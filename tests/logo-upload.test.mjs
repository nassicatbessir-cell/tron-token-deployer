import assert from "node:assert/strict";

function sanitize(originalName, mimeType) {
  const baseName = originalName.replace(/\.[^.]+$/, "").normalize("NFKD");
  const asciiBase = baseName
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);

  const safeBaseName = asciiBase || "token-logo";
  const extension =
    mimeType === "image/png" ? "png" :
    mimeType === "image/jpeg" ? "jpg" :
    mimeType === "image/webp" ? "webp" : "bin";

  return `${safeBaseName}.${extension}`;
}

assert.equal(sanitize("My Logo 🚀.png", "image/png"), "My-Logo.png");
assert.equal(sanitize("توکن-لوگو.jpg", "image/jpeg"), "token-logo.jpg");
assert.equal(sanitize("safe_name.webp", "image/webp"), "safe_name.webp");
assert.equal(sanitize("", "image/webp"), "token-logo.webp");
assert.ok(sanitize("a".repeat(100) + ".png", "image/png").length <= 68);
// path-like or separator-heavy names must not leak and must stay ASCII-safe
const pathy = sanitize("../../../etc/passwd.png", "image/png");
assert.ok(!pathy.includes(".."));
assert.ok(!pathy.includes("/"));
assert.match(pathy, /^[a-zA-Z0-9_-]+\.png$/);
assert.equal(sanitize("logo.PNG", "image/png"), "logo.png");

console.log("logo-upload sanitize tests passed");
