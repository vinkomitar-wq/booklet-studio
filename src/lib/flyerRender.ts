/**
 * Letak kao slika. Osnovna veličina je A4 (1240×1754, omjer svih A-listova), a `scale` 2 daje 2480×3508 za ispis u oštrini 300 dpi.
 * Isti crtež vrijedi za A4 i A5 (A5 je A4 prepolovljen s istim omjerom), pa se papir mijenja samo pri ispisu.
 */
import { FlyerModel } from './flyer';
import { Ctx, INK, MUTED, PAPER, PLACE, drawFit, drawLines, font, loadImg, roundRect, wrap } from './render';
import { qrMatrix } from './qr';

export const FLYER_W = 1240;
export const FLYER_H = 1754;
const M = 80;
const FOOT_H = 330;

function drawQr(ctx: Ctx, text: string, x: number, y: number, size: number): boolean {
  const qr = qrMatrix(text);
  if (!qr) return false;
  ctx.fillStyle = '#fff';
  roundRect(ctx, x, y, size, size, 14);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.stroke();
  const n = qr.length;
  const quiet = 2;
  const cell = size / (n + quiet * 2);
  ctx.fillStyle = INK;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr[r][c]) ctx.fillRect(x + (c + quiet) * cell, y + (r + quiet) * cell, Math.ceil(cell), Math.ceil(cell));
  return true;
}

/** Podnožje: kontakt lijevo (naziv sitno, vrijednost krupno), QR desno. Crta se od dna lista prema gore; vraća gornji rub podnožja. */
function drawFooter(ctx: Ctx, m: FlyerModel): number {
  const top = FLYER_H - M - FOOT_H;
  ctx.fillStyle = INK;
  ctx.fillRect(M, top, FLYER_W - 2 * M, 3);
  const qrSize = m.qr ? 250 : 0;
  const textW = FLYER_W - 2 * M - (qrSize ? qrSize + 40 : 0);
  const rows = m.contacts.slice(0, 5);
  const rowH = rows.length > 0 ? Math.min(62, (FOOT_H - 40) / rows.length) : 0;
  let y = top + 44 + 10;
  ctx.textAlign = 'left';
  // jedan stupac za sve vrijednosti: najširi naziv + razmak (inače vrijednosti ne bi bile poravnate)
  ctx.font = font(24, 700);
  const col = M + Math.max(150, ...rows.map((c) => ctx.measureText(c.label).width)) + 36;
  for (const c of rows) {
    ctx.font = font(24, 700);
    ctx.fillStyle = MUTED;
    ctx.fillText(c.label, M, y);
    ctx.font = font(36, 700);
    ctx.fillStyle = INK;
    ctx.fillText(wrap(ctx, c.value, M + textW - col, 1)[0] ?? '', col, y + 1);
    y += rowH;
  }
  if (m.qr) drawQr(ctx, m.qr, FLYER_W - M - qrSize, top + (FOOT_H - qrSize) / 2 + 6, qrSize);
  return top;
}

function drawHead(ctx: Ctx, m: FlyerModel): number {
  let y = M;
  ctx.textAlign = 'left';
  ctx.fillStyle = INK;
  if (m.title.trim()) {
    ctx.font = font(92, 600, true);
    const lines = wrap(ctx, m.title, FLYER_W - 2 * M, 2);
    y = drawLines(ctx, lines, M, y + 78, 104) - 78 + 8;
  }
  if (m.subtitle.trim()) {
    ctx.font = font(34, 700);
    ctx.fillStyle = MUTED;
    y = drawLines(ctx, wrap(ctx, m.subtitle, FLYER_W - 2 * M, 2), M, y + 34, 46) - 34 + 6;
  }
  if (m.title.trim() || m.subtitle.trim()) {
    ctx.fillStyle = INK;
    ctx.fillRect(M, y + 14, FLYER_W - 2 * M, 3);
    y += 14 + 3 + 28;
  }
  return y;
}

export async function renderFlyer(m: FlyerModel, scale = 1): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = FLYER_W * scale;
  canvas.height = FLYER_H * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available on this device');
  ctx.scale(scale, scale);
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, FLYER_W, FLYER_H);
  ctx.textBaseline = 'alphabetic';

  const footTop = drawFooter(ctx, m);
  let top = drawHead(ctx, m);

  // tekst ispod slika, odmah iznad podnožja
  let bodyH = 0;
  let bodyLines: string[] = [];
  if (m.body.trim()) {
    ctx.font = font(34, 400);
    bodyLines = wrap(ctx, m.body, FLYER_W - 2 * M, 5);
    bodyH = bodyLines.length * 46 + 28;
  }
  const areaBottom = footTop - 24 - bodyH;
  const imgs = await Promise.all(m.cells.map((c) => loadImg(c.image)));

  const caption = (i: number, x: number, y: number, w: number, big: boolean) => {
    const c = m.cells[i];
    const k = big ? 1.5 : 1;
    ctx.textAlign = 'left';
    ctx.fillStyle = INK;
    ctx.font = font(34 * k, 700);
    y = drawLines(ctx, wrap(ctx, c.title, w, 2), x, y, 42 * k);
    if (c.price) {
      ctx.font = font(32 * k, 700);
      ctx.fillStyle = MUTED;
      y = drawLines(ctx, [c.price], x, y, 40 * k);
    }
    if (c.desc) {
      ctx.font = font(26 * k, 400);
      ctx.fillStyle = MUTED;
      drawLines(ctx, wrap(ctx, c.desc, w, 3), x, y, 34 * k);
    }
  };
  const capHeight = (i: number, w: number, big: boolean) => {
    const c = m.cells[i];
    const k = big ? 1.5 : 1;
    ctx.font = font(34 * k, 700);
    const t = c.title ? wrap(ctx, c.title, w, 2).length : 0;
    ctx.font = font(26 * k, 400);
    const d = c.desc ? wrap(ctx, c.desc, w, 3).length : 0;
    return t * 42 * k + (c.price ? 40 * k : 0) + d * 34 * k;
  };
  const box = (i: number, x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = PLACE;
    ctx.fillRect(x, y, w, h);
    const im = imgs[i];
    if (im) drawFit(ctx, im, x, y, w, h, 'contain');
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, w, h);
  };

  const innerW = FLYER_W - 2 * M;
  const gap = 36;
  if (m.cells.length > 0) {
    if (m.layout === 'feature' || m.cells.length === 1) {
      const capH = capHeight(0, innerW, true);
      const ch = capH > 0 ? capH + 44 : 0;
      const h = areaBottom - top - ch;
      box(0, M, top, innerW, h);
      caption(0, M, top + h + 22 + 50, innerW, true);
    } else {
      const cols = m.layout === 'two' ? 2 : 2;
      const rows = m.layout === 'two' ? 1 : Math.ceil(m.cells.length / 2);
      const cw = (innerW - (cols - 1) * gap) / cols;
      const caps = m.cells.map((_, i) => capHeight(i, cw, m.layout === 'two'));
      const capH = Math.max(0, ...caps);
      const capSpace = capH > 0 ? capH + 44 : 0;
      const rowH = (areaBottom - top - (rows - 1) * gap) / rows;
      m.cells.forEach((_, i) => {
        const x = M + (i % cols) * (cw + gap);
        const y = top + Math.floor(i / cols) * (rowH + gap);
        box(i, x, y, cw, rowH - capSpace);
        caption(i, x, y + rowH - capSpace + 22 + 32, cw, m.layout === 'two');
      });
    }
  }
  if (bodyLines.length) {
    ctx.fillStyle = INK;
    ctx.font = font(34, 400);
    ctx.textAlign = 'left';
    drawLines(ctx, bodyLines, M, areaBottom + 24 + 34, 46);
  }
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create the flyer'))), 'image/jpeg', scale > 1 ? 0.92 : 0.9));
}
