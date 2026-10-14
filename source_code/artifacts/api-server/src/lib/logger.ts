import pino from "pino";

const pretty = process.env.LOG_PRETTY === "1" || process.env.NODE_ENV !== "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: ["req.headers.authorization", "req.headers.cookie", "res.headers['set-cookie']", "*.password", "*.newPassword"],
  ...(pretty
    ? { transport: { target: "pino-pretty", options: { colorize: process.stdout.isTTY, translateTime: "SYS:yyyy-mm-dd HH:MM:ss", ignore: "pid,hostname" } } }
    : {}),
});
