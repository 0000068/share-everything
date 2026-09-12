import assert from "node:assert/strict";
import { readShortSiteName } from "../lib/site-brand.mjs";
import { parseHtml, findElement, findMetaByName, findMetaByProperty } from "../lib/html-rewriter.mjs";

function textContent(node) {
  return node?.nodeName === "#text" ? node.value : (node?.childNodes || []).map(textContent).join("");
}

function content(node) {
  return node?.attrs?.find((attr) => attr.name === "content")?.value;
}

export function checkSiteBrand({ siteName, indexHtml, blogHtml, postHtml, manifest }) {
  for (const [page, html, title, ogTitle] of [
    ["index", indexHtml, siteName, siteName],
    ["blog", blogHtml, `总览 — ${siteName}`, `总览 — ${siteName}`],
    ["post", postHtml, `文章 — ${siteName}`, siteName],
  ]) {
    const doc = parseHtml(html);
    assert.equal(textContent(findElement(doc, (node) => node.tagName === "title")), title, `${page} title`);
    assert.equal(content(findMetaByProperty(doc, "og:title")), ogTitle, `${page} og:title`);
    assert.equal(content(findMetaByProperty(doc, "og:image:alt")), siteName, `${page} image alt`);
    for (const name of ["application-name", "apple-mobile-web-app-title"]) {
      assert.equal(content(findMetaByName(doc, name)), siteName, `${page} ${name}`);
    }
    if (page === "index") {
      assert.equal(textContent(findElement(doc, (node) => node.tagName === "h1")), siteName, "home heading");
      assert.equal(content(findMetaByName(doc, "description")), `${siteName} — 探索、记录、分享`, "home description");
    }
  }
  assert.equal(manifest.name, siteName, "manifest name");
  assert.equal(manifest.short_name, readShortSiteName(siteName), "manifest short name");
}
