import fs from "node:fs";
import path from "node:path";
import { resolveDataDir } from "@workspace/db";
import { logger } from "./logger";

/**
 * Platform icon (browser tab, installed app, desktop shortcut).
 * The default icon ships with the web build; an administrator can replace it from the settings page.
 * The active icon is always mirrored to DATA_DIR/branding/app.ico so the desktop shortcut created by
 * "control app.bat" picks up a replacement automatically.
 */

export const ICON_SIZES = [512, 256, 192, 180, 32] as const;
export type IconSize = (typeof ICON_SIZES)[number];

export function resolveWebDir(): string {
  return path.resolve(process.env.WEB_DIST_DIR || path.join(process.cwd(), "artifacts", "hall-booking", "dist", "public"));
}

export function brandingDir(): string {
  return path.join(resolveDataDir(), "branding");
}

const customPng = (size: number) => path.join(brandingDir(), `icon-${size}.png`);
const customFlag = () => path.join(brandingDir(), "custom-icon.json");
export const appIcoPath = () => path.join(brandingDir(), "app.ico");

export function hasCustomIcon(): boolean {
  return fs.existsSync(customFlag());
}

/** Path of the PNG to serve for a size (custom when uploaded, else the bundled default). */
export function iconPngPath(size: number): string | null {
  if (hasCustomIcon() && fs.existsSync(customPng(size))) return customPng(size);
  const def = path.join(resolveWebDir(), "icons", `icon-${size}.png`);
  return fs.existsSync(def) ? def : null;
}

export function faviconPath(): string | null {
  if (hasCustomIcon() && fs.existsSync(appIcoPath())) return appIcoPath();
  const def = path.join(resolveWebDir(), "favicon.ico");
  return fs.existsSync(def) ? def : null;
}

/** Build a multi-size .ico that embeds PNG images (supported since Windows Vista). */
function buildIco(images: { size: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, data }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function decodePng(dataUrl: unknown, expected: number): Buffer | string {
  if (typeof dataUrl !== "string") return `صورة الأيقونة ${expected} مفقودة`;
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return "يجب أن تكون الأيقونة بصيغة PNG";
  const buf = Buffer.from(m[1], "base64");
  if (buf.length < 33 || !buf.subarray(0, 8).equals(PNG_SIG)) return "ملف الأيقونة تالف";
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  if (w !== expected || h !== expected) return `أبعاد الأيقونة يجب أن تكون ${expected}×${expected}`;
  if (buf.length > 2_000_000) return "حجم الأيقونة كبير جداً";
  return buf;
}

/** Save an uploaded icon set ({ "512": dataUrl, "256": …, "192": …, "180": …, "32": … }). */
export function saveCustomIcon(input: Record<string, unknown>): string | null {
  const decoded: Record<number, Buffer> = {};
  for (const size of ICON_SIZES) {
    const r = decodePng(input?.[String(size)], size);
    if (typeof r === "string") return r;
    decoded[size] = r;
  }
  fs.mkdirSync(brandingDir(), { recursive: true });
  for (const size of ICON_SIZES) fs.writeFileSync(customPng(size), decoded[size]);
  fs.writeFileSync(appIcoPath(), buildIco([{ size: 32, data: decoded[32] }, { size: 256, data: decoded[256] }]));
  fs.writeFileSync(customFlag(), JSON.stringify({ updatedAt: new Date().toISOString() }));
  return null;
}

export function resetIcon(): void {
  for (const size of ICON_SIZES) fs.rmSync(customPng(size), { force: true });
  fs.rmSync(customFlag(), { force: true });
  copyDefaultIco();
}

function copyDefaultIco() {
  const def = path.join(resolveWebDir(), "favicon.ico");
  if (!fs.existsSync(def)) return;
  fs.mkdirSync(brandingDir(), { recursive: true });
  fs.copyFileSync(def, appIcoPath());
}

/** Startup: make sure DATA_DIR/branding/app.ico exists (default icon unless a custom one was uploaded). */
export function ensureBranding(): void {
  try {
    if (!hasCustomIcon() || !fs.existsSync(appIcoPath())) copyDefaultIco();
  } catch (err) {
    logger.warn({ err }, "Could not prepare the platform icon");
  }
}

export function iconVersion(): string {
  try {
    return hasCustomIcon() ? String(fs.statSync(customFlag()).mtimeMs | 0) : "default";
  } catch {
    return "default";
  }
}
