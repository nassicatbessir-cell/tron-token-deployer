import { NextResponse } from "next/server";
import {
  buildPinataMultipartBody,
  matchesImageMagicBytes,
  parseMultipartUploadRequest,
} from "@/lib/upload-multipart";

export const runtime = "nodejs";

const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const DEFAULT_MAX_UPLOAD_SIZE_MB = 5;
const DEFAULT_GATEWAY_BASE_URL = "https://gateway.pinata.cloud/ipfs";
const DEFAULT_UPLOAD_TIMEOUT_MS = 30_000;
const CID_PATTERN = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[1-9A-Za-z]{20,})$/;

type UploadStage =
  | "request_validation"
  | "request_parse"
  | "pinata_upload"
  | "pinata_response";

function jsonError(
  status: number,
  stage: UploadStage,
  message: string,
  code: string,
  extra?: Record<string, unknown>
) {
  return NextResponse.json(
    {
      error: code,
      stage,
      message,
      ...extra,
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}

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

function getPinataErrorMessage(data: unknown, fallback: string) {
  if (!data || typeof data !== "object") {
    return fallback;
  }

  if (typeof (data as { error?: unknown }).error === "string" && (data as { error: string }).error.trim()) {
    return (data as { error: string }).error.trim();
  }

  if (typeof (data as { message?: unknown }).message === "string" && (data as { message: string }).message.trim()) {
    return (data as { message: string }).message.trim();
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

export async function POST(request: Request) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), getUploadTimeoutMs());

  try {
    if (!hasAllowedOrigin(request)) {
      return jsonError(
        403,
        "request_validation",
        "Cross-origin logo upload requests are not allowed.",
        "LOGO_UPLOAD_FORBIDDEN"
      );
    }

    const maxUploadSizeBytes = getMaxUploadSizeBytes();
    const contentLength = Number.parseInt(request.headers.get("content-length") || "0", 10);

    if (Number.isFinite(contentLength) && contentLength > maxUploadSizeBytes + 64 * 1024) {
      return jsonError(
        413,
        "request_validation",
        `Request body exceeds the ${Math.round(maxUploadSizeBytes / 1024 / 1024)}MB upload limit.`,
        "LOGO_UPLOAD_TOO_LARGE"
      );
    }

    const filePart = await parseMultipartUploadRequest(request).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Could not parse multipart upload.";
      throw new Error(`REQUEST_PARSE:${message}`);
    });

    if (!ALLOWED_MIME_TYPES.has(filePart.mimeType)) {
      return jsonError(
        400,
        "request_validation",
        "Only PNG, JPEG, or WebP images are supported.",
        "LOGO_UPLOAD_INVALID_MIME"
      );
    }

    if (filePart.data.byteLength > maxUploadSizeBytes) {
      return jsonError(
        400,
        "request_validation",
        `File size exceeds the ${Math.round(maxUploadSizeBytes / 1024 / 1024)}MB limit.`,
        "LOGO_UPLOAD_TOO_LARGE"
      );
    }

    const jwt = process.env.PINATA_JWT;

    if (!jwt) {
      return jsonError(
        500,
        "request_validation",
        "PINATA_JWT is not configured on the server.",
        "LOGO_UPLOAD_SERVER_MISCONFIGURED"
      );
    }

    if (!matchesImageMagicBytes(filePart.data, filePart.mimeType)) {
      return jsonError(
        400,
        "request_validation",
        "Logo content does not match the declared image type.",
        "LOGO_UPLOAD_INVALID_MAGIC_BYTES"
      );
    }

    const pinataRequest = buildPinataMultipartBody({
      fileBytes: filePart.data,
      mimeType: filePart.mimeType,
    });

    const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/json",
        "Content-Type": `multipart/form-data; boundary=${pinataRequest.boundary}`,
      },
      body: pinataRequest.body,
      cache: "no-store",
      signal: controller.signal,
    });

    const data: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      return jsonError(
        response.status || 502,
        "pinata_upload",
        getPinataErrorMessage(data, "Logo upload to IPFS failed."),
        "LOGO_UPLOAD_FAILED"
      );
    }

    const ipfsHash = typeof (data as { IpfsHash?: unknown })?.IpfsHash === "string"
      ? (data as { IpfsHash: string }).IpfsHash.trim()
      : "";

    if (!CID_PATTERN.test(ipfsHash)) {
      return jsonError(
        502,
        "pinata_response",
        "Pinata did not return a valid CID.",
        "LOGO_UPLOAD_INVALID_CID"
      );
    }

    const gatewayBaseUrl = getGatewayBaseUrl();

    return noStoreJson({
      success: true,
      ipfsHash,
      cid: ipfsHash,
      gatewayUrl: `${gatewayBaseUrl}/${ipfsHash}`,
      ipfsUrl: `ipfs://${ipfsHash}`,
      filename: pinataRequest.filename,
    });
  } catch (error: unknown) {
    const rawMessage = error instanceof Error ? error.message : "Error uploading logo.";

    if (rawMessage.startsWith("REQUEST_PARSE:")) {
      return jsonError(
        400,
        "request_parse",
        rawMessage.slice("REQUEST_PARSE:".length),
        "LOGO_UPLOAD_INVALID_MULTIPART"
      );
    }

    const message =
      error instanceof Error && error.name === "AbortError"
        ? "Logo upload request timed out before Pinata responded."
        : rawMessage;

    return jsonError(500, "pinata_upload", message, "LOGO_UPLOAD_FAILED");
  } finally {
    clearTimeout(timeoutId);
  }
}
