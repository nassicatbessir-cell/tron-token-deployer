/**
 * Logo upload utilities with retry and fallback logic
 */

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const UPLOAD_TIMEOUT_MS = 30000;

interface UploadResult {
  success: boolean;
  ipfsHash?: string;
  cid?: string;
  gatewayUrl?: string;
  ipfsUrl?: string;
  filename?: string;
  error?: string;
}

/**
 * Upload logo with automatic retry on failure
 */
export async function uploadLogoWithRetry(
  file: File,
  retries: number = MAX_RETRIES
): Promise<UploadResult> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await uploadLogoToIPFS(file);

      if (result.success) {
        return result;
      }

      if (attempt < retries) {
        // Wait before retry with exponential backoff
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

      // Wait before retry
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
 * Upload logo to IPFS via Pinata API
 */
async function uploadLogoToIPFS(file: File): Promise<UploadResult> {
  try {
    // Validate file
    if (!file || !file.type.startsWith("image/")) {
      return {
        success: false,
        error: "Invalid file. Must be an image.",
      };
    }

    const maxSizeMB = parseInt(process.env.NEXT_PUBLIC_MAX_UPLOAD_SIZE_MB || "5");
    const maxSizeBytes = maxSizeMB * 1024 * 1024;

    if (file.size > maxSizeBytes) {
      return {
        success: false,
        error: `File too large. Maximum size is ${maxSizeMB}MB`,
      };
    }

    const formData = new FormData();
    formData.append("file", file);

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      UPLOAD_TIMEOUT_MS
    );

    const response = await fetch("/api/upload-logo", {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data?.error || `Upload failed with status ${response.status}`,
      };
    }

    return {
      success: true,
      ipfsHash: data.ipfsHash || data.cid,
      cid: data.cid || data.ipfsHash,
      gatewayUrl: data.gatewayUrl,
      ipfsUrl: data.ipfsUrl,
      filename: data.filename,
    };
  } catch (error: any) {
    if (error.name === "AbortError") {
      return {
        success: false,
        error: "Upload timed out. Please try again.",
      };
    }

    return {
      success: false,
      error: error?.message || "Unknown upload error",
    };
  }
}

/**
 * Generate placeholder metadata if logo upload fails
 */
export function generateFallbackLogoMetadata(tokenSymbol: string) {
  return {
    ipfsHash: "",
    cid: "",
    gatewayUrl: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect fill='%23ff174d' width='100' height='100'/%3E%3Ctext x='50' y='50' font-size='48' fill='white' text-anchor='middle' dy='.3em'%3E${tokenSymbol.charAt(0)}%3C/text%3E%3C/svg%3E`,
    isPlaceholder: true,
  };
}

/**
 * Validate logo metadata
 */
export function isValidLogoMetadata(metadata: any): boolean {
  return (
    metadata &&
    (metadata.ipfsHash || metadata.cid || metadata.gatewayUrl) &&
    (metadata.gatewayUrl || metadata.ipfsUrl)
  );
}
