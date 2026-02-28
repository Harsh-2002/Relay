/**
 * End-to-end test of all OCBot SDK calls.
 * Tests every SDK method used by the bot commands.
 * Run with: bun run test-sdk.ts
 */
import { createOpencode } from "@opencode-ai/sdk";

const PASS = "  ✓";
const FAIL = "  ✗";

async function test() {
  console.log("=== OCBot SDK Integration Test ===\n");
  let passed = 0;
  let failed = 0;

  // Start server
  console.log("[Setup] Starting OpenCode server...");
  const { client, server } = await createOpencode({
    hostname: "127.0.0.1",
    port: 4097,
    timeout: 15000,
  });
  console.log(`${PASS} Server started on ${server.url}\n`);

  // 1. Health check (config.get)
  console.log("[1] config.get() — health check");
  try {
    const r = await client.config.get();
    if (r.data) { console.log(`${PASS} Keys: ${Object.keys(r.data)}`); passed++; }
    else { console.log(`${FAIL} Error: ${JSON.stringify(r.error)}`); failed++; }
  } catch (e: any) { console.log(`${FAIL} ${e.message}`); failed++; }

  // 2. Config providers
  console.log("[2] config.providers()");
  try {
    const r = await client.config.providers();
    if (r.data) { console.log(`${PASS} Got providers`); passed++; }
    else { console.log(`${FAIL} Error`); failed++; }
  } catch (e: any) { console.log(`${FAIL} ${e.message}`); failed++; }

  // 3. App agents
  console.log("[3] app.agents()");
  try {
    const r = await client.app.agents();
    console.log(`${PASS} Agents: ${JSON.stringify(r.data).slice(0, 100)}`); passed++;
  } catch (e: any) { console.log(`${FAIL} ${e.message}`); failed++; }

  // 4. Session create
  console.log("[4] session.create()");
  let sessionId = "";
  try {
    const r = await client.session.create({ body: { title: "Test" } });
    if (r.data?.id) { sessionId = r.data.id; console.log(`${PASS} ID: ${sessionId}`); passed++; }
    else { console.log(`${FAIL} No ID`); failed++; }
  } catch (e: any) { console.log(`${FAIL} ${e.message}`); failed++; }

  // 5. Session list
  console.log("[5] session.list()");
  try {
    const r = await client.session.list();
    const count = (r.data ?? []).length;
    console.log(`${PASS} ${count} session(s)`); passed++;
  } catch (e: any) { console.log(`${FAIL} ${e.message}`); failed++; }

  // 6. Session get
  console.log("[6] session.get()");
  try {
    const r = await client.session.get({ path: { id: sessionId } });
    if (r.data?.title) { console.log(`${PASS} Title: ${r.data.title}`); passed++; }
    else { console.log(`${FAIL}`); failed++; }
  } catch (e: any) { console.log(`${FAIL} ${e.message}`); failed++; }

  // 7. Session prompt
  console.log("[7] session.prompt() — core chat");
  try {
    const r = await client.session.prompt({
      path: { id: sessionId },
      body: { parts: [{ type: "text", text: "Say 'ok' and nothing else." }] },
    });
    if (r.data?.parts) {
      const textParts = r.data.parts.filter((p) => p.type === "text");
      const text = textParts.map((p) => p.type === "text" ? p.text : "").join("");
      console.log(`${PASS} Response: "${text.slice(0, 100)}"`); passed++;
    } else {
      console.log(`${FAIL} Error: ${JSON.stringify(r.error)}`); failed++;
    }
  } catch (e: any) { console.log(`${FAIL} ${e.message}`); failed++; }

  // 8. Session messages
  console.log("[8] session.messages()");
  try {
    const r = await client.session.messages({ path: { id: sessionId } });
    const count = (r.data ?? []).length;
    console.log(`${PASS} ${count} message(s)`); passed++;
  } catch (e: any) { console.log(`${FAIL} ${e.message}`); failed++; }

  // 9. File read
  console.log("[9] file.read() — package.json");
  try {
    const r = await client.file.read({ query: { path: "package.json" } });
    const data = r.data as any;
    if (data?.content) { console.log(`${PASS} Type: ${data.type}, length: ${data.content.length}`); passed++; }
    else { console.log(`${FAIL} No content`); failed++; }
  } catch (e: any) { console.log(`${FAIL} ${e.message}`); failed++; }

  // 10. File status
  console.log("[10] file.status()");
  try {
    const r = await client.file.status();
    const files = r.data ?? [];
    console.log(`${PASS} ${(files as any[]).length} changed file(s)`); passed++;
  } catch (e: any) { console.log(`${FAIL} ${e.message}`); failed++; }

  // 11. Find files
  console.log("[11] find.files() — query 'ts'");
  try {
    const r = await client.find.files({ query: { query: "ts" } });
    const files = r.data ?? [];
    console.log(`${PASS} ${files.length} file(s) found`); passed++;
    for (const f of files.slice(0, 3)) console.log(`     ${f}`);
  } catch (e: any) { console.log(`${FAIL} ${e.message}`); failed++; }

  // 12. Find text (with timeout)
  console.log("[12] find.text() — pattern 'Bot'");
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const r = await client.find.text({ query: { pattern: "Bot" }, signal: controller.signal } as any);
    clearTimeout(timeout);
    const matches = r.data ?? [];
    console.log(`${PASS} ${(matches as any[]).length} match(es)`); passed++;
  } catch (e: any) {
    if (e.name === "AbortError") { console.log(`${FAIL} Timed out`); }
    else { console.log(`${FAIL} ${e.message}`); }
    failed++;
  }

  // 13. Session abort (nothing running — should be OK)
  console.log("[13] session.abort()");
  try {
    const r = await client.session.abort({ path: { id: sessionId } });
    console.log(`${PASS} Result: ${r.data}`); passed++;
  } catch (e: any) { console.log(`${FAIL} ${e.message}`); failed++; }

  // 14. Session command
  console.log("[14] session.command()");
  try {
    const r = await client.session.command({
      path: { id: sessionId },
      body: { command: "help", arguments: "", agent: "build" },
    });
    if (r.data?.parts) {
      console.log(`${PASS} ${r.data.parts.length} part(s)`); passed++;
    } else {
      console.log(`${FAIL} Error: ${JSON.stringify(r.error)}`); failed++;
    }
  } catch (e: any) { console.log(`${FAIL} ${e.message}`); failed++; }

  // 15. Session delete
  console.log("[15] session.delete()");
  try {
    const r = await client.session.delete({ path: { id: sessionId } });
    console.log(`${PASS} Deleted: ${r.data}`); passed++;
  } catch (e: any) { console.log(`${FAIL} ${e.message}`); failed++; }

  // Summary
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  server.close();
  process.exit(failed > 0 ? 1 : 0);
}

test().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
