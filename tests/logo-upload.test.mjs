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

const unicodeRegressionCases = [
  ["logo.png", "image/png", "logo.png"],
  ["logo-new.png", "image/png", "logo-new.png"],
  ["logo جدید.png", "image/png", "logo.png"],
  ["لوگوی توکن.png", "image/png", "token-logo.png"],
  ["USDT لوگو جدید.png", "image/png", "USDT.png"],
];

for (const [originalName, mimeType, expected] of unicodeRegressionCases) {
  const filename = sanitize(originalName, mimeType);
  assert.equal(filename, expected);
  assert.match(filename, /^[a-zA-Z0-9_-]+\.(png|jpg|webp)$/);
  assert.match(filename, /^[\x00-\x7F]+$/);
}

assert.equal(sanitize("My Logo 🚀.png", "image/png"), "My-Logo.png");
assert.equal(sanitize("توکن-لوگو.jpg", "image/jpeg"), "token-logo.jpg");
assert.equal(sanitize("safe_name.webp", "image/webp"), "safe_name.webp");
assert.equal(sanitize("", "image/webp"), "token-logo.webp");
assert.equal(sanitize("logo.svg", "image/png"), "logo.png");
assert.equal(sanitize("logo.txt", "image/jpeg"), "logo.jpg");
assert.ok(sanitize("a".repeat(100) + ".png", "image/png").length <= 68);

const pathy = sanitize("../../../etc/passwd.png", "image/png");
assert.ok(!pathy.includes(".."));
assert.ok(!pathy.includes("/"));
assert.match(pathy, /^[a-zA-Z0-9_-]+\.png$/);

console.log("logo-upload sanitize tests passed");
