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
  status?: number;
  stage?: string;
  errorCode?: string;
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

export function createSafeUploadFilename(mimeType: string) {
  return `logo.${getSafeExtension(mimeType)}`;
}

function prepareLogoFileForUpload(file: File) {
  const safeFilename = createSafeUploadFilename(file.type);

  return new File([file], safeFilename, {
    type: file.type,
    lastModified: file.lastModified,
  });
}

function shouldRetryUpload(result: UploadResult) {
  return !result.status || result.status >= 500 || result.status === 408 || result.status === 429;
}

/**
 * Upload logo with automatic retry on retryable failure.
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

      if (attempt < retries && shouldRetryUpload(result)) {
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
          error: error?.message || `Upload failed after ${retries} attempts`,
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
        status: 400,
        errorCode: "LOGO_UPLOAD_MISSING_FILE",
        stage: "request_validation",
      };
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return {
        success: false,
        error: "Only PNG, JPEG, or WebP images are supported.",
        status: 400,
        errorCode: "LOGO_UPLOAD_INVALID_MIME",
        stage: "request_validation",
      };
    }

    const maxSizeBytes = getMaxUploadSizeBytes();

    if (file.size > maxSizeBytes) {
      return {
        success: false,
        error: `File too large. Maximum size is ${Math.round(maxSizeBytes / 1024 / 1024)}MB.`,
        status: 400,
        errorCode: "LOGO_UPLOAD_TOO_LARGE",
        stage: "request_validation",
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
        error: data?.message || data?.error || `Upload failed with status ${response.status}`,
        status: response.status,
        errorCode: data?.error,
        stage: data?.stage,
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
      status: response.status,
    };
  } catch (error: any) {
    if (error?.name === "AbortError") {
      return {
        success: false,
        error: "Upload timed out. Please try again.",
        status: 408,
        errorCode: "LOGO_UPLOAD_TIMEOUT",
        stage: "pinata_upload",
      };
    }

    return {
      success: false,
      error:
        error?.message === "Failed to fetch"
          ? "Logo upload request failed before the server responded."
          : error?.message || "Unknown upload error",
      status: 0,
      errorCode: "LOGO_UPLOAD_REQUEST_FAILED",
      stage: "request_parse",
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
