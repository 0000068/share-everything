import * as parse5 from "parse5";

export function parseHtml(source) {
  return parse5.parse(source, { sourceCodeLocationInfo: true });
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

function walkAll(node, visitor, results = []) {
  if (!node) return results;
  if (visitor(node)) results.push(node);
  for (const child of node.childNodes || []) {
    walkAll(child, visitor, results);
  }
  return results;
}

function getAttribute(node, name) {
  const attr = node?.attrs?.find((item) => item.name === name);
  return attr?.value || "";
}

export function setAttribute(node, name, value) {
  if (!node.attrs) node.attrs = [];
  const attr = node.attrs.find((item) => item.name === name);
  if (attr) {
    attr.value = String(value);
    return node;
  }
  node.attrs.push({ name, value: String(value) });
  return node;
}

export function findMetaByName(doc, name) {
  return walk(doc, (node) => isElement(node, "meta") && getAttribute(node, "name") === name);
}

export function findMetaByProperty(doc, property) {
  return walk(doc, (node) => isElement(node, "meta") && getAttribute(node, "property") === property);
}

export function findLinkByRel(doc, rel) {
  return walk(doc, (node) => isElement(node, "link") && getAttribute(node, "rel") === rel);
}

export function findElementById(doc, id) {
  return walk(doc, (node) => getAttribute(node, "id") === id);
}

export function findElement(doc, predicate) {
  return walk(doc, (node) => isElement(node) && predicate(node, getAttribute));
}

export function findElements(doc, predicate) {
  return walkAll(doc, (node) => isElement(node) && predicate(node, getAttribute));
}
