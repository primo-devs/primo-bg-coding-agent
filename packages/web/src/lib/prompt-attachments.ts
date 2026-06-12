import type { Attachment } from "@open-inspect/shared";

// Max number of attachments on a single prompt.
export const MAX_ATTACHMENTS = 5;

// Reject source images larger than this before attempting to decode them. Downscaling
// brings the encoded payload far below this, so it only guards the decode step.
export const MAX_IMAGE_SOURCE_BYTES = 25 * 1024 * 1024; // 25 MB

// Inline cap for non-image files. These cannot be downscaled, so the raw bytes ride
// inside the prompt as base64; keep them small enough not to bloat the session row.
// Larger / binary files belong in the (future) object-storage delivery path.
export const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

// Longest-edge target for images. Claude's vision pipeline downscales to ~1568px
// anyway, so anything larger is wasted bytes.
const MAX_DIMENSION = 1568;
const JPEG_QUALITY = 0.85;

// Mime types we treat as text. The agent runtime inlines text/plain data URLs as file
// content, so textual files are sent with mime text/plain regardless of their subtype.
const TEXTUAL_MIME_EXACT = new Set([
  "application/json",
  "application/xml",
  "application/x-yaml",
  "application/yaml",
  "application/csv",
  "application/javascript",
  "application/x-sh",
]);

// Extensions for files browsers often report with an empty or octet-stream mime but
// that are really text.
const TEXTUAL_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "csv",
  "tsv",
  "json",
  "yaml",
  "yml",
  "xml",
  "html",
  "css",
  "js",
  "jsx",
  "ts",
  "tsx",
  "py",
  "go",
  "rs",
  "java",
  "rb",
  "php",
  "c",
  "h",
  "cpp",
  "hpp",
  "sh",
  "bash",
  "zsh",
  "sql",
  "toml",
  "ini",
  "cfg",
  "conf",
  "log",
  "env",
]);

const MB = 1024 * 1024;

export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function isTextualFile(file: File): boolean {
  if (file.type.startsWith("text/")) return true;
  if (TEXTUAL_MIME_EXACT.has(file.type)) return true;
  if (file.type === "" || file.type === "application/octet-stream") {
    return TEXTUAL_EXTENSIONS.has(extensionOf(file.name));
  }
  return false;
}

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || extensionOf(file.name) === "pdf";
}

export function isSupportedFile(file: File): boolean {
  return isImageFile(file) || isTextualFile(file) || isPdfFile(file);
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to decode image"));
    img.src = dataUrl;
  });
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

function utf8ToBase64(text: string): string {
  return btoa(unescape(encodeURIComponent(text)));
}

async function fileToImageAttachment(file: File): Promise<Attachment> {
  if (file.size > MAX_IMAGE_SOURCE_BYTES) {
    throw new Error(`Image too large: ${file.name}`);
  }

  const sourceDataUrl = await readAsDataUrl(file);
  const img = await loadImage(sourceDataUrl);

  const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    // Canvas unavailable: fall back to the original (already a valid data URL).
    return { type: "image", name: file.name, mimeType: file.type, url: sourceDataUrl };
  }
  ctx.drawImage(img, 0, 0, width, height);

  const url = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  return { type: "image", name: file.name, mimeType: "image/jpeg", url };
}

async function fileToTextAttachment(file: File): Promise<Attachment> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`File too large: ${file.name} (max ${MAX_FILE_BYTES / MB} MB)`);
  }
  // Send as text/plain so the agent runtime injects the content as readable file text.
  const text = await readAsText(file);
  const url = `data:text/plain;base64,${utf8ToBase64(text)}`;
  return { type: "file", name: file.name, mimeType: "text/plain", url };
}

async function fileToPdfAttachment(file: File): Promise<Attachment> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`File too large: ${file.name} (max ${MAX_FILE_BYTES / MB} MB)`);
  }
  const url = await readAsDataUrl(file);
  return { type: "file", name: file.name, mimeType: "application/pdf", url };
}

/**
 * Convert a user-selected file into an inline prompt attachment carrying a base64
 * data URL. Images are downscaled to a vision-sized JPEG; textual files are sent as
 * text/plain so the agent reads their content; PDFs are sent as documents. The data
 * URL travels inside the prompt message, so no separate upload is involved.
 *
 * Throws on unsupported types or files that exceed the inline size cap.
 */
export async function fileToAttachment(file: File): Promise<Attachment> {
  if (isImageFile(file)) return fileToImageAttachment(file);
  if (isPdfFile(file)) return fileToPdfAttachment(file);
  if (isTextualFile(file)) return fileToTextAttachment(file);
  throw new Error(`Unsupported file: ${file.name}`);
}
