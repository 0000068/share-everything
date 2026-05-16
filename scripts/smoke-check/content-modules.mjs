export function runContentModuleChecks(context) {
  const {
    assert,
    expectIncludes,
    expectNotIncludes,
    notionArticleRendererHelpers,
    notionArticleRendererJs,
    notionContentHelpers,
    notionContentJs,
    notionContentSharedHelpers,
    notionContentSharedJs,
    notionContentUrlHelpers,
    notionContentUrlJs,
    notionContentUtilsHelpers,
    notionContentUtilsJs,
    postPageCss,
    siteArchitectureMd,
  } = context;

  expectIncludes(siteArchitectureMd, "`notion-content-shared.js` owns shared category constants", "architecture docs should describe the shared content constants module");
  expectIncludes(siteArchitectureMd, "`notion-content-url.js` owns display-safe URL and image proxy helpers", "architecture docs should describe the URL helper split");
  expectIncludes(siteArchitectureMd, "`notion-article-renderer.js` owns the article header and shell HTML", "architecture docs should describe the article renderer split");
  expectIncludes(siteArchitectureMd, "`notion-content-utils.js` must load before `notion-content-url.js` and `notion-content.js`", "architecture docs should document the content module load order");

  expectIncludes(notionContentSharedJs, "root.NotionContentShared", "notion-content-shared.js should publish a browser global");
  expectIncludes(notionContentUtilsJs, "root.NotionContentUtils", "notion-content-utils.js should publish a browser utility global");
  expectIncludes(notionContentUrlJs, "root.NotionContentUrl", "notion-content-url.js should publish a browser URL helper global");
  expectIncludes(notionArticleRendererJs, "root.NotionArticleRenderer", "notion-article-renderer.js should publish a browser article renderer global");
  expectIncludes(notionContentJs, "root.NotionContent", "shared notion content module should publish a browser global");
  expectIncludes(notionContentJs, "module.exports = exported;", "shared notion content module should support CommonJS consumers");
  expectIncludes(notionContentJs, 'require("./notion-content-shared")', "shared notion content module should import extracted shared constants in CommonJS");
  expectIncludes(notionContentJs, 'require("./notion-content-utils")', "shared notion content module should import extracted pure utilities in CommonJS");
  expectIncludes(notionContentJs, 'require("./notion-content-url")', "shared notion content module should import extracted URL helpers in CommonJS");
  expectIncludes(notionContentJs, 'require("./notion-article-renderer")', "shared notion content module should import extracted article renderer in CommonJS");
  expectIncludes(notionContentJs, "root?.NotionContentShared", "shared notion content module should read extracted constants from the browser global");
  expectIncludes(notionContentJs, "root?.NotionContentUtils", "shared notion content module should read extracted pure utilities from the browser global");
  expectIncludes(notionContentJs, "root?.NotionContentUrl", "shared notion content module should read extracted URL helpers from the browser global");
  expectIncludes(notionContentJs, "root?.NotionArticleRenderer", "shared notion content module should read the article renderer from the browser global");
  expectIncludes(notionContentJs, "notion-content.js dependencies missing or wrong type", "shared notion content module should fail loudly when the browser load order is wrong");
  expectIncludes(notionContentJs, "missingDependencies.join", "shared notion content module should name the missing browser load-order dependency");

  expectIncludes(notionContentUtilsJs, "function resolveNotionContentSchema", "notion-content-utils.js should own Notion schema resolution");
  expectIncludes(notionContentUtilsJs, "function getPageProperty", "notion-content-utils.js should own schema-based page property lookup");
  expectIncludes(notionContentUtilsJs, "function buildPostSearchText", "notion-content-utils.js should own post search text normalization");
  expectIncludes(notionContentUrlJs, "function sanitizeUrl", "notion-content-url.js should own URL sanitization");
  expectIncludes(notionContentUrlJs, "function resolveShareImageUrl", "notion-content-url.js should own share image URL stability checks");
  expectIncludes(notionContentUrlJs, 'const SAFE_IMAGE_PROTOCOLS = new Set(["https:"])', "notion-content-url.js should align external image URL policy with production CSP");
  expectIncludes(notionArticleRendererJs, "function createPostArticleRenderer", "notion-article-renderer.js should expose the article renderer factory");
  expectIncludes(notionArticleRendererJs, "function renderPostArticle", "notion-article-renderer.js should own article shell rendering");
  expectNotIncludes(notionContentJs, "function findPropertyEntry", "shared notion content renderer should not keep schema lookup internals inline");
  expectNotIncludes(notionContentJs, "function buildPostSearchText", "shared notion content renderer should not keep post search normalization inline");
  expectNotIncludes(notionContentJs, "function sanitizeUrl", "shared notion content renderer should not keep URL sanitization inline");
  expectNotIncludes(notionContentJs, "function resolveShareImageUrl", "shared notion content renderer should not keep share image URL checks inline");
  expectNotIncludes(notionContentJs, "function renderPostArticle", "shared notion content renderer should not keep article shell rendering inline");

  expectIncludes(notionContentJs, "function mapNotionPage", "shared notion content module should own notion page mapping");
  expectIncludes(notionContentJs, "function renderBlocks", "shared notion content module should own block rendering");
  expectIncludes(notionContentJs, "function createBlockRenderers", "shared notion content module should register block renderers by type");
  expectIncludes(notionContentJs, "const blockRenderers = createBlockRenderers()", "shared notion content module should keep renderer dispatch in a registry");
  expectNotIncludes(notionContentJs, "switch (block.type)", "shared notion content renderer should avoid a central block-type switch");
  expectIncludes(notionContentJs, "function renderMathExpression", "shared notion content module should render Notion equations without exposing LaTeX as code");
  expectIncludes(notionContentJs, "application/x-tex", "shared notion content module should keep the original TeX only as MathML annotation");
  expectIncludes(notionContentJs, "resolveDisplayImageUrl", "shared notion content module should expose a display-safe image resolver");
  expectIncludes(notionContentJs, "REMOTE_BLOG_CATEGORIES", "shared notion content module should centralize remote blog category definitions");
  expectIncludes(notionContentJs, "BOOKMARK_ONLY_CATEGORIES", "shared notion content module should centralize bookmark-only category definitions");
  expectIncludes(notionContentJs, "table: () => ({", "shared notion content module should preserve Notion table blocks");
  expectIncludes(notionContentJs, "buildResourceBlock(", "shared notion content module should preserve file-like Notion blocks");
  expectIncludes(notionContentJs, "buildUnsupportedBlock(", "shared notion content module should surface unsupported blocks instead of dropping them");
  expectIncludes(notionContentJs, "table_of_contents: () => ({ type })", "shared notion content module should preserve table of contents blocks for semantic rendering");
  expectIncludes(notionContentJs, "function renderTableOfContentsBlock", "shared notion content module should build semantic table of contents navigation");
  expectIncludes(notionContentJs, "function renderBookmarkBlock", "shared notion content module should render bookmark blocks as semantic cards");
  expectIncludes(notionContentJs, "function renderEmbedBlock", "shared notion content module should render embed resources through a dedicated renderer");
  expectIncludes(notionContentJs, "shouldOpenLinkInNewTab", "shared notion content module should distinguish internal rich-text links from external links");
  expectIncludes(postPageCss, ".post-math-display", "post page CSS should style display equations as rendered math instead of code");
  expectNotIncludes(postPageCss, ".post-equation-expression code", "post page CSS should not style equations as visible code blocks");

  assert.equal(
    notionContentSharedHelpers.ALL_CATEGORY,
    "\u5168\u90e8",
    "notion-content-shared.js should expose the canonical all-posts category label",
  );
  assert.equal(
    notionContentSharedHelpers.BOOKMARK_CATEGORY,
    "\u6536\u85cf",
    "notion-content-shared.js should expose the canonical bookmark category label",
  );
  assert.ok(
    notionContentSharedHelpers.getRemoteBlogCategories().some(
      (category) => category.name && category.name !== notionContentSharedHelpers.ALL_CATEGORY,
    ),
    "notion-content-shared.js should publish the remote category list for client pages",
  );
  assert.equal(
    notionContentHelpers.ALL_CATEGORY,
    notionContentSharedHelpers.ALL_CATEGORY,
    "notion-content.js should re-export the shared all-posts category label",
  );
  assert.equal(
    notionContentHelpers.BOOKMARK_CATEGORY,
    notionContentSharedHelpers.BOOKMARK_CATEGORY,
    "notion-content.js should re-export the shared bookmark category label",
  );
  assert.equal(
    notionContentUtilsHelpers.buildPostSearchText({
      title: "  Hello  ",
      excerpt: "World",
      tags: ["Tag One", "", "Tag Two"],
    }),
    "hello world tag one tag two",
    "notion-content-utils.js should provide the canonical post search text normalizer",
  );
  assert.equal(
    notionContentUtilsHelpers.sanitizeCssColorValue("rgb(0 0 0 / 50%)", "fallback"),
    "rgb(0 0 0 / 50%)",
    "notion-content-utils.js should accept CSS Color Level 4 rgb syntax",
  );
  assert.equal(
    notionContentUtilsHelpers.sanitizeCssColorValue("oklch(62% 0.18 250)", "fallback"),
    "oklch(62% 0.18 250)",
    "notion-content-utils.js should accept oklch colors",
  );
  assert.equal(
    notionContentUtilsHelpers.sanitizeCssColorValue("color-mix(in srgb, #112233 40%, white)", "fallback"),
    "color-mix(in srgb, #112233 40%, white)",
    "notion-content-utils.js should accept conservative color-mix syntax",
  );
  assert.equal(
    notionContentUtilsHelpers.sanitizeCssColorValue("rgb(var(--unsafe))", "fallback"),
    "fallback",
    "notion-content-utils.js should reject CSS variables in inline color values",
  );
  assert.equal(
    notionContentUtilsHelpers.sanitizeCssColorValue("oklch(62% 0.18 250);background:url(x)", "fallback"),
    "fallback",
    "notion-content-utils.js should reject inline style breakouts",
  );
  const extractedSchema = notionContentUtilsHelpers.resolveNotionContentSchema({
    properties: {
      Name: { id: "title-id", name: "Name", type: "title" },
      "\u5206\u7c7b": { id: "category-id", name: "\u5206\u7c7b", type: "select" },
    },
  });
  assert.equal(extractedSchema.title.name, "Name", "notion-content-utils.js should resolve title schema entries");
  assert.equal(extractedSchema.category.name, "\u5206\u7c7b", "notion-content-utils.js should resolve localized category schema entries");
  assert.equal(
    notionContentUrlHelpers.resolveDisplayImageUrl("http://cdn.example.com/cover.png", "https://example.com"),
    null,
    "notion-content-url.js should reject external http images that production CSP would block",
  );
  assert.equal(
    notionContentUrlHelpers.resolveProxiedDisplayImageUrl("/cover.png", "http://localhost:3000"),
    "http://localhost:3000/cover.png",
    "notion-content-url.js should still allow same-origin local image URLs",
  );
  assert.equal(
    notionContentUrlHelpers.resolveEmbeddableUrl("https://vimeo.com/123456789/abcdef123", "https://example.com"),
    "https://player.vimeo.com/video/123456789?h=abcdef123",
    "notion-content-url.js should preserve Vimeo unlisted hash tokens on embed URLs",
  );
  const malformedParagraphBlock = notionContentHelpers.mapNotionBlock({ type: "paragraph", paragraph: {} });
  assert.equal(malformedParagraphBlock.type, "paragraph", "notion-content.js should preserve malformed paragraph block type");
  assert.equal(malformedParagraphBlock.text, "", "notion-content.js should tolerate malformed paragraph blocks without throwing");
  const malformedImageBlock = notionContentHelpers.mapNotionBlock({ type: "image", image: {} });
  assert.equal(malformedImageBlock.type, "image", "notion-content.js should preserve malformed media block type");
  assert.equal(malformedImageBlock.url, "", "notion-content.js should fall back missing media URLs to an empty string");
  assert.equal(malformedImageBlock.captionHtml, "", "notion-content.js should tolerate malformed media captions without throwing");
  const missingBlock = notionContentHelpers.mapNotionBlock(null);
  assert.equal(missingBlock.type, "unsupported", "notion-content.js should degrade missing blocks to unsupported placeholders");
  assert.equal(missingBlock.blockType, "unsupported", "notion-content.js should label missing blocks as unsupported");
  assert.equal(
    notionContentHelpers.richTextToHtml("not-an-array"),
    "",
    "notion-content.js should ignore malformed rich-text fields",
  );
  const deepLatex = `${"{".repeat(40)}x${"}".repeat(40)}`;
  const deepLatexHtml = notionContentHelpers.renderMathExpression(deepLatex);
  expectIncludes(deepLatexHtml, "post-math-fallback", "notion-content.js should degrade overly deep LaTeX instead of recursing indefinitely");
  expectIncludes(deepLatexHtml, deepLatex, "notion-content.js should preserve the original LaTeX when it degrades rendering");
  const articleHtml = notionArticleRendererHelpers.createPostArticleRenderer({
    DEFAULT_CATEGORY_COLOR: notionContentSharedHelpers.DEFAULT_CATEGORY_COLOR,
    escapeHtml: notionContentUtilsHelpers.escapeHtml,
    getCategoryColor: notionContentSharedHelpers.getCategoryColor,
    renderBlocks: () => "<p>Body</p>",
    sanitizeCssColorValue: notionContentUtilsHelpers.sanitizeCssColorValue,
  }).renderPostArticle({
    title: "Article",
    category: "\u7cbe\u9009",
    tags: ["Tag"],
  });
  expectIncludes(articleHtml, "post-header", "notion-article-renderer.js should render the article header shell");
  expectIncludes(articleHtml, "#Tag", "notion-article-renderer.js should render post tags in the article shell");
}
