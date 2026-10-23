/**
 * Podaci aplikacije (čisto, bez preglednika, pod testom): cipele, postavke, sigurnosna kopija i pretvorba u ulaz za knjižicu.
 * Sve što korisnik upiše ostaje u uređaju; ništa se ne šalje na server.
 */
import { BookletBuildInput, BookletContact, BookletDraft, BookletLang, BookletShoe, normalizeDraft } from './booklet';
import { Flyer, normalizeFlyers } from './flyer';
import { photoSrc } from './photoRef';

/** Stavka knjižice/letka: bilo što (proizvod, usluga, ponuda). U kodu knjižice zove se „shoe" iz povijesnih razloga; korisnik to nikad ne vidi. */
export interface Item {
  id: string;
  title: string;
  /** Slobodan tekst cijene kako ga korisnik upiše („฿699", „from 599"). Prazno = bez cijene. */
  price: string;
  /** Kratak opis (neobavezno). */
  desc: string;
  images: string[];
}

export interface Settings {
  uiLang: BookletLang;
  businessName: string;
  ownerName: string;
  /** Telefon i WhatsApp u međunarodnom obliku (+66…). */
  phone: string;
  whatsapp: string;
  lineUrl: string;
  lineDisplay: string;
  email: string;
  shopUrl: string;
}

export const defaultSettings = (uiLang: BookletLang = 'en'): Settings => ({
  uiLang,
  businessName: '',
  ownerName: '',
  phone: '',
  whatsapp: '',
  lineUrl: '',
  lineDisplay: '',
  email: '',
  shopUrl: '',
});

const str = (v: unknown, max = 200): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function normalizeSettings(raw: unknown, fallbackLang: BookletLang = 'en'): Settings {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    uiLang: o.uiLang === 'th' ? 'th' : o.uiLang === 'en' ? 'en' : fallbackLang,
    businessName: str(o.businessName, 80),
    ownerName: str(o.ownerName, 80),
    phone: str(o.phone, 40),
    whatsapp: str(o.whatsapp, 40),
    lineUrl: str(o.lineUrl, 300),
    lineDisplay: str(o.lineDisplay, 80),
    email: str(o.email, 120),
    shopUrl: str(o.shopUrl, 300),
  };
}

export function normalizeItems(raw: unknown): Item[] {
  const seen = new Set<string>();
  const out: Item[] = [];
  for (const s of Array.isArray(raw) ? raw : []) {
    if (!s || typeof s !== 'object') continue;
    const o = s as Record<string, unknown>;
    let id = str(o.id, 40);
    if (!id || seen.has(id)) id = newId(seen);
    seen.add(id);
    out.push({
      id,
      title: str(o.title, 120),
      price: str(o.price, 60),
      desc: str(o.desc, 300),
      images: (Array.isArray(o.images) ? o.images : []).filter((x): x is string => typeof x === 'string' && x.startsWith('data:image/')).slice(0, 3),
    });
    if (out.length >= 500) break;
  }
  return out;
}

export const newId = (taken: Set<string> = new Set()): string => {
  let id = '';
  do id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  while (taken.has(id));
  return id;
};

/**
 * Telefonski broj za wa.me / tel: — samo znamenke u MEĐUNARODNOM obliku. Broj koji počinje nulom („0945…") nema pozivni broj zemlje i NE pogađa se
 * (pogrešna zemlja bi poslala goste na tuđi telefon): vraća '' i sučelje to kaže.
 */
export function toE164(input: string): string {
  const t = input.trim();
  if (!t) return '';
  let d = t.replace(/\D/g, '');
  if (t.startsWith('00')) d = d.replace(/^00/, '');
  if (!d || d.startsWith('0')) return '';
  return d.length >= 7 && d.length <= 15 ? d : '';
}

export interface SettingsIssue {
  field: 'phone' | 'whatsapp' | 'shopUrl' | 'lineUrl';
}
export function settingsIssues(s: Settings): SettingsIssue[] {
  const out: SettingsIssue[] = [];
  if (s.phone.trim() && !toE164(s.phone)) out.push({ field: 'phone' });
  if (s.whatsapp.trim() && !toE164(s.whatsapp)) out.push({ field: 'whatsapp' });
  if (s.shopUrl.trim() && !/^https?:\/\//i.test(s.shopUrl.trim())) out.push({ field: 'shopUrl' });
  if (s.lineUrl.trim() && !/^https?:\/\//i.test(s.lineUrl.trim())) out.push({ field: 'lineUrl' });
  return out;
}

export function toContact(s: Settings): BookletContact {
  return {
    businessName: s.businessName,
    ownerName: s.ownerName,
    phoneDisplay: s.phone,
    phoneE164: toE164(s.phone),
    whatsappE164: toE164(s.whatsapp),
    lineUrl: /^https?:\/\//i.test(s.lineUrl) ? s.lineUrl : '',
    lineDisplay: s.lineDisplay,
    email: s.email,
    shopUrl: /^https?:\/\//i.test(s.shopUrl) ? s.shopUrl : '',
  };
}

/** Ulaz za slaganje knjižice: samo cipele koje su na stranicama ili naslovnici (datoteka ne nosi slike koje nitko ne koristi). */
export function toBuildInput(draft: BookletDraft, items: Item[], settings: Settings, storedPhotos: Record<string, string> = {}): BookletBuildInput {
  const wanted = new Set<string>();
  if (draft.coverShoeId) wanted.add(draft.coverShoeId);
  const photos: Record<string, string> = {};
  for (const p of draft.pages) {
    if (p.type === 'shoes') p.shoeIds.forEach((id) => wanted.add(id));
    else if (p.type === 'photos') p.items.forEach((it) => (photos[it.ref] = photoSrc(storedPhotos, it.ref))); // ref je id spremljene slike (ili, u starim zapisima, sama data: adresa)
  }
  const bookletShoes: BookletShoe[] = items.filter((s) => wanted.has(s.id)).map((s) => ({ id: s.id, title: s.title, images: s.images, priceText: draft.showPrices ? s.price : '', desc: s.desc }));
  return { draft, shoes: bookletShoes, photos, contact: toContact(settings) };
}

export const BACKUP_VERSION = 3;
export interface Backup {
  app: 'booklet-studio';
  version: number;
  savedAt: string;
  items: Item[];
  settings: Settings;
  draft: BookletDraft;
  flyers: Flyer[];
}

export const makeBackup = (items: Item[], settings: Settings, draft: BookletDraft, flyers: Flyer[], now: Date = new Date()): Backup => ({ app: 'booklet-studio', version: BACKUP_VERSION, savedAt: now.toISOString(), items, settings, draft, flyers });

/** Čita sigurnosnu kopiju (i starije: verzija 1 je stavke zvala shoes, a verzije 1 i 2 nemaju letke). Tuđa ili oštećena datoteka se ODBIJA s razlogom, ne uvozi se napola. */
export function parseBackup(text: string): { ok: true; items: Item[]; settings: Settings; draft: BookletDraft; flyers: Flyer[] } | { ok: false; reason: 'not-json' | 'not-ours' | 'newer' } {
  let o: any;
  try {
    o = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'not-json' };
  }
  const list = o && Array.isArray(o.items) ? o.items : o && Array.isArray(o.shoes) ? o.shoes : null;
  if (!o || o.app !== 'booklet-studio' || !list) return { ok: false, reason: 'not-ours' };
  if (typeof o.version === 'number' && o.version > BACKUP_VERSION) return { ok: false, reason: 'newer' };
  const settings = normalizeSettings(o.settings);
  return { ok: true, items: normalizeItems(list), settings, draft: normalizeDraft(o.draft, settings.uiLang), flyers: normalizeFlyers(o.flyers, settings.uiLang) };
}

/**
 * Predložak „pred-narudžba za brodsku turu": popuni korake, oznaku i poruku. To su samo POČETNE vrijednosti — sve se poslije uređuje.
 * Mjesto (zasad Phuket) upisuje korisnik, ne stoji u kodu; prazno mjesto se izostavlja (nema praznih zagrada ni praznog retka).
 */
export function boatTripPreset(lang: BookletLang, place: string): Pick<BookletDraft, 'stepsTitle' | 'stepsBadge' | 'steps' | 'waMessage'> {
  const p = place.trim();
  if (lang === 'th') {
    return {
      stepsTitle: 'อยากได้บนทริปเรือ? สั่งล่วงหน้า',
      stepsBadge: 'สต็อกบนเรือมีจำกัด — ต้องสั่งล่วงหน้า',
      steps: [
        { title: 'เลือกสินค้า', desc: 'สั่งผ่านเว็บไซต์ หรือส่งข้อความหาเรา' },
        { title: 'บอกวันที่ เรือ และสถานที่', desc: `วันที่ ชื่อเรือ และจุดรับ${p ? ` (${p})` : ''} — ต้องแจ้งล่วงหน้า` },
        { title: 'จ่ายและรับบนเรือ', desc: 'เงินสด / สแกน QR ลูกเรือนำสินค้าที่สั่งไว้มาให้' },
      ],
      waMessage: `สวัสดีค่ะ อยากสั่งล่วงหน้าสำหรับทริปเรือ\nสินค้า: \nไซส์: \nวันที่: \nชื่อเรือ:${p ? ` \nสถานที่: ${p}` : ''}`,
    };
  }
  return {
    stepsTitle: 'Want it on your boat trip? Pre-order',
    stepsBadge: 'Limited stock on board — pre-order only',
    steps: [
      { title: 'Choose your item', desc: 'Order on the web store, or message us.' },
      { title: 'Tell us the date, boat and place', desc: `Date, boat name and where${p ? ` (${p})` : ''} — please tell us in advance.` },
      { title: 'Pay and collect on board', desc: 'Cash or QR — the crew bring your pre-ordered item.' },
    ],
    waMessage: `Hi! I would like to pre-order for my boat trip.\nItem: \nSize: \nDate: \nBoat name:${p ? ` \nPlace: ${p}` : ''}`,
  };
}
