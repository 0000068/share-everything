export function readShortSiteName(siteName) {
  return siteName === "Share Everything" ? "Share" : Array.from(siteName).slice(0, 12).join("");
}
