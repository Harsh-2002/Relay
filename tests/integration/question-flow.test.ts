import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  startQuestionFlow,
  cleanupQuestionFlow,
  consumePendingTextQuestion,
  registerQuestionHandlers,
} from "../../src/commands/question.js";
import { createMockContext, createMockApi, createCallbackContext } from "../helpers/mock-grammy.js";
import { createMockProvider } from "../helpers/mock-provider.js";

let mockProvider = createMockProvider();

vi.mock("../../src/providers/index.js", () => ({
  getProvider: () => mockProvider,
}));

let chatIdCounter = 4000;
function nextChatId() {
  return chatIdCounter++;
}

// Capture registered callback handlers
const callbackHandlers = new Map<string, Function>();

beforeEach(() => {
  mockProvider = createMockProvider();
  callbackHandlers.clear();

  const mockBot = {
    callbackQuery: (re: RegExp, fn: Function) => {
      callbackHandlers.set(re.source, fn);
    },
  };
  registerQuestionHandlers(mockBot as any);
});

function getHandler(pattern: string): Function {
  const handler = callbackHandlers.get(pattern);
  if (!handler) throw new Error(`No handler for pattern: ${pattern}`);
  return handler;
}

describe("question flow lifecycle", () => {
  describe("single-select", () => {
    it("option click calls replyToQuestion and edits message", async () => {
      const chatId = nextChatId();
      const api = createMockApi();
      const ctx = createMockContext({ chatId, api });

      const requestId = `req-ss-${chatId}`;
      const question = {
        requestId,
        sessionId: "sess-1",
        items: [{
          header: "Plan",
          question: "Which approach?",
          options: [
            { label: "Option A", description: "First approach" },
            { label: "Option B", description: "Second approach" },
          ],
        }],
      };

      await startQuestionFlow(ctx, chatId, question, null);

      // Simulate clicking "Option A"
      const callbackData = `qa:${requestId}:0`;
      const cbCtx = createCallbackContext({
        data: callbackData,
        match: callbackData.match(/^qa:([^:]+):(\d+)$/)!,
        chatId,
        api,
        inlineKeyboard: [[
          { text: "Option A", callback_data: `qa:${requestId}:0` },
          { text: "Option B", callback_data: `qa:${requestId}:1` },
        ]],
      });

      const handler = getHandler("^qa:([^:]+):(\\d+)$");
      await handler(cbCtx);

      expect(mockProvider.replyToQuestion).toHaveBeenCalledWith(requestId, [["Option A"]]);
      expect(cbCtx.editMessageText).toHaveBeenCalled();
      expect(cbCtx.answerCallbackQuery).toHaveBeenCalled();
    });

    it("skip auto-selects first option", async () => {
      const chatId = nextChatId();
      const api = createMockApi();
      const ctx = createMockContext({ chatId, api });

      const requestId = `req-skip-${chatId}`;
      const question = {
        requestId,
        sessionId: "sess-1",
        items: [{
          header: "",
          question: "Pick?",
          options: [{ label: "Default" }, { label: "Other" }],
        }],
      };

      await startQuestionFlow(ctx, chatId, question, null);

      const callbackData = `qa_skip:${requestId}`;
      const cbCtx = createCallbackContext({
        data: callbackData,
        match: callbackData.match(/^qa_skip:([^:]+)$/)!,
        chatId,
        api,
        inlineKeyboard: [[
          { text: "Default", callback_data: `qa:${requestId}:0` },
        ]],
      });

      const handler = getHandler("^qa_skip:([^:]+)$");
      await handler(cbCtx);

      expect(mockProvider.replyToQuestion).toHaveBeenCalledWith(requestId, [["Default"]]);
    });
  });

  describe("no-options (Yes/No)", () => {
    it("Yes button calls replyToQuestion with 'yes'", async () => {
      const chatId = nextChatId();
      const api = createMockApi();
      const ctx = createMockContext({ chatId, api });

      const requestId = `req-yes-${chatId}`;
      const question = {
        requestId,
        sessionId: "sess-1",
        items: [{
          header: "",
          question: "Continue?",
          options: [],
        }],
      };

      await startQuestionFlow(ctx, chatId, question, null);

      const callbackData = `qay:${requestId}`;
      const cbCtx = createCallbackContext({
        data: callbackData,
        match: callbackData.match(/^qay:([^:]+)$/)!,
        chatId,
        api,
      });

      const handler = getHandler("^qay:([^:]+)$");
      await handler(cbCtx);

      expect(mockProvider.replyToQuestion).toHaveBeenCalledWith(requestId, [["yes"]]);
    });

    it("No button calls replyToQuestion with 'no'", async () => {
      const chatId = nextChatId();
      const api = createMockApi();
      const ctx = createMockContext({ chatId, api });

      const requestId = `req-no-${chatId}`;
      const question = {
        requestId,
        sessionId: "sess-1",
        items: [{
          header: "",
          question: "Cancel?",
          options: [],
        }],
      };

      await startQuestionFlow(ctx, chatId, question, null);

      const callbackData = `qan:${requestId}`;
      const cbCtx = createCallbackContext({
        data: callbackData,
        match: callbackData.match(/^qan:([^:]+)$/)!,
        chatId,
        api,
      });

      const handler = getHandler("^qan:([^:]+)$");
      await handler(cbCtx);

      expect(mockProvider.replyToQuestion).toHaveBeenCalledWith(requestId, [["no"]]);
    });
  });

  describe("type answer", () => {
    it("qatxt sends force_reply and pendingTextQuestion can be consumed", async () => {
      const chatId = nextChatId();
      const api = createMockApi();
      const ctx = createMockContext({ chatId, api });

      const requestId = `req-txt-${chatId}`;
      const question = {
        requestId,
        sessionId: "sess-1",
        items: [{
          header: "",
          question: "What path?",
          options: [{ label: "default" }],
          custom: true,
        }],
      };

      await startQuestionFlow(ctx, chatId, question, null);

      // Simulate "Type answer..." click
      const callbackData = `qatxt:${requestId}`;
      const cbCtx = createCallbackContext({
        data: callbackData,
        match: callbackData.match(/^qatxt:([^:]+)$/)!,
        chatId,
        messageId: api.sendMessage.mock.results[0]?.value?.message_id ?? 100,
        api,
      });

      const handler = getHandler("^qatxt:([^:]+)$");
      await handler(cbCtx);

      // Should have sent a force_reply message
      expect(api.sendMessage).toHaveBeenCalledWith(
        chatId,
        "Type your answer:",
        expect.objectContaining({
          reply_markup: { force_reply: true, selective: true },
        }),
      );

      // Pending text question should be consumable
      const pending = consumePendingTextQuestion(chatId);
      expect(pending).not.toBeNull();

      // Simulate user typing an answer
      const textCtx = createMockContext({ chatId, api });
      await pending!.handle("/src/index.ts", textCtx);

      expect(mockProvider.replyToQuestion).toHaveBeenCalledWith(requestId, [["/src/index.ts"]]);
    });
  });

  describe("timeout cleanup", () => {
    it("cleanupQuestionFlow with timeout edits message to Auto-replied", async () => {
      const chatId = nextChatId();
      const api = createMockApi();
      const ctx = createMockContext({ chatId, api });

      const requestId = `req-timeout-${chatId}`;
      const question = {
        requestId,
        sessionId: "sess-1",
        items: [{
          header: "",
          question: "Approve?",
          options: [{ label: "A" }, { label: "B" }],
          multiple: true,
        }],
      };

      await startQuestionFlow(ctx, chatId, question, null);

      await cleanupQuestionFlow(requestId, "timeout");

      // Should have edited the message to show "Auto-replied"
      const editCalls = api.editMessageText.mock.calls;
      const autoReplied = editCalls.find((c: any[]) =>
        typeof c[2] === "string" && c[2].includes("Auto-replied"),
      );
      expect(autoReplied).toBeDefined();
    });

    it("cleanup removes consumable state", async () => {
      const chatId = nextChatId();
      const api = createMockApi();
      const ctx = createMockContext({ chatId, api });

      const requestId = `req-cleanup-${chatId}`;
      const question = {
        requestId,
        sessionId: "sess-1",
        items: [{
          header: "",
          question: "Go?",
          options: [],
        }],
      };

      await startQuestionFlow(ctx, chatId, question, null);

      // Simulate typing answer setup
      const callbackData = `qatxt:${requestId}`;
      const cbCtx = createCallbackContext({
        data: callbackData,
        match: callbackData.match(/^qatxt:([^:]+)$/)!,
        chatId,
        api,
      });

      const handler = getHandler("^qatxt:([^:]+)$");
      await handler(cbCtx);

      // Now cleanup
      await cleanupQuestionFlow(requestId, "resolved");

      // Pending text question should be gone
      expect(consumePendingTextQuestion(chatId)).toBeNull();
    });
  });

  describe("error handling", () => {
    it("handles expired question gracefully", async () => {
      const chatId = nextChatId();
      const api = createMockApi();

      const requestId = "nonexistent-req";
      const callbackData = `qa:${requestId}:0`;
      const cbCtx = createCallbackContext({
        data: callbackData,
        match: callbackData.match(/^qa:([^:]+):(\d+)$/)!,
        chatId,
        api,
      });

      // Provider rejects (question expired)
      mockProvider.replyToQuestion = vi.fn().mockRejectedValue(new Error("Question expired"));

      const handler = getHandler("^qa:([^:]+):(\\d+)$");
      await handler(cbCtx);

      expect(cbCtx.answerCallbackQuery).toHaveBeenCalledWith(
        expect.objectContaining({ text: "Already answered or expired" }),
      );
    });
  });
});
