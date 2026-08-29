import { Buffer } from "node:buffer";

const CRLF = Buffer.from("\r\n", "ascii");
const HEADER_SEPARATOR = Buffer.from("\r\n\r\n", "ascii");

type SupportedMimeType = "image/png" | "image/jpeg" | "image/webp";

export type ParsedMultipartFile = {
  fieldName: string;
  originalFilename: string;
  mimeType: string;
  data: Uint8Array;
};

export function getSafeUploadExtension(mimeType: string): string {
  switch ((mimeType || "").toLowerCase()) {
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

export function createSafeUploadFilename(mimeType: string): string {
  return `logo.${getSafeUploadExtension(mimeType)}`;
}

export function sanitizeHeaderFilename(
  value: string,
  mimeType: string
): string {
  const normalizedValue = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalizedValue || createSafeUploadFilename(mimeType);
}

function indexOfSequence(
  source: Uint8Array,
  sequence: Uint8Array,
  fromIndex = 0
): number {
  if (!sequence.length) {
    return -1;
  }

  outer: for (
    let index = fromIndex;
    index <= source.length - sequence.length;
    index += 1
  ) {
    for (let offset = 0; offset < sequence.length; offset += 1) {
      if (source[index + offset] !== sequence[offset]) {
        continue outer;
      }
    }

    return index;
  }

  return -1;
}

function parseHeaderPairs(
  headerText: string
): Array<[string, string]> {
  return headerText
    .split("\r\n")
    .map((line): [string, string] | null => {
      const separatorIndex = line.indexOf(":");

      if (separatorIndex === -1) {
        return null;
      }

      return [
        line.slice(0, separatorIndex).trim().toLowerCase(),
        line.slice(separatorIndex + 1).trim(),
      ];
    })
    .filter((pair): pair is [string, string] => pair !== null);
}

function parseContentDisposition(value: string): {
  type: string;
  name: string;
  filename: string;
} {
  const result = {
    type: "",
    name: "",
    filename: "",
  };

  for (const segment of String(value || "").split(";")) {
    const trimmed = segment.trim();

    if (!trimmed) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");

    if (equalsIndex === -1) {
      if (!result.type) {
        result.type = trimmed.toLowerCase();
      }

      continue;
    }

    const key = trimmed
      .slice(0, equalsIndex)
      .trim()
      .toLowerCase();

    const rawValue = trimmed
      .slice(equalsIndex + 1)
      .trim()
      .replace(/^"|"$/g, "");

    if (key === "name") {
      result.name = rawValue;
    }

    if (key === "filename" || key === "filename*") {
      result.filename = rawValue;
    }
  }

  return result;
}

export function matchesImageMagicBytes(
  bytes: Uint8Array,
  mimeType: string
): boolean {
  if (!(bytes instanceof Uint8Array)) {
    return false;
  }

  if (mimeType === "image/png") {
    const pngSignature = [
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a,
    ];

    return (
      bytes.length >= pngSignature.length &&
      pngSignature.every(
        (byte, index) => bytes[index] === byte
      )
    );
  }

  if (mimeType === "image/jpeg") {
    return (
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    );
  }

  if (mimeType === "image/webp") {
    if (bytes.length < 12) {
      return false;
    }

    const riff = Buffer.from(bytes.slice(0, 4)).toString("ascii");
    const webp = Buffer.from(bytes.slice(8, 12)).toString("ascii");

    return riff === "RIFF" && webp === "WEBP";
  }

  return false;
}

export function getMultipartBoundary(
  contentType: string
): string {
  const match =
    /boundary=(?:"([^"]+)"|([^;]+))/i.exec(
      String(contentType || "")
    );

  return match?.[1] || match?.[2] || "";
}

export async function parseMultipartUploadRequest(
  request: Request
): Promise<ParsedMultipartFile> {
  const contentType =
    request.headers.get("content-type") || "";

  const boundary = getMultipartBoundary(contentType);

  if (!boundary) {
    throw new Error(
      "Request is missing a multipart boundary."
    );
  }

  const bodyBuffer = Buffer.from(
    await request.arrayBuffer()
  );

  const boundaryBuffer = Buffer.from(
    `--${boundary}`,
    "ascii"
  );

  const closingBoundaryBuffer = Buffer.from(
    `--${boundary}--`,
    "ascii"
  );

  let cursor = indexOfSequence(
    bodyBuffer,
    boundaryBuffer,
    0
  );

  if (cursor === -1) {
    throw new Error(
      "Multipart boundary was not found in the request body."
    );
  }

  while (cursor !== -1) {
    const afterBoundaryIndex =
      cursor + boundaryBuffer.length;

    if (
      indexOfSequence(
        bodyBuffer,
        closingBoundaryBuffer,
        cursor
      ) === cursor
    ) {
      break;
    }

    let partStartIndex = afterBoundaryIndex;

    if (
      bodyBuffer[partStartIndex] === CRLF[0] &&
      bodyBuffer[partStartIndex + 1] === CRLF[1]
    ) {
      partStartIndex += CRLF.length;
    }

    const nextBoundaryIndex = indexOfSequence(
      bodyBuffer,
      boundaryBuffer,
      partStartIndex
    );

    if (nextBoundaryIndex === -1) {
      break;
    }

    let partEndIndex = nextBoundaryIndex;

    if (
      bodyBuffer[partEndIndex - 2] === CRLF[0] &&
      bodyBuffer[partEndIndex - 1] === CRLF[1]
    ) {
      partEndIndex -= CRLF.length;
    }

    const partBuffer = bodyBuffer.subarray(
      partStartIndex,
      partEndIndex
    );

    const headerEndIndex = indexOfSequence(
      partBuffer,
      HEADER_SEPARATOR,
      0
    );

    if (headerEndIndex !== -1) {
      const headerText = Buffer.from(
        partBuffer.subarray(0, headerEndIndex)
      ).toString("latin1");

      const headerPairs =
        parseHeaderPairs(headerText);

      const headerMap = Object.fromEntries(
        headerPairs
      );

      const disposition =
        parseContentDisposition(
          headerMap["content-disposition"] || ""
        );

      const fieldName = disposition.name;
      const rawFilename = disposition.filename;

      const mimeType = (
        headerMap["content-type"] ||
        "application/octet-stream"
      ).toLowerCase();

      const data = new Uint8Array(
        partBuffer.subarray(
          headerEndIndex +
            HEADER_SEPARATOR.length
        )
      );

      if (
        (fieldName === "file" ||
          fieldName === "logo") &&
        data.length > 0
      ) {
        return {
          fieldName,
          originalFilename:
            sanitizeHeaderFilename(
              rawFilename,
              mimeType
            ),
          mimeType,
          data,
        };
      }
    }

    cursor = nextBoundaryIndex;
  }

  throw new Error(
    "Multipart upload did not include a logo file field."
  );
}
