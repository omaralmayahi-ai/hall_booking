/** Client-side image helpers (logo / icon / background uploads). */

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("تعذّر قراءة الصورة"));
    img.src = src;
  });
}

/** Downscale an image so its longest side is at most `max` px (keeps PNG transparency, JPEG for photos). */
export async function resizeImage(src: string, max: number, type: "image/png" | "image/jpeg" = "image/png", quality = 0.85): Promise<string> {
  const img = await loadImage(src);
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);
  return c.toDataURL(type, quality);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export const ICON_SIZES = [512, 256, 192, 180, 32] as const;

/**
 * Build the square PNG icon set from any image: the picture is centred on a white rounded tile
 * (so transparent or wide logos still read well on the taskbar / home screen).
 * `fill` = true uses the image edge-to-edge (for images that are already a square icon).
 */
export async function makeIconSet(src: string, fill = false): Promise<Record<string, string>> {
  const img = await loadImage(src);
  const out: Record<string, string> = {};
  for (const size of ICON_SIZES) {
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    const radius = size * 0.22;
    roundRect(ctx, 0, 0, size, size, radius);
    ctx.save();
    ctx.clip();
    if (fill) {
      const s = Math.max(size / img.width, size / img.height);
      const w = img.width * s;
      const h = img.height * s;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size, size);
      const pad = size * 0.12;
      const box = size - pad * 2;
      const s = Math.min(box / img.width, box / img.height);
      const w = img.width * s;
      const h = img.height * s;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    }
    ctx.restore();
    out[String(size)] = c.toDataURL("image/png");
  }
  return out;
}
