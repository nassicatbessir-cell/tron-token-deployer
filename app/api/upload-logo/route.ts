import { NextResponse } from "next/server";

export const runtime = "nodejs";

const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const DEFAULT_MAX_UPLOAD_SIZE_MB = 5;
const DEFAULT_GATEWAY_BASE_URL = "https://gateway.pinata.cloud/ipfs";
const DEFAULT_UPLOAD_TIMEOUT_MS = 30_000;

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

function getSafeExtension(originalName: string, mimeType: string) {
  const normalizedName = originalName.trim();
  const extension = normalizedName.includes(".")
    ? normalizedName.split(".").pop()?.toLowerCase() || ""
    : "";

  if (/^[a-z0-9]{2,5}$/.test(extension)) {
    return extension;
  }

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
  const extension = getSafeExtension(originalName, mimeType);

  return `${safeBaseName}.${extension}`;
}

function getPinataErrorMessage(data: any, fallback: string) {
  if (!data || typeof data !== "object") {
    return fallback;
  }

  if (typeof data.error === "string" && data.error.trim()) {
    return data.error.trim();
  }

  if (typeof data.message === "string" && data.message.trim()) {
    return data.message.trim();
  }

  return fallback;
}

export async function POST(request: Request) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), getUploadTimeoutMs());

  try {
    const formData = await request.formData();
    const file = formData.get("file") ?? formData.get("logo");

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          error: "Logo file was not received.",
          hint: "Use the file or logo form field.",
        },
        {
          status: 400,
          headers: {
            "Cache-Control": "no-store",
          },
        }
      );
    }

    const mimeType = file.type.toLowerCase();

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return NextResponse.json(
        {
          error: "Only PNG, JPEG, or WebP images are supported.",
        },
        {
          status: 400,
          headers: {
            "Cache-Control": "no-store",
          },
        }
      );
    }

    const maxUploadSizeBytes = getMaxUploadSizeBytes();

    if (file.size > maxUploadSizeBytes) {
      return NextResponse.json(
        {
          error: `File size exceeds the ${Math.round(maxUploadSizeBytes / 1024 / 1024)}MB limit.`,
        },
        {
          status: 400,
          headers: {
            "Cache-Control": "no-store",
          },
        }
      );
    }

    const jwt = process.env.PINATA_JWT;

    if (!jwt) {
      return NextResponse.json(
        {
          error: "PINATA_JWT is not configured on the server.",
        },
        {
          status: 500,
          headers: {
            "Cache-Control": "no-store",
          },
        }
      );
    }

    const originalFilename = file.name || "token-logo";
    const filename = sanitizeFilename(originalFilename, mimeType);
    const bytes = await file.arrayBuffer();

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

      return NextResponse.json(
        {
          error: pinataMessage,
        },
        {
          status: response.status || 502,
          headers: {
            "Cache-Control": "no-store",
          },
        }
      );
    }

    const ipfsHash = data?.IpfsHash;

    if (!ipfsHash) {
      return NextResponse.json(
        {
          error: "Pinata did not return a valid CID.",
        },
        {
          status: 502,
          headers: {
            "Cache-Control": "no-store",
          },
        }
      );
    }

    const gatewayBaseUrl = getGatewayBaseUrl();

    return NextResponse.json(
      {
        success: true,
        ipfsHash,
        cid: ipfsHash,
        gatewayUrl: `${gatewayBaseUrl}/${ipfsHash}`,
        ipfsUrl: `ipfs://${ipfsHash}`,
        filename,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error: any) {
    const message =
      error?.name === "AbortError"
        ? "Logo upload request timed out before Pinata responded."
        : error?.message || "Error uploading logo.";

    return NextResponse.json(
      {
        error: message,
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
