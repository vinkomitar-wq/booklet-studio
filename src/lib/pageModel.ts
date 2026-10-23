/**
 * Stranice knjižice kao PODACI (bez HTML-a i bez crtanja): isto što `bookletPages` slaže u HTML, ovdje za crtanje u slike.
 * Pravila o tome što ulazi (prazno se izostavlja, stavke bez slike ne zauzimaju mjesto, podjela po `perPage`) su ista kao u HTML-u i čuvaju se testom
 * koji uspoređuje broj i redoslijed stranica.
 */
import { BookletBuildInput, BookletShoe, LABELS, OrderModel, PHOTOS_PER_PAGE, orderPageModel, perPageOf, safeSrc, shoeChunks } from './booklet';

export interface Cell {
  image: string;
  title: string;
  price: string;
  desc: string;
}

export type PageModel =
  | { kind: 'cover'; image: string; title: string; subtitle: string; by: string }
  | { kind: 'grid'; heading: string; part: number; parts: number; perPage: number; cells: Cell[]; note: string }
  | { kind: 'text'; heading: string; body: string }
  | { kind: 'order'; model: OrderModel };

export function pageModels(input: BookletBuildInput): PageModel[] {
  const { draft, shoes, photos, contact } = input;
  const L = LABELS[draft.lang];
  const byId = new Map(shoes.map((s) => [s.id, s] as const));
  const out: PageModel[] = [];

  const coverShoe = byId.get(draft.coverShoeId);
  const firstImage =
    coverShoe?.images.find((u) => safeSrc(u)) ??
    draft.pages.flatMap((p) => (p.type === 'shoes' ? p.shoeIds.map((id) => byId.get(id)?.images[0] ?? '') : p.type === 'photos' ? p.items.map((it) => photos[it.ref] ?? '') : [])).find((u) => safeSrc(u)) ??
    '';
  out.push({ kind: 'cover', image: safeSrc(firstImage) ? firstImage : '', title: draft.title || L.defaultTitle, subtitle: draft.subtitle.trim(), by: contact.businessName });

  const grid = (heading: string, cells: Cell[], perPage: number, note: string) => {
    const chunks = shoeChunks(cells, perPage);
    chunks.forEach((chunk, i) => out.push({ kind: 'grid', heading, part: i + 1, parts: chunks.length, perPage, cells: chunk, note: i === chunks.length - 1 ? note.trim() : '' }));
  };

  for (const p of draft.pages) {
    if (p.type === 'shoes') {
      const cells: Cell[] = p.shoeIds
        .map((id) => byId.get(id))
        .filter((s): s is BookletShoe => !!s && s.images.some((u) => safeSrc(u)))
        .map((s) => ({ image: s.images.find((u) => safeSrc(u)) ?? '', title: s.title, price: draft.showPrices ? s.priceText : '', desc: s.desc ?? '' }));
      grid(p.heading, cells, perPageOf(p), p.note);
    } else if (p.type === 'photos') {
      const cells: Cell[] = p.items.filter((it) => safeSrc(photos[it.ref] ?? '')).map((it) => ({ image: photos[it.ref], title: it.caption, price: '', desc: '' }));
      grid(p.heading, cells, PHOTOS_PER_PAGE, p.note);
    } else if (p.heading.trim() || p.body.trim()) {
      out.push({ kind: 'text', heading: p.heading, body: p.body });
    }
  }
  out.push({ kind: 'order', model: orderPageModel(input) });
  return out;
}
