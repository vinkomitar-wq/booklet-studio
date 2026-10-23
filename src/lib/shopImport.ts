/**
 * Uvoz cipela iz web-dućana (čisto, bez mreže i preglednika — pod testom). Dućan drži popis u `app_data/main_app_state.pck_collection`, a slike su
 * zasebni dokumenti (`img:<id>` → `shop_images/<id>.data`). Ovdje se samo čita i pretvara u stavke; ništa se u dućanu ne mijenja.
 */
import { MAX_PAYLOAD } from './sync';
import type { Item } from './studio';

export interface ShopShoe {
  id: string;
  title: string;
  /** Sirovi zapisi slika: `img:<id>` (treba dohvatiti) ili već `data:image/…`. */
  images: string[];
  visible: boolean;
  price?: number;
  sizePricing?: 'same' | 'bySize';
  sizeExtras?: Record<string, number>;
}

const MAX_IMAGES = 3;
/** Zbroj slika jedne stavke ostaje ispod granice zapisa za sinkronizaciju (ostavljen prostor za naslov i ostala polja). */
const IMAGE_BUDGET = MAX_PAYLOAD - 50_000;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function parseShopCollection(raw: unknown): ShopShoe[] {
  if (!Array.isArray(raw)) return [];
  const out: ShopShoe[] = [];
  for (const r of raw) {
    if (!isObj(r) || typeof r.id !== 'string' || !r.id) continue;
    const extras: Record<string, number> = {};
    if (isObj(r.sizeExtras)) for (const [k, v] of Object.entries(r.sizeExtras)) if (typeof v === 'number' && Number.isFinite(v)) extras[k] = v;
    out.push({
      id: r.id.slice(0, 60),
      title: typeof r.title === 'string' ? r.title.trim().slice(0, 120) : '',
      images: (Array.isArray(r.images) ? r.images : []).filter((x): x is string => typeof x === 'string' && x.length > 0),
      visible: r.visible !== false,
      price: typeof r.price === 'number' && Number.isFinite(r.price) && r.price > 0 ? r.price : undefined,
      sizePricing: r.sizePricing === 'same' ? 'same' : r.sizePricing === 'bySize' ? 'bySize' : undefined,
      sizeExtras: Object.keys(extras).length > 0 ? extras : undefined,
    });
  }
  return out;
}

const baht = (n: number): string => '฿' + Math.round(n).toLocaleString('en-US');

/**
 * Tekst cijene za stavku. Bez cijene u dućanu → prazno (ne izmišlja se). Cijena po veličini s različitim doplatama → „from ฿X" (najniža), inače „฿X".
 * Napomena: dućan raspon računa i iz zalihe (stare zajedničke doplate); ovdje se gledaju samo doplate zapisane uz cipelu.
 */
export function shopPriceText(s: Pick<ShopShoe, 'price' | 'sizePricing' | 'sizeExtras'>): string {
  if (s.price === undefined) return '';
  const base = s.price;
  if (s.sizePricing !== 'same' && s.sizeExtras) {
    const prices = Object.values(s.sizeExtras).map((e) => Math.max(0, base + e));
    prices.push(base);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    if (min !== max) return `from ${baht(min)}`;
  }
  return baht(base);
}

export interface ImportPlan {
  /** Cipele koje se uvoze (vidljive u dućanu i još nisu uvezene). */
  fresh: ShopShoe[];
  /** Već uvezene (po šifri iz dućana): ne diraju se, da se ne pregazi ono što je uređeno ovdje. */
  already: number;
  /** Skrivene u dućanu: ne uvoze se. */
  hidden: number;
}

export function planImport(existing: Pick<Item, 'shopId'>[], shoes: ShopShoe[]): ImportPlan {
  const have = new Set(existing.map((i) => i.shopId).filter((x): x is string => !!x));
  const plan: ImportPlan = { fresh: [], already: 0, hidden: 0 };
  for (const s of shoes) {
    if (!s.visible) plan.hidden++;
    else if (have.has(s.id)) plan.already++;
    else plan.fresh.push(s);
  }
  return plan;
}

/** Do 3 slike (kao i ručno), redom; samo prave `data:image` adrese; stane se kad bi zbroj prešao granicu zapisa (prva slika ulazi samo ako sama stane). */
export function pickImages(urls: string[]): string[] {
  const out: string[] = [];
  let total = 0;
  for (const u of urls) {
    if (out.length >= MAX_IMAGES) break;
    if (typeof u !== 'string' || !u.startsWith('data:image/')) continue;
    if (total + u.length > IMAGE_BUDGET) {
      if (out.length > 0) break;
      continue;
    }
    out.push(u);
    total += u.length;
  }
  return out;
}

export function shoeToItem(s: ShopShoe, images: string[], id: string): Item {
  return { id, title: s.title, price: shopPriceText(s), desc: '', images: pickImages(images), shopId: s.id };
}

export interface ImportResult {
  added: Item[];
  /** Iz dućana pročitano / već uvezeno / skriveno u dućanu. */
  total: number;
  already: number;
  hidden: number;
  /** Cipele bez ijedne upotrebljive slike (ne uvoze se). */
  noImage: number;
  /** Cipele čije slike nije bilo moguće dohvatiti (greška mreže): ne uvoze se, pa ih sljedeći pokušaj ponovno pokuša. */
  failed: number;
}

/**
 * Cijeli uvoz s ubrizganim dohvatom (da se isproba bez mreže). Slike se dohvaćaju samo za cipele koje će se uvesti — svaka slika je jedno čitanje baze,
 * a dnevna kvota čitanja dijeli se s dućanom. Cipela kojoj je dohvat neke slike pao NE uvozi se napola (inače bi je „već uvezeno" zauvijek ostavilo bez slike).
 */
export async function runShopImport(
  existing: Item[],
  fetchCollection: () => Promise<unknown>,
  fetchImage: (ref: string) => Promise<string>,
  newItemId: (taken: Set<string>) => string,
  concurrency = 4,
): Promise<ImportResult> {
  const shoes = parseShopCollection(await fetchCollection());
  const plan = planImport(existing, shoes);
  const result: ImportResult = { added: [], total: shoes.length, already: plan.already, hidden: plan.hidden, noImage: 0, failed: 0 };
  const taken = new Set(existing.map((i) => i.id));
  const resolved = new Map<string, string[] | 'failed'>();
  let next = 0;
  const worker = async () => {
    while (next < plan.fresh.length) {
      const s = plan.fresh[next++];
      const want = s.images.slice(0, 6); // više od tri se ne čita; ostalo je rezerva ako neka slika u dućanu više ne postoji
      try {
        const got: string[] = [];
        for (const r of want) {
          if (got.length >= MAX_IMAGES) break; // kad su tri dobre, ostale se ne čitaju (štedi čitanja)
          const url = r.startsWith('img:') ? await fetchImage(r) : r;
          if (url.startsWith('data:image/')) got.push(url);
        }
        resolved.set(s.id, got);
      } catch {
        resolved.set(s.id, 'failed');
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  for (const s of plan.fresh) {
    const imgs = resolved.get(s.id);
    if (imgs === 'failed' || imgs === undefined) {
      result.failed++;
      continue;
    }
    const item = shoeToItem(s, imgs, '');
    if (item.images.length === 0) {
      result.noImage++;
      continue;
    }
    item.id = newItemId(taken);
    taken.add(item.id);
    result.added.push(item);
  }
  return result;
}
