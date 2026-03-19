import { vi } from "vitest";

// Silence all pino loggers during tests
const noop = () => {};
const noopLogger = {
  info: noop,
  warn: noop,
  error: noop,
  debug: noop,
  trace: noop,
  fatal: noop,
  child: () => noopLogger,
  level: "silent",
};

vi.mock("../src/utils/logger.js", () => ({
  default: noopLogger,
  authLogger: noopLogger,
  botLogger: noopLogger,
  chatLogger: noopLogger,
  mediaLogger: noopLogger,
  providerLogger: noopLogger,
  sessionLogger: noopLogger,
  sttLogger: noopLogger,
  streamLogger: noopLogger,
  cronLogger: noopLogger,
  lifecycleLogger: noopLogger,
  relayApiLogger: noopLogger,
  researchLogger: noopLogger,
  watchLogger: noopLogger,
}));
