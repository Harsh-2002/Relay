import { describe, it, expect } from "vitest";
import { escapeHtml } from "../../../src/utils/html.js";

describe("escapeHtml", () => {
  it("escapes ampersand", () => {
    expect(escapeHtml("foo & bar")).toBe("foo &amp; bar");
  });

  it("escapes angle brackets", () => {
    expect(escapeHtml("<script>alert(1)</script>")).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("escapes double quotes", () => {
    expect(escapeHtml('he said "hello"')).toBe("he said &quot;hello&quot;");
  });

  it("handles empty string", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("handles string with all special characters", () => {
    expect(escapeHtml('&<>"')).toBe("&amp;&lt;&gt;&quot;");
  });

  it("leaves safe characters untouched", () => {
    expect(escapeHtml("hello world 123")).toBe("hello world 123");
  });

  it("handles multiple occurrences", () => {
    expect(escapeHtml("a & b & c")).toBe("a &amp; b &amp; c");
  });
});
