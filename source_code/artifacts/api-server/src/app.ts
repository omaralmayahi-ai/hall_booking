import express, { type Express, type NextFunction, type Request, type Response } from "express";
import path from "node:path";
import fs from "node:fs";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { securityHeaders, apiLimiter } from "./middlewares/security";
import { faviconPath, iconPngPath, iconVersion, ICON_SIZES, resolveWebDir } from "./lib/branding";
import { getOptions } from "./lib/options";

const app: Express = express();

// Behind a reverse proxy set TRUST_PROXY=1 so client IPs (audit log, rate limit) are correct.
app.set("trust proxy", process.env.TRUST_PROXY === "1" ? 1 : false);
app.disable("x-powered-by");

app.use(
  pinoHttp({
    logger,
    autoLogging: { ignore: (req) => !req.url?.startsWith("/api") },
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);
app.use(securityHeaders);

// Optional cross-origin access (only needed if the UI is hosted elsewhere).
const allowedOrigins = (process.env.CORS_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
if (allowedOrigins.length) {
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
      if (req.method === "OPTIONS") {
        res.sendStatus(204);
        return;
      }
    }
    next();
  });
}

// Images are stored as data-URLs inside JSON payloads, hence the 10 MB limit.
app.use("/api", apiLimiter, express.json({ limit: "10mb" }), express.urlencoded({ extended: false, limit: "1mb" }));
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
app.use("/api", router);
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ---- Platform icon & installable-app manifest (custom icon uploaded by the admin, else the default) ----
app.get("/favicon.ico", (_req, res) => {
  const file = faviconPath();
  if (!file) return void res.sendStatus(404);
  res.setHeader("Cache-Control", "no-cache");
  res.type("image/x-icon").sendFile(file);
});
app.get(/^\/icons\/icon-(\d+)\.png$/, (req, res) => {
  const size = Number((req.params as Record<string, string>)[0]);
  const file = (ICON_SIZES as readonly number[]).includes(size) ? iconPngPath(size) : null;
  if (!file) return void res.sendStatus(404);
  res.setHeader("Cache-Control", "no-cache");
  res.type("image/png").sendFile(file);
});
app.get("/apple-touch-icon.png", (_req, res) => {
  const file = iconPngPath(180);
  if (!file) return void res.sendStatus(404);
  res.setHeader("Cache-Control", "no-cache");
  res.type("image/png").sendFile(file);
});
app.get("/manifest.webmanifest", async (_req, res, next) => {
  try {
    const o = await getOptions();
    const v = iconVersion();
    res.setHeader("Cache-Control", "no-cache");
    res.type("application/manifest+json").send(
      JSON.stringify({
        name: o.identity.systemNameAr,
        short_name: o.identity.shortNameAr || o.identity.systemNameAr,
        description: o.identity.taglineAr,
        lang: "ar",
        dir: "rtl",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#1366c4",
        icons: [
          { src: `/icons/icon-192.png?v=${v}`, sizes: "192x192", type: "image/png", purpose: "any" },
          { src: `/icons/icon-512.png?v=${v}`, sizes: "512x512", type: "image/png", purpose: "any" },
          { src: `/icons/icon-512.png?v=${v}`, sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      }),
    );
  } catch (err) {
    next(err);
  }
});

// ---- Frontend (built SPA) ----
const webDir = resolveWebDir();
if (fs.existsSync(path.join(webDir, "index.html"))) {
  app.use(
    express.static(webDir, {
      index: false,
      setHeaders(res, filePath) {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        } else {
          res.setHeader("Cache-Control", "no-cache");
        }
      },
    }),
  );
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(webDir, "index.html"));
  });
} else {
  logger.warn({ webDir }, "Frontend build not found — only the API will be served");
}

// ---- Error handler (never leak stack traces to clients) ----
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  const status = Number(err?.status || err?.statusCode) || 500;
  if (status >= 500) {
    req.log?.error({ err }, "Unhandled error");
  }
  if (res.headersSent) return;
  let message = status >= 500 ? "حدث خطأ داخلي في الخادم" : err?.message || "طلب غير صالح";
  if (err?.type === "entity.too.large") message = "حجم البيانات المرسلة كبير جداً";
  if (err?.type === "entity.parse.failed") message = "صيغة البيانات غير صالحة";
  res.status(status).json({ error: message });
});

export default app;
