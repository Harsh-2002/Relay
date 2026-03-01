import pino from "pino";

const logger = pino({
  level: "info",
  timestamp: pino.stdTimeFunctions.isoTime,
  transport: process.stdout.isTTY
    ? { target: "pino/file", options: { destination: 1 } }
    : undefined,
});

export default logger;

export const authLogger = logger.child({ component: "auth" });
export const botLogger = logger.child({ component: "bot" });
export const chatLogger = logger.child({ component: "chat" });
export const mediaLogger = logger.child({ component: "media" });
export const providerLogger = logger.child({ component: "provider" });
export const sessionLogger = logger.child({ component: "session" });
export const sttLogger = logger.child({ component: "stt" });
export const streamLogger = logger.child({ component: "stream" });
