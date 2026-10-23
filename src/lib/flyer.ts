/**
 * Letak (jedna stranica za ispis ili slanje kao slika): podaci, pravila i model za crtanje. Čisto — bez preglednika, pod testom.
 * Letak ne ovisi o knjižici: ima vlastiti naslov, odabrane stavke (1, 2 ili 4 — prema predlošku), tekst i kontakt iz postavki.
 */
import { BookletContact, BookletLang, LABELS, safeSrc } from './booklet';
import type { Item } from './studio';

export type FlyerLayout = 'feature' | 'two' | 'grid4';
export type Paper = 'A4' | 'A5';

/** Koliko stavki stane na letak po predlošku. */
export const FLYER_SLOTS: Record<FlyerLayout, number> = { feature: 1, two: 2, grid4: 4 };
export const FLYER_LAYOUTS: FlyerLayout[] = ['feature', 'two', 'grid4'];

export interface Flyer {
  id: string;
  /** Naziv za popis (korisnik ga vidi samo u aplikaciji). */
  name: string;
  layout: FlyerLayout;
  /** Papir za ispis; slika je ista, mijenja se samo veličina lista. */
  paper: Paper;
  lang: BookletLang;
  title: string;
  subtitle: string;
  itemIds: string[];
  body: string;
  showPrices: boolean;
  showQr: boolean;
}

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export const newFlyerId = (taken: Set<string> = new Set()): string => {
  let id = '';
  do id = `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  while (taken.has(id));
  return id;
};

export const newFlyer = (lang: BookletLang, taken: Set<string> = new Set()): Flyer => ({
  id: newFlyerId(taken),
  name: '',
  layout: 'grid4',
  paper: 'A4',
  lang,
  title: '',
  subtitle: '',
  itemIds: [],
  body: '',
  showPrices: true,
  showQr: true,
});

export function normalizeFlyers(raw: unknown, fallbackLang: BookletLang = 'en'): Flyer[] {
  const seen = new Set<string>();
  const out: Flyer[] = [];
  for (const f of Array.isArray(raw) ? raw : []) {
    if (!isObj(f)) continue;
    let id = str(f.id, 40);
    if (!id || seen.has(id)) id = newFlyerId(seen);
    seen.add(id);
    const layout: FlyerLayout = f.layout === 'feature' || f.layout === 'two' || f.layout === 'grid4' ? f.layout : 'grid4';
    out.push({
      id,
      name: str(f.name, 80),
      layout,
      paper: f.paper === 'A5' ? 'A5' : 'A4',
      lang: f.lang === 'th' ? 'th' : f.lang === 'en' ? 'en' : fallbackLang,
      title: str(f.title, 120),
      subtitle: str(f.subtitle, 160),
      itemIds: (Array.isArray(f.itemIds) ? f.itemIds : []).filter((x): x is string => typeof x === 'string').slice(0, FLYER_SLOTS[layout]),
      body: str(f.body, 1200),
      showPrices: f.showPrices !== false,
      showQr: f.showQr !== false,
    });
    if (out.length >= 100) break;
  }
  return out;
}

/** Promjena predloška smanjuje broj stavki na ono što stane (višak se ne gubi tiho: sučelje to kaže prije promjene). */
export function setLayout(f: Flyer, layout: FlyerLayout): Flyer {
  return { ...f, layout, itemIds: f.itemIds.slice(0, FLYER_SLOTS[layout]) };
}

/** Označi/odznači stavku; kad je predložak pun, nova stavka NE istiskuje staru nego se odbija (korisnik prvo odznači). */
export function toggleFlyerItem(f: Flyer, id: string): { flyer: Flyer; full: boolean } {
  if (f.itemIds.includes(id)) return { flyer: { ...f, itemIds: f.itemIds.filter((x) => x !== id) }, full: false };
  if (f.itemIds.length >= FLYER_SLOTS[f.layout]) return { flyer: f, full: true };
  return { flyer: { ...f, itemIds: [...f.itemIds, id] }, full: false };
}

export interface FlyerCell {
  image: string;
  title: string;
  price: string;
  desc: string;
}

export interface FlyerModel {
  layout: FlyerLayout;
  lang: BookletLang;
  title: string;
  subtitle: string;
  cells: FlyerCell[];
  body: string;
  contacts: { label: string; value: string }[];
  /** Što kodira QR (web trgovina, inače WhatsApp), ili null. */
  qr: string | null;
}

const display = (u: string) => u.replace(/^https?:\/\//i, '').replace(/\/$/, '');

export function flyerModel(f: Flyer, items: Item[], contact: BookletContact): FlyerModel {
  const L = LABELS[f.lang];
  const byId = new Map(items.map((i) => [i.id, i] as const));
  const cells: FlyerCell[] = f.itemIds
    .map((id) => byId.get(id))
    .filter((i): i is Item => !!i && i.images.some((u) => safeSrc(u)))
    .slice(0, FLYER_SLOTS[f.layout])
    .map((i) => ({ image: i.images.find((u) => safeSrc(u)) ?? '', title: i.title, price: f.showPrices ? i.price : '', desc: i.desc }));
  const contacts: FlyerModel['contacts'] = [];
  if (contact.whatsappE164) contacts.push({ label: 'WhatsApp', value: `+${contact.whatsappE164}` });
  if (contact.lineDisplay || contact.lineUrl) contacts.push({ label: 'LINE', value: contact.lineDisplay || L.lineAdd });
  if (contact.phoneDisplay && contact.phoneE164) contacts.push({ label: L.phone, value: contact.phoneDisplay });
  if (contact.email) contacts.push({ label: L.email, value: contact.email });
  const shopOk = /^https?:\/\//i.test(contact.shopUrl);
  if (shopOk) contacts.push({ label: L.website, value: display(contact.shopUrl) });
  const qr = !f.showQr ? null : shopOk ? contact.shopUrl : contact.whatsappE164 ? `https://wa.me/${contact.whatsappE164}` : null;
  return { layout: f.layout, lang: f.lang, title: f.title, subtitle: f.subtitle, cells, body: f.body, contacts, qr };
}

export type FlyerIssue = 'no-items' | 'missing-items';
/** Što je na letku prazno ili pokvareno (prikazuje se na ekranu, ne šuti). */
export function flyerIssues(f: Flyer, items: Item[]): FlyerIssue[] {
  const byId = new Map(items.map((i) => [i.id, i] as const));
  const out: FlyerIssue[] = [];
  const ok = f.itemIds.filter((id) => byId.get(id)?.images.some((u) => safeSrc(u)));
  if (ok.length === 0) out.push('no-items');
  if (f.itemIds.some((id) => !byId.has(id))) out.push('missing-items');
  return out;
}
