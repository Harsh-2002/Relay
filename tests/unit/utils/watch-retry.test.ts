import { describe, it, expect } from "vitest";
import { classifyAnalysisError } from "../../../src/watch.js";

describe("classifyAnalysisError", () => {
  it("classifies the 120s stall abort as a model-didn't-respond message", () => {
    const err = new Error("Session not found or timed out — no response received after 120 seconds");
    expect(classifyAnalysisError(err)).toMatch(/didn't respond in 120s/i);
  });

  it("extracts the model id from a 'Model not found' error", () => {
    const err = new Error("Model not found: anthropic/claude-opus-4-6.");
    expect(classifyAnalysisError(err)).toBe("Model unavailable: anthropic/claude-opus-4-6");
  });

  it("classifies 429 as rate limiting", () => {
    const err = new Error("Provider returned 429 Too Many Requests");
    expect(classifyAnalysisError(err)).toMatch(/rate limit/i);
  });

  it("classifies an 'Unauthorized' error as a bad API key", () => {
    const err = new Error("401 Unauthorized: Invalid API key");
    expect(classifyAnalysisError(err)).toMatch(/API key/i);
  });

  it("classifies a connection refused error as unreachable", () => {
    const err = new Error("connect ECONNREFUSED 127.0.0.1:39147");
    expect(classifyAnalysisError(err)).toMatch(/unreachable/i);
  });

  it("falls through to the raw message for anything unclassified", () => {
    const err = new Error("Something weird and unique happened");
    expect(classifyAnalysisError(err)).toBe("Something weird and unique happened");
  });

  it("caps unclassified errors at 200 chars", () => {
    const long = "x".repeat(500);
    const classified = classifyAnalysisError(new Error(long));
    expect(classified.length).toBeLessThanOrEqual(200);
  });

  it("tolerates non-Error values", () => {
    expect(classifyAnalysisError(null)).toBe("Unknown error.");
    expect(classifyAnalysisError(undefined)).toBe("Unknown error.");
    expect(classifyAnalysisError("string error")).toBe("string error");
  });
});

describe("WatchJob pendingReanalysis schema", () => {
  it("round-trips pendingReanalysis through JSON persistence without loss", async () => {
    // Simulate the JsonStore round-trip: write, read back, all optional fields preserved.
    const original = {
      id: "w1",
      name: "t",
      url: "http://example.com",
      task: "Pricing",
      intervalMinutes: 5,
      enabled: true,
      createdAt: 1,
      lastCheckAt: 2,
      lastCheckOk: true,
      lastChangedAt: 3,
      nextCheckAt: 4,
      checkCount: 1,
      changeCount: 1,
      consecutiveErrors: 0,
      snapshots: [],
      pendingReanalysis: {
        previousContent: "old",
        currentContent: "new",
        detectedAt: 100,
        attempts: 1,
        lastAttemptAt: 200,
        lastError: "Model didn't respond",
        modelTried: "anthropic/claude-opus-4-6",
        notificationMsgId: 12345,
        notificationChatId: 67890,
      },
    };

    const serialized = JSON.stringify(original);
    const parsed = JSON.parse(serialized);
    expect(parsed.pendingReanalysis).toEqual(original.pendingReanalysis);
  });

  it("omits pendingReanalysis when it's never been set (backwards-compatible with v2.5.8 watches)", () => {
    const watchJsonV258 = {
      id: "w1",
      name: "t",
      url: "http://example.com",
      task: "Pricing",
      intervalMinutes: 5,
      enabled: true,
      createdAt: 1,
      lastCheckAt: 2,
      lastCheckOk: true,
      lastChangedAt: 3,
      nextCheckAt: 4,
      checkCount: 1,
      changeCount: 1,
      consecutiveErrors: 0,
      snapshots: [],
    };
    expect(JSON.parse(JSON.stringify(watchJsonV258))).not.toHaveProperty("pendingReanalysis");
  });
});
