import { vi } from "vitest";
import type { Context } from "grammy";

export function createMockApi() {
  return {
    sendMessage: vi.fn().mockResolvedValue({ message_id: 100, chat: { id: 1 } }),
    editMessageText: vi.fn().mockResolvedValue(true),
    deleteMessage: vi.fn().mockResolvedValue(true),
    editMessageReplyMarkup: vi.fn().mockResolvedValue(true),
    getFile: vi.fn().mockResolvedValue({ file_path: "test.txt" }),
  };
}

export function createMockContext(opts: {
  chatId?: number;
  messageText?: string;
  api?: ReturnType<typeof createMockApi>;
} = {}) {
  const api = opts.api ?? createMockApi();
  const chatId = opts.chatId ?? 1;

  const ctx = {
    chat: { id: chatId },
    message: {
      text: opts.messageText ?? "",
      message_id: 42,
      chat: { id: chatId },
    },
    api,
    reply: vi.fn().mockResolvedValue({ message_id: 101, chat: { id: chatId } }),
    editMessageText: vi.fn().mockResolvedValue(true),
    editMessageReplyMarkup: vi.fn().mockResolvedValue(true),
    answerCallbackQuery: vi.fn().mockResolvedValue(true),
  } as unknown as Context;

  return ctx;
}

export function createCallbackContext(opts: {
  data: string;
  match: RegExpMatchArray;
  chatId?: number;
  messageId?: number;
  inlineKeyboard?: Array<Array<{ text: string; callback_data: string }>>;
  api?: ReturnType<typeof createMockApi>;
}) {
  const api = opts.api ?? createMockApi();
  const chatId = opts.chatId ?? 1;
  const messageId = opts.messageId ?? 50;

  const ctx = {
    chat: { id: chatId },
    match: opts.match,
    callbackQuery: {
      data: opts.data,
      message: {
        chat: { id: chatId },
        message_id: messageId,
        text: "Question text",
        reply_markup: {
          inline_keyboard: opts.inlineKeyboard ?? [],
        },
      },
    },
    api,
    reply: vi.fn().mockResolvedValue({ message_id: 101, chat: { id: chatId } }),
    editMessageText: vi.fn().mockResolvedValue(true),
    editMessageReplyMarkup: vi.fn().mockResolvedValue(true),
    answerCallbackQuery: vi.fn().mockResolvedValue(true),
  } as unknown as Context;

  return ctx;
}
