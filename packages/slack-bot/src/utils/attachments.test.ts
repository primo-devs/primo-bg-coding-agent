import { describe, expect, it, vi, beforeEach } from "vitest";
import type * as SharedModule from "@open-inspect/shared";
import type { SlackFile } from "@open-inspect/shared";
import type { Env } from "../types";

const { mockDownloadSlackFile, mockGetFileInfo } = vi.hoisted(() => ({
  mockDownloadSlackFile: vi.fn(),
  mockGetFileInfo: vi.fn(),
}));

vi.mock("@open-inspect/shared", async () => {
  const actual = await vi.importActual<typeof SharedModule>("@open-inspect/shared");
  return {
    ...actual,
    downloadSlackFile: mockDownloadSlackFile,
    getFileInfo: mockGetFileInfo,
  };
});

import { slackFilesToAttachments, skippedNote, MAX_SLACK_ATTACHMENTS } from "./attachments";

const env = { SLACK_BOT_TOKEN: "xoxb-test" } as unknown as Env;

function file(overrides: Partial<SlackFile>): SlackFile {
  return {
    id: overrides.id ?? "F1",
    name: overrides.name ?? "file",
    mimetype: overrides.mimetype,
    size: overrides.size,
    url_private_download: overrides.url_private_download ?? "https://files.slack.com/x",
    ...overrides,
  };
}

function okDownload(bytes = new Uint8Array([1, 2, 3])) {
  return { ok: true as const, bytes, contentType: "application/octet-stream" };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDownloadSlackFile.mockResolvedValue(okDownload());
});

describe("slackFilesToAttachments", () => {
  it("converts an image into an image attachment", async () => {
    const { attachments, skipped } = await slackFilesToAttachments(env, [
      file({ name: "shot.png", mimetype: "image/png" }),
    ]);
    expect(skipped).toEqual([]);
    expect(attachments).toHaveLength(1);
    expect(attachments[0]).toMatchObject({
      type: "image",
      name: "shot.png",
      mimeType: "image/png",
    });
    expect(attachments[0].url).toMatch(/^data:image\/png;base64,/);
  });

  it("sends textual files as text/plain", async () => {
    const { attachments } = await slackFilesToAttachments(env, [
      file({ name: "data.csv", mimetype: "text/csv" }),
    ]);
    expect(attachments[0]).toMatchObject({
      type: "file",
      name: "data.csv",
      mimeType: "text/plain",
    });
    expect(attachments[0].url).toMatch(/^data:text\/plain;base64,/);
  });

  it("keeps PDFs as application/pdf", async () => {
    const { attachments } = await slackFilesToAttachments(env, [
      file({ name: "doc.pdf", mimetype: "application/pdf" }),
    ]);
    expect(attachments[0]).toMatchObject({ type: "file", mimeType: "application/pdf" });
  });

  it("skips unsupported types with a note", async () => {
    const { attachments, skipped } = await slackFilesToAttachments(env, [
      file({ name: "a.zip", mimetype: "application/zip" }),
    ]);
    expect(attachments).toEqual([]);
    expect(skipped[0]).toContain("a.zip");
    expect(mockDownloadSlackFile).not.toHaveBeenCalled();
  });

  it("skips files over the size cap by reported size without downloading", async () => {
    const { attachments, skipped } = await slackFilesToAttachments(env, [
      file({ name: "huge.png", mimetype: "image/png", size: 50 * 1024 * 1024 }),
    ]);
    expect(attachments).toEqual([]);
    expect(skipped[0]).toContain("huge.png");
    expect(mockDownloadSlackFile).not.toHaveBeenCalled();
  });

  it("skips files whose download fails", async () => {
    mockDownloadSlackFile.mockResolvedValueOnce({ ok: false, error: "unauthorized_or_expired" });
    const { attachments, skipped } = await slackFilesToAttachments(env, [
      file({ name: "x.png", mimetype: "image/png" }),
    ]);
    expect(attachments).toEqual([]);
    expect(skipped[0]).toContain("x.png");
  });

  it("hydrates via files.info when the download URL is missing", async () => {
    mockGetFileInfo.mockResolvedValueOnce({
      ok: true,
      file: file({ name: "late.png", mimetype: "image/png" }),
    });
    const { attachments } = await slackFilesToAttachments(env, [
      { id: "F9", name: "late.png", mimetype: "image/png" } as SlackFile,
    ]);
    expect(mockGetFileInfo).toHaveBeenCalledWith("xoxb-test", "F9");
    expect(attachments).toHaveLength(1);
  });

  it("caps the number of attachments and reports the overflow", async () => {
    const many = Array.from({ length: MAX_SLACK_ATTACHMENTS + 2 }, (_, i) =>
      file({ id: `F${i}`, name: `img${i}.png`, mimetype: "image/png" })
    );
    const { attachments, skipped } = await slackFilesToAttachments(env, many);
    expect(attachments).toHaveLength(MAX_SLACK_ATTACHMENTS);
    expect(skipped.some((s) => s.includes("more"))).toBe(true);
  });
});

describe("skippedNote", () => {
  it("is empty when nothing was skipped", () => {
    expect(skippedNote([])).toBe("");
  });

  it("lists skipped files", () => {
    const note = skippedNote(["a.zip (unsupported type)"]);
    expect(note).toContain("a.zip");
    expect(note).toContain("could not be included");
  });
});
