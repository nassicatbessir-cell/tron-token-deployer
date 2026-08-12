/**
 * Logo upload utilities with retry and fallback logic.
 */

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const UPLOAD_TIMEOUT_MS = 30000;
const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const DEFAULT_MAX_UPLOAD_SIZE_MB = 5;

interface UploadResult {
  success: boolean;
  ipfsHash?: string;
  cid?: string;
  gatewayUrl?: string;
  ipfsUrl?: string;
  filename?: string;
  originalFilename?: string;
  error?: string;
}

function getMaxUploadSizeBytes() {
  const maxSizeMB = Number.parseInt(
    process.env.NEXT_PUBLIC_MAX_UPLOAD_SIZE_MB || `${DEFAULT_MAX_UPLOAD_SIZE_MB}`,
    10
  );

  const normalizedMaxSizeMB = Number.isFinite(maxSizeMB) && maxSizeMB > 0
    ? maxSizeMB
    : DEFAULT_MAX_UPLOAD_SIZE_MB;

  return normalizedMaxSizeMB * 1024 * 1024;
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

export function sanitizeUploadFilename(originalName: string, mimeType: string) {
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

function prepareLogoFileForUpload(file: File) {
  const safeFilename = sanitizeUploadFilename(file.name || "token-logo", file.type);

  return new File([file], safeFilename, {
    type: file.type,
    lastModified: file.lastModified,
  });
}

/**
 * Upload logo with automatic retry on failure.
 */
export async function uploadLogoWithRetry(
  file: File,
  retries: number = MAX_RETRIES
): Promise<UploadResult> {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const result = await uploadLogoToIPFS(file);

      if (result.success) {
        return result;
      }

      if (attempt < retries) {
        await new Promise((resolve) =>
          setTimeout(resolve, RETRY_DELAY_MS * Math.pow(1.5, attempt - 1))
        );
        continue;
      }

      return result;
    } catch (error: any) {
      if (attempt === retries) {
        return {
          success: false,
          error:
            error?.message || `Upload failed after ${retries} attempts`,
        };
      }

      await new Promise((resolve) =>
        setTimeout(resolve, RETRY_DELAY_MS * Math.pow(1.5, attempt - 1))
      );
    }
  }

  return {
    success: false,
    error: "Upload failed after maximum retries",
  };
}

/**
 * Upload logo to IPFS via the local API route.
 */
async function uploadLogoToIPFS(file: File): Promise<UploadResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

  try {
    if (!file) {
      return {
        success: false,
        error: "Logo file is required.",
      };
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return {
        success: false,
        error: "Only PNG, JPEG, or WebP images are supported.",
      };
    }

    const maxSizeBytes = getMaxUploadSizeBytes();

    if (file.size > maxSizeBytes) {
      return {
        success: false,
        error: `File too large. Maximum size is ${Math.round(maxSizeBytes / 1024 / 1024)}MB.`,
      };
    }

    const preparedFile = prepareLogoFileForUpload(file);
    const formData = new FormData();
    formData.append("file", preparedFile, preparedFile.name);

    const response = await fetch("/api/upload-logo", {
      method: "POST",
      body: formData,
      signal: controller.signal,
      cache: "no-store",
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        success: false,
        error: data?.error || `Upload failed with status ${response.status}`,
      };
    }

    return {
      success: true,
      ipfsHash: data?.ipfsHash || data?.cid,
      cid: data?.cid || data?.ipfsHash,
      gatewayUrl: data?.gatewayUrl,
      ipfsUrl: data?.ipfsUrl,
      filename: data?.filename,
      originalFilename: file.name,
    };
  } catch (error: any) {
    if (error?.name === "AbortError") {
      return {
        success: false,
        error: "Upload timed out. Please try again.",
      };
    }

    return {
      success: false,
      error:
        error?.message === "Failed to fetch"
          ? "Upload request could not be sent. Check the network connection and try again."
          : error?.message || "Unknown upload error",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Generate placeholder metadata if logo upload fails.
 */
export function generateFallbackLogoMetadata(tokenSymbol: string) {
  return {
    ipfsHash: "",
    cid: "",
    gatewayUrl: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect fill='%23ff174d' width='100' height='100'/%3E%3Ctext x='50' y='50' font-size='48' fill='white' text-anchor='middle' dy='.3em'%3E${encodeURIComponent(
      tokenSymbol.charAt(0) || "T"
    )}%3C/text%3E%3C/svg%3E`,
    isPlaceholder: true,
  };
}

/**
 * Validate logo metadata.
 */
export function isValidLogoMetadata(metadata: any): boolean {
  return Boolean(
    metadata &&
      (metadata.ipfsHash || metadata.cid || metadata.gatewayUrl) &&
      (metadata.gatewayUrl || metadata.ipfsUrl)
  );
}
