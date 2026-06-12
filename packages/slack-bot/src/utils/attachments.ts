import type { Attachment } from "@open-inspect/shared";
import { downloadSlackFile, getFileInfo, type SlackFile } from "@open-inspect/shared";
import type { Env } from "../types";

// Caps for inbound attachments forwarded from a Slack message.
export const MAX_SLACK_ATTACHMENTS = 5;
export const MAX_SLACK_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

const MB = 1024 * 1024;

// Textual mime types. Sent as text/plain so the agent runtime inlines their
// content as readable file text.
const TEXTUAL_MIMES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/tab-separated-values",
  "text/html",
  "text/css",
  "application/json",
  "application/xml",
  "application/x-yaml",
  "application/yaml",
  "application/javascript",
  "application/x-sh",
]);

type AttachmentKind = "image" | "text" | "pdf";

function classify(mime: string | undefined): AttachmentKind | null {
  if (!mime) return null;
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("text/") || TEXTUAL_MIMES.has(mime)) return "text";
  return null;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * Ensure a Slack file has the download URL and mimetype needed to fetch it,
 * falling back to files.info when the event payload omitted them (e.g. files
 * still uploading when the event fired).
 */
async function hydrate(env: Env, file: SlackFile): Promise<SlackFile> {
  if (file.url_private_download || file.url_private) return file;
  const info = await getFileInfo(env.SLACK_BOT_TOKEN, file.id);
  return info.ok ? info.file : file;
}

/**
 * Download Slack files and convert the supported ones into inline prompt
 * attachments (base64 data URLs). Images and PDFs keep their mime; textual
 * files are sent as text/plain so the agent reads their content. Unsupported,
 * oversized, or failed downloads are skipped and reported by display name so
 * the caller can note them in the prompt.
 */
export async function slackFilesToAttachments(
  env: Env,
  files: SlackFile[]
): Promise<{ attachments: Attachment[]; skipped: string[] }> {
  const attachments: Attachment[] = [];
  const skipped: string[] = [];

  for (const raw of files.slice(0, MAX_SLACK_ATTACHMENTS)) {
    const file = await hydrate(env, raw);
    const name = file.name || file.title || file.id;
    const kind = classify(file.mimetype);

    if (!kind) {
      skipped.push(`${name} (unsupported type)`);
      continue;
    }
    if (file.size && file.size > MAX_SLACK_FILE_BYTES) {
      skipped.push(`${name} (over ${MAX_SLACK_FILE_BYTES / MB} MB)`);
      continue;
    }

    const url = file.url_private_download || file.url_private;
    if (!url) {
      skipped.push(`${name} (no download URL)`);
      continue;
    }

    const result = await downloadSlackFile(env.SLACK_BOT_TOKEN, url);
    if (!result.ok) {
      skipped.push(`${name} (download failed)`);
      continue;
    }
    if (result.bytes.byteLength > MAX_SLACK_FILE_BYTES) {
      skipped.push(`${name} (over ${MAX_SLACK_FILE_BYTES / MB} MB)`);
      continue;
    }

    const base64 = bytesToBase64(result.bytes);
    if (kind === "image") {
      const mime = file.mimetype || "image/png";
      attachments.push({
        type: "image",
        name,
        mimeType: mime,
        url: `data:${mime};base64,${base64}`,
      });
    } else if (kind === "pdf") {
      attachments.push({
        type: "file",
        name,
        mimeType: "application/pdf",
        url: `data:application/pdf;base64,${base64}`,
      });
    } else {
      // Textual: send as text/plain so the runtime injects the content.
      attachments.push({
        type: "file",
        name,
        mimeType: "text/plain",
        url: `data:text/plain;base64,${base64}`,
      });
    }
  }

  if (files.length > MAX_SLACK_ATTACHMENTS) {
    skipped.push(`+${files.length - MAX_SLACK_ATTACHMENTS} more (max ${MAX_SLACK_ATTACHMENTS})`);
  }

  return { attachments, skipped };
}

/**
 * A short parenthetical note listing files that could not be attached, for
 * appending to the prompt so the agent knows something was dropped.
 */
export function skippedNote(skipped: string[]): string {
  if (skipped.length === 0) return "";
  return `\n\n(Note: some attachments could not be included: ${skipped.join(", ")}.)`;
}
