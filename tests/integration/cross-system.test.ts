import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  setPendingInput,
  consumePendingInput,
  clearPendingInput,
  setCrossClear,
  promptForInput,
} from "../../src/utils/input.js";
import {
  startQuestionFlow,
  consumePendingTextQuestion,
  clearPendingTextQuestionsForChat,
  registerQuestionHandlers,
} from "../../src/commands/question.js";
import { createMockContext, createMockApi } from "../helpers/mock-grammy.js";

// Mock provider for question.ts
vi.mock("../../src/providers/index.js", () => {
  const provider = {
    replyToQuestion: vi.fn().mockResolvedValue(undefined),
    rejectQuestion: vi.fn().mockResolvedValue(undefined),
  };
  return {
    getProvider: () => provider,
  };
});

let chatIdCounter = 3000;
function nextChatId() {
  return chatIdCounter++;
}

// Register cross-clear hooks (as the app does at startup)
beforeEach(() => {
  const handlers = new Map<string, Function>();
  const mockBot = {
    callbackQuery: (re: RegExp, fn: Function) => {
      handlers.set(re.source, fn);
    },
  };
  registerQuestionHandlers(mockBot as any);
});

describe("cross-system clearing", () => {
  it("startQuestionFlow clears pending command input", async () => {
    const chatId = nextChatId();
    const api = createMockApi();
    const ctx = createMockContext({ chatId, api });

    // Set up a pending command input
    const handler = vi.fn();
    setPendingInput(chatId, handler);

    // Start a question flow — should clear the pending input
    const question = {
      requestId: `req-cross-${chatId}`,
      sessionId: "sess-1",
      items: [{
        header: "",
        question: "Approve?",
        options: [],
        custom: true,
      }],
    };
    await startQuestionFlow(ctx, chatId, question, null);

    // Pending input should be gone
    expect(consumePendingInput(chatId)).toBeNull();
  });

  it("promptForInput clears pending text questions", async () => {
    const chatId = nextChatId();
    const api = createMockApi();
    const ctx = createMockContext({ chatId, api });

    // Start a question flow to create internal state
    const question = {
      requestId: `req-input-${chatId}`,
      sessionId: "sess-1",
      items: [{
        header: "",
        question: "Continue?",
        options: [{ label: "Yes" }, { label: "No" }],
      }],
    };
    await startQuestionFlow(ctx, chatId, question, null);

    // Now call promptForInput — it should invoke crossClearFn
    // which clears pending text questions for this chat
    await promptForInput(ctx, "Enter file path:", vi.fn());

    // The pending text question should be cleared
    expect(consumePendingTextQuestion(chatId)).toBeNull();
  });

  it("back-to-back promptForInput replaces handler", async () => {
    const chatId = nextChatId();
    const api = createMockApi();
    const ctx = createMockContext({ chatId, api });

    const handlerA = vi.fn();
    const handlerB = vi.fn();

    await promptForInput(ctx, "First:", handlerA);
    await promptForInput(ctx, "Second:", handlerB);

    const result = consumePendingInput(chatId);
    expect(result).toBe(handlerB);

    // Previous force_reply deletion should have been attempted
    expect(api.deleteMessage).toHaveBeenCalled();
  });

  it("both systems can be set up independently without interference", async () => {
    const chatId = nextChatId();
    const api = createMockApi();
    const ctx = createMockContext({ chatId, api });

    // Set up pending command input
    const handler = vi.fn();
    setPendingInput(chatId, handler);

    // Consume the command input — question system is unaffected
    const result = consumePendingInput(chatId);
    expect(result).toBe(handler);

    // Set up a question flow after consuming input
    const question = {
      requestId: `req-indep-${chatId}`,
      sessionId: "sess-1",
      items: [{
        header: "",
        question: "Ok?",
        options: [],
      }],
    };
    await startQuestionFlow(ctx, chatId, question, null);

    // Question flow should work independently
    expect(api.sendMessage).toHaveBeenCalled();
  });
});
