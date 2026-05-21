(function (root, factory) {
  const sharedContent = typeof module === "object" && module.exports
    ? require("./notion-content-shared")
    : root?.NotionContentShared;
  const sharedUtils = typeof module === "object" && module.exports
    ? require("./notion-content-utils")
    : root?.NotionContentUtils;
  const contentUrl = typeof module === "object" && module.exports
    ? require("./notion-content-url")
    : root?.NotionContentUrl;
  const articleRenderer = typeof module === "object" && module.exports
    ? require("./notion-article-renderer")
    : root?.NotionArticleRenderer;
  const exported = factory(
    sharedContent || {},
    sharedUtils || {},
    contentUrl || {},
    articleRenderer || {},
  );

  if (typeof module === "object" && module.exports) {
    module.exports = exported;
  } else if (root) {
    root.NotionContent = exported;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, (
  sharedContent = {},
  sharedUtils = {},
  contentUrl = {},
  articleRenderer = {},
) => {
  const NOTION_ANNOTATION_STYLES = {
    gray: "color: #9b9a97;",
    brown: "color: #937264;",
    orange: "color: #ffa344;",
    yellow: "color: #ffd43b;",
    green: "color: #4caf50;",
    blue: "color: #4dabf7;",
    purple: "color: #c77dff;",
    pink: "color: #ff7aa2;",
    red: "color: #ff6b6b;",
    gray_background: "background: rgba(155, 154, 151, 0.16); color: var(--text-primary); border-radius: 0.2em; padding: 0 0.2em;",
    brown_background: "background: rgba(147, 114, 100, 0.18); color: var(--text-primary); border-radius: 0.2em; padding: 0 0.2em;",
    orange_background: "background: rgba(255, 163, 68, 0.18); color: var(--text-primary); border-radius: 0.2em; padding: 0 0.2em;",
    yellow_background: "background: rgba(255, 212, 59, 0.18); color: var(--text-primary); border-radius: 0.2em; padding: 0 0.2em;",
    green_background: "background: rgba(76, 175, 80, 0.18); color: var(--text-primary); border-radius: 0.2em; padding: 0 0.2em;",
    blue_background: "background: rgba(77, 171, 247, 0.18); color: var(--text-primary); border-radius: 0.2em; padding: 0 0.2em;",
    purple_background: "background: rgba(199, 125, 255, 0.18); color: var(--text-primary); border-radius: 0.2em; padding: 0 0.2em;",
    pink_background: "background: rgba(255, 122, 162, 0.18); color: var(--text-primary); border-radius: 0.2em; padding: 0 0.2em;",
    red_background: "background: rgba(255, 107, 107, 0.18); color: var(--text-primary); border-radius: 0.2em; padding: 0 0.2em;",
  };
  const {
    ALL_CATEGORY,
    BOOKMARK_CATEGORY,
    BOOKMARK_ONLY_CATEGORIES,
    CATEGORY_COLORS,
    CATEGORY_GRADIENTS,
    DEFAULT_CATEGORY_COLOR,
    DEFAULT_COVER_GRADIENT,
    DEFAULT_SHARE_IMAGE_PATH,
    FEATURED_CATEGORY_DEFINITIONS,
    REMOTE_BLOG_CATEGORIES,
    SUPPORTED_BLOG_CATEGORIES,
    getBookmarkOnlyCategories,
    getCategoryColor,
    getRemoteBlogCategories,
    getSupportedBlogCategories,
    gradientForCategory,
  } = sharedContent;

  const {
    DEFAULT_NOTION_CONTENT_PROPERTY_CANDIDATES,
    buildPostSearchText,
    escapeHtml,
    getBaseOrigin,
    getPageProperty,
    normalizeName,
    normalizePostTags,
    normalizeSearchText,
    resolveNotionContentSchema,
    sanitizeCssColorValue,
  } = sharedUtils;
  const {
    IMAGE_PROXY_PATH,
    SAFE_IMAGE_PROTOCOLS,
    SAFE_LINK_PROTOCOLS,
    getUrlHostname,
    isLikelyEphemeralAssetUrl,
    resolveDisplayImageUrl,
    resolveEmbeddableUrl,
    resolveProxiedDisplayImageUrl,
    resolveShareImageUrl,
    sanitizeCspResourceUrl,
    sanitizeUrl,
    shouldOpenLinkInNewTab,
  } = contentUrl;
  const {
    CALENDAR_ICON_SVG,
    CLOCK_ICON_SVG,
    createPostArticleRenderer,
  } = articleRenderer;

  const REQUIRED_DEPENDENCIES = [
    { path: "sharedContent.ALL_CATEGORY", value: ALL_CATEGORY, kind: "truthy" },
    { path: "sharedContent.BOOKMARK_CATEGORY", value: BOOKMARK_CATEGORY, kind: "truthy" },
    { path: "sharedContent.BOOKMARK_ONLY_CATEGORIES", value: BOOKMARK_ONLY_CATEGORIES, kind: "truthy" },
    { path: "sharedContent.CATEGORY_COLORS", value: CATEGORY_COLORS, kind: "truthy" },
    { path: "sharedContent.CATEGORY_GRADIENTS", value: CATEGORY_GRADIENTS, kind: "truthy" },
    { path: "sharedContent.DEFAULT_CATEGORY_COLOR", value: DEFAULT_CATEGORY_COLOR, kind: "truthy" },
    { path: "sharedContent.DEFAULT_COVER_GRADIENT", value: DEFAULT_COVER_GRADIENT, kind: "truthy" },
    { path: "sharedContent.DEFAULT_SHARE_IMAGE_PATH", value: DEFAULT_SHARE_IMAGE_PATH, kind: "string" },
    { path: "sharedContent.FEATURED_CATEGORY_DEFINITIONS", value: FEATURED_CATEGORY_DEFINITIONS, kind: "truthy" },
    { path: "sharedContent.REMOTE_BLOG_CATEGORIES", value: REMOTE_BLOG_CATEGORIES, kind: "truthy" },
    { path: "sharedContent.SUPPORTED_BLOG_CATEGORIES", value: SUPPORTED_BLOG_CATEGORIES, kind: "truthy" },
    { path: "sharedContent.getBookmarkOnlyCategories", value: getBookmarkOnlyCategories, kind: "function" },
    { path: "sharedContent.getCategoryColor", value: getCategoryColor, kind: "function" },
    { path: "sharedContent.getRemoteBlogCategories", value: getRemoteBlogCategories, kind: "function" },
    { path: "sharedContent.getSupportedBlogCategories", value: getSupportedBlogCategories, kind: "function" },
    { path: "sharedContent.gradientForCategory", value: gradientForCategory, kind: "function" },
    { path: "sharedUtils.DEFAULT_NOTION_CONTENT_PROPERTY_CANDIDATES", value: DEFAULT_NOTION_CONTENT_PROPERTY_CANDIDATES, kind: "truthy" },
    { path: "sharedUtils.buildPostSearchText", value: buildPostSearchText, kind: "function" },
    { path: "sharedUtils.escapeHtml", value: escapeHtml, kind: "function" },
    { path: "sharedUtils.getBaseOrigin", value: getBaseOrigin, kind: "function" },
    { path: "sharedUtils.getPageProperty", value: getPageProperty, kind: "function" },
    { path: "sharedUtils.normalizeName", value: normalizeName, kind: "function" },
    { path: "sharedUtils.normalizePostTags", value: normalizePostTags, kind: "function" },
    { path: "sharedUtils.normalizeSearchText", value: normalizeSearchText, kind: "function" },
    { path: "sharedUtils.resolveNotionContentSchema", value: resolveNotionContentSchema, kind: "function" },
    { path: "sharedUtils.sanitizeCssColorValue", value: sanitizeCssColorValue, kind: "function" },
    { path: "contentUrl.IMAGE_PROXY_PATH", value: IMAGE_PROXY_PATH, kind: "truthy" },
    { path: "contentUrl.SAFE_IMAGE_PROTOCOLS", value: SAFE_IMAGE_PROTOCOLS, kind: "truthy" },
    { path: "contentUrl.SAFE_LINK_PROTOCOLS", value: SAFE_LINK_PROTOCOLS, kind: "truthy" },
    { path: "contentUrl.getUrlHostname", value: getUrlHostname, kind: "function" },
    { path: "contentUrl.isLikelyEphemeralAssetUrl", value: isLikelyEphemeralAssetUrl, kind: "function" },
    { path: "contentUrl.resolveDisplayImageUrl", value: resolveDisplayImageUrl, kind: "function" },
    { path: "contentUrl.resolveEmbeddableUrl", value: resolveEmbeddableUrl, kind: "function" },
    { path: "contentUrl.resolveProxiedDisplayImageUrl", value: resolveProxiedDisplayImageUrl, kind: "function" },
    { path: "contentUrl.resolveShareImageUrl", value: resolveShareImageUrl, kind: "function" },
    { path: "contentUrl.sanitizeCspResourceUrl", value: sanitizeCspResourceUrl, kind: "function" },
    { path: "contentUrl.sanitizeUrl", value: sanitizeUrl, kind: "function" },
    { path: "contentUrl.shouldOpenLinkInNewTab", value: shouldOpenLinkInNewTab, kind: "function" },
    { path: "articleRenderer.createPostArticleRenderer", value: createPostArticleRenderer, kind: "function" },
    { path: "articleRenderer.CALENDAR_ICON_SVG", value: CALENDAR_ICON_SVG, kind: "string" },
    { path: "articleRenderer.CLOCK_ICON_SVG", value: CLOCK_ICON_SVG, kind: "string" },
  ];
  const missingDependencies = REQUIRED_DEPENDENCIES
    .filter(({ value, kind }) => (
      kind === "function" ? typeof value !== "function"
        : kind === "string" ? typeof value !== "string"
          : !value
    ))
    .map(({ path }) => path);

  if (missingDependencies.length > 0) {
    throw new Error(
      `notion-content.js dependencies missing or wrong type: ${missingDependencies.join(", ")}. ` +
      "Ensure notion-content-shared.js, notion-content-utils.js, notion-content-url.js, " +
      "and notion-article-renderer.js load before notion-content.js.",
    );
  }

  const LATEX_SYMBOLS = Object.freeze({
    alpha: "α",
    beta: "β",
    gamma: "γ",
    delta: "δ",
    epsilon: "ε",
    varepsilon: "ε",
    zeta: "ζ",
    eta: "η",
    theta: "θ",
    vartheta: "ϑ",
    iota: "ι",
    kappa: "κ",
    lambda: "λ",
    mu: "μ",
    nu: "ν",
    xi: "ξ",
    pi: "π",
    varpi: "ϖ",
    rho: "ρ",
    sigma: "σ",
    tau: "τ",
    upsilon: "υ",
    phi: "φ",
    varphi: "φ",
    chi: "χ",
    psi: "ψ",
    omega: "ω",
    Gamma: "Γ",
    Delta: "Δ",
    Theta: "Θ",
    Lambda: "Λ",
    Xi: "Ξ",
    Pi: "Π",
    Sigma: "Σ",
    Upsilon: "Υ",
    Phi: "Φ",
    Psi: "Ψ",
    Omega: "Ω",
    infty: "∞",
    infinity: "∞",
    partial: "∂",
    nabla: "∇",
    emptyset: "∅",
    ell: "ℓ",
    le: "≤",
    leq: "≤",
    ge: "≥",
    geq: "≥",
    ne: "≠",
    neq: "≠",
    approx: "≈",
    sim: "∼",
    simeq: "≃",
    equiv: "≡",
    propto: "∝",
    times: "×",
    cdot: "⋅",
    div: "÷",
    pm: "±",
    mp: "∓",
    to: "→",
    rightarrow: "→",
    leftarrow: "←",
    leftrightarrow: "↔",
    Rightarrow: "⇒",
    Leftarrow: "⇐",
    Leftrightarrow: "⇔",
    implies: "⇒",
    iff: "⇔",
    sum: "∑",
    prod: "∏",
    int: "∫",
    oint: "∮",
    forall: "∀",
    exists: "∃",
    in: "∈",
    notin: "∉",
    subset: "⊂",
    subseteq: "⊆",
    supset: "⊃",
    supseteq: "⊇",
    cup: "∪",
    cap: "∩",
    land: "∧",
    lor: "∨",
    neg: "¬",
    angle: "∠",
    degree: "°",
  });

  const LATEX_OPERATOR_COMMANDS = new Set([
    "arccos",
    "arcsin",
    "arctan",
    "cos",
    "cosh",
    "cot",
    "csc",
    "det",
    "dim",
    "exp",
    "gcd",
    "hom",
    "ker",
    "lg",
    "lim",
    "ln",
    "log",
    "max",
    "min",
    "Pr",
    "sec",
    "sin",
    "sinh",
    "sup",
    "tan",
    "tanh",
  ]);
  const LATEX_OPERATOR_SYMBOLS = new Set([
    "approx",
    "cap",
    "cdot",
    "cup",
    "degree",
    "div",
    "equiv",
    "exists",
    "forall",
    "ge",
    "geq",
    "in",
    "int",
    "land",
    "le",
    "leq",
    "leftarrow",
    "leftrightarrow",
    "Leftarrow",
    "Leftrightarrow",
    "lor",
    "mp",
    "ne",
    "neq",
    "neg",
    "notin",
    "oint",
    "pm",
    "prod",
    "propto",
    "rightarrow",
    "Rightarrow",
    "sim",
    "simeq",
    "subset",
    "subseteq",
    "sum",
    "supset",
    "supseteq",
    "times",
    "to",
  ]);
  const LATEX_SPACING_COMMANDS = new Set([" ", ",", ":", ";", "!", "quad", "qquad", "thinspace"]);
  const LATEX_DELIMITER_COMMANDS = Object.freeze({
    lbrace: "{",
    rbrace: "}",
    langle: "⟨",
    rangle: "⟩",
    lvert: "|",
    rvert: "|",
    lVert: "‖",
    rVert: "‖",
  });
  const LATEX_ACCENTS = Object.freeze({
    bar: "¯",
    hat: "^",
    tilde: "~",
    vec: "→",
    dot: ".",
  });
  const MATH_ENVIRONMENT_DELIMITERS = Object.freeze({
    pmatrix: ["(", ")"],
    bmatrix: ["[", "]"],
    Bmatrix: ["{", "}"],
    vmatrix: ["|", "|"],
    Vmatrix: ["‖", "‖"],
  });
  const LATEX_MATH_VARIANTS = Object.freeze({
    mathbb: "double-struck",
    mathcal: "script",
    mathfrak: "fraktur",
    mathbf: "bold",
    mathsf: "sans-serif",
    mathtt: "monospace",
  });
  const MAX_LATEX_PARSE_DEPTH = 32;

  function normalizeLatexExpression(expression) {
    let source = String(expression || "").trim();
    if ((source.startsWith("$$") && source.endsWith("$$")) || (source.startsWith("\\[") && source.endsWith("\\]"))) {
      source = source.slice(2, -2).trim();
    } else if (source.startsWith("\\(") && source.endsWith("\\)")) {
      source = source.slice(2, -2).trim();
    } else if (source.startsWith("$") && source.endsWith("$")) {
      source = source.slice(1, -1).trim();
    }

    return source;
  }

  function isLatexLetter(character) {
    return /^[A-Za-z]$/.test(character);
  }

  function isLatexDigit(character) {
    return /^[0-9]$/.test(character);
  }

  function skipLatexSpaces(state) {
    while (state.index < state.source.length && /\s/.test(state.source[state.index])) {
      state.index += 1;
    }
  }

  function readLatexCommand(state) {
    if (state.source[state.index] !== "\\") return "";
    state.index += 1;
    const start = state.index;
    while (state.index < state.source.length && isLatexLetter(state.source[state.index])) {
      state.index += 1;
    }
    if (state.index > start) return state.source.slice(start, state.index);
    if (state.index >= state.source.length) return "";
    return state.source[state.index++] || "";
  }

  function readRawLatexGroup(state, open = "{", close = "}") {
    skipLatexSpaces(state);
    if (state.source[state.index] !== open) return "";

    state.index += 1;
    let depth = 1;
    const start = state.index;
    while (state.index < state.source.length) {
      const character = state.source[state.index];
      if (character === "\\") {
        state.index += 2;
        continue;
      }
      if (character === open) depth += 1;
      if (character === close) depth -= 1;
      if (depth === 0) {
        const raw = state.source.slice(start, state.index);
        state.index += 1;
        return raw;
      }
      state.index += 1;
    }

    return state.source.slice(start);
  }

  function splitLatexRows(source) {
    return String(source || "")
      .split(/\\\\/)
      .map((row) => row.trim())
      .filter(Boolean);
  }

  function splitLatexCells(source) {
    return String(source || "").split("&").map((cell) => cell.trim());
  }

  function wrapMathRow(html) {
    return `<mrow>${html || ""}</mrow>`;
  }

  function createMathIdentifier(value, attributes = "") {
    return `<mi${attributes}>${escapeHtml(value)}</mi>`;
  }

  function createMathOperator(value) {
    return `<mo>${escapeHtml(value)}</mo>`;
  }

  function enterLatexParseDepth(state) {
    state.depth = (state.depth || 0) + 1;
    if (state.depth > MAX_LATEX_PARSE_DEPTH) {
      throw new Error("LaTeX expression exceeds the supported nesting depth");
    }
  }

  function exitLatexParseDepth(state) {
    state.depth = Math.max(0, (state.depth || 0) - 1);
  }

  function renderMathFallback(source, { display = false } = {}) {
    const className = display
      ? "post-math post-math-display post-math-fallback"
      : "post-math post-math-inline post-math-fallback";
    const label = escapeHtml(source);
    return `<span class="${className}" aria-label="${label}">${label}</span>`;
  }

  function parseLatexFragment(source) {
    const state = {
      source: normalizeLatexExpression(source),
      index: 0,
      depth: 0,
    };
    return parseLatexSequence(state);
  }

  function parseLatexRequiredArgument(state) {
    skipLatexSpaces(state);
    if (state.source[state.index] === "{") {
      state.index += 1;
      const html = parseLatexSequence(state, "}");
      if (state.source[state.index] === "}") state.index += 1;
      return wrapMathRow(html);
    }

    const atom = parseLatexAtom(state);
    return atom ? applyLatexScripts(state, atom) : wrapMathRow("");
  }

  function parseLatexScriptArgument(state) {
    skipLatexSpaces(state);
    if (state.source[state.index] === "{") {
      state.index += 1;
      const html = parseLatexSequence(state, "}");
      if (state.source[state.index] === "}") state.index += 1;
      return wrapMathRow(html);
    }

    return parseLatexAtom(state) || wrapMathRow("");
  }

  function parseLatexOptionalArgument(state) {
    skipLatexSpaces(state);
    if (state.source[state.index] !== "[") return "";
    state.index += 1;
    const html = parseLatexSequence(state, "]");
    if (state.source[state.index] === "]") state.index += 1;
    return wrapMathRow(html);
  }

  function parseLatexEnvironment(command, state) {
    const environmentName = readRawLatexGroup(state);
    if (!environmentName) return createMathIdentifier(command);

    const endToken = `\\end{${environmentName}}`;
    const endIndex = state.source.indexOf(endToken, state.index);
    if (endIndex === -1) return createMathIdentifier(environmentName);

    const body = state.source.slice(state.index, endIndex);
    state.index = endIndex + endToken.length;
    const rows = splitLatexRows(body);
    const tableHtml = `<mtable>${rows.map((row) => `<mtr>${splitLatexCells(row).map((cell) => `<mtd>${wrapMathRow(parseLatexFragment(cell))}</mtd>`).join("")}</mtr>`).join("")}</mtable>`;
    const delimiters = MATH_ENVIRONMENT_DELIMITERS[environmentName];
    if (!delimiters) return tableHtml;

    return `<mrow>${createMathOperator(delimiters[0])}${tableHtml}${createMathOperator(delimiters[1])}</mrow>`;
  }

  function parseLatexCommand(state) {
    const command = readLatexCommand(state);
    if (!command) return "";

    if (LATEX_SPACING_COMMANDS.has(command)) {
      return command === "!" ? "" : '<mspace width="0.22em"></mspace>';
    }

    if (command === "frac" || command === "dfrac" || command === "tfrac") {
      return `<mfrac>${parseLatexRequiredArgument(state)}${parseLatexRequiredArgument(state)}</mfrac>`;
    }

    if (command === "sqrt") {
      const indexHtml = parseLatexOptionalArgument(state);
      const radicand = parseLatexRequiredArgument(state);
      return indexHtml ? `<mroot>${radicand}${indexHtml}</mroot>` : `<msqrt>${radicand}</msqrt>`;
    }

    if (command === "text") {
      return `<mtext>${escapeHtml(readRawLatexGroup(state))}</mtext>`;
    }

    if (command === "mathrm" || command === "operatorname") {
      return createMathIdentifier(readRawLatexGroup(state), ' mathvariant="normal"');
    }

    if (LATEX_MATH_VARIANTS[command]) {
      return createMathIdentifier(
        readRawLatexGroup(state),
        ` mathvariant="${LATEX_MATH_VARIANTS[command]}"`,
      );
    }

    if (command === "overline") {
      return `<mover accent="true">${parseLatexRequiredArgument(state)}<mo stretchy="true">‾</mo></mover>`;
    }

    if (command === "underline") {
      return `<munder accentunder="true">${parseLatexRequiredArgument(state)}<mo stretchy="true">_</mo></munder>`;
    }

    if (command === "boxed") {
      return `<menclose notation="box">${parseLatexRequiredArgument(state)}</menclose>`;
    }

    if (command === "begin") {
      return parseLatexEnvironment(command, state);
    }

    if (command === "left" || command === "right" || command === "big" || command === "Big" || command === "bigg" || command === "Bigg") {
      skipLatexSpaces(state);
      if (state.source[state.index] === ".") {
        state.index += 1;
        return "";
      }
      return parseLatexAtom(state);
    }

    if (LATEX_ACCENTS[command]) {
      return `<mover>${parseLatexRequiredArgument(state)}${createMathOperator(LATEX_ACCENTS[command])}</mover>`;
    }

    if (LATEX_DELIMITER_COMMANDS[command]) {
      return createMathOperator(LATEX_DELIMITER_COMMANDS[command]);
    }

    if (LATEX_SYMBOLS[command]) {
      const value = LATEX_SYMBOLS[command];
      return LATEX_OPERATOR_SYMBOLS.has(command) ? createMathOperator(value) : createMathIdentifier(value);
    }

    if (LATEX_OPERATOR_COMMANDS.has(command)) {
      return createMathIdentifier(command, ' mathvariant="normal"');
    }

    if (command === "\\") {
      return '<mspace linebreak="newline"></mspace>';
    }

    return createMathIdentifier(command);
  }

  function parseLatexAtom(state) {
    skipLatexSpaces(state);
    const character = state.source[state.index];
    if (!character) return "";

    if (character === "\\") {
      return parseLatexCommand(state);
    }

    if (character === "{") {
      state.index += 1;
      const html = parseLatexSequence(state, "}");
      if (state.source[state.index] === "}") state.index += 1;
      return wrapMathRow(html);
    }

    if (isLatexDigit(character) || (character === "." && isLatexDigit(state.source[state.index + 1]))) {
      const start = state.index;
      state.index += 1;
      while (state.index < state.source.length && /[0-9.]/.test(state.source[state.index])) {
        state.index += 1;
      }
      return `<mn>${escapeHtml(state.source.slice(start, state.index))}</mn>`;
    }

    state.index += 1;
    if (isLatexLetter(character)) return createMathIdentifier(character);
    return createMathOperator(character);
  }

  function applyLatexScripts(state, baseHtml) {
    let subscriptHtml = "";
    let superscriptHtml = "";

    while (state.index < state.source.length) {
      skipLatexSpaces(state);
      const marker = state.source[state.index];
      if (marker !== "_" && marker !== "^") break;
      state.index += 1;
      const argument = parseLatexScriptArgument(state);
      if (marker === "_") {
        subscriptHtml = argument;
      } else {
        superscriptHtml = argument;
      }
    }

    if (subscriptHtml && superscriptHtml) return `<msubsup>${baseHtml}${subscriptHtml}${superscriptHtml}</msubsup>`;
    if (subscriptHtml) return `<msub>${baseHtml}${subscriptHtml}</msub>`;
    if (superscriptHtml) return `<msup>${baseHtml}${superscriptHtml}</msup>`;
    return baseHtml;
  }

  function parseLatexSequence(state, stopCharacter = "") {
    enterLatexParseDepth(state);
    try {
      const nodes = [];
      while (state.index < state.source.length) {
        if (stopCharacter && state.source[state.index] === stopCharacter) break;
        const atom = parseLatexAtom(state);
        if (atom) nodes.push(applyLatexScripts(state, atom));
      }
      return nodes.join("");
    } finally {
      exitLatexParseDepth(state);
    }
  }

  function renderMathExpression(expression, { display = false } = {}) {
    const source = normalizeLatexExpression(expression);
    if (!source) return "";

    const className = display ? "post-math post-math-display" : "post-math post-math-inline";
    const displayAttribute = display ? ' display="block"' : "";
    const label = escapeHtml(source);
    let bodyHtml = "";
    try {
      bodyHtml = wrapMathRow(parseLatexFragment(source));
    } catch (error) {
      return renderMathFallback(source, { display });
    }

    return `<math class="${className}" xmlns="http://www.w3.org/1998/Math/MathML"${displayAttribute} aria-label="${label}"><semantics>${bodyHtml}<annotation encoding="application/x-tex">${label}</annotation></semantics></math>`;
  }

  function getBlockResourceUrl(blockData) {
    return blockData?.external?.url || blockData?.file?.url || blockData?.url || "";
  }

  function getBlockCaption(blockData) {
    return richTextToPlain(blockData?.caption);
  }

  function getBlockCaptionHtml(blockData, options = {}) {
    return richTextToHtml(blockData?.caption, options);
  }

  function formatBlockTypeLabel(type) {
    return String(type || "unsupported").replace(/_/g, " ");
  }

  function slugifyText(value) {
    return String(value || "")
      .toLowerCase()
      .trim()
      .replace(/<[^>]*>/g, " ")
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function buildHeadingAnchorId(blockId, fallbackText) {
    const source = typeof blockId === "string" && blockId.trim()
      ? blockId.trim()
      : slugifyText(fallbackText) || "section";

    return `heading-${source.replace(/[^a-z0-9\u4e00-\u9fff-]+/gi, "-").replace(/^-+|-+$/g, "")}`;
  }

  function buildHeadingBlock(type, blockId, richText, options = {}) {
    const plainText = richTextToPlain(richText);

    return {
      type,
      text: richTextToHtml(richText, options),
      plainText,
      anchorId: buildHeadingAnchorId(blockId, plainText),
    };
  }

  function buildResourceBlock(resourceType, blockData, options = {}) {
    return {
      type: "resource",
      resourceType,
      url: getBlockResourceUrl(blockData),
      caption: getBlockCaption(blockData),
      captionHtml: getBlockCaptionHtml(blockData, options),
      name: typeof blockData?.name === "string" ? blockData.name : "",
    };
  }

  function buildUnsupportedBlock(block, options = {}, children = []) {
    const type = typeof block?.type === "string" && block.type ? block.type : "unsupported";
    const blockData = block?.[type];
    const richText = blockData?.rich_text || blockData?.caption || [];

    return {
      type: "unsupported",
      blockType: type,
      text: richTextToHtml(richText, options),
      url: getBlockResourceUrl(blockData),
      children,
    };
  }

  function richTextToPlain(richText) {
    return (Array.isArray(richText) ? richText : [])
      .map((item) => item?.plain_text || "")
      .join("");
  }

  function richTextToHtml(richText, { baseOrigin } = {}) {
    const items = Array.isArray(richText) ? richText : [];
    if (!items.length) return "";

    return items.map((item) => {
      const equationExpression = item?.type === "equation" || item?.equation?.expression
        ? item?.equation?.expression || item?.plain_text || ""
        : "";
      let text = equationExpression
        ? renderMathExpression(equationExpression)
        : escapeHtml(item?.plain_text || "");
      const annotations = item?.annotations || {};

      if (!equationExpression) {
        if (annotations.code) text = `<code>${text}</code>`;
        if (annotations.bold) text = `<strong>${text}</strong>`;
        if (annotations.italic) text = `<em>${text}</em>`;
        if (annotations.strikethrough) text = `<del>${text}</del>`;
        if (annotations.underline) text = `<u>${text}</u>`;
        if (annotations.color && NOTION_ANNOTATION_STYLES[annotations.color]) {
          text = `<span style="${NOTION_ANNOTATION_STYLES[annotations.color]}">${text}</span>`;
        }
      }

      const safeHref = sanitizeUrl(item.href, SAFE_LINK_PROTOCOLS, baseOrigin);
      if (safeHref) {
        const newTabAttributes = shouldOpenLinkInNewTab(safeHref, baseOrigin)
          ? ' target="_blank" rel="noopener"'
          : "";
        text = `<a href="${escapeHtml(safeHref)}"${newTabAttributes}>${text}</a>`;
      }

      return text;
    }).join("");
  }

  function mapNotionPage(page, { includeSearchText = false, schema = null } = {}) {
    const titleProperty = getPageProperty(page, schema?.title, DEFAULT_NOTION_CONTENT_PROPERTY_CANDIDATES.title);
    const excerptProperty = getPageProperty(page, schema?.excerpt, DEFAULT_NOTION_CONTENT_PROPERTY_CANDIDATES.excerpt);
    const readTimeProperty = getPageProperty(page, schema?.readTime, DEFAULT_NOTION_CONTENT_PROPERTY_CANDIDATES.readTime);
    const tagsProperty = getPageProperty(page, schema?.tags, DEFAULT_NOTION_CONTENT_PROPERTY_CANDIDATES.tags);
    const categoryProperty = getPageProperty(page, schema?.category, DEFAULT_NOTION_CONTENT_PROPERTY_CANDIDATES.category);
    const dateProperty = getPageProperty(page, schema?.date, DEFAULT_NOTION_CONTENT_PROPERTY_CANDIDATES.date);
    const cover = page?.cover;
    const coverImage = cover?.external?.url || cover?.file?.url || null;
    const category = categoryProperty?.select?.name || "";
    const title = richTextToPlain(titleProperty?.title) || "Untitled";
    const excerpt = richTextToPlain(excerptProperty?.rich_text);
    const readTime = richTextToPlain(readTimeProperty?.rich_text);
    const tags = normalizePostTags(tagsProperty?.multi_select?.map((tag) => tag?.name));
    const mappedPage = {
      id: page.id,
      title,
      excerpt,
      category,
      date: dateProperty?.date?.start || "",
      readTime,
      coverImage,
      coverEmoji: page?.icon?.emoji || "📝",
      coverGradient: gradientForCategory(category),
      tags,
    };

    if (includeSearchText) {
      Object.defineProperty(mappedPage, "_searchText", {
        value: buildPostSearchText({ title, excerpt, tags }),
        enumerable: false,
        configurable: true,
      });
    }

    return mappedPage;
  }

  function mapNotionBlock(block, options = {}) {
    const type = typeof block?.type === "string" && block.type ? block.type : "unsupported";
    const blockData = block?.[type] && typeof block[type] === "object" ? block[type] : {};
    const children = Array.isArray(block?.children)
      ? block.children.map((child) => mapNotionBlock(child, options)).filter(Boolean)
      : [];
    const withChildren = (payload) => (children.length > 0 ? { ...payload, children } : payload);

    const handlers = {
      paragraph: () => withChildren({ type, text: richTextToHtml(blockData.rich_text, options) }),
      heading_1: () => withChildren(buildHeadingBlock(type, block?.id, blockData.rich_text, options)),
      heading_2: () => withChildren(buildHeadingBlock(type, block?.id, blockData.rich_text, options)),
      heading_3: () => withChildren(buildHeadingBlock(type, block?.id, blockData.rich_text, options)),
      bulleted_list_item: () => withChildren({ type, text: richTextToHtml(blockData.rich_text, options) }),
      numbered_list_item: () => withChildren({ type, text: richTextToHtml(blockData.rich_text, options) }),
      code: () => ({ type, language: blockData.language || "", text: richTextToPlain(blockData.rich_text) }),
      quote: () => withChildren({ type, text: richTextToHtml(blockData.rich_text, options) }),
      callout: () => withChildren({
        type,
        text: richTextToHtml(blockData.rich_text, options),
        icon: blockData.icon?.emoji || "",
      }),
      toggle: () => withChildren({ type, text: richTextToHtml(blockData.rich_text, options) }),
      to_do: () => withChildren({
        type,
        text: richTextToHtml(blockData.rich_text, options),
        checked: Boolean(blockData.checked),
      }),
      equation: () => ({
        type,
        expression: blockData.expression || "",
      }),
      bookmark: () => ({ type, url: blockData.url || "" }),
      link_preview: () => buildResourceBlock(type, blockData, options),
      child_page: () => ({ type, title: blockData.title || "" }),
      child_database: () => ({ type, title: blockData.title || "" }),
      synced_block: () => ({ type, children }),
      table_of_contents: () => ({ type }),
      column_list: () => ({ type: "container", children }),
      column: () => ({ type: "container", children }),
      divider: () => ({ type: "divider" }),
      image: () => ({
        type: "image",
        url: blockData.file?.url || blockData.external?.url || "",
        caption: richTextToPlain(blockData.caption),
        captionHtml: richTextToHtml(blockData.caption, options),
      }),
      embed: () => buildResourceBlock(type, blockData, options),
      video: () => buildResourceBlock(type, blockData, options),
      file: () => buildResourceBlock(type, blockData, options),
      pdf: () => buildResourceBlock(type, blockData, options),
      audio: () => buildResourceBlock(type, blockData, options),
      table: () => ({
        type,
        hasColumnHeader: Boolean(blockData.has_column_header),
        hasRowHeader: Boolean(blockData.has_row_header),
        children,
      }),
      table_row: () => ({
        type,
        cells: Array.isArray(blockData.cells)
          ? blockData.cells.map((cell) => richTextToHtml(cell, options))
          : [],
      }),
    };

    if (handlers[type]) {
      return handlers[type]();
    }

    return buildUnsupportedBlock(block, options, children);
  }

  function renderBlocks(blocks, options = {}) {
    if (!Array.isArray(blocks) || blocks.length === 0) return "";

    const resolvedOptions = {
      ...options,
      imageRenderState: options.imageRenderState || { renderedImageCount: 0 },
      tocHeadings: Array.isArray(options.tocHeadings)
        ? options.tocHeadings
        : collectTableOfContentsHeadings(blocks),
    };
    let html = "";
    for (let index = 0; index < blocks.length; index += 1) {
      const block = blocks[index];
      if (!block) continue;

      if (block.type === "bulleted_list_item" || block.type === "numbered_list_item") {
        const tag = block.type === "bulleted_list_item" ? "ul" : "ol";
        const items = [];

        while (index < blocks.length && blocks[index]?.type === block.type) {
          items.push(blocks[index]);
          index += 1;
        }

        index -= 1;
        html += `<${tag}>${items.map((item) => renderListItem(item, resolvedOptions)).join("")}</${tag}>`;
        continue;
      }

      html += renderBlock(block, resolvedOptions);
    }

    return html;
  }

  function renderListItem(block, options = {}) {
    return `<li>${block.text || ""}${renderBlocks(block.children || [], options)}</li>`;
  }

  function getPostImageLoadingAttributes(options = {}) {
    const imageRenderState = options.imageRenderState || { renderedImageCount: 0 };
    const imageIndex = imageRenderState.renderedImageCount;
    imageRenderState.renderedImageCount = imageIndex + 1;

    if (imageIndex === 0) {
      return 'loading="eager" decoding="async" fetchpriority="high"';
    }

    return 'loading="lazy" decoding="async"';
  }

  function getResourceTypeLabel(resourceType) {
    const labels = {
      audio: "Audio",
      embed: "Embed",
      file: "File",
      link_preview: "Link",
      pdf: "PDF",
      video: "Video",
    };

    return labels[resourceType] || formatBlockTypeLabel(resourceType);
  }

  function renderFigureCaption(captionHtml, fallbackText, className) {
    const content = captionHtml || escapeHtml(fallbackText || "");
    if (!content) {
      return "";
    }

    return `<figcaption class="${escapeHtml(className)}">${content}</figcaption>`;
  }

  function collectTableOfContentsHeadings(blocks, headings = []) {
    if (!Array.isArray(blocks) || blocks.length === 0) {
      return headings;
    }

    blocks.forEach((block) => {
      if (!block) {
        return;
      }

      if (block.type === "heading_1" || block.type === "heading_2" || block.type === "heading_3") {
        const level = Number(block.type.split("_")[1]) || 1;
        const text = block.plainText || "";
        if (text) {
          headings.push({
            level,
            text,
            anchorId: block.anchorId || buildHeadingAnchorId(block.id, text),
          });
        }
      }

      if (Array.isArray(block.children) && block.children.length > 0) {
        collectTableOfContentsHeadings(block.children, headings);
      }
    });

    return headings;
  }

  function renderHeadingBlock(tagName, block, childrenHtml) {
    const headingId = block.anchorId
      ? ` id="${escapeHtml(block.anchorId)}"`
      : "";

    return `<${tagName}${headingId}>${block.text || ""}</${tagName}>${childrenHtml}`;
  }

  function renderResourceBlock(block, childrenHtml, baseOrigin) {
    const safeUrl = sanitizeUrl(block.url, SAFE_LINK_PROTOCOLS, baseOrigin);
    const resourceLabel = getResourceTypeLabel(block.resourceType);
    const resourceName = block.name || (safeUrl ? safeUrl : "");
    const linkHtml = safeUrl
      ? `<a class="post-resource-link" href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener">${escapeHtml(resourceName || resourceLabel)}</a>`
      : `<span class="post-resource-link post-resource-link-disabled">${escapeHtml(resourceName || resourceLabel)}</span>`;
    const captionHtml = renderFigureCaption(block.captionHtml, block.caption, "post-resource-caption");
    const resourceTypeClass = String(block.resourceType || "resource").replace(/_/g, "-");

    return `<figure class="post-resource post-resource-${escapeHtml(resourceTypeClass)}"><div class="post-resource-body"><p class="post-block-label">${escapeHtml(resourceLabel)}</p>${linkHtml}</div>${captionHtml}</figure>${childrenHtml}`;
  }

  function renderEmbedLink(block, childrenHtml, safeUrl, hostname) {
    const captionHtml = renderFigureCaption(block.captionHtml, block.caption, "post-resource-caption");
    const linkLabel = block.name || hostname || safeUrl;

    return `<figure class="post-embed post-embed-link-only"><div class="post-embed-meta"><p class="post-block-label">Embed</p><a class="post-resource-link" href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener">${escapeHtml(linkLabel)}</a></div>${captionHtml}</figure>${childrenHtml}`;
  }

  function renderEmbedBlock(block, childrenHtml, baseOrigin) {
    const safeUrl = sanitizeCspResourceUrl(block.url, SAFE_IMAGE_PROTOCOLS, baseOrigin);
    if (!safeUrl) {
      return childrenHtml;
    }

    const hostname = getUrlHostname(safeUrl, baseOrigin);
    const embedUrl = resolveEmbeddableUrl(safeUrl, baseOrigin);
    if (!embedUrl) {
      return renderEmbedLink(block, childrenHtml, safeUrl, hostname);
    }

    const captionHtml = renderFigureCaption(block.captionHtml, block.caption, "post-resource-caption");
    const linkLabel = block.name || hostname || safeUrl;

    return `<figure class="post-embed"><div class="post-embed-meta"><p class="post-block-label">Embed</p><a class="post-resource-link" href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener">${escapeHtml(linkLabel)}</a></div><div class="post-embed-shell"><iframe class="post-embed-frame" src="${escapeHtml(embedUrl)}" title="${escapeHtml(block.name || hostname || "Embedded content")}" loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-presentation"></iframe></div>${captionHtml}</figure>${childrenHtml}`;
  }

  function renderTableRow(block, { cellTag = "td", hasRowHeader = false } = {}) {
    const cells = Array.isArray(block.cells) ? block.cells : [];
    if (cells.length === 0) {
      return "";
    }

    return `<tr>${cells.map((cell, index) => {
      const resolvedTag = hasRowHeader && cellTag === "td" && index === 0 ? "th" : cellTag;
      const scope = resolvedTag === "th"
        ? ` scope="${cellTag === "th" ? "col" : "row"}"`
        : "";
      return `<${resolvedTag}${scope}>${cell || ""}</${resolvedTag}>`;
    }).join("")}</tr>`;
  }

  function renderTableBlock(block, childrenHtml) {
    const rows = Array.isArray(block.children) ? block.children.filter((child) => child?.type === "table_row") : [];
    if (rows.length === 0) {
      return childrenHtml;
    }

    const headerRows = block.hasColumnHeader ? rows.slice(0, 1) : [];
    const bodyRows = block.hasColumnHeader ? rows.slice(1) : rows;
    const headHtml = headerRows.length > 0
      ? `<thead>${headerRows.map((row) => renderTableRow(row, { cellTag: "th" })).join("")}</thead>`
      : "";
    const bodyHtml = bodyRows.length > 0
      ? `<tbody>${bodyRows.map((row) => renderTableRow(row, { hasRowHeader: block.hasRowHeader })).join("")}</tbody>`
      : "";

    return `<div class="post-table-wrapper" role="region" aria-label="Content table" tabindex="0"><table class="post-table"><caption class="visually-hidden">Content table</caption>${headHtml}${bodyHtml}</table></div>${childrenHtml}`;
  }

  function renderUnsupportedBlock(block, childrenHtml, baseOrigin) {
    const safeUrl = sanitizeUrl(block.url, SAFE_LINK_PROTOCOLS, baseOrigin);
    const blockTypeLabel = formatBlockTypeLabel(block.blockType);
    const detailHtml = block.text
      ? `<div class="post-unsupported-detail">${block.text}</div>`
      : "";
    const linkHtml = safeUrl
      ? `<a class="post-unsupported-link" href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener">${escapeHtml(safeUrl)}</a>`
      : "";

    return `<aside class="post-unsupported" aria-label="Unsupported Notion block"><p class="post-unsupported-title">Unsupported block: ${escapeHtml(blockTypeLabel)}</p>${detailHtml}${linkHtml}</aside>${childrenHtml}`;
  }

  function renderBookmarkBlock(block, childrenHtml, baseOrigin) {
    const safeUrl = sanitizeUrl(block.url, SAFE_LINK_PROTOCOLS, baseOrigin);
    if (!safeUrl) {
      return childrenHtml;
    }

    const hostname = getUrlHostname(safeUrl, baseOrigin);

    return `<article class="post-bookmark"><p class="post-block-label">Bookmark</p><a class="post-bookmark-link" href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener"><span class="post-bookmark-title">${escapeHtml(hostname || safeUrl)}</span><span class="post-bookmark-url">${escapeHtml(safeUrl)}</span></a></article>${childrenHtml}`;
  }

  function renderChildReferenceBlock(block, childrenHtml) {
    const label = block.type === "child_database" ? "Child database" : "Child page";

    return `<section class="post-child-page" aria-label="${escapeHtml(label)}"><p class="post-block-label">${escapeHtml(label)}</p><p class="post-child-page-title">${escapeHtml(block.title || "")}</p></section>${childrenHtml}`;
  }

  function renderTableOfContentsBlock(block, childrenHtml, options = {}) {
    const headings = Array.isArray(options.tocHeadings) ? options.tocHeadings : [];
    if (headings.length === 0) {
      return childrenHtml;
    }

    const itemsHtml = headings.map((heading) => {
      const anchorId = escapeHtml(heading.anchorId || "");
      const text = escapeHtml(heading.text || "");
      const levelClass = `level-${Number(heading.level) || 1}`;

      return `<li class="post-table-of-contents-item ${levelClass}"><a href="#${anchorId}">${text}</a></li>`;
    }).join("");

    return `<nav class="post-table-of-contents" aria-label="Table of contents"><p class="post-block-label">Table of contents</p><ol class="post-table-of-contents-list">${itemsHtml}</ol></nav>${childrenHtml}`;
  }

  function createBlockRenderers() {
    const renderers = {
      container: (block, { childrenHtml }) => childrenHtml,
      synced_block: (block, { childrenHtml }) => childrenHtml,
      heading_1: (block, { childrenHtml }) => renderHeadingBlock("h2", block, childrenHtml),
      heading_2: (block, { childrenHtml }) => renderHeadingBlock("h3", block, childrenHtml),
      heading_3: (block, { childrenHtml }) => renderHeadingBlock("h4", block, childrenHtml),
      paragraph: (block, { childrenHtml }) => (block.text ? `<p>${block.text}</p>${childrenHtml}` : childrenHtml),
      code: (block, { childrenHtml }) => `<pre><code class="language-${escapeHtml(block.language)}">${escapeHtml(block.text)}</code></pre>${childrenHtml}`,
      quote: (block, { childrenHtml }) => `<blockquote>${block.text || ""}${childrenHtml}</blockquote>`,
      divider: (block, { childrenHtml }) => `<hr>${childrenHtml}`,
      image: (block, { baseOrigin, childrenHtml, options }) => {
        const safeImageUrl = resolveProxiedDisplayImageUrl(block.url, baseOrigin);
        if (!safeImageUrl) return childrenHtml;
        const captionHtml = renderFigureCaption(block.captionHtml, block.caption, "post-figure-caption");
        return `<figure class="post-figure post-figure-image"><img class="post-figure-media" src="${escapeHtml(safeImageUrl)}" alt="${escapeHtml(block.caption)}" ${getPostImageLoadingAttributes(options)}>${captionHtml}</figure>${childrenHtml}`;
      },
      callout: (block, { childrenHtml }) => {
        const iconHtml = block.icon
          ? `<div class="post-callout-icon" aria-hidden="true">${escapeHtml(block.icon)}</div>`
          : "";
        return `<aside class="post-callout" role="note">${iconHtml}<div class="post-callout-body">${block.text || ""}${childrenHtml}</div></aside>`;
      },
      toggle: (block, { childrenHtml }) => `<details class="post-toggle"><summary>${block.text || ""}</summary>${childrenHtml}</details>`,
      to_do: (block, { childrenHtml }) => `<div class="post-todo${block.checked ? " checked" : ""}"><span class="post-todo-box" aria-hidden="true">${block.checked ? "&#10003;" : ""}</span><div class="post-todo-content"><div class="post-todo-text">${block.text || ""}</div>${childrenHtml}</div></div>`,
      equation: (block, { childrenHtml }) => `<figure class="post-equation"><figcaption class="post-block-label">Equation</figcaption><div class="post-equation-expression">${renderMathExpression(block.expression || "", { display: true })}</div></figure>${childrenHtml}`,
      bookmark: (block, { baseOrigin, childrenHtml }) => renderBookmarkBlock(block, childrenHtml, baseOrigin),
      resource: (block, { baseOrigin, childrenHtml }) => (
        block.resourceType === "embed"
          ? renderEmbedBlock(block, childrenHtml, baseOrigin)
          : renderResourceBlock(block, childrenHtml, baseOrigin)
      ),
      table: (block, { childrenHtml }) => renderTableBlock(block, childrenHtml),
      table_row: (block, { childrenHtml }) => `<div class="post-table-wrapper" role="region" aria-label="Content table row" tabindex="0"><table class="post-table"><caption class="visually-hidden">Content table row</caption><tbody>${renderTableRow(block)}</tbody></table></div>${childrenHtml}`,
      table_of_contents: (block, { childrenHtml, options }) => renderTableOfContentsBlock(block, childrenHtml, options),
      child_page: (block, { childrenHtml }) => renderChildReferenceBlock(block, childrenHtml),
      child_database: (block, { childrenHtml }) => renderChildReferenceBlock(block, childrenHtml),
      unsupported: (block, { baseOrigin, childrenHtml }) => renderUnsupportedBlock(block, childrenHtml, baseOrigin),
    };

    return Object.freeze(renderers);
  }

  const blockRenderers = createBlockRenderers();

  function renderBlock(block, options = {}) {
    const childrenHtml = renderBlocks(block.children || [], options);
    const baseOrigin = options.baseOrigin;
    const renderer = blockRenderers[block.type];

    return typeof renderer === "function"
      ? renderer(block, { baseOrigin, childrenHtml, options })
      : childrenHtml;
  }

  const { renderPostArticle, renderPostTags } = createPostArticleRenderer({
    DEFAULT_CATEGORY_COLOR,
    escapeHtml,
    getCategoryColor,
    renderBlocks,
    sanitizeCssColorValue,
  });

  function buildArticleStructuredData(post, {
    canonicalUrl,
    defaultShareImageUrl,
    imageUrl,
    siteName = sharedContent.DEFAULT_SITE_NAME || "Site",
    baseOrigin,
  } = {}) {
    const resolvedBaseOrigin = getBaseOrigin(baseOrigin);
    const fallbackCanonicalPath =
      typeof post?.id === "string" && post.id.trim()
        ? `/posts/${encodeURIComponent(post.id.trim())}`
        : "/post.html";
    const resolvedCanonicalUrl = new URL(
      typeof canonicalUrl === "string" && canonicalUrl.trim()
        ? canonicalUrl.trim()
        : fallbackCanonicalPath,
      resolvedBaseOrigin,
    ).href;
    const resolvedDefaultShareImageUrl = resolveDisplayImageUrl(
      defaultShareImageUrl,
      resolvedBaseOrigin,
    ) || new URL(DEFAULT_SHARE_IMAGE_PATH, resolvedBaseOrigin).href;
    const resolvedImageUrl = resolveShareImageUrl(
      typeof imageUrl === "string" && imageUrl.trim() ? imageUrl.trim() : post?.coverImage,
      resolvedDefaultShareImageUrl,
      resolvedBaseOrigin,
    );
    const normalizedTags = normalizePostTags(post?.tags);

    return {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: post?.title || siteName,
      description: post?.excerpt || post?.title || siteName,
      articleSection: post?.categoryLabel || post?.category || undefined,
      keywords: normalizedTags.length > 0 ? normalizedTags.join(", ") : undefined,
      datePublished: post?.date || undefined,
      dateModified: post?.date || undefined,
      image: [resolvedImageUrl],
      mainEntityOfPage: resolvedCanonicalUrl,
      url: resolvedCanonicalUrl,
      author: {
        "@type": "Organization",
        name: siteName,
      },
      publisher: {
        "@type": "Organization",
        name: siteName,
        logo: {
          "@type": "ImageObject",
          url: resolvedDefaultShareImageUrl,
        },
      },
    };
  }

  return Object.freeze({
    ALL_CATEGORY,
    BOOKMARK_CATEGORY,
    BOOKMARK_ONLY_CATEGORIES,
    CALENDAR_ICON_SVG,
    CLOCK_ICON_SVG,
    DEFAULT_CATEGORY_COLOR,
    DEFAULT_COVER_GRADIENT,
    DEFAULT_NOTION_CONTENT_PROPERTY_CANDIDATES,
    REMOTE_BLOG_CATEGORIES,
    SUPPORTED_BLOG_CATEGORIES,
    buildArticleStructuredData,
    buildPostSearchText,
    escapeHtml,
    getBookmarkOnlyCategories,
    getRemoteBlogCategories,
    getSupportedBlogCategories,
    getCategoryColor,
    gradientForCategory,
    isLikelyEphemeralAssetUrl,
    mapNotionBlock,
    mapNotionPage,
    renderMathExpression,
    renderPostArticle,
    renderBlocks,
    resolveDisplayImageUrl,
    resolveProxiedDisplayImageUrl,
    resolveNotionContentSchema,
    resolveShareImageUrl,
    richTextToHtml,
    richTextToPlain,
    normalizeSearchText,
    sanitizeCssColorValue,
    sanitizeUrl,
  });
});
