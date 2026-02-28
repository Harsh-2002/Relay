import { readFileSync, existsSync, watchFile, unwatchFile } from "fs";
import { resolve } from "path";

const DEFAULT_SYSTEM_PROMPT = `You are a coding assistant accessed through a Telegram bot that bridges to the OpenCode AI agent. Your responses are delivered as Telegram messages, so keep them concise and under 4000 characters when possible — use Markdown formatting (bold, inline code, code blocks) for readability. Focus on actionable, practical answers: provide code, commands, or direct solutions rather than lengthy explanations. Messages may originate from voice transcriptions, so interpret the user's intent generously even if the wording is imprecise or contains transcription artifacts.`;

let cachedPrompt: string | null = null;
let watchedPath: string | null = null;

export function getSystemPrompt(): string {
  if (cachedPrompt !== null) return cachedPrompt;
  return loadSystemPrompt();
}

export function loadSystemPrompt(): string {
  const filePath = resolvePromptPath();
  if (filePath && existsSync(filePath)) {
    try {
      const fileContent = readFileSync(filePath, "utf-8").trim();
      if (fileContent) {
        cachedPrompt = fileContent;
        if (watchedPath !== filePath) {
          if (watchedPath) unwatchFile(watchedPath);
          watchFile(filePath, { interval: 5000 }, () => {
            cachedPrompt = null;
          });
          watchedPath = filePath;
        }
        return cachedPrompt;
      }
    } catch {
      // Fall through to default
    }
  }
  cachedPrompt = DEFAULT_SYSTEM_PROMPT;
  return cachedPrompt;
}

export function reloadSystemPrompt(): string {
  cachedPrompt = null;
  return loadSystemPrompt();
}

export function isUsingCustomPrompt(): boolean {
  const filePath = resolvePromptPath();
  if (!filePath || !existsSync(filePath)) return false;
  try {
    const content = readFileSync(filePath, "utf-8").trim();
    return content.length > 0;
  } catch {
    return false;
  }
}

function resolvePromptPath(): string | null {
  const envPath = process.env.SYSTEM_PROMPT_FILE;
  if (envPath) return resolve(envPath);
  return resolve("skill.md");
}
