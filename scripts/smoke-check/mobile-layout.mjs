function normalizeCssValue(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function findMatchingBrace(source, openIndex) {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    if (source[index] === "{") {
      depth += 1;
      continue;
    }

    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
}

function extractCssBlock(source, prefix) {
  const prefixIndex = source.indexOf(prefix);
  if (prefixIndex < 0) {
    throw new Error(`Missing CSS block: ${prefix}`);
  }

  const openIndex = source.indexOf("{", prefixIndex + prefix.length);
  const closeIndex = findMatchingBrace(source, openIndex);
  if (openIndex < 0 || closeIndex < 0) {
    throw new Error(`Malformed CSS block: ${prefix}`);
  }

  return source.slice(openIndex + 1, closeIndex);
}

function extractRuleBody(source, selector) {
  let searchIndex = 0;
  while (searchIndex < source.length) {
    const selectorIndex = source.indexOf(selector, searchIndex);
    if (selectorIndex < 0) break;

    const afterSelector = source.slice(selectorIndex + selector.length);
    const leadingWhitespace = afterSelector.match(/^\s*/)?.[0] || "";
    if (afterSelector.slice(leadingWhitespace.length).startsWith("{")) {
      const openIndex = selectorIndex + selector.length + leadingWhitespace.length;
      const closeIndex = findMatchingBrace(source, openIndex);
      if (closeIndex < 0) {
        throw new Error(`Malformed CSS rule: ${selector}`);
      }

      return source.slice(openIndex + 1, closeIndex);
    }

    searchIndex = selectorIndex + selector.length;
  }

  throw new Error(`Missing CSS rule: ${selector}`);
}

function readRuleDeclarations(source, selector) {
  return extractRuleBody(source, selector)
    .split(";")
    .reduce((declarations, chunk) => {
      const declaration = chunk.trim();
      if (!declaration) return declarations;

      const separatorIndex = declaration.indexOf(":");
      if (separatorIndex < 0) return declarations;

      declarations.set(
        declaration.slice(0, separatorIndex).trim(),
        normalizeCssValue(declaration.slice(separatorIndex + 1)),
      );
      return declarations;
    }, new Map());
}

function expectDeclarations(assert, source, selector, expectedDeclarations, label) {
  const declarations = readRuleDeclarations(source, selector);
  Object.entries(expectedDeclarations).forEach(([property, expectedValue]) => {
    assert.equal(
      declarations.get(property),
      normalizeCssValue(expectedValue),
      `${label} should keep ${selector} ${property}`,
    );
  });
}

function expectStaticGradientTitle(assert, source, selector, label) {
  const declarations = readRuleDeclarations(source, selector);

  expectDeclarations(assert, source, selector, {
    "white-space": "nowrap",
    "overflow-wrap": "normal",
    "word-break": "normal",
    "font-size": "2.44rem",
    "line-height": "1",
    "letter-spacing": "0",
    "background-size": "100% auto",
    "-webkit-background-clip": "text",
    "-webkit-text-fill-color": "transparent",
    "background-clip": "text",
    "filter": "none",
  }, label);

  assert.match(
    declarations.get("background") || "",
    /#7dfff3.+#28eaff.+#5da8ff.+#a36cff.+#f044e9/,
    `${label} should keep the static mobile title gradient colors`,
  );
  assert.ok(
    !(declarations.get("animation") || "").includes("title-gradient"),
    `${label} should not run the expensive title-gradient animation`,
  );
  assert.match(
    declarations.get("animation") || "",
    /fadeInUp/,
    `${label} should keep the one-time entrance animation`,
  );
}

function expectMobileAmbientBackground(assert, source, selector, label, { backgroundColor = "#111528", allowStars = false } = {}) {
  const declarations = readRuleDeclarations(source, selector);

  assert.equal(
    declarations.get("background-color"),
    backgroundColor,
    `${label} should paint the mobile safe-area background`,
  );
  assert.equal(
    declarations.get("background-repeat"),
    "no-repeat",
    `${label} should keep the mobile background stable`,
  );
  if (allowStars) {
    assert.ok(
      (declarations.get("background-image") || "").includes("mobile-home-starry-bg.svg"),
      `${label} should use the static mobile starfield asset`,
    );
    assert.equal(
      declarations.get("background-size"),
      "cover",
      `${label} should cover the mobile viewport with the static starfield`,
    );
  }
  if (!allowStars) {
    assert.ok(
      !/radial-gradient\(1px/i.test(declarations.get("background-image") || ""),
      `${label} should avoid static star speckles on mobile`,
    );
  }
}

function expectBlogCardMobileContract(assert, source, label, bookmarkColumnWidth) {
  expectDeclarations(assert, source, ".blog-card-body", {
    "display": "grid",
    "grid-template-columns": `minmax(0, 1fr) ${bookmarkColumnWidth}`,
    "grid-template-rows": "auto minmax(0, 1fr)",
    "align-items": "start",
    "position": "relative",
  }, label);

  expectDeclarations(assert, source, ".blog-card-category", {
    "display": "inline-flex",
    "align-items": "center",
    "justify-content": "center",
    "grid-column": "1 / -1",
    "align-self": "flex-start",
    "justify-self": "start",
    "max-width": "100%",
    "min-width": "0",
    "overflow": "hidden",
    "text-overflow": "ellipsis",
    "white-space": "nowrap",
  }, label);

  expectDeclarations(assert, source, ".blog-card-title", {
    "grid-column": "1",
    "grid-row": "2",
    "align-self": "center",
    "margin-bottom": "0",
    "min-height": "0",
  }, label);

  expectDeclarations(assert, source, ".blog-card-meta", {
    "position": "static",
    "grid-column": "2",
    "grid-row": "2",
    "align-self": "center",
    "justify-self": "end",
    "margin-top": "0",
  }, label);

  expectDeclarations(assert, source, ".card-bookmark-btn", {
    "width": "21px",
    "height": "21px",
  }, label);
}

function expectTouchTargetContract(assert, source, selector, label) {
  expectDeclarations(assert, source, selector, {
    "min-width": "44px",
    "min-height": "44px",
  }, label);
}

function expectBookmarkHitAreaContract(assert, source, label) {
  expectDeclarations(assert, source, ".card-bookmark-btn::after", {
    "content": "\"\"",
    "position": "absolute",
    "inset": "-11px",
  }, label);
}

export function runMobileLayoutChecks(context) {
  const { assert, blogPageCss, postPageCss, styleCss } = context;
  const narrowViewportStyle = extractCssBlock(
    styleCss,
    "@media (max-width: 768px)",
  );
  const compactViewportStyle = extractCssBlock(
    styleCss,
    "@media (max-width: 540px)",
  );
  const ultraNarrowViewportStyle = extractCssBlock(
    styleCss,
    "@media (max-width: 360px)",
  );
  const narrowViewportBlog = extractCssBlock(
    blogPageCss,
    "@media (max-width: 768px)",
  );
  const compactViewportBlog = extractCssBlock(
    blogPageCss,
    "@media (max-width: 540px)",
  );
  const touchOnlyBlog = extractCssBlock(
    blogPageCss,
    "@media (max-width: 768px) and (hover: none) and (pointer: coarse)",
  );
  const narrowViewportPost = extractCssBlock(
    postPageCss,
    "@media (max-width: 768px)",
  );
  const touchOnlyPost = extractCssBlock(
    postPageCss,
    "@media (max-width: 768px) and (hover: none) and (pointer: coarse)",
  );
  assert.ok(
    styleCss.includes("MOBILE_FALLBACKS_START") && styleCss.includes("MOBILE_FALLBACKS_END"),
    "shared CSS should keep an explicit generated mobile fallback range",
  );
  assert.ok(
    blogPageCss.includes("MOBILE_FALLBACKS_START") && blogPageCss.includes("MOBILE_FALLBACKS_END"),
    "blog CSS should keep an explicit generated mobile fallback range",
  );
  assert.ok(
    postPageCss.includes("MOBILE_FALLBACKS_START") && postPageCss.includes("MOBILE_FALLBACKS_END"),
    "post CSS should keep an explicit generated mobile fallback range",
  );

  expectStaticGradientTitle(assert, narrowViewportStyle, ".hero-title", "narrow-viewport home");
  expectDeclarations(assert, narrowViewportStyle, "html", {
    "background-color": "#0a0e1a",
  }, "narrow-viewport root");
  expectDeclarations(assert, narrowViewportStyle, "body", {
    "background-color": "#0a0e1a",
  }, "narrow-viewport body");
  expectMobileAmbientBackground(assert, narrowViewportStyle, ".ambient-background", "narrow-viewport home background", { backgroundColor: "#0b1021", allowStars: true });
  expectDeclarations(assert, narrowViewportStyle, "#particles-canvas", {
    "display": "none",
  }, "narrow-viewport home");
  expectDeclarations(assert, narrowViewportStyle, ".glow-orb", {
    "display": "none",
  }, "narrow-viewport home");
  expectDeclarations(assert, narrowViewportStyle, ".hero-section", {
    "padding": "clamp(148px, 21svh, 190px) 0 48px",
    "gap": "12px",
  }, "narrow-viewport home");
  expectDeclarations(assert, narrowViewportStyle, ".hero-search input", {
    "min-height": "44px",
    "padding": "10px 58px 10px 16px",
  }, "narrow-viewport home search field");
  expectDeclarations(assert, compactViewportStyle, ".hero-title", {
    "font-size": "2.44rem",
    "letter-spacing": "0",
  }, "compact-viewport home");
  expectDeclarations(assert, compactViewportStyle, ".hero-search input", {
    "min-height": "44px",
    "padding": "10px 58px 10px 14px",
  }, "compact-viewport home search field");
  expectDeclarations(assert, ultraNarrowViewportStyle, ".hero-title", {
    "max-width": "100%",
    "white-space": "normal",
    "overflow-wrap": "anywhere",
    "text-wrap": "balance",
    "font-size": "clamp(1.85rem, 10vw, 2.24rem)",
  }, "ultra-narrow home title");

  expectDeclarations(assert, narrowViewportBlog, ".blog-grid", {
    "grid-template-columns": "repeat(2, minmax(0, 1fr))",
    "max-width": "460px",
  }, "narrow-viewport blog grid");
  expectBlogCardMobileContract(assert, narrowViewportBlog, "narrow-viewport blog cards", "24px");
  expectTouchTargetContract(assert, narrowViewportBlog, ".page-btn,\n  .empty-state-action", "narrow-viewport targets");
  expectBookmarkHitAreaContract(assert, touchOnlyBlog, "touch-first bookmark hit area");
  expectDeclarations(assert, compactViewportBlog, ".blog-card-body", {
    "grid-template-columns": "minmax(0, 1fr) 24px",
  }, "compact-viewport blog cards");
  expectDeclarations(assert, compactViewportBlog, ".blog-card-category", {
    "display": "inline-flex",
    "min-height": "17px",
    "white-space": "nowrap",
  }, "compact-viewport blog cards");
  expectDeclarations(assert, compactViewportBlog, ".blog-card-meta", {
    "align-self": "center",
    "justify-self": "end",
    "gap": "0",
  }, "compact-viewport blog cards");
  expectDeclarations(assert, compactViewportBlog, ".card-bookmark-btn", {
    "width": "21px",
    "height": "21px",
  }, "compact-viewport blog cards");

  expectDeclarations(assert, narrowViewportPost, 'body[data-page="post"] #spa-content,\n  body[data-page="post"] .page-transition-wrapper,\n  body[data-page="post"] .post-container,\n  body[data-page="post"] .post-article,\n  body[data-page="post"] .post-content', {
    "width": "100%",
    "max-width": "100%",
    "min-width": "0",
    "overflow-x": "hidden",
  }, "narrow-viewport post wrappers");
  expectDeclarations(assert, touchOnlyPost, ".fab-bookmark:hover", {
    "width": "40px",
    "gap": "0",
    "transform": "none",
  }, "touch-first post bookmark hover suppression");

  assert.doesNotMatch(touchOnlyBlog, /\.blog-grid\s*\{/, "touch capability queries must not control blog grid reflow");
  assert.doesNotMatch(touchOnlyPost, /\.post-container\s*[,{]/, "touch capability queries must not control post width");
  assert.doesNotMatch(
    blogPageCss.slice(blogPageCss.indexOf("MOBILE_FALLBACKS_START")),
    /is-mobile-device-viewport \.blog-grid/,
    "generated touch fallback must not duplicate structural blog reflow",
  );
}
