export function getSafeUploadExtension(mimeType: string): string;
export function createSafeUploadFilename(mimeType: string): string;
export function sanitizeHeaderFilename(value: string, mimeType: string): string;
export function matchesImageMagicBytes(bytes: Uint8Array, mimeType: string): boolean;
export function getMultipartBoundary(contentType: string): string;
export function parseMultipartUploadRequest(request: Request): Promise<{
  fieldName: string;
  originalFilename: string;
  mimeType: string;
  data: Uint8Array;
}>;
