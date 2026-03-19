import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  setPendingInput,
  consumePendingInput,
  clearPendingInput,
  setCrossClear,
  promptForInput,
} from "../../../src/utils/input.js";
import { createMockContext, createMockApi } from "../../helpers/mock-grammy.js";
import { FIVE_MINUTES_MS } from "../../helpers/time.js";

// Use unique chatIds per test group to avoid state leaks
let chatIdCounter = 1000;
function nextChatId() {
  return chatIdCounter++;
}

describe("setPendingInput + consumePendingInput", () => {
  it("returns handler when consumed within 5 minutes", () => {
    const chatId = nextChatId();
    const handler = vi.fn();
    setPendingInput(chatId, handler);

    const result = consumePendingInput(chatId);
    expect(result).toBe(handler);
  });

  it("returns null when no pending input exists", () => {
    const chatId = nextChatId();
    expect(consumePendingInput(chatId)).toBeNull();
  });

  it("removes entry after consumption (second consume returns null)", () => {
    const chatId = nextChatId();
    setPendingInput(chatId, vi.fn());

    consumePendingInput(chatId);
    expect(consumePendingInput(chatId)).toBeNull();
  });

  it("returns null when expired (>5 min)", () => {
    const chatId = nextChatId();
    const handler = vi.fn();

    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValueOnce(now - FIVE_MINUTES_MS - 1);
    setPendingInput(chatId, handler);
    vi.spyOn(Date, "now").mockReturnValueOnce(now);

    expect(consumePendingInput(chatId)).toBeNull();
  });
});

describe("clearPendingInput", () => {
  it("removes pending input for chatId", () => {
    const chatId = nextChatId();
    setPendingInput(chatId, vi.fn());
    clearPendingInput(chatId);
    expect(consumePendingInput(chatId)).toBeNull();
  });

  it("is a no-op when nothing pending", () => {
    const chatId = nextChatId();
    // Should not throw
    clearPendingInput(chatId);
  });

  it("calls api.deleteMessage when both messageId and api are stored", async () => {
    const chatId = nextChatId();
    const api = createMockApi();
    const ctx = createMockContext({ chatId, api });

    // Use promptForInput to store messageId + api
    await promptForInput(ctx, "Enter value:", vi.fn());

    // Now clear it — should attempt to delete the force_reply message
    clearPendingInput(chatId);
    expect(api.deleteMessage).toHaveBeenCalled();
  });

  it("uses provided api argument over stored api", async () => {
    const chatId = nextChatId();
    const storedApi = createMockApi();
    const overrideApi = createMockApi();
    const ctx = createMockContext({ chatId, api: storedApi });

    await promptForInput(ctx, "Enter:", vi.fn());

    clearPendingInput(chatId, overrideApi as any);
    expect(overrideApi.deleteMessage).toHaveBeenCalled();
    // Stored api should NOT have been called for delete
    // (only for the reply in promptForInput)
  });

  it("does not throw when deleteMessage rejects", async () => {
    const chatId = nextChatId();
    const api = createMockApi();
    api.deleteMessage.mockRejectedValue(new Error("msg not found"));
    const ctx = createMockContext({ chatId, api });

    await promptForInput(ctx, "Enter:", vi.fn());

    // Should not throw
    clearPendingInput(chatId);
  });
});

describe("setCrossClear", () => {
  it("stored callback is invoked by promptForInput", async () => {
    const chatId = nextChatId();
    const crossClear = vi.fn();
    setCrossClear(crossClear);

    const ctx = createMockContext({ chatId });
    await promptForInput(ctx, "Enter:", vi.fn());

    expect(crossClear).toHaveBeenCalledWith(chatId, ctx.api);
  });
});

describe("promptForInput", () => {
  it("clears previous pending input for same chatId (self-cleaning)", async () => {
    const chatId = nextChatId();
    const api = createMockApi();
    const ctx = createMockContext({ chatId, api });

    // Set up first pending input via promptForInput
    const handler1 = vi.fn();
    await promptForInput(ctx, "First:", handler1);

    // Set up second — should clear first
    const handler2 = vi.fn();
    await promptForInput(ctx, "Second:", handler2);

    const result = consumePendingInput(chatId);
    expect(result).toBe(handler2);
  });

  it("sends force_reply via ctx.reply", async () => {
    const chatId = nextChatId();
    const ctx = createMockContext({ chatId });
    await promptForInput(ctx, "Enter value:", vi.fn());

    expect(ctx.reply).toHaveBeenCalledWith("Enter value:", {
      parse_mode: "HTML",
      reply_markup: { force_reply: true, selective: true },
    });
  });

  it("stores handler that can be consumed", async () => {
    const chatId = nextChatId();
    const handler = vi.fn();
    const ctx = createMockContext({ chatId });

    await promptForInput(ctx, "Enter:", handler);

    const result = consumePendingInput(chatId);
    expect(result).toBe(handler);
  });

  it("deletes previous force_reply message when replacing", async () => {
    const chatId = nextChatId();
    const api = createMockApi();
    const ctx = createMockContext({ chatId, api });

    // First call stores a messageId
    await promptForInput(ctx, "First:", vi.fn());

    // Second call should delete the previous force_reply message
    await promptForInput(ctx, "Second:", vi.fn());

    // deleteMessage should have been called (clearing the previous entry)
    expect(api.deleteMessage).toHaveBeenCalled();
  });
});
