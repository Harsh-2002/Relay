import pino from "pino";

const level = process.env.LOG_LEVEL ?? "info";

const logger = pino({
  level,
  timestamp: pino.stdTimeFunctions.isoTime,
  transport: process.stdout.isTTY
    ? { target: "pino/file", options: { destination: 1 } }
    : undefined,
});

export default logger;

export const botLogger = logger.child({ component: "bot" });
export const providerLogger = logger.child({ component: "provider" });
export const sttLogger = logger.child({ component: "stt" });
export const streamLogger = logger.child({ component: "stream" });
