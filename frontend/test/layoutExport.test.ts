/**
 * Tests for the pure helpers in src/lib/layoutExport.ts. We only
 * exercise the parts that don't need a DOM (sanitizeFilename). The
 * Canvas-based PNG path is browser-only and is covered by manual /
 * Playwright tests.
 */
import { describe, it, expect } from "vitest";
import { sanitizeFilename } from "../src/lib/layoutExport";

describe("sanitizeFilename", () => {
  it("replaces path separators and reserved characters", () => {
    expect(sanitizeFilename("../etc/passwd")).toMatch(/^_+etc_passwd$/);
    expect(sanitizeFilename('a"b<c>d|e?f*g:h\\i/j')).not.toMatch(/[/\\<>:"|?*]/);
  });

  it("strips control characters", () => {
    expect(sanitizeFilename("hello\x00\x1fworld")).toBe("hello__world");
  });

  it("trims trailing dots and spaces", () => {
    expect(sanitizeFilename("My layout.  ")).toBe("My layout");
  });

  it("falls back to default for empty input", () => {
    expect(sanitizeFilename("")).toBe("layout");
    expect(sanitizeFilename("   ")).toBe("layout");
  });

  it("preserves the file extension when truncating long names", () => {
    const longName = "a".repeat(120) + ".svg";
    const out = sanitizeFilename(longName);
    expect(out.endsWith(".svg")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(80);
  });

  it("preserves the full string when the trailing segment is too long to be an extension", () => {
    // 14 chars after the dot — not detected as an extension because
    // sanitize only treats 1-8 alphanumeric chars as a file extension.
    const out = sanitizeFilename("name.notanextension");
    expect(out).toBe("name.notanextension");
  });
});
