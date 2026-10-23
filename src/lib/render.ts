/**
 * Stranice knjižice kao SLIKE (JPEG, 1080×1350): to se šalje preko WhatsAppa/LINE-a — svaki mobitel ih otvara, ne treba aplikacija ni pregledno čitanje.
 * Crta se na platnu iz `pageModels` (isti sadržaj kao HTML). Poveznice na slikama nisu klikabilne, zato se kontakt ispisuje, a web ima QR kod.
 */
import { BookletBuildInput, OrderModel } from './booklet';
import { Cell, PageModel, pageModels } from './pageModel';
import { qrMatrix } from './qr';
import { Measure, wrapText } from './wrap';

export const PAGE_W = 1080;
export const PAGE_H = 1350;
const M = 72;
const INK = '#1A1A1A';
const PAPER = '#FAF9F6';
const MUTED = '#6b7280';
const PLACE = '#EFEDE8';
const SANS = '"Inter","Noto Sans Thai","Sukhumvit Set",Tahoma,system-ui,-apple-system,"Segoe UI",sans-serif';
const SERIF = '"Playfair Display","Noto Serif Thai",Georgia,serif';

type Ctx = CanvasRenderingContext2D;
const font = (px: number, weight = 400, serif = false) => `${weight} ${Math.round(px)}px ${serif ? SERIF : SANS}`;
const measureOf = (ctx: Ctx): Measure => (s) => ctx.measureText(s).width;
const wrap = (ctx: Ctx, text: string, w: number, maxLines?: number) => wrapText(measureOf(ctx), text, w, { maxLines });

const imgCache = new Map<string, Promise<HTMLImageElement | null>>();
function loadImg(src: string): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  let p = imgCache.get(src);
  if (!p) {
    p = new Promise((resolve) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => resolve(null);
      im.src = src;
    });
    imgCache.set(src, p);
    if (imgCache.size > 80) imgCache.delete(imgCache.keys().next().value as string);
  }
  return p;
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Slika ispunjava okvir (obrezuje) ili staje cijela u okvir (contain). */
function drawFit(ctx: Ctx, im: HTMLImageElement, x: number, y: number, w: number, h: number, mode: 'cover' | 'contain') {
  const k = mode === 'cover' ? Math.max(w / im.width, h / im.height) : Math.min(w / im.width, h / im.height);
  const dw = im.width * k;
  const dh = im.height * k;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(im, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
}

function newPage(): { canvas: HTMLCanvasElement; ctx: Ctx } {
  const canvas = document.createElement('canvas');
  canvas.width = PAGE_W;
  canvas.height = PAGE_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available on this device');
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.strokeRect(28, 28, PAGE_W - 56, PAGE_H - 56);
  ctx.textBaseline = 'alphabetic';
  return { canvas, ctx };
}

function drawLines(ctx: Ctx, lines: string[], x: number, y: number, lh: number, align: CanvasTextAlign = 'left'): number {
  ctx.textAlign = align;
  for (const l of lines) {
    ctx.fillText(l, x, y);
    y += lh;
  }
  return y;
}

/** Naslov stranice (+ oznaka dijela „2 / 3") i crta ispod; vraća y ispod crte. */
function drawHeader(ctx: Ctx, heading: string, part: number, parts: number): number {
  const y0 = M + 56;
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  let x = M;
  if (heading.trim()) {
    ctx.font = font(56, 600, true);
    const lines = wrap(ctx, heading, PAGE_W - 2 * M - (parts > 1 ? 130 : 0), 1);
    ctx.fillText(lines[0] ?? '', x, y0);
    x += ctx.measureText(lines[0] ?? '').width + 18;
  }
  if (parts > 1) {
    ctx.font = font(26, 700);
    ctx.fillStyle = MUTED;
    ctx.fillText(`${part} / ${parts}`, heading.trim() ? x : M, y0);
  }
  ctx.fillStyle = INK;
  ctx.fillRect(M, y0 + 24, PAGE_W - 2 * M, 2);
  return y0 + 24 + 30;
}

async function drawCover(m: Extract<PageModel, { kind: 'cover' }>): Promise<HTMLCanvasElement> {
  const { canvas, ctx } = newPage();
  const im = await loadImg(m.image);
  const innerW = PAGE_W - 2 * M;
  let y = M;
  if (im) {
    const h = 760;
    ctx.fillStyle = PLACE;
    ctx.fillRect(M, y, innerW, h);
    drawFit(ctx, im, M, y, innerW, h, 'cover');
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.strokeRect(M, y, innerW, h);
    y += h + 96;
  } else {
    y = 420;
  }
  ctx.fillStyle = INK;
  ctx.font = font(84, 600, true);
  const lines = wrap(ctx, m.title, innerW, 3);
  y = drawLines(ctx, lines, PAGE_W / 2, y, 100, 'center');
  if (m.subtitle) {
    ctx.font = font(32, 700);
    ctx.fillStyle = MUTED;
    y = drawLines(ctx, wrap(ctx, m.subtitle, innerW, 2), PAGE_W / 2, y + 8, 44, 'center');
  }
  if (m.by) {
    ctx.font = font(32, 700);
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.fillText(wrap(ctx, m.by, innerW, 1)[0] ?? '', PAGE_W / 2, PAGE_H - M - 8);
  }
  return canvas;
}

const GRID: Record<number, [number, number, number]> = { 2: [1, 2, 1.25], 4: [2, 2, 1.05], 6: [2, 3, 0.95], 9: [3, 3, 0.8] };

async function drawGrid(m: Extract<PageModel, { kind: 'grid' }>): Promise<HTMLCanvasElement> {
  const { canvas, ctx } = newPage();
  const y = drawHeader(ctx, m.heading, m.part, m.parts);
  const [cols, rows, s] = GRID[m.perPage] ?? GRID[6];
  const gap = 28;
  const innerW = PAGE_W - 2 * M;
  let noteLines: string[] = [];
  if (m.note) {
    ctx.font = font(28, 400);
    noteLines = wrap(ctx, m.note, innerW, 4);
  }
  const noteH = noteLines.length ? noteLines.length * 38 + 20 : 0;
  const gridBottom = PAGE_H - M - noteH;
  const cellW = (innerW - (cols - 1) * gap) / cols;
  const cellH = (gridBottom - y - (rows - 1) * gap) / rows;
  // visina potpisa = ono što najduža kartica na stranici stvarno treba (bez teksta nema potpisa, pa slike dobiju sav prostor)
  const lines = m.cells.map((c: Cell) => {
    ctx.font = font(30 * s, 700);
    const t = c.title ? wrap(ctx, c.title, cellW, 2) : [];
    ctx.font = font(22 * s, 400);
    const d = c.desc ? wrap(ctx, c.desc, cellW, 2) : [];
    return { t, d, h: t.length * 36 * s + (c.price ? 34 * s : 0) + d.length * 28 * s };
  });
  const need = Math.max(0, ...lines.map((l) => l.h));
  const capH = need > 0 ? Math.round(need + 22) : 0;
  const imgs = await Promise.all(m.cells.map((c: Cell) => loadImg(c.image)));
  const top = y;
  m.cells.forEach((c, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = M + col * (cellW + gap);
    const cy = top + row * (cellH + gap);
    const ih = cellH - capH;
    ctx.fillStyle = PLACE;
    ctx.fillRect(x, cy, cellW, ih);
    const im = imgs[i];
    if (im) drawFit(ctx, im, x, cy, cellW, ih, 'contain');
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, cy, cellW, ih);
    let ty = cy + ih + 8 + 30 * s;
    ctx.fillStyle = INK;
    ctx.font = font(30 * s, 700);
    ty = drawLines(ctx, lines[i].t, x, ty, 36 * s);
    if (c.price) {
      ctx.font = font(28 * s, 700);
      ctx.fillStyle = MUTED;
      ty = drawLines(ctx, [c.price], x, ty, 34 * s);
    }
    if (c.desc) {
      ctx.font = font(22 * s, 400);
      ctx.fillStyle = MUTED;
      drawLines(ctx, lines[i].d, x, ty, 28 * s);
    }
  });
  if (noteLines.length) {
    ctx.fillStyle = INK;
    ctx.font = font(28, 400);
    drawLines(ctx, noteLines, M, gridBottom + 20 + 28, 38);
  }
  return canvas;
}

/** Tekstna stranica; predug tekst se nastavlja na sljedećoj slici (nikad ne izlazi izvan stranice). */
function drawText(m: Extract<PageModel, { kind: 'text' }>): HTMLCanvasElement[] {
  const pages: HTMLCanvasElement[] = [];
  let { canvas, ctx } = newPage();
  const innerW = PAGE_W - 2 * M;
  let y = drawHeader(ctx, m.heading, 1, 1) + 20;
  const lh = 50;
  ctx.font = font(34, 400);
  const lines = wrap(ctx, m.body, innerW);
  for (const l of lines) {
    if (y + lh > PAGE_H - M) {
      pages.push(canvas);
      ({ canvas, ctx } = newPage());
      y = M + 40;
      ctx.font = font(34, 400);
    }
    ctx.fillStyle = INK;
    ctx.textAlign = 'left';
    ctx.fillText(l, M, y);
    y += l === '' ? lh * 0.5 : lh;
  }
  pages.push(canvas);
  return pages;
}

interface Block {
  h: (ctx: Ctx, s: number) => number;
  draw: (ctx: Ctx, y: number, s: number) => void;
}

function orderBlocks(o: OrderModel): Block[] {
  const blocks: Block[] = [];
  const innerW = PAGE_W - 2 * M;
  const qr = o.shop ? qrMatrix(o.shop.url) : null;

  if (o.shop) {
    const shop = o.shop;
    const qrSize = (s: number) => (qr ? Math.round(200 * s) : 0);
    const textW = (s: number) => innerW - 64 - (qr ? qrSize(s) + 32 : 0);
    const lay = (ctx: Ctx, s: number) => {
      ctx.font = font(42 * s, 700);
      const t = wrap(ctx, shop.title, textW(s), 2);
      ctx.font = font(28 * s, 400);
      const b = wrap(ctx, shop.body, textW(s), 3);
      ctx.font = font(30 * s, 700);
      const u = wrap(ctx, shop.display, textW(s), 1);
      const th = t.length * 50 * s + 8 + b.length * 38 * s + 14 + u.length * 40 * s;
      return { t, b, u, h: Math.max(th, qrSize(s)) + 64 };
    };
    blocks.push({
      h: (ctx, s) => lay(ctx, s).h + 22,
      draw: (ctx, y, s) => {
        const l = lay(ctx, s);
        ctx.fillStyle = INK;
        roundRect(ctx, M, y, innerW, l.h, 20);
        ctx.fill();
        ctx.fillStyle = '#fff';
        let ty = y + 32 + 38 * s;
        ctx.font = font(42 * s, 700);
        ty = drawLines(ctx, l.t, M + 32, ty, 50 * s);
        ctx.font = font(28 * s, 400);
        ctx.fillStyle = 'rgba(255,255,255,.85)';
        ty = drawLines(ctx, l.b, M + 32, ty - 6, 38 * s);
        ctx.font = font(30 * s, 700);
        ctx.fillStyle = '#fff';
        drawLines(ctx, l.u, M + 32, ty + 10, 40 * s);
        if (qr) {
          const size = qrSize(s);
          const qx = M + innerW - 32 - size;
          const qy = y + (l.h - size) / 2;
          ctx.fillStyle = '#fff';
          roundRect(ctx, qx, qy, size, size, 10);
          ctx.fill();
          const n = qr.length;
          const quiet = 2;
          const cell = size / (n + quiet * 2);
          ctx.fillStyle = INK;
          for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr[r][c]) ctx.fillRect(qx + (c + quiet) * cell, qy + (r + quiet) * cell, Math.ceil(cell), Math.ceil(cell));
        }
      },
    });
  }

  if (o.steps.length > 0) {
    const stepLay = (ctx: Ctx, s: number) => {
      const textW = innerW - 40 - 64 * s - 24;
      return o.steps.map((st) => {
        ctx.font = font(32 * s, 700);
        const t = wrap(ctx, st.title, textW, 2);
        ctx.font = font(26 * s, 400);
        const d = st.desc ? wrap(ctx, st.desc, textW, 3) : [];
        return { t, d, h: Math.max(64 * s, t.length * 40 * s + d.length * 34 * s + 4) + 40 };
      });
    };
    const headH = (ctx: Ctx, s: number) => {
      let h = 0;
      if (o.stepsTitle) {
        ctx.font = font(32 * s, 700);
        h += wrap(ctx, o.stepsTitle, innerW, 2).length * 42 * s + 8;
      }
      if (o.badge) h += 52 * s + 16;
      return h;
    };
    blocks.push({
      h: (ctx, s) => headH(ctx, s) + stepLay(ctx, s).reduce((n, st) => n + st.h + 14, 0) + 8,
      draw: (ctx, y, s) => {
        ctx.textAlign = 'left';
        if (o.stepsTitle) {
          ctx.fillStyle = INK;
          ctx.font = font(32 * s, 700);
          y = drawLines(ctx, wrap(ctx, o.stepsTitle, innerW, 2), M, y + 32 * s, 42 * s) - 32 * s + 8;
        }
        if (o.badge) {
          ctx.font = font(24 * s, 700);
          const w = Math.min(innerW, ctx.measureText(o.badge).width + 44);
          ctx.fillStyle = '#fff';
          roundRect(ctx, M, y, w, 52 * s, 26 * s);
          ctx.fill();
          ctx.strokeStyle = INK;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.fillStyle = INK;
          ctx.fillText(wrap(ctx, o.badge, w - 30, 1)[0] ?? '', M + 22, y + 35 * s);
          y += 52 * s + 16;
        }
        const lay = stepLay(ctx, s);
        lay.forEach((st, i) => {
          const last = i === lay.length - 1;
          ctx.fillStyle = last ? INK : '#fff';
          ctx.fillRect(M, y, innerW, st.h);
          ctx.strokeStyle = INK;
          ctx.lineWidth = 2;
          ctx.strokeRect(M, y, innerW, st.h);
          const cx = M + 20 + 32 * s;
          const cy = y + 20 + 32 * s;
          ctx.fillStyle = last ? PAPER : INK;
          ctx.beginPath();
          ctx.arc(cx, cy, 32 * s, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = last ? INK : PAPER;
          ctx.font = font(30 * s, 700);
          ctx.textAlign = 'center';
          ctx.fillText(String(i + 1), cx, cy + 10 * s);
          ctx.textAlign = 'left';
          const tx = M + 20 + 64 * s + 24;
          ctx.fillStyle = last ? PAPER : INK;
          ctx.font = font(32 * s, 700);
          let ty = drawLines(ctx, st.t, tx, y + 20 + 30 * s, 40 * s);
          if (st.d.length) {
            ctx.font = font(26 * s, 400);
            ctx.fillStyle = last ? 'rgba(250,249,246,.85)' : MUTED;
            drawLines(ctx, st.d, tx, ty - 2, 34 * s);
          }
          y += st.h + 14;
        });
      },
    });
  }

  if (o.note) {
    const lay = (ctx: Ctx, s: number) => {
      ctx.font = font(28 * s, 400);
      return wrap(ctx, o.note, innerW, 8);
    };
    blocks.push({
      h: (ctx, s) => lay(ctx, s).length * 38 * s + 30,
      draw: (ctx, y, s) => {
        ctx.fillStyle = INK;
        ctx.font = font(28 * s, 400);
        drawLines(ctx, lay(ctx, s), M, y + 30 * s, 38 * s);
      },
    });
  }

  if (o.contacts.length > 0 || o.owner) {
    blocks.push({
      h: (_c, s) => 46 * s + (o.owner ? 48 * s : 0) + o.contacts.length * 74 * s + 10,
      draw: (ctx, y, s) => {
        ctx.textAlign = 'left';
        ctx.fillStyle = MUTED;
        ctx.font = font(24 * s, 700);
        ctx.fillText(o.contactHeading, M, y + 28 * s);
        y += 46 * s;
        if (o.owner) {
          ctx.font = font(28 * s, 400);
          ctx.fillStyle = MUTED;
          ctx.fillText(`${o.owner.label}:`, M, y + 28 * s);
          const w = ctx.measureText(`${o.owner.label}: `).width;
          ctx.font = font(30 * s, 700);
          ctx.fillStyle = INK;
          ctx.fillText(o.owner.name, M + w, y + 28 * s);
          y += 48 * s;
        }
        o.contacts.forEach((c) => {
          ctx.fillStyle = INK;
          ctx.fillRect(M, y, PAGE_W - 2 * M, 1);
          ctx.font = font(24 * s, 700);
          ctx.fillStyle = MUTED;
          ctx.textAlign = 'left';
          ctx.fillText(c.label, M, y + 46 * s);
          ctx.font = font(34 * s, 700);
          ctx.fillStyle = INK;
          ctx.textAlign = 'right';
          const vw = PAGE_W - 2 * M - 190 * s;
          ctx.fillText(wrap(ctx, c.value, vw, 1)[0] ?? '', PAGE_W - M, y + 48 * s);
          y += 74 * s;
        });
        ctx.textAlign = 'left';
      },
    });
  }
  return blocks;
}

/** Zadnja stranica: sve na jednu sliku (uz smanjenje do 75 %); ako ni tada ne stane, blokovi (nikad cijepani) prelaze na sljedeću sliku. */
function drawOrder(m: Extract<PageModel, { kind: 'order' }>): HTMLCanvasElement[] {
  const blocks = orderBlocks(m.model);
  const probe = newPage();
  probe.ctx.textAlign = 'left';
  const header = drawHeader(probe.ctx, m.model.heading, 1, 1);
  const limit = PAGE_H - M;
  const total = (s: number) => blocks.reduce((n, b) => n + b.h(probe.ctx, s) + 18, 0);
  let s = 1;
  while (s > 0.75 && total(s) > limit - header) s = Math.round((s - 0.05) * 100) / 100;
  if (total(s) > limit - header) s = 0.85; // ni smanjenje ne pomaže: blokovi idu na više slika
  const pages: HTMLCanvasElement[] = [];
  let { canvas, ctx } = newPage();
  let y = drawHeader(ctx, m.model.heading, 1, 1);
  const first = y;
  for (const b of blocks) {
    const h = b.h(ctx, s);
    if (y + h > limit && y > first) {
      pages.push(canvas);
      ({ canvas, ctx } = newPage());
      y = M + 20;
    }
    b.draw(ctx, y, s);
    y += h + 18;
  }
  pages.push(canvas);
  return pages;
}

const toBlob = (c: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create the picture'))), 'image/jpeg', 0.9));

/** Sve stranice knjižice kao JPEG slike, redom. */
export async function renderBookletImages(input: BookletBuildInput): Promise<Blob[]> {
  const canvases: HTMLCanvasElement[] = [];
  for (const m of pageModels(input)) {
    if (m.kind === 'cover') canvases.push(await drawCover(m));
    else if (m.kind === 'grid') canvases.push(await drawGrid(m));
    else if (m.kind === 'text') canvases.push(...drawText(m));
    else canvases.push(...drawOrder(m));
  }
  const blobs: Blob[] = [];
  for (const c of canvases) blobs.push(await toBlob(c));
  return blobs;
}
