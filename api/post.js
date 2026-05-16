const fs = require("node:fs/promises");
const path = require("node:path");

const {
  buildArticleStructuredData,
  buildPostUrl,
  escapeHtml,
  fetchPublicPost,
  getSiteName,
  getSiteOrigin,
  renderPostArticle,
  renderPostContent,
  resolveShareImageUrl,
} = require("../server/notion-server");
const {
  applyPublicErrorHeaders,
  getPublicPostErrorStatus,
  logServerError,
  rejectUnsupportedReadMethod,
  readQueryString,
} = require("../server/public-content");
const { escapeHtmlAttribute } = require("../server/html-escape");
const { applyHtmlSecurityHeaders, createCspNonce } = require("../server/security-policy");

let templatePromise = null;
let parse5Promise = null;
const IS_DEVELOPMENT = process.env.NODE_ENV === "development";
const HEAD_META_BLOCK_START = "<!--SSR_HEAD_META_START-->";
const HEAD_META_BLOCK_END = "<!--SSR_HEAD_META_END-->";

function formatFallbackTitle(title, siteName) {
  return `${title} - ${siteName}`;
}

function formatPostTitle(title, siteName) {
  return `${title} — ${siteName}`;
}

function getTemplate() {
  if (IS_DEVELOPMENT) {
    return fs.readFile(path.join(process.cwd(), "post.html"), "utf8");
  }
  if (!templatePromise) {
    templatePromise = fs.readFile(path.join(process.cwd(), "post.html"), "utf8").catch((error) => {
      templatePromise = null;
      throw error;
    });
  }
  return templatePromise;
}

function serializeJsonForScript(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function loadParse5() {
  if (globalThis.__parse5ForSmokeCheck) {
    return Promise.resolve(globalThis.__parse5ForSmokeCheck);
  }
  if (!parse5Promise) {
    parse5Promise = import("parse5");
  }
  return parse5Promise;
}

async function parseTemplate(html) {
  const parse5 = await loadParse5();
  return parse5.parse(html, { sourceCodeLocationInfo: true });
}

function getAttribute(node, name) {
  return node?.attrs?.find((attr) => attr.name === name)?.value || "";
}

function hasAttribute(node, name) {
  return Boolean(node?.attrs?.some((attr) => attr.name === name));
}

function isElement(node, tagName = "") {
  return Boolean(node?.tagName) && (!tagName || node.tagName === tagName);
}

function walk(node, visitor) {
  if (!node) return null;
  if (visitor(node)) return node;
  for (const child of node.childNodes || []) {
    const match = walk(child, visitor);
    if (match) return match;
  }
  return null;
}

function findElement(doc, predicate) {
  return walk(doc, (node) => isElement(node) && predicate(node));
}

function findElementById(doc, id) {
  return findElement(doc, (node) => getAttribute(node, "id") === id);
}

function findElementByTag(doc, tagName) {
  return findElement(doc, (node) => node.tagName === tagName);
}

function findMeta(doc, attrName, attrValue) {
  return findElement(doc, (node) => (
    node.tagName === "meta" && getAttribute(node, attrName) === attrValue
  ));
}

function findLink(doc, rel) {
  return findElement(doc, (node) => node.tagName === "link" && getAttribute(node, "rel") === rel);
}

function findComment(doc, marker) {
  const expected = marker.replace(/^<!--|-->$/g, "");
  return walk(doc, (node) => node.nodeName === "#comment" && String(node.data || "").trim() === expected);
}

function sourceRange(node) {
  const location = node?.sourceCodeLocation;
  if (!location) return null;
  return { start: location.startOffset, end: location.endOffset };
}

function startTagRange(node) {
  const location = node?.sourceCodeLocation?.startTag;
  if (!location) return null;
  return { start: location.startOffset, end: location.endOffset };
}

function innerRange(node) {
  const location = node?.sourceCodeLocation;
  if (!location?.startTag || !location?.endTag) return null;
  return { start: location.startTag.endOffset, end: location.endTag.startOffset };
}

function endTagStart(node) {
  return node?.sourceCodeLocation?.endTag?.startOffset;
}

function applyPatches(html, patches) {
  return patches
    .filter((patch) => Number.isInteger(patch.start) && Number.isInteger(patch.end))
    .sort((a, b) => b.start - a.start)
    .reduce((nextHtml, patch) => (
      `${nextHtml.slice(0, patch.start)}${patch.markup}${nextHtml.slice(patch.end)}`
    ), html);
}

function isTemplateEditor(value) {
  return Boolean(value?.__templateEditor);
}

async function createTemplateEditor(html) {
  const doc = await parseTemplate(html);
  const patches = [];
  return {
    __templateEditor: true,
    html,
    doc,
    patches,
    addPatch(patch) {
      if (patch && Number.isInteger(patch.start) && Number.isInteger(patch.end)) {
        patches.push(patch);
      }
      return this;
    },
    apply() {
      return applyPatches(html, patches);
    },
  };
}

function withTemplateEditor(htmlOrEditor, mutator) {
  if (isTemplateEditor(htmlOrEditor)) {
    mutator(htmlOrEditor);
    return htmlOrEditor;
  }

  return createTemplateEditor(htmlOrEditor).then((editor) => {
    mutator(editor);
    return editor.apply();
  });
}

function insertBeforeEndTag(editor, node, markup, indentation = "") {
  const offset = endTagStart(node);
  if (!Number.isInteger(offset)) return editor;
  return editor.addPatch({ start: offset, end: offset, markup: `${markup}\n${indentation}` });
}

function serializeAttribute(name, value) {
  if (value === "" || value === true) return ` ${name}`;
  return ` ${name}="${escapeHtmlAttribute(value)}"`;
}

function replaceElement(editor, node, markup, label) {
  const range = sourceRange(node);
  if (!range) {
    if (label) {
      console.warn(`SSR: Node for "${label}" did not expose a source range. The post.html structure may have changed.`);
    }
    return editor;
  }
  return editor.addPatch({ ...range, markup });
}

function upsertStructuredDataScript(htmlOrEditor, key, payload) {
  const marker = `data-structured-data="${escapeHtmlAttribute(key)}"`;
  const scriptTag = `    <script type="application/ld+json" ${marker}>${serializeJsonForScript(payload)}</script>`;
  return withTemplateEditor(htmlOrEditor, (editor) => {
    const existing = findElement(
      editor.doc,
      (node) => (
        node.tagName === "script"
          && getAttribute(node, "type") === "application/ld+json"
          && getAttribute(node, "data-structured-data") === key
      ),
    );

    if (existing) {
      replaceElement(editor, existing, scriptTag, `structuredData:${key}`);
      return;
    }

    const head = findElementByTag(editor.doc, "head");
    if (head) {
      insertBeforeEndTag(editor, head, scriptTag, "  ");
      return;
    }

    editor.addPatch({ start: editor.html.length, end: editor.html.length, markup: `\n${scriptTag}` });
  });
}

function injectInitialPostData(htmlOrEditor, payload) {
  const scriptTag = `    <script id="initialPostData" type="application/json">${serializeJsonForScript(payload)}</script>`;
  return withTemplateEditor(htmlOrEditor, (editor) => {
    const main = findElementByTag(editor.doc, "main");
    if (!main) {
      console.warn('SSR: Node for "initialPostData" did not match template. The post.html structure may have changed.');
      return;
    }
    insertBeforeEndTag(editor, main, scriptTag, "    ");
  });
}

function replacePostContent(htmlOrEditor, post, { renderedContent, baseOrigin }) {
  const articleMarkup = renderPostArticle(post, { renderedContent, baseOrigin });
  const replacement = `<div id="postContent" style="display: block;">${articleMarkup}</div>`;
  return withTemplateEditor(htmlOrEditor, (editor) => {
    const postContent = findElementById(editor.doc, "postContent");
    if (postContent) {
      replaceElement(editor, postContent, replacement, "postContent");
      return;
    }

    console.warn('SSR: Pattern for "postContent" did not match template. Falling back to article insertion.');
    const article = findElementById(editor.doc, "postArticle") || findElementByTag(editor.doc, "article");
    if (article) {
      insertBeforeEndTag(editor, article, replacement, "        ");
    }
  });
}

function buildHeadMetaBlock({ title, description, url, image, imageAlt, canonicalUrl, robots, ogType }) {
  return [
    `    ${HEAD_META_BLOCK_START}`,
    `    <title>${escapeHtml(title)}</title>`,
    `    <meta name="description" content="${escapeHtmlAttribute(description)}" />`,
    `    <meta property="og:title" content="${escapeHtmlAttribute(title)}" />`,
    `    <meta property="og:description" content="${escapeHtmlAttribute(description)}" />`,
    `    <meta property="og:type" content="${escapeHtmlAttribute(ogType || "website")}" />`,
    `    <meta property="og:url" content="${escapeHtmlAttribute(url)}" />`,
    `    <meta property="og:image" content="${escapeHtmlAttribute(image)}" />`,
    `    <meta property="og:image:alt" content="${escapeHtmlAttribute(imageAlt)}" />`,
    ...(typeof robots === "string" && robots ? [`    <meta name="robots" content="${escapeHtmlAttribute(robots)}" />`] : []),
    `    <link rel="canonical" href="${escapeHtmlAttribute(canonicalUrl)}" />`,
    `    ${HEAD_META_BLOCK_END}`,
  ].join("\n");
}

function tagPatch(node, markup) {
  const range = sourceRange(node);
  return range ? { ...range, markup } : null;
}

function innerPatch(node, markup) {
  const range = node ? {
    start: node.sourceCodeLocation?.startTag?.endOffset,
    end: node.sourceCodeLocation?.endTag?.startOffset,
  } : null;
  return range && Number.isInteger(range.start) && Number.isInteger(range.end)
    ? { ...range, markup }
    : null;
}

function insertionPatchBeforeEnd(node, markup, indentation = "  ") {
  const offset = endTagStart(node);
  return Number.isInteger(offset) ? { start: offset, end: offset, markup: `${markup}\n${indentation}` } : null;
}

function replaceHeadMeta(htmlOrEditor, { title, description, url, image, imageAlt, canonicalUrl, robots, ogType }) {
  return withTemplateEditor(htmlOrEditor, (editor) => {
    const doc = editor.doc;
    const start = findComment(doc, HEAD_META_BLOCK_START);
    const end = findComment(doc, HEAD_META_BLOCK_END);
    const startOffset = start?.sourceCodeLocation?.startOffset;
    const endOffset = end?.sourceCodeLocation?.endOffset;

    if (Number.isInteger(startOffset) && Number.isInteger(endOffset) && startOffset < endOffset) {
      editor.addPatch({
        start: startOffset,
        end: endOffset,
        markup: buildHeadMetaBlock({ title, description, url, image, imageAlt, canonicalUrl, robots, ogType }),
      });
      return;
    }

    const head = findElementByTag(doc, "head");
    const titleNode = findElementByTag(doc, "title");
    const robotsNode = findMeta(doc, "name", "robots");
    const canonical = findLink(doc, "canonical");
    const patches = [
      titleNode
        ? innerPatch(titleNode, escapeHtml(title))
        : insertionPatchBeforeEnd(head, `    <title>${escapeHtml(title)}</title>`),
      tagPatch(findMeta(doc, "name", "description"), `    <meta name="description" content="${escapeHtmlAttribute(description)}" />`),
      tagPatch(findMeta(doc, "property", "og:title"), `    <meta property="og:title" content="${escapeHtmlAttribute(title)}" />`),
      tagPatch(findMeta(doc, "property", "og:description"), `    <meta property="og:description" content="${escapeHtmlAttribute(description)}" />`),
      tagPatch(findMeta(doc, "property", "og:type"), `    <meta property="og:type" content="${escapeHtmlAttribute(ogType || "website")}" />`),
      tagPatch(findMeta(doc, "property", "og:url"), `    <meta property="og:url" content="${escapeHtmlAttribute(url)}" />`),
      tagPatch(findMeta(doc, "property", "og:image"), `    <meta property="og:image" content="${escapeHtmlAttribute(image)}" />`),
      tagPatch(findMeta(doc, "property", "og:image:alt"), `    <meta property="og:image:alt" content="${escapeHtmlAttribute(imageAlt)}" />`),
      canonical
        ? tagPatch(canonical, `    <link rel="canonical" href="${escapeHtmlAttribute(canonicalUrl)}" />`)
        : insertionPatchBeforeEnd(head, `    <link rel="canonical" href="${escapeHtmlAttribute(canonicalUrl)}" />`),
    ];

    if (typeof robots === "string" && robots) {
      patches.push(robotsNode
        ? tagPatch(robotsNode, `    <meta name="robots" content="${escapeHtmlAttribute(robots)}" />`)
        : insertionPatchBeforeEnd(head, `    <meta name="robots" content="${escapeHtmlAttribute(robots)}" />`));
    } else if (robotsNode) {
      patches.push(tagPatch(robotsNode, ""));
    }

    patches.filter(Boolean).forEach((patch) => editor.addPatch(patch));
  });
}

function replaceEmptyStateContent(htmlOrEditor, { message, linkText = "返回博客列表" }) {
  return withTemplateEditor(htmlOrEditor, (editor) => {
    const emptyState = findElementById(editor.doc, "postEmpty");
    if (!emptyState) {
      console.warn('SSR: Node for "postEmpty" did not match template. The post.html structure may have changed.');
      return;
    }

    const messageNode = walk(emptyState, (node) => (
      isElement(node, "p") && getAttribute(node, "class") !== "empty-state-helper"
    ));
    const emptyLink = walk(emptyState, (node) => isElement(node, "a") && hasAttribute(node, "data-empty-link"));

    if (messageNode) {
      editor.addPatch({ ...innerRange(messageNode), markup: escapeHtml(message) });
    }

    if (emptyLink) {
      const linkAttrs = new Map((emptyLink.attrs || []).map((attr) => [attr.name, attr.value]));
      linkAttrs.set("href", "/blog.html");
      const attrs = Array.from(linkAttrs, ([name, value]) => serializeAttribute(name, value)).join("");
      editor.addPatch({ ...sourceRange(emptyLink), markup: `<a${attrs}>${escapeHtml(linkText)}</a>` });
    }
  });
}
function buildInitialPostPayload(post) {
  return {
    id: post.id,
    title: post.title,
    excerpt: post.excerpt,
    category: post.category,
    date: post.date,
    readTime: post.readTime,
    coverImage: post.coverImage,
    coverEmoji: post.coverEmoji,
    coverGradient: post.coverGradient,
    tags: Array.isArray(post.tags) ? post.tags : [],
  };
}

function buildNotFoundContent(siteName = getSiteName()) {
  return {
    title: formatFallbackTitle("文章不存在", siteName),
    description: "未找到对应的文章内容。",
    message: "文章不存在",
    linkText: "返回博客列表",
    ogType: "website",
    robots: "noindex, nofollow",
  };
}

function buildUnavailableContent(siteName = getSiteName()) {
  return {
    title: formatFallbackTitle("文章暂时不可用", siteName),
    description: "文章内容暂时无法加载，请稍后再试。",
    message: "文章暂时不可用",
    linkText: "返回博客列表",
    ogType: "website",
    robots: "noindex, nofollow",
  };
}

function setElementDisplay(htmlOrEditor, id, display, label) {
  return withTemplateEditor(htmlOrEditor, (editor) => {
    const node = findElementById(editor.doc, id);
    if (!node) {
      console.warn(`SSR: Node for "${label}" did not match template. The post.html structure may have changed.`);
      return;
    }
    replaceStartTag(editor, node, { style: `display: ${display};` }, label);
  });
}

function replaceStartTag(editor, node, updates, label) {
  const range = startTagRange(node);
  if (!range) {
    if (label) {
      console.warn(`SSR: Node for "${label}" did not expose a source range. The post.html structure may have changed.`);
    }
    return editor;
  }
  const attrMap = new Map((node.attrs || []).map((attr) => [attr.name, attr.value]));
  Object.entries(updates).forEach(([name, value]) => {
    if (value == null) attrMap.delete(name);
    else attrMap.set(name, value);
  });
  const attrs = Array.from(attrMap, ([name, value]) => serializeAttribute(name, value)).join("");
  return editor.addPatch({ ...range, markup: `<${node.tagName}${attrs}>` });
}

async function renderFallbackPage(html, fallback, { url, canonicalUrl, image, imageAlt }) {
  const editor = await createTemplateEditor(html);
  replaceHeadMeta(editor, {
    title: fallback.title,
    description: fallback.description,
    url,
    image,
    imageAlt,
    canonicalUrl,
    robots: fallback.robots,
    ogType: fallback.ogType,
  });
  replaceEmptyStateContent(editor, {
    message: fallback.message,
    linkText: fallback.linkText,
  });
  setElementDisplay(editor, "postSkeleton", "none", "fallback:postSkeleton");
  setElementDisplay(editor, "postEmpty", "flex", "fallback:postEmpty");
  return editor.apply();
}

module.exports = async function handler(req, res) {
  if (rejectUnsupportedReadMethod(req, res)) {
    return undefined;
  }

  const routeId = readQueryString(req.query.id);
  const siteOrigin = getSiteOrigin();
  const siteName = getSiteName();
  const defaultShareImageUrl = `${siteOrigin}/og-image.jpg?v=4`;

  let html = await getTemplate();

  if (!routeId) {
    const fallback = buildNotFoundContent(siteName);
    html = await renderFallbackPage(html, fallback, {
      url: `${siteOrigin}/post.html`,
      canonicalUrl: `${siteOrigin}/post.html`,
      image: defaultShareImageUrl,
      imageAlt: siteName,
    });
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    applyHtmlSecurityHeaders(res);
    return res.status(404).send(html);
  }

  try {
    const scriptNonce = createCspNonce();
    const post = await fetchPublicPost(routeId);
    const postUrl = buildPostUrl(post.id);
    const pageTitle = formatPostTitle(post.title, siteName);
    const pageDescription = post.excerpt || post.title;
    const pageImage = resolveShareImageUrl(post.coverImage, defaultShareImageUrl, siteOrigin);
    const articleStructuredData = buildArticleStructuredData(post);
    const renderedContent = renderPostContent(post, { baseOrigin: siteOrigin });

    const editor = await createTemplateEditor(html);
    replaceHeadMeta(editor, {
      title: pageTitle,
      description: pageDescription,
      url: postUrl,
      image: pageImage,
      imageAlt: post.title,
      canonicalUrl: postUrl,
      robots: "index, follow",
      ogType: "article",
    });
    setElementDisplay(editor, "postSkeleton", "none", "postSkeleton");
    replacePostContent(editor, post, {
      renderedContent,
      baseOrigin: siteOrigin,
    });
    injectInitialPostData(editor, buildInitialPostPayload(post));
    upsertStructuredDataScript(editor, "post-article", articleStructuredData);
    html = editor.apply();

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    applyHtmlSecurityHeaders(res, { scriptNonce });
    return res.status(200).send(html);
  } catch (error) {
    const status = getPublicPostErrorStatus(error);
    const fallback = status === 404 ? buildNotFoundContent(siteName) : buildUnavailableContent(siteName);
    if (status !== 404) {
      logServerError("Failed to render post route", error);
    }

    applyPublicErrorHeaders(res, error);
    html = await renderFallbackPage(html, fallback, {
      url: buildPostUrl(routeId),
      canonicalUrl: buildPostUrl(routeId),
      image: defaultShareImageUrl,
      imageAlt: siteName,
    });
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    applyHtmlSecurityHeaders(res);
    return res.status(status).send(html);
  }
};
