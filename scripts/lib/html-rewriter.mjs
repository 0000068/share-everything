import * as parse5 from "parse5";

export function parseHtml(source) {
  return parse5.parse(source, { sourceCodeLocationInfo: true });
}

export function serializeHtml(document) {
  return `${parse5.serialize(document)
    .replace(/^<!DOCTYPE html><html/i, "<!DOCTYPE html>\n<html")
    .replace(/^<!DOCTYPE html><!--/i, "<!DOCTYPE html>\n<!--")
    .replace(/--><html/i, "-->\n<html")
    .replace(/<\/head><body/i, "</head>\n  <body")
    .trimEnd()}\n`;
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

function removeAttribute(node, name) {
  if (!node?.attrs) return;
  node.attrs = node.attrs.filter((attr) => attr.name !== name);
}

function appendChild(parent, child) {
  child.parentNode = parent;
  parent.childNodes ||= [];
  parent.childNodes.push(child);
  return child;
}

function insertAfter(anchor, node) {
  const parent = anchor?.parentNode;
  if (!parent?.childNodes) return appendChild(findHead(anchor) || parent, node);
  const index = parent.childNodes.indexOf(anchor);
  node.parentNode = parent;
  parent.childNodes.splice(index + 1, 0, node);
  return node;
}

function insertBefore(parent, beforeNode, node) {
  node.parentNode = parent;
  parent.childNodes ||= [];
  const index = parent.childNodes.indexOf(beforeNode);
  if (index === -1) parent.childNodes.push(node);
  else parent.childNodes.splice(index, 0, node);
  return node;
}

function removeNode(node) {
  const parent = node?.parentNode;
  if (!parent?.childNodes) return;
  const index = parent.childNodes.indexOf(node);
  if (index > 0) {
    const previous = parent.childNodes[index - 1];
    if (previous?.nodeName === "#text" && /^\s*$/.test(previous.value || "")) {
      parent.childNodes.splice(index - 1, 1);
    }
  }
  parent.childNodes = parent.childNodes.filter((child) => child !== node);
}

function nodeFromHtml(markup) {
  const fragment = parse5.parseFragment(markup);
  return fragment.childNodes.find((node) => node.nodeName !== "#text" || node.value.trim()) || null;
}

function findHead(node) {
  return walk(rootNode(node), (candidate) => isElement(candidate, "head"));
}

function rootNode(node) {
  let current = node;
  while (current?.parentNode) current = current.parentNode;
  return current;
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

export function setTextContent(node, value) {
  node.childNodes = [{ nodeName: "#text", value: String(value), parentNode: node }];
}

export function upsertMeta(doc, { name, property, content, insertAfter }) {
  const node = name ? findMetaByName(doc, name) : findMetaByProperty(doc, property);
  if (node) {
    if (name) setAttribute(node, "name", name);
    if (property) setAttribute(node, "property", property);
    setAttribute(node, "content", content);
    return node;
  }

  const attrs = name ? `name="${name}"` : `property="${property}"`;
  const nextNode = nodeFromHtml(`<meta ${attrs} content="${escapeAttribute(content)}">`);
  const anchor = typeof insertAfter === "string"
    ? findMetaByName(doc, insertAfter) || findMetaByProperty(doc, insertAfter)
    : insertAfter;
  return anchor ? insertAfterNode(anchor, nextNode) : appendChild(findHead(doc), nextNode);
}

function insertAfterNode(anchor, node) {
  return insertAfter(anchor, node);
}

export function upsertLink(doc, { rel, href, attrs = {}, insertAfter }) {
  let node = findLinkByRel(doc, rel);
  if (!node) {
    node = nodeFromHtml(`<link rel="${rel}" href="${escapeAttribute(href)}">`);
    const anchor = typeof insertAfter === "string" ? findLinkByRel(doc, insertAfter) : insertAfter;
    if (anchor) insertAfter(anchor, node);
    else appendChild(findHead(doc), node);
  }
  setAttribute(node, "rel", rel);
  setAttribute(node, "href", href);
  for (const [name, value] of Object.entries(attrs)) {
    if (value == null) removeAttribute(node, name);
    else setAttribute(node, name, value);
  }
  return node;
}

export function replaceElement(doc, node, markup) {
  const nextNode = nodeFromHtml(markup);
  const parent = node.parentNode;
  const index = parent.childNodes.indexOf(node);
  nextNode.parentNode = parent;
  parent.childNodes.splice(index, 1, nextNode);
  return nextNode;
}

export function appendHeadNodes(doc, nodes) {
  const head = findHead(doc);
  const beforeNode = head.childNodes.find((node) => node.tagName === "script") || null;
  for (const node of nodes) {
    if (beforeNode) {
      insertBefore(head, beforeNode, createTextNode("\n    "));
      insertBefore(head, beforeNode, node);
    } else {
      appendChild(head, createTextNode("\n    "));
      appendChild(head, node);
    }
  }
  if (beforeNode) insertBefore(head, beforeNode, createTextNode("\n  "));
  else appendChild(head, createTextNode("\n  "));
}

export function createNodeFromHtml(markup) {
  return nodeFromHtml(markup);
}

export function removeNodes(nodes) {
  nodes.forEach(removeNode);
}

export function removeChildrenAfter(parent, marker) {
  const index = parent.childNodes?.indexOf(marker) ?? -1;
  if (index >= 0) parent.childNodes = parent.childNodes.slice(0, index + 1);
}

function escapeAttribute(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function createTextNode(value) {
  return { nodeName: "#text", value: String(value) };
}
