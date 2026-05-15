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
    "width": "26px",
    "height": "26px",
  }, label);
}

export function runMobileLayoutChecks(context) {
  const { assert, blogPageCss, styleCss } = context;
  const realMobileStyle = extractCssBlock(
    styleCss,
    "@media (max-width: 768px) and (hover: none) and (pointer: coarse)",
  );
  const narrowMobileStyle = extractCssBlock(
    styleCss,
    "@media (max-width: 540px) and (hover: none) and (pointer: coarse)",
  );
  const realMobileBlog = extractCssBlock(
    blogPageCss,
    "@media (max-width: 768px) and (hover: none) and (pointer: coarse)",
  );
  const narrowMobileBlog = extractCssBlock(
    blogPageCss,
    "@media (max-width: 540px) and (hover: none) and (pointer: coarse)",
  );
  const mobileFallbackBlog = blogPageCss.slice(
    blogPageCss.indexOf("html.is-mobile-device-viewport .blog-card.visible"),
  );
  const mobileFallbackStyle = styleCss.slice(
    styleCss.indexOf("html.is-mobile-device-viewport .glow-orb"),
  );
  const narrowMobileFallbackStyle = extractCssBlock(
    mobileFallbackStyle,
    "@media (max-width: 540px)",
  );

  expectStaticGradientTitle(assert, realMobileStyle, ".hero-title", "real-mobile home");
  expectStaticGradientTitle(assert, mobileFallbackStyle, "html.is-mobile-device-viewport .hero-title", "mobile fallback home");
  expectDeclarations(assert, realMobileStyle, "html", {
    "background-color": "#0a0e1a",
  }, "real-mobile root");
  expectDeclarations(assert, realMobileStyle, "body", {
    "background-color": "#0a0e1a",
  }, "real-mobile body");
  expectDeclarations(assert, mobileFallbackStyle, "html.is-mobile-device-viewport", {
    "background-color": "#0a0e1a",
  }, "mobile fallback root");
  expectDeclarations(assert, mobileFallbackStyle, "html.is-mobile-device-viewport body", {
    "background-color": "#0a0e1a",
  }, "mobile fallback body");
  expectMobileAmbientBackground(assert, realMobileStyle, ".ambient-background", "real-mobile home background", { backgroundColor: "#0b1021", allowStars: true });
  expectMobileAmbientBackground(assert, mobileFallbackStyle, "html.is-mobile-device-viewport .ambient-background", "mobile fallback home background", { backgroundColor: "#0b1021", allowStars: true });
  expectDeclarations(assert, realMobileStyle, "#particles-canvas", {
    "display": "none",
  }, "real-mobile home");
  expectDeclarations(assert, mobileFallbackStyle, "html.is-mobile-device-viewport #particles-canvas", {
    "display": "none",
  }, "mobile fallback home");
  expectDeclarations(assert, realMobileStyle, ".hero-section", {
    "padding": "clamp(148px, 21svh, 190px) 0 48px",
    "gap": "12px",
  }, "real-mobile home");
  expectDeclarations(assert, mobileFallbackStyle, "html.is-mobile-device-viewport .hero-section", {
    "padding": "clamp(148px, 21svh, 190px) 0 48px",
    "gap": "12px",
  }, "mobile fallback home");
  expectDeclarations(assert, narrowMobileStyle, ".hero-title", {
    "font-size": "2.44rem",
    "letter-spacing": "0",
  }, "narrow real-mobile home");
  expectDeclarations(assert, narrowMobileFallbackStyle, "html.is-mobile-device-viewport .hero-title", {
    "font-size": "2.44rem",
    "letter-spacing": "0",
  }, "narrow mobile fallback home");

  const heroGlowContract = {
    "width": "480px",
    "height": "480px",
    "top": "54%",
    "border-radius": "50%",
  };
  expectDeclarations(assert, realMobileStyle, ".hero-section::after", heroGlowContract, "real-mobile hero glow");
  expectDeclarations(assert, mobileFallbackStyle, "html.is-mobile-device-viewport .hero-section::after", heroGlowContract, "mobile fallback hero glow");
  const heroGlowBackgroundRealMobile = readRuleDeclarations(realMobileStyle, ".hero-section::after").get("background") || "";
  const heroGlowBackgroundMobileFallback = readRuleDeclarations(mobileFallbackStyle, "html.is-mobile-device-viewport .hero-section::after").get("background") || "";
  assert.equal(
    heroGlowBackgroundRealMobile,
    heroGlowBackgroundMobileFallback,
    "mobile hero glow background must match between the media query and the is-mobile-device-viewport fallback",
  );
  assert.match(
    heroGlowBackgroundRealMobile,
    /rgba\(73,\s*145,\s*255,\s*0\.24\)/,
    "mobile hero glow inner stop should keep the v5.8 brightened opacity",
  );

  expectBlogCardMobileContract(assert, realMobileBlog, "real-mobile blog cards", "30px");
  expectBlogCardMobileContract(assert, mobileFallbackBlog, "mobile fallback blog cards", "28px");
  expectDeclarations(assert, narrowMobileBlog, ".blog-card-body", {
    "grid-template-columns": "minmax(0, 1fr) 28px",
  }, "narrow real-mobile blog cards");
  expectDeclarations(assert, narrowMobileBlog, ".blog-card-category", {
    "display": "inline-flex",
    "min-height": "21px",
    "white-space": "nowrap",
  }, "narrow real-mobile blog cards");
  expectDeclarations(assert, narrowMobileBlog, ".blog-card-meta", {
    "align-self": "center",
    "justify-self": "end",
    "gap": "0",
  }, "narrow real-mobile blog cards");
  expectDeclarations(assert, narrowMobileBlog, ".card-bookmark-btn", {
    "width": "26px",
    "height": "26px",
  }, "narrow real-mobile blog cards");
}
