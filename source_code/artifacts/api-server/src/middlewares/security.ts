import helmet from "helmet";
import rateLimit from "express-rate-limit";
import type { RequestHandler } from "express";

const arabic = (msg: string) => ({ error: msg });

/** Security headers. CSP allows the satellite map tiles / geocoder the app uses. */
export const securityHeaders: RequestHandler = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "img-src": ["'self'", "data:", "blob:", "https://server.arcgisonline.com", "https://*.tile.openstreetmap.org", "https://unpkg.com"],
      "font-src": ["'self'", "data:"],
      "connect-src": ["'self'", "https://server.arcgisonline.com", "https://nominatim.openstreetmap.org"],
      "worker-src": ["'self'"],
      "frame-ancestors": ["'self'"],
      "form-action": ["'self'"],
      "base-uri": ["'self'"],
      "object-src": ["'none'"],
    },
  },
  // Internal HTTP deployment: HSTS / upgrade-insecure-requests would break plain-HTTP LAN access.
  strictTransportSecurity: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "same-origin" },
  referrerPolicy: { policy: "same-origin" },
});

/** 10 login attempts / 15 min per IP (account lockout handles per-user brute force). */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.LOGIN_RATE_LIMIT || 10),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: arabic("محاولات دخول كثيرة من هذا الجهاز، حاول مجدداً بعد 15 دقيقة"),
});

export const resetRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: arabic("تم تجاوز عدد الطلبات المسموح، حاول لاحقاً"),
});

/** General API ceiling to blunt scripted abuse. */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.API_RATE_LIMIT || 600),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: arabic("طلبات كثيرة، يرجى الانتظار قليلاً"),
});
