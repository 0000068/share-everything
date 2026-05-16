import { readFile, writeFile } from "node:fs/promises";
import postcss from "postcss";
import selectorParser from "postcss-selector-parser";

const checkOnly = process.argv.includes("--check");
const mobileClassName = "is-mobile-device-viewport";
const mobileSelector = `html.${mobileClassName}`;
const targetFiles = [
  "css/style.css",
  "css/blog-page.css",
  "css/post-page.css",
];
const touchMediaFeatures = new Set([
  "(hover: none)",
  "(pointer: coarse)",
]);

function normalizeMediaFeature(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function splitMediaFeatures(params) {
  if (String(params || "").includes(",")) {
    throw new Error(`Unsupported comma-separated mobile media query: ${params}`);
  }

  return String(params || "")
    .split(/\s+and\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function isTouchMediaQuery(params) {
  const features = splitMediaFeatures(params).map(normalizeMediaFeature);
  return [...touchMediaFeatures].every((feature) => features.includes(feature));
}

function toFallbackMediaParams(params) {
  return splitMediaFeatures(params)
    .filter((part) => !touchMediaFeatures.has(normalizeMediaFeature(part)))
    .join(" and ");
}

function firstMeaningfulNode(selectorNode) {
  return selectorNode.nodes?.find((node) => node.type !== "comment");
}

function selectorStartsWithHtml(selectorNode) {
  const firstNode = firstMeaningfulNode(selectorNode);
  return firstNode?.type === "tag" && firstNode.value?.toLowerCase() === "html";
}

function selectorStartsWithRoot(selectorNode) {
  const firstNode = firstMeaningfulNode(selectorNode);
  return firstNode?.type === "pseudo" && firstNode.value === ":root";
}

function prefixSingleSelector(selector) {
  return selectorParser((selectors) => {
    selectors.each((selectorNode) => {
      if (selectorNode.toString().includes(mobileSelector)) return;

      if (selectorStartsWithHtml(selectorNode)) {
        const htmlNode = firstMeaningfulNode(selectorNode);
        htmlNode.parent.insertAfter(htmlNode, selectorParser.className({ value: mobileClassName }));
        return;
      }

      if (selectorStartsWithRoot(selectorNode)) {
        const rootNode = firstMeaningfulNode(selectorNode);
        rootNode.replaceWith(
          selectorParser.tag({ value: "html" }),
          selectorParser.className({ value: mobileClassName }),
        );
        return;
      }

      selectorNode.prepend(selectorParser.combinator({ value: " " }));
      selectorNode.prepend(selectorParser.className({ value: mobileClassName }));
      selectorNode.prepend(selectorParser.tag({ value: "html" }));
    });
  }).processSync(selector).trim();
}

function prefixSelector(selector) {
  const selectors = selectorParser().astSync(selector);
  return selectors.nodes
    .map((selectorNode) => prefixSingleSelector(selectorNode.toString().trim()))
    .join(",\n  ");
}

// @keyframes step selectors ("0%", "from", "to" etc.) must NOT receive the
// `html.is-mobile-device-viewport` prefix — combining them yields invalid CSS
// like `html.is-mobile-device-viewport 0% {}`. The check inspects the immediate
// parent because postcss models keyframe steps as one-level children of the
// @keyframes at-rule.
function isKeyframeStep(node) {
  const parent = node.parent;
  if (!parent || parent.type !== "atrule") return false;
  return /^(-webkit-|-moz-|-ms-|-o-)?keyframes$/i.test(parent.name || "");
}

function prefixRules(node) {
  if (node.type === "rule" && !isKeyframeStep(node)) {
    node.selector = prefixSelector(node.selector);
  }

  if (typeof node.each === "function") {
    node.each((child) => prefixRules(child));
  }

  return node;
}

function cloneFallbackNodes(atRule) {
  return (atRule.nodes || []).map((node) => prefixRules(node.clone()));
}

function removeExistingFallbacks(root) {
  root.walkComments((comment) => {
    if (/Mobile fallback block|Generated mobile compatibility fallback|build-mobile-fallbacks/.test(comment.text || "")) {
      comment.remove();
    }
  });

  root.walkRules((rule) => {
    if (String(rule.selector || "").includes(mobileSelector)) {
      rule.remove();
    }
  });

  let removedEmptyAtRule = true;
  while (removedEmptyAtRule) {
    removedEmptyAtRule = false;
    root.walkAtRules((atRule) => {
      if (atRule.nodes && atRule.nodes.length === 0) {
        atRule.remove();
        removedEmptyAtRule = true;
      }
    });
  }
}

function collectGeneratedFallbackNodes(root) {
  const generatedNodes = [];

  root.walkAtRules("media", (atRule) => {
    if (!isTouchMediaQuery(atRule.params)) return;

    const fallbackMediaParams = toFallbackMediaParams(atRule.params);
    const fallbackNodes = cloneFallbackNodes(atRule);
    if (fallbackMediaParams) {
      generatedNodes.push(
        postcss.atRule({ name: "media", params: fallbackMediaParams }).append(fallbackNodes),
      );
      return;
    }

    generatedNodes.push(...fallbackNodes);
  });

  return generatedNodes;
}

function appendGeneratedFallbacks(root, generatedNodes) {
  const marker = postcss.comment({
    text: [
      "===== Generated mobile compatibility fallback =====",
      " * Source: scripts/build-mobile-fallbacks.mjs.",
      " * Edit the real touch media queries above, then run npm.cmd run mobile:fallbacks.",
      " * =================================================",
    ].join("\n"),
  });
  marker.raws.before = "\n\n";
  root.append(marker);

  generatedNodes.forEach((node, index) => {
    node.raws.before = index === 0 ? "\n" : "\n\n";
    root.append(node);
  });
}

function buildMobileFallbacks(source, file) {
  const root = postcss.parse(source, { from: file });
  removeExistingFallbacks(root);
  const generatedNodes = collectGeneratedFallbackNodes(root);
  if (generatedNodes.length === 0) {
    throw new Error(`No touch media queries found in ${file}`);
  }
  appendGeneratedFallbacks(root, generatedNodes);
  return `${root.toString().trimEnd()}\n`;
}

const changedFiles = [];

for (const file of targetFiles) {
  const source = await readFile(file, "utf8");
  const nextSource = buildMobileFallbacks(source, file);
  if (nextSource !== source) {
    changedFiles.push(file);
    if (!checkOnly) {
      await writeFile(file, nextSource);
    }
  }
}

if (checkOnly && changedFiles.length > 0) {
  console.error(`Generated mobile fallbacks are out of sync: ${changedFiles.join(", ")}`);
  process.exit(1);
}

if (!checkOnly && changedFiles.length > 0) {
  console.log(`Updated generated mobile fallbacks: ${changedFiles.join(", ")}`);
}
