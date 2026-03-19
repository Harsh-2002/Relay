import { describe, it, expect } from "vitest";
import { formatCatchError, isNotModified, EMPTY_RESPONSE_MSG } from "../../../src/utils/errors.js";

describe("formatCatchError", () => {
  describe("connection errors", () => {
    it("detects ECONNREFUSED", () => {
      const result = formatCatchError(new Error("connect ECONNREFUSED 127.0.0.1:3000"), "streaming");
      expect(result).toContain("Server unreachable");
    });

    it("detects ECONNRESET", () => {
      const result = formatCatchError(new Error("socket hang up ECONNRESET"), "streaming");
      expect(result).toContain("Server unreachable");
    });

    it("detects fetch failed", () => {
      const result = formatCatchError(new Error("fetch failed"), "streaming");
      expect(result).toContain("Server unreachable");
    });
  });

  describe("timeout errors", () => {
    it("detects timeout", () => {
      const result = formatCatchError(new Error("Request timeout"), "streaming");
      expect(result).toContain("Request timed out");
    });

    it("detects AbortError", () => {
      const result = formatCatchError(new Error("AbortError: signal timed out"), "streaming");
      expect(result).toContain("Request timed out");
    });

    it("detects aborted", () => {
      const result = formatCatchError(new Error("The operation was aborted"), "streaming");
      expect(result).toContain("Request timed out");
    });
  });

  describe("rate limit errors", () => {
    it("detects rate limit text", () => {
      const result = formatCatchError(new Error("rate limit exceeded"), "streaming");
      expect(result).toContain("Rate limit exceeded");
    });

    it("detects 429 status", () => {
      const result = formatCatchError(new Error("HTTP 429 Too Many Requests"), "streaming");
      expect(result).toContain("Rate limit exceeded");
    });

    it("detects tokens per minute", () => {
      const result = formatCatchError(new Error("tokens per minute limit reached"), "streaming");
      expect(result).toContain("Rate limit exceeded");
    });
  });

  describe("model not found", () => {
    it("detects model not found", () => {
      const result = formatCatchError(new Error("model not found: gpt-5"), "streaming");
      expect(result).toContain("Model not found");
    });

    it("detects ProviderModelNotFoundError", () => {
      const result = formatCatchError(new Error("ProviderModelNotFoundError"), "streaming");
      expect(result).toContain("Model not found");
    });
  });

  describe("generic errors", () => {
    it("shows context and message", () => {
      const result = formatCatchError(new Error("something weird"), "streaming");
      expect(result).toContain("Error streaming");
      expect(result).toContain("something weird");
    });
  });

  describe("extractMessage paths", () => {
    it("handles string errors", () => {
      const result = formatCatchError("raw string error", "test");
      expect(result).toContain("raw string error");
    });

    it("handles { message } shape", () => {
      const result = formatCatchError({ message: "from message" }, "test");
      expect(result).toContain("from message");
    });

    it("handles { error: { message } } shape", () => {
      const result = formatCatchError({ error: { message: "nested msg" } }, "test");
      expect(result).toContain("nested msg");
    });

    it("handles { error: string } shape", () => {
      const result = formatCatchError({ error: "string error" }, "test");
      expect(result).toContain("string error");
    });

    it("handles { statusCode } shape", () => {
      const result = formatCatchError({ statusCode: 503 }, "test");
      expect(result).toContain("HTTP 503");
    });

    it("handles { status } shape", () => {
      const result = formatCatchError({ status: 500 }, "test");
      expect(result).toContain("HTTP 500");
    });

    it("handles null/undefined", () => {
      const result = formatCatchError(null, "test");
      expect(result).toContain("Error test");
    });
  });

  describe("truncation", () => {
    it("truncates messages over 200 characters", () => {
      const longMsg = "x".repeat(250);
      const result = formatCatchError(new Error(longMsg), "test");
      expect(result).toContain("...");
    });

    it("does not truncate short messages", () => {
      const result = formatCatchError(new Error("short"), "test");
      expect(result).not.toMatch(/short\.\.\./);
    });
  });
});

describe("isNotModified", () => {
  it("returns true for Telegram not-modified error", () => {
    expect(isNotModified({ description: "Bad Request: message is not modified" })).toBe(true);
  });

  it("returns false for other errors", () => {
    expect(isNotModified({ description: "Bad Request: message not found" })).toBe(false);
  });

  it("returns falsy for null", () => {
    expect(isNotModified(null)).toBeFalsy();
  });
});

describe("EMPTY_RESPONSE_MSG", () => {
  it("is an HTML string", () => {
    expect(EMPTY_RESPONSE_MSG).toContain("<b>Empty response</b>");
  });
});
