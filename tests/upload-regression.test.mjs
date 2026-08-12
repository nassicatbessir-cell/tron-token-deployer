import test from "node:test";
import assert from "node:assert/strict";
import {
  createSafeUploadFilename,
  getMultipartBoundary,
  matchesImageMagicBytes,
  parseMultipartUploadRequest,
} from "../lib/upload-multipart.js";

const PNG_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const JPEG_BYTES = Uint8Array.from([0xff, 0xd8, 0xff, 0xdb, 0x00]);
const WEBP_BYTES = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);

function createMultipartRequest({ filename, mimeType, bytes }) {
  const boundary = "----tron-token-boundary";
  const encoder = new TextEncoder();
  const header =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n`;
  const footer = `\r\n--${boundary}--\r\n`;
  const body = Buffer.concat([
    Buffer.from(encoder.encode(header)),
    Buffer.from(bytes),
    Buffer.from(encoder.encode(footer)),
  ]);

  return new Request("https://example.com/api/upload-logo", {
    method: "POST",
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": `${body.length}`,
    },
    body,
  });
}

test("safe upload filename is always ASCII and ignores original unicode name", () => {
  assert.equal(createSafeUploadFilename("image/png"), "logo.png");
  assert.equal(createSafeUploadFilename("image/jpeg"), "logo.jpg");
  assert.equal(createSafeUploadFilename("image/webp"), "logo.webp");
});

test("boundary parser extracts multipart boundary", () => {
  assert.equal(
    getMultipartBoundary('multipart/form-data; boundary="abc123"'),
    "abc123"
  );
});

test("multipart parser accepts a Persian filename without requiring request.formData", async () => {
  const request = createMultipartRequest({
    filename: "لوگو تست.png",
    mimeType: "image/png",
    bytes: PNG_BYTES,
  });

  const parsed = await parseMultipartUploadRequest(request);

  assert.equal(parsed.fieldName, "file");
  assert.equal(parsed.mimeType, "image/png");
  assert.ok(parsed.originalFilename.length > 0);
  assert.ok(parsed.data.byteLength > 0);
});

test("multipart parser accepts filenames with spaces and emoji", async () => {
  const request = createMultipartRequest({
    filename: "logo test 🚀.png",
    mimeType: "image/png",
    bytes: PNG_BYTES,
  });

  const parsed = await parseMultipartUploadRequest(request);

  assert.equal(parsed.mimeType, "image/png");
  assert.ok(parsed.originalFilename.length > 0);
});

test("magic byte validation works for PNG, JPEG, and WebP", () => {
  assert.equal(matchesImageMagicBytes(PNG_BYTES, "image/png"), true);
  assert.equal(matchesImageMagicBytes(JPEG_BYTES, "image/jpeg"), true);
  assert.equal(matchesImageMagicBytes(WEBP_BYTES, "image/webp"), true);
  assert.equal(matchesImageMagicBytes(PNG_BYTES, "image/jpeg"), false);
});

test("multipart parser preserves invalid MIME for later validation", async () => {
  const request = createMultipartRequest({
    filename: "لوگو تست.txt",
    mimeType: "text/plain",
    bytes: PNG_BYTES,
  });

  const parsed = await parseMultipartUploadRequest(request);

  assert.equal(parsed.mimeType, "text/plain");
});
