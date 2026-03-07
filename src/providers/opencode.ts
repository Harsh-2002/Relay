import {
  createOpencode,
  createOpencodeClient,
  type OpencodeClient,
} from "@opencode-ai/sdk";
import type {
  Provider,
  Session,
  SessionInfo,
  PromptOptions,
  PromptResult,
  StreamChunk,
  Todo,
  FileDiff,
  SearchResult,
  FileStatus,
  FileNode,
  ProjectInfo,
  CommandInfo,
  ToolInfo,
  HealthInfo,
  ModelDetail,
  McpServerConfig,
  McpServerStatus,
} from "./types.js";
import type { Event as OcEvent } from "@opencode-ai/sdk";
import { exec } from "child_process";
import { createServer } from "net";
import { getConfig } from "../config/index.js";
import { providerLogger } from "../utils/logger.js";

/** Strip known MCP server prefix and convert to title case */
function formatToolName(name: string): string {
  const prefixes = ["relay_", "playwright_", "fetch_", "memory_", "filesystem_", "github_", "context7_"];
  let stripped = name;
  for (const p of prefixes) {
    if (stripped.startsWith(p)) {
      stripped = stripped.slice(p.length);
      break;
    }
  }
  return stripped
    .split("_")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
import { spawnAsync } from "../utils/shell.js";

let client: OpencodeClient;
let serverClose: (() => void) | undefined;
let activePort: number | null = null;

export class OpenCodeProvider implements Provider {
  readonly name = "opencode" as const;

  async init(): Promise<void> {
    const config = getConfig();
    const hostname = config.opencodeHostname;
    const preferredPort = config.opencodePort;
    const port = await findAvailablePort(preferredPort);
    activePort = port;
    providerLogger.info({ hostname, port, preferredPort }, "Initializing provider");

    // On Windows, the SDK's createOpencode() fails with ENOENT because
    // spawn("opencode") can't find .cmd shims. We spawn manually with
    // shell:true and then connect as a client.
    // See: https://github.com/anomalyco/opencode/issues/8160
    if (process.platform === "win32") {
      const baseUrl = await spawnOpencodeWindows(hostname, port);
      client = createOpencodeClient({ baseUrl });
    } else {
      const result = await createOpencode({
        hostname,
        port,
        timeout: 30_000,
        config: { permission: "allow" } as any,
      });
      client = result.client;
      serverClose = result.server.close;
    }
  }

  getPort(): number | null {
    return activePort;
  }

  shutdown(): void {
    providerLogger.info("Shutting down provider");
    serverClose?.();
    serverClose = undefined;
  }

  async isAlive(): Promise<boolean> {
    try {
      const result = await client.config.get();
      return !result.error;
    } catch {
      return false;
    }
  }

  async reconnect(): Promise<void> {
    providerLogger.warn("Reconnecting to OpenCode server...");
    this.shutdown();
    await this.init();
    providerLogger.info("OpenCode server reconnected");
  }

  // --- Sessions ---

  async createSession(title?: string): Promise<Session> {
    providerLogger.info({ title: title ?? "Telegram Session" }, "Creating session");
    const result = await client.session.create({
      body: { title: title ?? "Telegram Session" },
    });
    if (result.error) throw sdkError(result.error);
    if (result.data) {
      providerLogger.info({ sessionId: result.data.id }, "Session created");
      return { id: result.data.id, title: result.data.title };
    }
    throw new Error("Failed to create session");
  }

  async listSessions(): Promise<SessionInfo[]> {
    const result = await client.session.list();
    if (result.error) throw sdkError(result.error);
    return ((result.data ?? []) as any[]).map((s: any) => ({
      id: s.id,
      title: s.title,
      lastModified: s.time?.updated,
    }));
  }

  async getSession(id: string): Promise<Session | null> {
    const result = await client.session.get({ path: { id } });
    if (result.error) return null;
    const s = result.data as any;
    return { id: s.id, title: s.title };
  }

  async deleteSession(id: string): Promise<boolean> {
    providerLogger.info({ sessionId: id }, "Deleting session");
    try {
      await client.session.delete({ path: { id } });
      providerLogger.info({ sessionId: id }, "Session deleted");
      return true;
    } catch (err: any) {
      providerLogger.info({ sessionId: id, err: err?.message }, "Session delete failed");
      return false;
    }
  }

  async renameSession(id: string, title: string): Promise<boolean> {
    try {
      await client.session.update({ path: { id }, body: { title } });
      return true;
    } catch {
      return false;
    }
  }

  async getSessionStatuses(): Promise<Record<string, string>> {
    try {
      const result = await client.session.status();
      if (result.error) return {};
      const data = result.data as Record<string, any> | undefined;
      if (!data) return {};
      const statuses: Record<string, string> = {};
      for (const [id, status] of Object.entries(data)) {
        statuses[id] = status?.type ?? "unknown";
      }
      return statuses;
    } catch {
      return {};
    }
  }

  // --- Messaging ---

  async prompt(
    sessionId: string,
    text: string,
    options?: PromptOptions
  ): Promise<PromptResult> {
    const startMs = Date.now();
    providerLogger.info(
      { sessionId, textLen: text.length, model: options?.model, agent: options?.agent },
      "Starting prompt (via async)"
    );

    let collectedText = "";
    let collectedReasoning = "";
    const fileParts: any[] = [];
    let chunkCount = 0;

    for await (const chunk of this.promptStream(sessionId, text, options)) {
      chunkCount++;
      if (chunk.type === "text") {
        collectedText += chunk.content;
      } else if (chunk.type === "reasoning") {
        collectedReasoning += chunk.content;
      } else if (chunk.type === "reasoning_reclassify") {
        if (chunk.deltaText) {
          const idx = collectedText.indexOf(chunk.deltaText);
          if (idx >= 0) collectedText = collectedText.slice(0, idx) + collectedText.slice(idx + chunk.deltaText.length);
        }
        collectedReasoning += chunk.content;
      } else if (chunk.type === "file" && chunk.file) {
        fileParts.push({
          type: "file" as const,
          mime: chunk.file.mime,
          filename: chunk.file.filename,
          url: chunk.file.url,
        });
      } else if (chunk.type === "done") {
        break;
      }
    }

    collectedText = collectedText || "(empty response)";
    const parts: any[] = [{ type: "text", text: collectedText }, ...fileParts];

    providerLogger.info(
      { sessionId, durationMs: Date.now() - startMs, responseLen: collectedText.length, reasoningLen: collectedReasoning?.length ?? 0 },
      "Prompt completed"
    );

    return { text: collectedText, reasoning: collectedReasoning || undefined, parts, raw: null };
  }

  async abort(sessionId: string): Promise<void> {
    providerLogger.info({ sessionId }, "Aborting session");
    await client.session.abort({ path: { id: sessionId } });
  }

  // --- Questions ---
  // The v1 SDK client doesn't expose a .question namespace — use direct HTTP calls.

  async replyToQuestion(requestId: string, answers: string[][]): Promise<void> {
    providerLogger.info({ requestId, answers }, "Replying to question");
    await questionReply(requestId, answers);
  }

  async rejectQuestion(requestId: string): Promise<void> {
    providerLogger.info({ requestId }, "Rejecting question");
    await questionReject(requestId);
  }

  // --- Streaming ---

  async *promptStream(
    sessionId: string,
    text: string,
    options?: PromptOptions
  ): AsyncGenerator<StreamChunk> {
    const startMs = Date.now();
    providerLogger.info(
      { sessionId, textLen: text.length, model: options?.model, agent: options?.agent },
      "Starting streaming prompt"
    );

    const body: any = {
      parts: options?.parts ?? [{ type: "text", text }],
    };
    if (options?.model) body.model = options.model;
    // System prompt is delivered via OpenCode's instructions config (file-based),
    // not body.system (which OpenCode stores as metadata but never sends to the LLM).
    if (options?.agent) body.agent = options.agent;

    providerLogger.info({ sessionId, body }, "promptAsync request body");

    const asyncResult = await client.session.promptAsync({
      path: { id: sessionId },
      body,
    });
    providerLogger.info(
      { sessionId, status: (asyncResult as any)?.response?.status, error: asyncResult.error },
      "promptAsync response"
    );

    const controller = new AbortController();
    const STALL_TIMEOUT = 120_000;
    let pendingQuestion = false;
    let pendingQuestionId: string | null = null;
    let questionAutoReplyTimer: ReturnType<typeof setTimeout> | null = null;
    let sessionDeleted = false;

    // Stall detection: abort if no session-relevant events arrive for 120s.
    // There is no global wall-clock timeout — the stream stays open as long as
    // OpenCode is making progress (tool runs, reasoning steps, etc.)
    // Skips abort when a question is pending user input.
    const stallAbort = () => {
      if (pendingQuestion) {
        // Question is pending — skip this stall check and reschedule
        stallTimer = setTimeout(stallAbort, STALL_TIMEOUT);
        return;
      }
      providerLogger.warn({ sessionId }, "Stream stall — no activity for 120s, aborting");
      controller.abort();
    };
    let stallTimer = setTimeout(stallAbort, STALL_TIMEOUT);
    const resetStallTimer = () => {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(stallAbort, STALL_TIMEOUT);
    };

    const sseResult = await client.event.subscribe();

    let chunkCount = 0;
    let toolEvents = 0;
    // Track partIDs from delta events so we can match message.part.updated
    // events (v2 API: updated events lack sessionID at top level)
    const sessionPartIds = new Set<string>();
    const partTypeMap = new Map<string, string>();          // partID → definitive part type from updated events
    const reasoningDeltaPartIds = new Set<string>();        // partIDs that yielded reasoning via deltas
    const snapshotYieldedPartIds = new Set<string>();       // partIDs whose full snapshot was already yielded
    const fieldCounts = new Map<string, number>();          // delta field names seen (diagnostics)
    const partDeltaText = new Map<string, string>();        // partID → concatenated delta text yielded as "text"

    try {
      for await (const event of sseResult.stream) {
        if (controller.signal.aborted) break;
        const evt = event as OcEvent;
        const evtType = evt.type as string;
        const props = evt.properties as any;

        // --- v2 API: message.part.delta (streaming text/reasoning tokens) ---
        if (evtType === "message.part.delta") {
          if (props.sessionID !== sessionId) continue;
          resetStallTimer();
          sessionPartIds.add(props.partID);

          if (props.delta) {
            chunkCount++;
            const field = props.field as string;
            fieldCounts.set(field, (fieldCounts.get(field) ?? 0) + 1);
            const isReasoningField = field === "reasoning" || field === "reasoning_content" || field === "reasoning_details";
            // Cross-reference: if field says "text" but partTypeMap says "reasoning", treat as reasoning
            const isReasoningByType = field === "text" && partTypeMap.get(props.partID) === "reasoning";

            if (snapshotYieldedPartIds.has(props.partID)) {
              // Full snapshot already yielded for this part — skip delta to avoid duplication
            } else if (isReasoningField || isReasoningByType) {
              reasoningDeltaPartIds.add(props.partID);
              yield { type: "reasoning", content: props.delta };
            } else if (field === "text") {
              partDeltaText.set(props.partID, (partDeltaText.get(props.partID) ?? "") + props.delta);
              yield { type: "text", content: props.delta };
            } else {
              providerLogger.info({ sessionId, field, partID: props.partID }, "Unknown delta field");
            }
          }

        // --- message.part.updated (files, tool state, full part snapshots) ---
        } else if (evtType === "message.part.updated") {
          const part = props.part;
          // v2: sessionID lives on the part object itself (part.sessionID), not at top-level props
          const partId = part?.id ?? props.partID;
          const isOurSession = matchesSession(evt, sessionId)
            || part?.sessionID === sessionId
            || (partId && sessionPartIds.has(partId));
          if (!isOurSession) continue;
          resetStallTimer();

          // Always track part type for cross-referencing with delta events
          if (part?.id && part?.type) {
            partTypeMap.set(part.id, part.type);
            sessionPartIds.add(part.id);
          }

          // v1 compat: updated events may carry a delta field
          const delta = props.delta;
          if (part?.type === "text" && delta) {
            chunkCount++;
            yield { type: "text", content: delta };
          } else if (part?.type === "file") {
            yield {
              type: "file" as const,
              content: part.filename ?? "file",
              file: { mime: part.mime, filename: part.filename ?? "file", url: part.url },
            };
          } else if (part?.type === "reasoning" && delta) {
            yield { type: "reasoning", content: delta };
          } else if (part?.type === "reasoning" && !delta) {
            if (reasoningDeltaPartIds.has(part.id)) {
              // Deltas already yielded as reasoning — skip
            } else {
              const misclassifiedText = partDeltaText.get(part.id);
              if (misclassifiedText) {
                // Deltas were yielded as text — reclassify
                snapshotYieldedPartIds.add(part.id);
                yield {
                  type: "reasoning_reclassify" as const,
                  content: part.text ?? misclassifiedText,
                  deltaText: misclassifiedText,
                };
              } else if (part.text) {
                // No deltas for this part — yield snapshot as new reasoning
                snapshotYieldedPartIds.add(part.id);
                yield { type: "reasoning", content: part.text };
              }
            }
          } else if (part?.type === "tool") {
            toolEvents++;
            const toolName = part.tool;
            const status = part.state?.status;
            providerLogger.info(
              { sessionId, tool: toolName, status, title: part.state?.title, input: part.state?.input ?? undefined, attachments: part.state?.attachments?.length },
              "Tool event"
            );
            if (status === "running") {
              const label = part.state.title || formatToolName(toolName);
              yield { type: "tool_use", content: `🔧 ${label}...` };
            } else if (status === "completed") {
              const label = part.state.title || formatToolName(toolName);
              yield { type: "tool_use", content: `✅ ${label}` };
              // Yield tool attachments (e.g. Playwright screenshots) as file chunks
              if (part.state?.attachments?.length) {
                for (let ai = 0; ai < part.state.attachments.length; ai++) {
                  const att = part.state.attachments[ai];
                  if (att?.type === "file" && att.url) {
                    const mime = att.mime ?? "application/octet-stream";
                    const filename = att.filename || filenameFromMime(mime, ai);
                    yield {
                      type: "file" as const,
                      content: filename,
                      file: { mime, filename, url: att.url },
                    };
                  }
                }
              }
            } else if (status === "error") {
              yield { type: "tool_use", content: `❌ ${formatToolName(toolName)}` };
            }
          }

        // --- permission requests (auto-approve so tools can run) ---
        // Not session-filtered — handles sub-agent permissions too
        } else if (evtType === "permission.asked" || evtType === "permission.updated") {
          const permission = props as any;
          const permId = permission.id;
          if (!permId) continue;
          resetStallTimer();
          const permSessionId = permission.sessionID ?? permission.session_id;
          providerLogger.info(
            { sessionId, permId, permSessionId, permType: permission.permission, title: permission.title },
            "Auto-approving permission"
          );
          // v1 SDK lacks .permission namespace — use direct HTTP
          permissionReply(permSessionId ?? sessionId, permId).catch((err: any) => {
            providerLogger.warn({ sessionId, permId, err: err?.message }, "Permission auto-approve failed");
          });

        // --- question requests (forward to Telegram or auto-reply) ---
        // Not session-filtered — handles sub-agent questions too
        } else if (evtType === "question.asked") {
          const questionReq = props as any;
          const questionId = questionReq.id;
          if (!questionId) continue;
          resetStallTimer();

          if (options?.cronMode) {
            providerLogger.info({ sessionId, questionId }, "Cron mode — rejecting question");
            questionReject(questionId).catch(() => {});
            continue;
          }

          pendingQuestion = true;
          pendingQuestionId = questionId;

          const items = questionReq.questions ?? [];
          providerLogger.info(
            { sessionId, questionId, questionSessionId: questionReq.sessionID, itemCount: items.length },
            "Question asked"
          );

          yield {
            type: "question" as const,
            content: "",
            question: {
              requestId: questionId,
              sessionId: questionReq.sessionID ?? sessionId,
              items: items.map((q: any) => ({
                header: q.header ?? "",
                question: q.question ?? "",
                options: (q.options ?? []).map((o: any) => ({ label: o.label, description: o.description })),
                multiple: q.multiple,
                custom: q.custom,
              })),
            },
          };
          // 5-min auto-reply fallback for ALL question types
          questionAutoReplyTimer = setTimeout(async () => {
            providerLogger.info({ questionId }, "Question auto-reply timeout — selecting first option");
            const answers = items.map((q: any) => [q.options?.[0]?.label ?? "yes"]);
            try {
              await questionReply(questionId, answers);
            } catch (err: any) {
              providerLogger.warn({ questionId, err: err?.message }, "Question auto-reply failed");
            }
            try { const { cleanupQuestionFlow } = await import("../commands/question.js"); await cleanupQuestionFlow(questionId, "timeout"); } catch {}
            pendingQuestion = false;
            pendingQuestionId = null;
          }, 300_000);

        } else if (evtType === "question.replied" || evtType === "question.rejected") {
          pendingQuestion = false;
          pendingQuestionId = null;
          if (questionAutoReplyTimer) { clearTimeout(questionAutoReplyTimer); questionAutoReplyTimer = null; }
          try { const { cleanupQuestionFlow } = await import("../commands/question.js"); await cleanupQuestionFlow(props.requestID, "resolved"); } catch {}
          providerLogger.info({ sessionId, evtType, requestId: props.requestID }, "Question resolved");

        // --- session lifecycle ---
        } else if (evtType === "session.idle") {
          if (!matchesSession(evt, sessionId)) continue;
          providerLogger.info({ sessionId, elapsedMs: Date.now() - startMs }, "session.idle");
          yield { type: "done", content: "" };
          break;
        } else if (evtType === "session.status") {
          // v2 API completion signal: session.status with type "idle"
          if (!matchesSession(evt, sessionId)) continue;
          if (props.status?.type === "idle") {
            providerLogger.info({ sessionId, elapsedMs: Date.now() - startMs }, "session idle");
            yield { type: "done", content: "" };
            break;
          }
        } else if (evtType === "session.deleted") {
          if (props?.info?.id === sessionId) {
            providerLogger.info({ sessionId }, "Session deleted during stream — ending gracefully");
            sessionDeleted = true;
            yield { type: "done", content: "" };
            break;
          }
        } else if (evtType === "session.error") {
          if (!matchesSession(evt, sessionId)) continue;
          const rawError = props.error ?? "Unknown session error";
          // If the session was deleted or this is a FOREIGN KEY error from a deleted session,
          // end gracefully instead of surfacing a confusing error to the user.
          const errStr = typeof rawError === "string" ? rawError : JSON.stringify(rawError);
          if (sessionDeleted || errStr.includes("FOREIGN KEY")) {
            providerLogger.info({ sessionId, error: rawError }, "session.error after deletion — ignoring");
            yield { type: "done", content: "" };
            break;
          }
          providerLogger.warn({ sessionId, error: rawError }, "session.error");
          throw sdkError(rawError);
        } else {
          providerLogger.info({ sessionId, evtType, props }, "SSE event");
        }
      }

      // If stream ended due to stall with zero output, throw so streamPromptWithRetry
      // can detect stale sessions and retry with a new one.
      if (controller.signal.aborted && chunkCount === 0 && toolEvents === 0) {
        throw new Error("Session not found or timed out — no response received after 120 seconds");
      }
    } finally {
      clearTimeout(stallTimer);
      if (questionAutoReplyTimer) clearTimeout(questionAutoReplyTimer);
      // Reject any orphaned question so the OpenCode session doesn't stay stuck in "busy"
      if (pendingQuestion && pendingQuestionId) {
        providerLogger.info({ sessionId, questionId: pendingQuestionId }, "Rejecting orphaned question on stream teardown");
        questionReject(pendingQuestionId).catch((err: any) => {
          providerLogger.warn({ sessionId, questionId: pendingQuestionId, err: err?.message }, "Orphaned question reject failed");
        });
        try { const { cleanupQuestionFlow } = await import("../commands/question.js"); await cleanupQuestionFlow(pendingQuestionId, "timeout"); } catch {}
      }
      providerLogger.info(
        { sessionId, durationMs: Date.now() - startMs, chunkCount, toolEvents, fieldCounts: Object.fromEntries(fieldCounts) },
        "Stream completed"
      );
      try { sseResult.stream?.return?.(undefined as any); } catch {}
    }
  }

  // --- Session features ---

  async getTodos(sessionId: string): Promise<Todo[] | null> {
    const result = await client.session.todo({ path: { id: sessionId } });
    if (result.error) throw sdkError(result.error);
    return ((result.data ?? []) as any[]).map((t: any) => ({
      content: t.content,
      status: t.status,
      priority: t.priority,
      id: t.id,
    }));
  }

  async getDiff(sessionId: string): Promise<FileDiff[] | null> {
    const result = await client.session.diff({ path: { id: sessionId } });
    if (result.error) throw sdkError(result.error);
    return ((result.data ?? []) as any[]).map((d: any) => ({
      file: d.file,
      additions: d.additions ?? 0,
      deletions: d.deletions ?? 0,
      before: d.before,
      after: d.after,
    }));
  }

  async forkSession(
    sessionId: string,
    messageId?: string
  ): Promise<Session | null> {
    const result = await client.session.fork({
      path: { id: sessionId },
      body: { messageID: messageId },
    });
    if (result.error) throw sdkError(result.error);
    const forked = result.data as any;
    return { id: forked.id, title: forked.title };
  }

  async revert(sessionId: string): Promise<boolean> {
    // Get last assistant message ID
    const msgsResult = await client.session.messages({
      path: { id: sessionId },
    });
    const messages = msgsResult.data ?? [];
    const lastAssistant = [...messages]
      .reverse()
      .find((m: any) => m.info?.role === "assistant");
    if (!lastAssistant) return false;

    const messageID = (lastAssistant as any).info?.id;
    if (!messageID) return false;

    const result = await client.session.revert({
      path: { id: sessionId },
      body: { messageID },
    });
    if (result.error) throw sdkError(result.error);
    return true;
  }

  async unrevert(sessionId: string): Promise<boolean> {
    try {
      await client.session.unrevert({ path: { id: sessionId } });
      return true;
    } catch {
      return false;
    }
  }

  async share(sessionId: string): Promise<string | null> {
    const result = await client.session.share({
      path: { id: sessionId },
    });
    if (result.error) throw sdkError(result.error);
    return (result.data as any)?.share?.url ?? null;
  }

  async unshare(sessionId: string): Promise<boolean> {
    try {
      await client.session.unshare({ path: { id: sessionId } });
      return true;
    } catch {
      return false;
    }
  }

  async summarize(sessionId: string): Promise<{ title: string; additions?: number; deletions?: number; files?: number } | null> {
    try {
      await client.session.summarize({ path: { id: sessionId } });
      // Fetch session to get updated title + change stats
      const result = await client.session.get({ path: { id: sessionId } });
      if (result.error) return { title: "Session summarized" };
      const s = result.data as any;
      return {
        title: s.title ?? "Untitled",
        additions: s.summary?.additions,
        deletions: s.summary?.deletions,
        files: s.summary?.files,
      };
    } catch {
      return null;
    }
  }

  async getHistory(sessionId: string): Promise<unknown[] | null> {
    const result = await client.session.messages({
      path: { id: sessionId },
    });
    if (result.error) throw sdkError(result.error);
    return result.data ?? [];
  }

  // --- File operations ---

  async readFile(path: string): Promise<string | null> {
    const result = await client.file.read({ query: { path } });
    if (result.error) throw sdkError(result.error);
    const fileData = result.data as any;
    return fileData?.content ?? JSON.stringify(fileData, null, 2);
  }

  async listFiles(path: string): Promise<FileNode[] | null> {
    try {
      const result = await client.file.list({ query: { path } });
      if (result.error) return null;
      return ((result.data ?? []) as any[]).map((f: any) => ({
        name: f.name,
        path: f.path,
        type: f.type === "directory" ? "directory" : "file",
        ignored: f.ignored ?? false,
      }));
    } catch {
      return null;
    }
  }

  async findFiles(query: string): Promise<string[] | null> {
    const result = await client.find.files({ query: { query } });
    if (result.error) throw sdkError(result.error);
    return (result.data ?? []) as string[];
  }

  async searchText(pattern: string): Promise<SearchResult[] | null> {
    const result = await client.find.text({ query: { pattern } } as any);
    if (result.error) throw sdkError(result.error);
    return ((result.data ?? []) as any[]).map((m: any) => ({
      file: m.path?.text ?? "",
      line: m.line_number,
      text: m.lines?.text?.trim(),
    }));
  }

  async findSymbols(query: string): Promise<unknown[] | null> {
    const result = await client.find.symbols({ query: { query } });
    if (result.error) throw sdkError(result.error);
    return result.data ?? [];
  }

  async getFileStatus(): Promise<FileStatus[] | null> {
    const result = await client.file.status();
    if (result.error) throw sdkError(result.error);
    return ((result.data ?? []) as any[]).map((f: any) => ({
      path: f.path ?? String(f),
      status: f.status ?? "?",
    }));
  }

  // --- Shell ---

  async shell(_sessionId: string, command: string): Promise<string | null> {
    // Get the project working directory from OpenCode
    let cwd: string | undefined;
    try {
      const pathResult = await client.path.get();
      cwd = (pathResult.data as any)?.directory;
    } catch {
      // Fall back to OpenCode's project worktree
      try {
        const projResult = await client.project.current();
        cwd = (projResult.data as any)?.worktree;
      } catch {
        // Use process cwd as last resort
      }
    }
    providerLogger.info({ command, cwd: cwd ?? process.cwd() }, "Executing shell command");

    return new Promise((resolve, reject) => {
      exec(command, { cwd: cwd ?? process.cwd(), timeout: 30_000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
        const output = (stdout + stderr).trim();
        if (err && !output) {
          providerLogger.info({ command, err: err.message }, "Shell command failed");
          reject(new Error(err.message));
          return;
        }
        providerLogger.info({ command, outputLen: output.length }, "Shell command completed");
        resolve(output || "Command completed with no output.");
      });
    });
  }

  async runCommand(
    sessionId: string,
    command: string,
    args?: string
  ): Promise<PromptResult | null> {
    const result = await client.session.command({
      path: { id: sessionId },
      body: { command, arguments: args ?? "", agent: "build" },
    });
    if (result.error) throw sdkError(result.error);
    return {
      text: formatPartsToText(result.data?.parts ?? []),
      parts: result.data?.parts,
      raw: result.data,
    };
  }

  // --- Info ---

  async getProjectInfo(): Promise<ProjectInfo | null> {
    const [projResult, pathResult, vcsResult] = await Promise.all([
      client.project.current(),
      client.path.get(),
      client.vcs.get(),
    ]);
    if (projResult.error) throw sdkError(projResult.error);

    const proj = projResult.data as any;
    const paths = pathResult.data as any;
    const vcs = vcsResult.data as any;

    return {
      id: proj?.id,
      worktree: proj?.worktree,
      directory: paths?.directory,
      vcs: proj?.vcs,
      branch: vcs?.branch,
    };
  }

  async getTools(): Promise<ToolInfo[] | null> {
    // Try tool.list with current model for descriptions; fall back to tool.ids
    const config = getConfig();
    const envModel = config.opencodeModel;
    if (envModel && envModel.includes("/")) {
      const [providerID, ...rest] = envModel.split("/");
      try {
        const result = await client.tool.list({
          query: { provider: providerID, model: rest.join("/") },
        });
        if (!result.error && result.data) {
          return ((result.data ?? []) as any[]).map((t: any) => ({
            id: t.id ?? t.name ?? String(t),
            description: t.description,
          }));
        }
      } catch {
        // Fall through to tool.ids
      }
    }

    // Fallback: tool IDs without descriptions
    const result = await client.tool.ids();
    if (result.error) throw sdkError(result.error);
    return ((result.data ?? []) as string[]).map((id) => ({ id }));
  }

  async getCommands(): Promise<CommandInfo[] | null> {
    const result = await client.command.list();
    if (result.error) throw sdkError(result.error);
    return ((result.data ?? []) as any[]).map((c: any) => ({
      name: c.name,
      description: c.description,
    }));
  }

  async getHealth(): Promise<HealthInfo> {
    const [configResult, projResult, vcsResult] = await Promise.all([
      client.config.get(),
      client.project.current(),
      client.vcs.get(),
    ]);

    const proj = projResult.data as any;
    const vcs = vcsResult.data as any;

    return {
      status: configResult.error ? "Error" : "Healthy",
      provider: "opencode",
      project: proj?.worktree,
      branch: vcs?.branch,
    };
  }

  async getConfig(): Promise<unknown> {
    const result = await client.config.get();
    if (result.error) throw sdkError(result.error);
    return result.data;
  }

  async getProviders(): Promise<unknown> {
    const result = await client.config.providers();
    if (result.error) throw sdkError(result.error);
    return result.data;
  }

  async getAgents(): Promise<unknown[] | null> {
    const result = await client.app.agents();
    if (result.error) throw sdkError(result.error);
    const agents = result.data ?? [];
    return Array.isArray(agents) ? agents : [];
  }

  // --- Models ---

  async listModels(): Promise<ModelDetail[]> {
    const result = await client.config.providers();
    if (result.error) throw sdkError(result.error);

    const data = result.data as any;
    const providers: any[] = data?.all ?? data?.providers ?? [];
    const models: ModelDetail[] = [];

    for (const prov of providers) {
      if (!prov.models) continue;
      for (const [key, m] of Object.entries(prov.models) as [string, any][]) {
        const isFree = m.free === true;
        models.push({
          id: m.id ?? key,
          name: m.name ?? key,
          provider: prov.id ?? prov.name ?? "unknown",
          providerName: prov.name ?? prov.id ?? undefined,
          family: m.family ?? undefined,
          reasoning: m.reasoning ?? m.capabilities?.reasoning ?? false,
          attachment: m.attachment ?? m.capabilities?.attachment ?? false,
          free: isFree,
          modalities: m.modalities,
          active: false, // Caller checks against selected model
        });
      }
    }

    return models;
  }

  // --- MCP ---

  async getMcpStatus(): Promise<McpServerStatus[] | null> {
    const result = await client.mcp.status();
    if (result.error) throw sdkError(result.error);

    const data = result.data as Record<string, any> | undefined;
    if (!data) return [];

    return Object.entries(data).map(([name, status]) => {
      let statusStr: McpServerStatus["status"] = "unknown";
      if (status?.status === "connected") statusStr = "connected";
      else if (status?.status === "disabled") statusStr = "disabled";
      else if (status?.status === "failed") statusStr = "failed";
      else if (status?.status === "needs_auth") statusStr = "needs_auth";

      return {
        name,
        status: statusStr,
        error: status?.error,
      };
    });
  }

  async addMcpServer(name: string, config: McpServerConfig): Promise<boolean> {
    const sdkConfig: any = config.type === "local"
      ? { type: "local", command: config.command ?? [], environment: config.environment, enabled: config.enabled ?? true, timeout: config.timeout }
      : { type: "remote", url: config.url ?? "", headers: config.headers, enabled: config.enabled ?? true, timeout: config.timeout };

    const result = await client.mcp.add({ body: { name, config: sdkConfig } });
    if (result.error) throw sdkError(result.error);
    return true;
  }

  async removeMcpServer(name: string): Promise<boolean> {
    try {
      await client.mcp.disconnect({ path: { name } });
      return true;
    } catch {
      return false;
    }
  }

  async connectMcpServer(name: string): Promise<boolean> {
    try {
      await client.mcp.connect({ path: { name } });
      return true;
    } catch {
      return false;
    }
  }
}

// --- Question & Permission API (direct HTTP — v1 SDK lacks these namespaces) ---

function getBaseUrl(): string {
  const config = getConfig();
  return `http://${config.opencodeHostname}:${activePort}`;
}

async function questionReply(requestId: string, answers: string[][]): Promise<void> {
  const res = await fetch(`${getBaseUrl()}/question/${encodeURIComponent(requestId)}/reply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Question reply failed: ${res.status} ${text}`);
  }
}

async function questionReject(requestId: string): Promise<void> {
  const res = await fetch(`${getBaseUrl()}/question/${encodeURIComponent(requestId)}/reject`, {
    method: "POST",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Question reject failed: ${res.status} ${text}`);
  }
}

async function permissionReply(sessionId: string, permissionId: string): Promise<void> {
  const res = await fetch(`${getBaseUrl()}/session/${encodeURIComponent(sessionId)}/permissions/${encodeURIComponent(permissionId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reply: "always" }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Permission reply failed: ${res.status} ${text}`);
  }
}

// --- Windows spawn workaround ---
// SDK's createOpencode() uses spawn("opencode") without shell:true,
// which fails on Windows because npm installs opencode as a .cmd shim.
// We use spawnAsync() which adds shell:true on Windows automatically.
// See: https://github.com/anomalyco/opencode/issues/8160

function spawnOpencodeWindows(hostname: string, port: number): Promise<string> {
  const TIMEOUT = 15_000;
  const args = ["serve", `--hostname=${hostname}`, `--port=${port}`];

  providerLogger.info({ hostname, port }, "Spawning OpenCode server (Windows)");

  const proc = spawnAsync("opencode", args, {
    env: {
      ...process.env,
      OPENCODE_CONFIG_CONTENT: JSON.stringify({ permission: "allow" }),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  // Store kill function for shutdown
  serverClose = () => {
    try { proc.kill(); } catch {}
  };

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`OpenCode server did not start within ${TIMEOUT / 1000}s`));
    }, TIMEOUT);

    let output = "";

    proc.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      for (const line of output.split("\n")) {
        if (line.includes("opencode server listening")) {
          const match = line.match(/on\s+(https?:\/\/[^\s]+)/);
          if (match) {
            clearTimeout(timer);
            providerLogger.info({ url: match[1] }, "OpenCode server started (Windows)");
            resolve(match[1]);
            return;
          }
        }
      }
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to spawn OpenCode: ${err.message}`));
    });

    proc.on("exit", (code) => {
      clearTimeout(timer);
      let msg = `OpenCode server exited with code ${code}`;
      if (output.trim()) msg += `\nOutput: ${output.trim()}`;
      reject(new Error(msg));
    });
  });
}

// --- Port selection ---

const PORT_MIN = 30000;
const PORT_MAX = 40000;
const PORT_MAX_ATTEMPTS = 10;

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once("error", () => resolve(false));
    srv.listen(port, "127.0.0.1", () => {
      srv.close(() => resolve(true));
    });
  });
}

function randomPort(): number {
  return PORT_MIN + Math.floor(Math.random() * (PORT_MAX - PORT_MIN));
}

async function findAvailablePort(preferred: number): Promise<number> {
  if (await isPortFree(preferred)) return preferred;
  providerLogger.info({ preferred }, "Preferred port in use, finding alternative");
  for (let i = 0; i < PORT_MAX_ATTEMPTS; i++) {
    const port = randomPort();
    if (await isPortFree(port)) {
      providerLogger.info({ port, preferred }, "Found available port");
      return port;
    }
  }
  // Last resort: let the OS pick
  return 0;
}

// --- Helpers ---

function sdkError(error: any): Error {
  if (typeof error === "string") return new Error(error);
  if (error?.message) return new Error(error.message);
  return new Error(JSON.stringify(error));
}

const MIME_EXTENSIONS: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif",
  "application/pdf": "pdf", "text/plain": "txt", "text/html": "html",
};

function filenameFromMime(mime: string, index: number): string {
  const ext = MIME_EXTENSIONS[mime] ?? mime.split("/")[1] ?? "bin";
  return `attachment${index > 0 ? `-${index + 1}` : ""}.${ext}`;
}

function matchesSession(evt: OcEvent, sessionId: string): boolean {
  const props = evt.properties as any;
  return props?.sessionID === sessionId || props?.session_id === sessionId;
}

function formatPartsToText(parts: any[]): string {
  const sections: string[] = [];
  for (const part of parts) {
    if (part.type === "text") {
      sections.push(part.text);
    } else if (part.type === "tool") {
      const toolName = part.tool;
      if (part.state?.status === "completed") {
        const output = part.state.output;
        const title = part.state.title || toolName;
        if (output && output.length > 0) {
          sections.push(
            `**[${title}]**\n\`\`\`\n${output.length > 1000 ? output.slice(0, 1000) + "\n... (truncated)" : output}\n\`\`\``
          );
        } else {
          sections.push(`**[${title}]** ✓`);
        }
      } else if (part.state?.status === "error") {
        sections.push(`**[${toolName}]** Error: ${part.state.error}`);
      }
    } else if (part.type === "file") {
      sections.push(`📄 ${part.filename ?? "file"}`);
    }
  }
  return sections.join("\n\n") || "(empty response)";
}
