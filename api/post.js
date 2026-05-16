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
const {
  applyHtmlSecurityHeaders,
  createCspNonce,
} = require("../server/security-policy");

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

function insertBeforeEndTag(html, node, markup, indentation = "") {
  const offset = endTagStart(node);
  if (!Number.isInteger(offset)) return html;
  return applyPatches(html, [{ start: offset, end: offset, markup: `${markup}\n${indentation}` }]);
}

function serializeAttribute(name, value) {
  if (value === "" || value === true) return ` ${name}`;
  return ` ${name}="${escapeHtmlAttribute(value)}"`;
}

function replaceElement(html, node, markup, label) {
  const range = sourceRange(node);
  if (!range) {
    if (label) {
      console.warn(`SSR: Node for "${label}" did not expose a source range. The post.html structure may have changed.`);
    }
    return html;
  }
  return applyPatches(html, [{ ...range, markup }]);
}

function buildNonceAttribute(scriptNonce = "") {
  return scriptNonce ? ` nonce="${escapeHtmlAttribute(scriptNonce)}"` : "";
}

async function upsertStructuredDataScript(html, key, payload, { scriptNonce = "" } = {}) {
  const marker = `data-structured-data="${escapeHtmlAttribute(key)}"`;
  const scriptTag = `    <script type="application/ld+json"${buildNonceAttribute(scriptNonce)} ${marker}>${serializeJsonForScript(payload)}</script>`;
  const doc = await parseTemplate(html);
  const existing = findElement(
    doc,
    (node) => (
      node.tagName === "script"
        && getAttribute(node, "type") === "application/ld+json"
        && getAttribute(node, "data-structured-data") === key
    ),
  );

  if (existing) {
    return replaceElement(html, existing, scriptTag, `structuredData:${key}`);
  }

  const head = findElementByTag(doc, "head");
  return head ? insertBeforeEndTag(html, head, scriptTag, "  ") : `${html}\n${scriptTag}`;
}

async function injectInitialPostData(html, payload, { scriptNonce = "" } = {}) {
  const scriptTag = `    <script id="initialPostData" type="application/json"${buildNonceAttribute(scriptNonce)}>${serializeJsonForScript(payload)}</script>`;
  const doc = await parseTemplate(html);
  const main = findElementByTag(doc, "main");
  if (!main) {
    console.warn('SSR: Node for "initialPostData" did not match template. The post.html structure may have changed.');
    return html;
  }
  return insertBeforeEndTag(html, main, scriptTag, "    ");
}

async function replacePostContent(html, post, { renderedContent, baseOrigin }) {
  const articleMarkup = renderPostArticle(post, { renderedContent, baseOrigin });
  const replacement = `<div id="postContent" style="display: block;">${articleMarkup}</div>`;
  const doc = await parseTemplate(html);
  const postContent = findElementById(doc, "postContent");
  if (postContent) {
    return replaceElement(html, postContent, replacement, "postContent");
  }

  console.warn('SSR: Pattern for "postContent" did not match template. Falling back to article insertion.');
  const article = findElementById(doc, "postArticle") || findElementByTag(doc, "article");
  return article ? insertBeforeEndTag(html, article, replacement, "        ") : html;
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

async function replaceHeadMeta(html, { title, description, url, image, imageAlt, canonicalUrl, robots, ogType }) {
  const doc = await parseTemplate(html);
  const start = findComment(doc, HEAD_META_BLOCK_START);
  const end = findComment(doc, HEAD_META_BLOCK_END);
  const startOffset = start?.sourceCodeLocation?.startOffset;
  const endOffset = end?.sourceCodeLocation?.endOffset;

  if (Number.isInteger(startOffset) && Number.isInteger(endOffset) && startOffset < endOffset) {
    return applyPatches(html, [{
      start: startOffset,
      end: endOffset,
      markup: buildHeadMetaBlock({ title, description, url, image, imageAlt, canonicalUrl, robots, ogType }),
    }]);
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

  return applyPatches(html, patches.filter(Boolean));
}

async function replaceEmptyStateContent(html, { message, linkText = "杩斿洖鍗氬鍒楄〃" }) {
  const doc = await parseTemplate(html);
  const emptyState = findElementById(doc, "postEmpty");
  if (!emptyState) {
    console.warn('SSR: Node for "postEmpty" did not match template. The post.html structure may have changed.');
    return html;
  }

  const messageNode = walk(emptyState, (node) => (
    isElement(node, "p") && getAttribute(node, "class") !== "empty-state-helper"
  ));
  const emptyLink = walk(emptyState, (node) => isElement(node, "a") && hasAttribute(node, "data-empty-link"));
  const patches = [];

  if (messageNode) {
    patches.push({ ...innerRange(messageNode), markup: escapeHtml(message) });
  }

  if (emptyLink) {
    const linkAttrs = new Map((emptyLink.attrs || []).map((attr) => [attr.name, attr.value]));
    linkAttrs.set("href", "/blog.html");
    const attrs = Array.from(linkAttrs, ([name, value]) => serializeAttribute(name, value)).join("");
    patches.push({ ...sourceRange(emptyLink), markup: `<a${attrs}>${escapeHtml(linkText)}</a>` });
  }

  return applyPatches(html, patches.filter((patch) => patch?.start != null && patch?.end != null));
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

async function setElementDisplay(html, id, display, label) {
  const doc = await parseTemplate(html);
  const node = findElementById(doc, id);
  if (!node) {
    console.warn(`SSR: Node for "${label}" did not match template. The post.html structure may have changed.`);
    return html;
  }
  return replaceStartTag(html, node, { style: `display: ${display};` }, label);
}

function replaceStartTag(html, node, updates, label) {
  const range = startTagRange(node);
  if (!range) {
    if (label) {
      console.warn(`SSR: Node for "${label}" did not expose a source range. The post.html structure may have changed.`);
    }
    return html;
  }
  const attrMap = new Map((node.attrs || []).map((attr) => [attr.name, attr.value]));
  Object.entries(updates).forEach(([name, value]) => {
    if (value == null) attrMap.delete(name);
    else attrMap.set(name, value);
  });
  const attrs = Array.from(attrMap, ([name, value]) => serializeAttribute(name, value)).join("");
  return applyPatches(html, [{ ...range, markup: `<${node.tagName}${attrs}>` }]);
}

async function renderFallbackPage(html, fallback, { url, canonicalUrl, image, imageAlt }) {
  let nextHtml = await replaceHeadMeta(html, {
    title: fallback.title,
    description: fallback.description,
    url,
    image,
    imageAlt,
    canonicalUrl,
    robots: fallback.robots,
    ogType: fallback.ogType,
  });
  nextHtml = await replaceEmptyStateContent(nextHtml, {
    message: fallback.message,
    linkText: fallback.linkText,
  });
  nextHtml = await setElementDisplay(nextHtml, "postSkeleton", "none", "fallback:postSkeleton");
  nextHtml = await setElementDisplay(nextHtml, "postEmpty", "flex", "fallback:postEmpty");
  return nextHtml;
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

    html = await replaceHeadMeta(html, {
      title: pageTitle,
      description: pageDescription,
      url: postUrl,
      image: pageImage,
      imageAlt: post.title,
      canonicalUrl: postUrl,
      robots: "index, follow",
      ogType: "article",
    });
    html = await setElementDisplay(html, "postSkeleton", "none", "postSkeleton");
    html = await replacePostContent(html, post, {
      renderedContent,
      baseOrigin: siteOrigin,
    });
    html = await injectInitialPostData(html, buildInitialPostPayload(post), { scriptNonce });
    html = await upsertStructuredDataScript(html, "post-article", articleStructuredData, { scriptNonce });

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
