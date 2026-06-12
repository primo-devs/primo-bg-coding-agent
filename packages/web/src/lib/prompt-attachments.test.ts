import { describe, expect, it } from "vitest";
import { isImageFile, isSupportedFile } from "./prompt-attachments";

function file(name: string, type: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type });
}

describe("prompt-attachments classification", () => {
  it("treats images as images and supported", () => {
    const png = file("shot.png", "image/png");
    expect(isImageFile(png)).toBe(true);
    expect(isSupportedFile(png)).toBe(true);
  });

  it("supports textual mime types", () => {
    expect(isSupportedFile(file("notes.txt", "text/plain"))).toBe(true);
    expect(isSupportedFile(file("data.csv", "text/csv"))).toBe(true);
    expect(isSupportedFile(file("config.json", "application/json"))).toBe(true);
  });

  it("supports textual files reported with empty or octet-stream mime via extension", () => {
    expect(isSupportedFile(file("server.log", ""))).toBe(true);
    expect(isSupportedFile(file("script.py", "application/octet-stream"))).toBe(true);
  });

  it("supports PDFs by mime or extension", () => {
    expect(isSupportedFile(file("doc.pdf", "application/pdf"))).toBe(true);
    expect(isSupportedFile(file("doc.pdf", ""))).toBe(true);
  });

  it("rejects unknown binary types", () => {
    expect(isSupportedFile(file("archive.zip", "application/zip"))).toBe(false);
    expect(isSupportedFile(file("sheet.xlsx", "application/octet-stream"))).toBe(false);
    expect(isImageFile(file("sheet.xlsx", "application/octet-stream"))).toBe(false);
  });
});
