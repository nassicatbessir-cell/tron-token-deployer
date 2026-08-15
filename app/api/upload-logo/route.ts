import { NextResponse } from "next/server";

export const runtime = "nodejs";

const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const DEFAULT_MAX_UPLOAD_SIZE_MB = 5;
const DEFAULT_GATEWAY_BASE_URL = "https://gateway.pinata.cloud/ipfs";
const DEFAULT_UPLOAD_TIMEOUT_MS = 30_000;
const CID_PATTERN = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[1-9A-Za-z]{20,})$/;

function noStoreJson(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      ...init?.headers,
    },
  });
}

function getMaxUploadSizeBytes() {
  const maxSizeMB = Number.parseInt(
    process.env.MAX_UPLOAD_SIZE_MB ||
      process.env.NEXT_PUBLIC_MAX_UPLOAD_SIZE_MB ||
      `${DEFAULT_MAX_UPLOAD_SIZE_MB}`,
    10
  );

  const normalizedMaxSizeMB = Number.isFinite(maxSizeMB) && maxSizeMB > 0
    ? maxSizeMB
    : DEFAULT_MAX_UPLOAD_SIZE_MB;

  return normalizedMaxSizeMB * 1024 * 1024;
}

function getUploadTimeoutMs() {
  const timeoutMs = Number.parseInt(
    process.env.UPLOAD_TIMEOUT_MS || `${DEFAULT_UPLOAD_TIMEOUT_MS}`,
    10
  );

  return Number.isFinite(timeoutMs) && timeoutMs > 0
    ? timeoutMs
    : DEFAULT_UPLOAD_TIMEOUT_MS;
}

function getGatewayBaseUrl() {
  return (process.env.PINATA_GATEWAY_BASE_URL || DEFAULT_GATEWAY_BASE_URL).replace(/\/$/, "");
}

function getSafeExtension(mimeType: string) {
  switch (mimeType) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    default:
      return "bin";
  }
}

function sanitizeFilename(originalName: string, mimeType: string) {
  const baseName = originalName.replace(/\.[^.]+$/, "").normalize("NFKD");
  const asciiBase = baseName
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);

  const safeBaseName = asciiBase || "token-logo";
  const extension = getSafeExtension(mimeType);

  return `${safeBaseName}.${extension}`;
}

function getPinataErrorMessage(data: unknown, fallback: string) {
  if (!data || typeof data !== "object") {
    return fallback;
  }

  const record = data as Record<string, unknown>;

  if (typeof record.error === "string" && record.error.trim()) {
    return record.error.trim();
  }

  if (typeof record.message === "string" && record.message.trim()) {
    return record.message.trim();
  }

  return fallback;
}

function hasAllowedOrigin(request: Request) {
  const originHeader = request.headers.get("origin");

  if (!originHeader) {
    return true;
  }

  try {
    const requestOrigin = new URL(request.url).origin;
    return new URL(originHeader).origin === requestOrigin;
  } catch {
    return false;
  }
}

function matchesDeclaredMimeType(bytes: Uint8Array, mimeType: string) {
  if (mimeType === "image/png") {
    const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return pngSignature.every((byte, index) => bytes[index] === byte);
  }

  if (mimeType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }

  if (mimeType === "image/webp") {
    const riff = String.fromCharCode(...bytes.slice(0, 4));
    const webp = String.fromCharCode(...bytes.slice(8, 12));
    return riff === "RIFF" && webp === "WEBP";
  }

  return false;
}

export async function POST(request: Request) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), getUploadTimeoutMs());

  try {
    if (!hasAllowedOrigin(request)) {
      return noStoreJson(
        {
          error: "Cross-origin logo upload requests are not allowed.",
        },
        { status: 403 }
      );
    }

    const maxUploadSizeBytes = getMaxUploadSizeBytes();
    const contentLength = Number.parseInt(request.headers.get("content-length") || "0", 10);

    if (Number.isFinite(contentLength) && contentLength > maxUploadSizeBytes + 64 * 1024) {
      return noStoreJson(
        {
          error: `Request body exceeds the ${Math.round(maxUploadSizeBytes / 1024 / 1024)}MB upload limit.`,
        },
        { status: 413 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") ?? formData.get("logo");

    if (!(file instanceof File)) {
      return noStoreJson(
        {
          error: "Logo file was not received.",
          hint: "Use the file or logo form field.",
        },
        { status: 400 }
      );
    }

    const mimeType = file.type.toLowerCase();

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return noStoreJson(
        {
          error: "Only PNG, JPEG, or WebP images are supported.",
        },
        { status: 400 }
      );
    }

    if (file.size > maxUploadSizeBytes) {
      return noStoreJson(
        {
          error: `File size exceeds the ${Math.round(maxUploadSizeBytes / 1024 / 1024)}MB limit.`,
        },
        { status: 400 }
      );
    }

    const jwt = process.env.PINATA_JWT;

    if (!jwt) {
      return noStoreJson(
        {
          error: "PINATA_JWT is not configured on the server.",
        },
        { status: 500 }
      );
    }

    const bytes = await file.arrayBuffer();
    const byteView = new Uint8Array(bytes);

    if (!matchesDeclaredMimeType(byteView, mimeType)) {
      return noStoreJson(
        {
          error: "Logo content does not match the declared image type.",
        },
        { status: 400 }
      );
    }

    const originalFilename = file.name || "token-logo";
    const filename = sanitizeFilename(originalFilename, mimeType);

    const pinataForm = new FormData();
    pinataForm.append("file", new Blob([bytes], { type: mimeType }), filename);
    pinataForm.append(
      "pinataMetadata",
      JSON.stringify({
        name: filename,
      })
    );

    const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/json",
      },
      body: pinataForm,
      cache: "no-store",
      signal: controller.signal,
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const pinataMessage = getPinataErrorMessage(data, "Logo upload to IPFS failed.");

      return noStoreJson(
        {
          error: pinataMessage,
        },
        { status: response.status || 502 }
      );
    }

    const ipfsHash = typeof data?.IpfsHash === "string" ? data.IpfsHash.trim() : "";

    if (!CID_PATTERN.test(ipfsHash)) {
      return noStoreJson(
        {
          error: "Pinata did not return a valid CID.",
        },
        { status: 502 }
      );
    }

    const gatewayBaseUrl = getGatewayBaseUrl();

    return noStoreJson({
      success: true,
      ipfsHash,
      cid: ipfsHash,
      gatewayUrl: `${gatewayBaseUrl}/${ipfsHash}`,
      ipfsUrl: `ipfs://${ipfsHash}`,
      filename,
    });
  } catch (error: unknown) {
    const err = error as { name?: string; message?: string };
    const message =
      err?.name === "AbortError"
        ? "Logo upload request timed out before Pinata responded."
        : err?.message || "Error uploading logo.";

    return noStoreJson(
      {
        error: message,
      },
      { status: 500 }
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
