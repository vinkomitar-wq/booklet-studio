/**
 * KNJIŽICA PRIMJERA (20.10.2026., Vinko: „Interactive booklet, isti stil kao na thailandboattours.com — gdje bi Parry sama slagala primjere bojanih cipela i slala kupcima").
 *
 * Parry u adminu složi stranice (cipele iz kolekcija, vlastite fotografije primjera, tekst), a aplikacija iz toga napravi JEDNU samostalnu .html datoteku:
 * isti okvir kao knjižica na thailandboattours.com (tamna traka, stranica, „Prev / Next", točkice, listanje strelicama i prstom, povećanje slike klikom, ispis).
 * Datoteka se otvara u bilo kojem pregledniku, bez aplikacije i prijave, i šalje se kupcu kao privitak (LINE, WhatsApp, e-pošta).
 *
 * Čisto: bez DOM-a, mreže i Firebasea (tests/booklet.test.ts). Slike ulaze već kao data: adrese (lib/bookletExport.ts ih skuplja); ono što se ne da ugraditi
 * ostaje na apsolutnoj adresi, a sučelje javi koliko ih je. Sve što se piše kupcu na jednom je jeziku knjižice (th ili en).
 */

export type BookletLang = 'th' | 'en';

export interface BookletShoesPage {
  id: string;
  type: 'shoes';
  heading: string;
  /** Id-evi cipela iz kolekcije (CollectionItem.id), redom kako se prikazuju. */
  shoeIds: string[];
  note: string;
  /** Koliko cipela stane na JEDNU stranicu knjižice (2/4/6/9); prazno = zadano. Više cipela od toga ide na sljedeće stranice, ništa se ne skrola. */
  perPage?: number;
}
export interface BookletPhotoItem {
  /** `img:<id>` (spremljeno u shop_images) ili data: adresa. */
  ref: string;
  caption: string;
}
export interface BookletPhotosPage {
  id: string;
  type: 'photos';
  heading: string;
  items: BookletPhotoItem[];
  note: string;
}
export interface BookletTextPage {
  id: string;
  type: 'text';
  heading: string;
  body: string;
}
export type BookletPage = BookletShoesPage | BookletPhotosPage | BookletTextPage;

export interface BookletDraft {
  title: string;
  subtitle: string;
  lang: BookletLang;
  showPrices: boolean;
  /** Cipela čija je slika naslovnica; prazno = prva slika koja postoji. */
  coverShoeId: string;
  pages: BookletPage[];
  /** Tekst na zadnjoj stranici (kako naručiti). Prazno = zadani tekst na jeziku knjižice. */
  orderNote: string;
  /** Gdje se knjižica uzima na brodu (pred-narudžba): zadano Phuket, Parry može promijeniti. Prazno = bez imena mjesta. */
  /** Naslov zadnje stranice; prazno = zadani tekst. */
  orderHeading: string;
  /** Neobavezni koraci (npr. odaberi, javi datum, plati): najviše 6. Prazno = bez koraka. */
  steps: BookletStep[];
  /** Naslov iznad koraka i oznaka uz njega (npr. ograničena zaliha). */
  stepsTitle: string;
  stepsBadge: string;
  /** Poruka koja se otvori u WhatsAppu kad gost pritisne kontakt; prazno = zadani pozdrav. */
  waMessage: string;
}
export interface BookletStep {
  title: string;
  desc: string;
}

export interface BookletShoe {
  id: string;
  title: string;
  /** data: adrese (ili apsolutne, ako se nisu dale ugraditi). */
  images: string[];
  /** Već složen tekst cijene („฿5,990" / „from ฿4,990"); prazno = cijena se ne prikazuje. */
  priceText: string;
  /** Kratak opis (neobavezno). */
  desc?: string;
}

export interface BookletContact {
  businessName: string;
  ownerName: string;
  phoneDisplay: string;
  phoneE164: string;
  whatsappE164: string;
  lineUrl: string;
  lineDisplay: string;
  email: string;
  shopUrl: string;
}

export interface BookletBuildInput {
  draft: BookletDraft;
  shoes: BookletShoe[];
  /** ref → data: adresa za vlastite fotografije stranica „photos". */
  photos: Record<string, string>;
  contact: BookletContact;
}

export const LABELS: Record<BookletLang, Record<string, string>> = {
  th: {
    defaultTitle: 'สมุดภาพของฉัน',
    defaultSubtitle: '',
    prev: 'ก่อนหน้า',
    next: 'ถัดไป',
    restart: 'กลับหน้าแรก',
    page: 'หน้า',
    of: 'จาก',
    priceFrom: 'เริ่มต้น',
    orderHeading: 'วิธีสั่งซื้อ',
    onlineOption: 'สั่งซื้อออนไลน์',
    onlineBody: 'ดูทั้งหมดและสั่งซื้อได้ที่เว็บไซต์ของเรา',
    onlineBtn: 'เปิดเว็บไซต์',
    contactHeading: 'ติดต่อเรา',
    owner: 'เจ้าของร้าน',
    phone: 'โทร',
    email: 'อีเมล',
    website: 'เว็บไซต์',
    waHello: 'สวัสดีค่ะ ดูสมุดภาพของร้านแล้ว สนใจค่ะ',
    lineAdd: 'เพิ่มเพื่อนใน LINE',
    photo: 'รูป',
    close: 'ปิด',
  },
  en: {
    defaultTitle: 'My booklet',
    defaultSubtitle: '',
    prev: 'Prev',
    next: 'Next',
    restart: 'Back to start',
    page: 'Page',
    of: 'of',
    priceFrom: 'from',
    orderHeading: 'How to order',
    onlineOption: 'Order online',
    onlineBody: 'See everything and order on our website.',
    onlineBtn: 'Open the website',
    contactHeading: 'Contact us',
    owner: 'Owner',
    phone: 'Phone',
    email: 'Email',
    website: 'Website',
    waHello: 'Hi! I saw your booklet and I am interested.',
    lineAdd: 'Add us on LINE',
    photo: 'Photo',
    close: 'Close',
  },
};

export function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Ime datoteke koje preživi Android, LINE i e-poštu: samo ASCII. Tajlandski naslov bez ijednog latiničnog znaka daje zadano ime. */
export function bookletFileName(title: string): string {
  const clean = String(title || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return `${clean || 'Painted-Shoes-Booklet'}.html`;
}

/** Odlomci odvojeni praznim retkom; novi redak unutar odlomka postaje <br>. Sve je escapeano. */
export function paragraphsHtml(text: string): string {
  return String(text ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/** Siguran izvor slike u atributu: samo data:image, http(s) i relativni putovi; nikad javascript: ni data:text/html. */
export function safeSrc(u: string): string {
  const s = String(u ?? '').trim();
  if (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(s)) return s;
  if (/^https?:\/\//i.test(s)) return s;
  return '';
}

export const defaultDraft = (lang: BookletLang = 'th'): BookletDraft => ({
  title: LABELS[lang].defaultTitle,
  subtitle: LABELS[lang].defaultSubtitle,
  lang,
  showPrices: true,
  coverShoeId: '',
  pages: [],
  orderNote: '',
  orderHeading: '',
  steps: [],
  stepsTitle: '',
  stepsBadge: '',
  waMessage: '',
});

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, max = 2000): string => (typeof v === 'string' ? v.slice(0, max) : '');

/**
 * Nacrt iz baze → uvijek ispravan oblik. Baza je javno čitljiva i stariji zapisi mogu nemati polja; sve što nije očekivanog oblika se izbacuje (a ne ruši sučelje),
 * stranica nepoznate vrste nestaje, a duljine su ograničene (zapis ne smije narasti).
 */
/** Dopuštene veličine stranice cipela: svaka stane na ekran bez skrolanja (2×1, 2×2, 3×2, 3×3). */
export const SHOES_PER_PAGE = [2, 4, 6, 9] as const;
export const DEFAULT_PER_PAGE = 6;
/** Samo dopuštene vrijednosti; sve ostalo (pokvaren zapis iz baze, string, 0, 5) ostaje prazno pa vrijedi zadano. */
export function cleanPerPage(v: unknown): number | undefined {
  return typeof v === 'number' && (SHOES_PER_PAGE as readonly number[]).includes(v) ? v : undefined;
}
export const perPageOf = (p: { perPage?: number }): number => cleanPerPage(p.perPage) ?? DEFAULT_PER_PAGE;
/** Cipele jedne stranice podijeljene na stranice knjižice po `perPage` komada; redoslijed ostaje kakav je. */
export function shoeChunks<T>(items: T[], perPage: number): T[][] {
  const n = cleanPerPage(perPage) ?? DEFAULT_PER_PAGE;
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}

export interface OutlineRow {
  /** Broj stranice u izvezenoj knjižici (naslovnica je 1). */
  no: number;
  kind: 'cover' | 'shoes' | 'photos' | 'text' | 'order';
  /** Id stranice u nacrtu (naslovnica i zadnja ga nemaju). */
  pageId: string | null;
  /** Za cipele: koji dio stranice u nacrtu je ovo (1 od 2…). */
  part: number;
  parts: number;
  shoeIds: string[];
}
/**
 * Što će TOČNO stajati na kojoj stranici knjižice — isto pravilo kao bookletPages (stranica bez ičega se izostavlja), pa broj stranice
 * koji Parry vidi u uređivaču je broj koji kupac vidi u knjižici. `usable` kaže koja cipela ima sliku (bez slike se ne crta).
 */
export function bookletOutline(draft: BookletDraft, usable: { shoe: (id: string) => boolean; photo?: (ref: string) => boolean }): OutlineRow[] {
  const rows: OutlineRow[] = [{ no: 1, kind: 'cover', pageId: null, part: 1, parts: 1, shoeIds: [] }];
  const add = (r: Omit<OutlineRow, 'no'>) => rows.push({ ...r, no: rows.length + 1 });
  for (const p of draft.pages) {
    if (p.type === 'shoes') {
      const chunks = shoeChunks(p.shoeIds.filter(usable.shoe), perPageOf(p));
      chunks.forEach((ids, i) => add({ kind: 'shoes', pageId: p.id, part: i + 1, parts: chunks.length, shoeIds: ids }));
    } else if (p.type === 'photos') {
      if (p.items.some((it) => (usable.photo ? usable.photo(it.ref) : true))) add({ kind: 'photos', pageId: p.id, part: 1, parts: 1, shoeIds: [] });
    } else if (p.heading.trim() || p.body.trim()) add({ kind: 'text', pageId: p.id, part: 1, parts: 1, shoeIds: [] });
  }
  add({ kind: 'order', pageId: null, part: 1, parts: 1, shoeIds: [] });
  return rows;
}

export function normalizeDraft(raw: unknown, uiLang: BookletLang = 'th'): BookletDraft {
  const base = defaultDraft(uiLang);
  if (!isObj(raw)) return base;
  const lang: BookletLang = raw.lang === 'en' ? 'en' : raw.lang === 'th' ? 'th' : base.lang;
  const pages: BookletPage[] = [];
  for (const p of Array.isArray(raw.pages) ? raw.pages.slice(0, 60) : []) {
    if (!isObj(p)) continue;
    const id = str(p.id, 40) || newPageId(pages);
    if (p.type === 'shoes') pages.push({ id, type: 'shoes', heading: str(p.heading, 120), shoeIds: (Array.isArray(p.shoeIds) ? p.shoeIds : []).filter((x): x is string => typeof x === 'string').slice(0, 200), note: str(p.note), perPage: cleanPerPage(p.perPage) });
    else if (p.type === 'photos')
      pages.push({
        id,
        type: 'photos',
        heading: str(p.heading, 120),
        items: (Array.isArray(p.items) ? p.items : []).filter(isObj).map((it) => ({ ref: str(it.ref, 900_000), caption: str(it.caption, 200) })).filter((it) => it.ref).slice(0, 60),
        note: str(p.note),
      });
    else if (p.type === 'text') pages.push({ id, type: 'text', heading: str(p.heading, 120), body: str(p.body, 6000) });
  }
  return {
    title: typeof raw.title === 'string' ? raw.title.slice(0, 120) : LABELS[lang].defaultTitle,
    subtitle: typeof raw.subtitle === 'string' ? raw.subtitle.slice(0, 160) : LABELS[lang].defaultSubtitle,
    lang,
    showPrices: raw.showPrices !== false,
    coverShoeId: str(raw.coverShoeId, 40),
    pages,
    orderNote: str(raw.orderNote, 2000),
    orderHeading: str(raw.orderHeading, 120),
    steps: (Array.isArray(raw.steps) ? raw.steps : [])
      .filter(isObj)
      .map((st) => ({ title: str(st.title, 120), desc: str(st.desc, 300) }))
      .filter((st) => st.title || st.desc)
      .slice(0, 6),
    stepsTitle: str(raw.stepsTitle, 120),
    stepsBadge: str(raw.stepsBadge, 80),
    waMessage: str(raw.waMessage, 600),
  };
}

export const newPageId = (pages: BookletPage[]): string => {
  let n = Date.now();
  while (pages.some((p) => p.id === `p${n}`)) n++;
  return `p${n}`;
};

/** Pomak stranice za jedno mjesto gore/dolje. Nepoznat id ili rub liste: popis ostaje isti (isti niz, ne kopija). */
export function movePage(pages: BookletPage[], id: string, dir: -1 | 1): BookletPage[] {
  const i = pages.findIndex((p) => p.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= pages.length) return pages;
  const out = pages.slice();
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/** Cipela se dodaje/miče sa stranice; ista se ne dodaje dvaput. */
export function toggleShoe(page: BookletShoesPage, shoeId: string): BookletShoesPage {
  const has = page.shoeIds.includes(shoeId);
  return { ...page, shoeIds: has ? page.shoeIds.filter((x) => x !== shoeId) : [...page.shoeIds, shoeId] };
}

/** Jedna stranica po kolekciji („Collection 1", „Collection 2"…), s cipelama koje su vidljive kupcima. Kolekcija bez ijedne cipele se preskače. */
export function autoPages(groups: { id: string; title: string }[], shoesByGroup: Record<string, string[]>, existing: BookletPage[] = []): BookletPage[] {
  const out: BookletPage[] = [];
  for (const g of groups) {
    const ids = shoesByGroup[g.id] ?? [];
    if (ids.length === 0) continue;
    out.push({ id: newPageId([...existing, ...out]), type: 'shoes', heading: g.title, shoeIds: ids, note: '' });
  }
  return out;
}

export interface BookletIssue {
  pageId: string | null;
  kind: 'empty-page' | 'unknown-shoe' | 'missing-photo' | 'no-pages';
  detail?: string;
}

/** Što je u nacrtu prazno ili pokvareno — sučelje to ispiše prije slanja, da kupac ne dobije praznu stranicu. */
export function draftIssues(draft: BookletDraft, shoeIds: ReadonlySet<string>): BookletIssue[] {
  const out: BookletIssue[] = [];
  if (draft.pages.length === 0) out.push({ pageId: null, kind: 'no-pages' });
  for (const p of draft.pages) {
    if (p.type === 'shoes') {
      const known = p.shoeIds.filter((id) => shoeIds.has(id));
      for (const id of p.shoeIds) if (!shoeIds.has(id)) out.push({ pageId: p.id, kind: 'unknown-shoe', detail: id });
      if (known.length === 0) out.push({ pageId: p.id, kind: 'empty-page' });
    } else if (p.type === 'photos') {
      if (p.items.length === 0) out.push({ pageId: p.id, kind: 'empty-page' });
    } else if (!p.body.trim() && !p.heading.trim()) out.push({ pageId: p.id, kind: 'empty-page' });
  }
  return out;
}

/** Kratka poruka uz privitak (LINE/WhatsApp), na jeziku knjižice. */
export function shareMessage(draft: BookletDraft, contact: BookletContact): string {
  const hello = draft.lang === 'th' ? 'สวัสดีค่ะ ส่งสมุดภาพมาให้ดูค่ะ' : 'Hi! Here is our booklet.';
  const how = draft.lang === 'th' ? 'สนใจอะไร ทักมาทาง LINE/WhatsApp ได้เลยค่ะ' : 'If something catches your eye, message us on LINE or WhatsApp.';
  return [hello, how, contact.businessName, contact.whatsappE164 ? `WhatsApp: +${contact.whatsappE164}` : '', contact.shopUrl].filter(Boolean).join('\n');
}

/** Kratki tekst cijene za karticu: „฿5,990" ili „from ฿4,990". */
export function priceText(range: { min: number; max: number } | null, fixed: boolean, lang: BookletLang, format: (n: number) => string): string {
  if (!range || !(range.min > 0)) return '';
  return fixed ? format(range.min) : `${LABELS[lang].priceFrom} ${format(range.min)}`;
}

const CHEVRON_L = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>';
const CHEVRON_R = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';
const BOOK = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/></svg>';

/** Listanje i povećanje slike — isti ponašanje kao knjižica na thailandboattours.com; bez vanjskih knjižnica (datoteka mora raditi i bez interneta). Nazivi tipki dolaze iz atributa. */
const SCRIPT = `(function(){
var pages=[].slice.call(document.querySelectorAll('[data-bk-page]'));
var n=pages.length,i=0;
var cnt=document.getElementById('bk-count'),prev=document.getElementById('bk-prev'),next=document.getElementById('bk-next'),
nextLbl=document.getElementById('bk-next-label'),dots=[].slice.call(document.querySelectorAll('[data-bk-dot]')),
body=document.getElementById('bk-body');
var LBL_NEXT=next.getAttribute('data-next'),LBL_RESTART=next.getAttribute('data-restart');
function show(k,dir){
 if(k<0||k>=n)return;i=k;
 pages.forEach(function(p,j){p.hidden=j!==k;p.classList.remove('bk-in-r','bk-in-l');});
 pages[k].classList.add(dir<0?'bk-in-l':'bk-in-r');
 cnt.textContent=String(k+1);
 prev.disabled=k===0;
 nextLbl.textContent=k===n-1?LBL_RESTART:LBL_NEXT;
 dots.forEach(function(d,j){d.setAttribute('aria-current',j===k?'true':'false');});
 if(body)body.scrollTop=0;
 try{history.replaceState(null,'','#p'+(k+1));}catch(e){}
}
prev.addEventListener('click',function(){show(i-1,-1);});
next.addEventListener('click',function(){show(i===n-1?0:i+1,1);});
dots.forEach(function(d,j){d.addEventListener('click',function(){show(j,j<i?-1:1);});});
var zEl=null,zImgs=[],zi=0;
function zClose(){if(zEl){zEl.parentNode.removeChild(zEl);zEl=null;}}
function zShow(k){if(!zEl||!zImgs.length)return;zi=(k+zImgs.length)%zImgs.length;zEl.querySelector('img').src=zImgs[zi];zEl.querySelector('[data-z-count]').textContent=(zi+1)+' / '+zImgs.length;}
function zBtn(label,aria,pos,fn){var b=document.createElement('button');b.type='button';b.textContent=label;b.setAttribute('aria-label',aria);
 b.style.cssText='position:absolute;'+pos+';background:rgba(15,23,42,.75);color:#fff;border:1px solid #334155;border-radius:9999px;width:44px;height:44px;font:28px/40px system-ui,sans-serif;cursor:pointer;padding:0';
 b.addEventListener('click',function(ev){ev.stopPropagation();fn();});return b;}
function zOpen(img){
 var pg=img.closest('[data-bk-page]')||document;
 zImgs=[].slice.call(pg.querySelectorAll('img')).filter(function(x){return !x.hasAttribute('data-bk-nozoom')&&(x.currentSrc||x.src);}).map(function(x){return x.currentSrc||x.src;});
 zi=Math.max(0,zImgs.indexOf(img.currentSrc||img.src));
 zClose();
 zEl=document.createElement('div');zEl.setAttribute('role','dialog');
 zEl.style.cssText='position:fixed;left:0;top:0;right:0;bottom:0;z-index:99999;background:rgba(2,6,23,.94);display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box';
 var im=document.createElement('img');im.alt='';im.style.cssText='max-width:100%;max-height:100%;object-fit:contain;border-radius:2px;box-shadow:0 10px 40px rgba(0,0,0,.5)';
 var c=document.createElement('span');c.setAttribute('data-z-count','');c.style.cssText='position:absolute;bottom:14px;left:0;right:0;text-align:center;color:#94a3b8;font:12px system-ui,sans-serif';
 zEl.appendChild(im);zEl.appendChild(c);
 zEl.appendChild(zBtn('×',next.getAttribute('data-close')||'Close','top:12px;right:12px',zClose));
 if(zImgs.length>1){zEl.appendChild(zBtn('‹','‹','left:12px;top:50%;margin-top:-22px',function(){zShow(zi-1);}));zEl.appendChild(zBtn('›','›','right:12px;top:50%;margin-top:-22px',function(){zShow(zi+1);}));}
 zEl.addEventListener('click',zClose);
 document.body.appendChild(zEl);zShow(zi);
}
if(body)body.addEventListener('click',function(e){var t=e.target;if(t&&t.tagName==='IMG'&&!t.hasAttribute('data-bk-nozoom'))zOpen(t);});
document.addEventListener('keydown',function(e){
 if(zEl){if(e.key==='Escape')zClose();else if(e.key==='ArrowRight')zShow(zi+1);else if(e.key==='ArrowLeft')zShow(zi-1);return;}
 if(e.key==='ArrowRight')show(Math.min(n-1,i+1),1);if(e.key==='ArrowLeft')show(Math.max(0,i-1),-1);});
var x0=null,y0=null;
document.addEventListener('touchstart',function(e){x0=e.touches[0].clientX;y0=e.touches[0].clientY;},{passive:true});
document.addEventListener('touchend',function(e){if(x0===null)return;var dx=e.changedTouches[0].clientX-x0,dy=e.changedTouches[0].clientY-y0;x0=null;
 if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.5){if(dx<0)show(Math.min(n-1,i+1),1);else show(Math.max(0,i-1),-1);}},{passive:true});
var m=/^#p(\\d+)$/.exec(location.hash||'');
show(m?Math.min(n,Math.max(1,+m[1]))-1:0,1);
})();`;

/** Okvir kao na thailandboattours.com (tamna traka #0F172A, smaragdna tipka, točkice) i stranice u izgledu trgovine (bijela podloga, crni okviri). Običan CSS: datoteka ne ovisi o Tailwindu. */
const CSS = `
*{box-sizing:border-box}
html,body{margin:0;min-height:100%;background:#0b1220;font-family:"Inter","Noto Sans Thai","Sukhumvit Set","Thonburi",Tahoma,system-ui,-apple-system,"Segoe UI",sans-serif;color:#1A1A1A}
.bk-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:8px}
.bk-shell{width:100%;max-width:896px}
.bk-frame{position:relative;width:100%;background:#fff;border:1px solid #e2e8f0;box-shadow:0 25px 50px -12px rgba(0,0,0,.5);border-radius:2px;overflow:hidden;display:flex;flex-direction:column;height:92vh;max-height:800px}
.bk-bar{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:#0F172A;color:#fff;border-bottom:1px solid #1e293b}
.bk-bar.bk-bottom{border-bottom:0;border-top:1px solid #1e293b}
.bk-title{display:flex;align-items:center;gap:8px;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.1em;min-width:0}
.bk-title span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#bk-body{flex:1;overflow-y:auto;padding:16px;background:#f8fafc;position:relative}
@media(min-width:640px){#bk-body{padding:24px}}
.bk-btn{display:flex;align-items:center;gap:6px;border:0;border-radius:2px;padding:6px 12px;font-family:inherit;font-weight:700;font-size:10px;line-height:1.2;text-transform:uppercase;letter-spacing:.05em;cursor:pointer;color:#fff}
#bk-prev{background:#1e293b}
#bk-prev:disabled{color:#475569;cursor:not-allowed}
#bk-next{background:#059669;padding:6px 16px}
.bk-dots{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:center}
[data-bk-dot]{width:8px;height:8px;border-radius:9999px;background:#475569;border:0;padding:0;cursor:pointer;transition:all .2s}
[data-bk-dot][aria-current=true]{background:#34d399;transform:scale(1.25)}
[data-bk-page][hidden]{display:none!important}
@keyframes bkR{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:none}}
@keyframes bkL{from{opacity:0;transform:translateX(-20px)}to{opacity:1;transform:none}}
.bk-in-r{animation:bkR .25s ease-in-out}.bk-in-l{animation:bkL .25s ease-in-out}
#bk-body img{cursor:zoom-in}
.bk-note{color:#94a3b8;font-size:11px;line-height:1.4;text-align:center;margin-top:8px}
/* stranice */
.pk-page{background:#FAF9F6;border:1px solid #1A1A1A;padding:20px;min-height:100%}
.pk-h{margin:0 0 4px;font-family:"Playfair Display","Noto Serif Thai",Georgia,serif;font-size:26px;line-height:1.25;font-weight:600}
.pk-sub{margin:0 0 16px;font-size:10px;text-transform:uppercase;letter-spacing:.2em;font-weight:700;opacity:.6}
.pk-rule{border:0;border-top:1px solid #1A1A1A;margin:0 0 16px}
.pk-cover{text-align:center}
.pk-cover img{width:100%;max-height:420px;object-fit:cover;border:1px solid #1A1A1A;margin-bottom:20px;display:block}
.pk-cover .pk-h{font-size:32px}
.pk-by{margin-top:24px;font-size:11px;text-transform:uppercase;letter-spacing:.2em;font-weight:700}
.pk-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
@media(min-width:640px){.pk-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
.pk-card{margin:0}
/* Stranica cipela stane na ekran bez skrolanja: mreža dijeli preostalu visinu, slika se prilagodi ćeliji (cijela cipela, ne izrezana). */
[data-bk-page]{height:100%}
.pk-fit{height:100%;min-height:380px;display:flex;flex-direction:column}
.pk-fit .pk-h{flex:none}
.pk-part{font-family:inherit;font-size:12px;font-weight:700;letter-spacing:.1em;opacity:.5;margin-left:8px;white-space:nowrap}
.pk-fit .pk-grid{flex:1;min-height:0;grid-template-columns:repeat(var(--c),minmax(0,1fr));grid-template-rows:repeat(var(--r),minmax(0,1fr));gap:10px}
.pk-n2{--c:1;--r:2}.pk-n4{--c:2;--r:2}.pk-n6{--c:2;--r:3}.pk-n9{--c:3;--r:3}
@media(min-width:640px){.pk-n2{--c:2;--r:1}.pk-n6{--c:3;--r:2}}
.pk-fit .pk-card{display:flex;flex-direction:column;min-height:0;min-width:0}
.pk-fit .pk-img{flex:1;min-height:0;aspect-ratio:auto;background:#f0f0f0}
.pk-fit .pk-img img{object-fit:contain}
.pk-fit .pk-cap{flex:none;margin-top:4px}
.pk-fit .pk-note{flex:none;margin-top:10px;font-size:12px}
.pk-img{position:relative;aspect-ratio:1/1;border:1px solid #1A1A1A;background:#f0f0f0;overflow:hidden}
.pk-more{position:absolute;right:6px;bottom:6px;background:rgba(15,23,42,.8);color:#fff;font-size:11px;font-weight:700;padding:2px 7px;border-radius:9999px;pointer-events:none}
.pk-img img{width:100%;height:100%;object-fit:cover;display:block}
.pk-cap{margin-top:6px;display:flex;flex-direction:column;gap:2px}
.pk-t{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;overflow-wrap:anywhere}
.pk-d{font-size:11px;line-height:1.35;opacity:.7;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.pk-p{font-size:11px;font-weight:700;color:#6b7280}
.pk-text p{margin:0 0 12px;font-size:14px;line-height:1.7}
.pk-note{margin-top:16px;font-size:13px;line-height:1.6;opacity:.8}
.pk-note p{margin:0 0 8px}
.pk-contact{display:grid;gap:10px;margin-top:18px}
@media(min-width:640px){.pk-contact{grid-template-columns:1fr 1fr}}
.pk-link{display:block;border:1px solid #1A1A1A;padding:12px 14px;color:#1A1A1A;text-decoration:none;background:#fff}
.pk-pill{display:inline-block;margin:0 0 14px;padding:4px 12px;border:1px solid #1A1A1A;border-radius:9999px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;background:#fff}
.pk-steps{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.pk-step{display:flex;gap:14px;align-items:flex-start;border:1px solid #1A1A1A;background:#fff;padding:14px}
.pk-step b{display:block;font-size:15px}
.pk-step p{margin:3px 0 0;font-size:13px;line-height:1.5;opacity:.75}
.pk-n{flex:none;width:30px;height:30px;border-radius:9999px;background:#1A1A1A;color:#FAF9F6;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px}
.pk-step-last{background:#1A1A1A;color:#FAF9F6}
.pk-step-last .pk-n{background:#FAF9F6;color:#1A1A1A}
.pk-step-last p{opacity:.85}
.pk-sub-contact{margin:20px 0 8px}
.pk-sub-first{margin:0 0 8px}
.pk-online{display:block;border:1px solid #1A1A1A;background:#fff;padding:14px;color:#1A1A1A;text-decoration:none;font-size:13px;line-height:1.5}
.pk-online b{display:block;margin-top:6px;font-size:12px;text-transform:uppercase;letter-spacing:.1em}
.pk-online-main{background:#1A1A1A;color:#FAF9F6;padding:18px;margin-bottom:6px}
.pk-online-main .pk-online-t{display:block;margin:0 0 4px;font-size:18px;text-transform:none;letter-spacing:0}
.pk-online-main span{display:block;opacity:.85}
.pk-online-main:hover{background:#000}
.pk-online+.pk-sub,.pk-steps+.pk-online{margin-top:10px}
.pk-online:hover{background:#1A1A1A;color:#FAF9F6}
.pk-owner{margin:0 0 6px;font-size:13px}.pk-owner span{opacity:.6}
.pk-care{margin-top:16px;padding:12px 14px;background:#F1EADB;border:1px solid #1A1A1A;font-size:12px;line-height:1.5}
.pk-link-main{background:#1A1A1A;color:#FAF9F6}
.pk-link-main:hover{background:#000}
.pk-link:hover{background:#1A1A1A;color:#FAF9F6}
.pk-link b{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.15em}
.pk-link span{display:block;font-size:14px;font-weight:600;margin-top:2px;overflow-wrap:anywhere}
.lang-th .pk-sub,.lang-th .pk-t,.lang-th .pk-by,.lang-th .pk-link b{letter-spacing:normal;text-transform:none}
.lang-th .pk-h{line-height:1.4}
@media print{
 html,body{background:#fff}.bk-wrap{display:block;padding:0}
 .bk-frame{height:auto!important;max-height:none!important;box-shadow:none!important;border:0!important}
 .bk-bar,.bk-note{display:none!important}
 #bk-body{overflow:visible!important;padding:0!important;background:#fff!important}
 [data-bk-page]{display:block!important;break-after:page;animation:none!important}
 [data-bk-page][hidden]{display:block!important}
 #bk-body img{cursor:auto}
 [data-bk-page]{height:auto!important}
 .pk-fit{height:auto!important;min-height:0!important}
 .pk-fit .pk-grid{grid-template-rows:none!important}
 .pk-fit .pk-img{flex:none!important;aspect-ratio:1/1!important}
}`;

function imgTag(src: string, alt: string, extra = ''): string {
  const s = safeSrc(src);
  return s ? `<img src="${escapeHtml(s)}" alt="${escapeHtml(alt)}" loading="lazy"${extra}>` : '';
}

function cardHtml(img: string[], title: string, sub: string, desc = ''): string {
  const [first, ...rest] = img.filter((u) => safeSrc(u));
  // Dodatne slike iste cipele (najviše 2) nisu u mreži — retci ostaju jednake visine — nego se listaju strelicama u povećanju; oznaka „+N" to kaže.
  const extras = rest.slice(0, 2).map((u) => imgTag(u, title)).join('');
  const more = extras ? `<span class="pk-more" aria-hidden="true">+${Math.min(rest.length, 2)}</span><span hidden>${extras}</span>` : '';
  return `<figure class="pk-card"><div class="pk-img">${first ? imgTag(first, title) : ''}${more}</div><figcaption class="pk-cap">${title ? `<span class="pk-t">${escapeHtml(title)}</span>` : ''}${sub ? `<span class="pk-p">${escapeHtml(sub)}</span>` : ''}${desc ? `<span class="pk-d">${escapeHtml(desc)}</span>` : ''}</figcaption></figure>`;
}

const heading = (h: string) => (h.trim() ? `<h2 class="pk-h">${escapeHtml(h)}</h2><hr class="pk-rule">` : '');

export interface OrderModel {
  heading: string;
  /** Kartica web trgovine: samo kad adresa postoji (gumb koji nikamo ne vodi gori je od nikakvog). */
  shop: { title: string; body: string; btn: string; url: string; display: string } | null;
  stepsTitle: string;
  badge: string;
  steps: BookletStep[];
  note: string;
  contactHeading: string;
  owner: { label: string; name: string } | null;
  contacts: { label: string; value: string; href: string; main?: boolean }[];
}

/** Sadržaj zadnje stranice, neovisno o načinu crtanja (HTML ili slika): jedno mjesto pravila, pa se oblici ne mogu razići. */
export function orderPageModel(input: BookletBuildInput): OrderModel {
  const { draft, contact } = input;
  const L = LABELS[draft.lang];
  const shopOk = /^https?:\/\//i.test(contact.shopUrl);
  const display = (u: string) => u.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  const msg = draft.waMessage.trim() || L.waHello;
  const contacts: OrderModel['contacts'] = [];
  const add = (href: string, label: string, value: string, main = false) => {
    if (href && value) contacts.push({ label, value, href, main });
  };
  add(contact.whatsappE164 ? `https://wa.me/${contact.whatsappE164}?text=${encodeURIComponent(msg)}` : '', 'WhatsApp', contact.whatsappE164 ? `+${contact.whatsappE164}` : '', true);
  add(contact.lineUrl, 'LINE', contact.lineDisplay || L.lineAdd);
  add(contact.phoneE164 ? `tel:+${contact.phoneE164}` : '', L.phone, contact.phoneDisplay);
  add(contact.email ? `mailto:${contact.email}` : '', L.email, contact.email);
  add(shopOk ? contact.shopUrl : '', L.website, display(contact.shopUrl));
  return {
    heading: draft.orderHeading.trim() || L.orderHeading,
    shop: shopOk ? { title: L.onlineOption, body: L.onlineBody, btn: L.onlineBtn, url: contact.shopUrl, display: display(contact.shopUrl) } : null,
    stepsTitle: draft.stepsTitle.trim(),
    badge: draft.stepsBadge.trim(),
    steps: draft.steps,
    note: draft.orderNote.trim(),
    contactHeading: L.contactHeading,
    owner: contact.ownerName ? { label: L.owner, name: contact.ownerName } : null,
    contacts,
  };
}

/** Stranice knjižice kao HTML nizovi (naslovnica prva, „kako naručiti i kontakt" zadnja). Stranica bez ičega za pokazati se izostavlja. */
export function bookletPages(input: BookletBuildInput): string[] {
  const { draft, shoes, photos, contact } = input;
  const L = LABELS[draft.lang];
  const byId = new Map(shoes.map((s) => [s.id, s] as const));
  const out: string[] = [];

  // naslovnica: cipela koju je Parry izabrala, inače prva slika koja postoji
  const coverShoe = byId.get(draft.coverShoeId);
  const firstImage =
    coverShoe?.images.find((u) => safeSrc(u)) ??
    draft.pages.flatMap((p) => (p.type === 'shoes' ? p.shoeIds.map((id) => byId.get(id)?.images[0] ?? '') : p.type === 'photos' ? p.items.map((it) => photos[it.ref] ?? '') : [])).find((u) => safeSrc(u)) ??
    '';
  out.push(
    `<section class="pk-page pk-cover">${firstImage ? imgTag(firstImage, draft.title) : ''}<h1 class="pk-h">${escapeHtml(draft.title || L.defaultTitle)}</h1>${draft.subtitle.trim() ? `<p class="pk-sub">${escapeHtml(draft.subtitle)}</p>` : ''}<p class="pk-by">${escapeHtml(contact.businessName)}</p></section>`,
  );

  for (const p of draft.pages) {
    if (p.type === 'shoes') {
      const usable = p.shoeIds.map((id) => byId.get(id)).filter((s): s is BookletShoe => !!s && s.images.some((u) => safeSrc(u)));
      const per = perPageOf(p);
      const chunks = shoeChunks(usable, per);
      chunks.forEach((chunk, i) => {
        const cards = chunk.map((s) => cardHtml(s.images, s.title, draft.showPrices ? s.priceText : '', s.desc ?? ''));
        const part = chunks.length > 1 ? `<span class="pk-part">${i + 1} / ${chunks.length}</span>` : '';
        const head = p.heading.trim() ? `<h2 class="pk-h">${escapeHtml(p.heading)}${part}</h2><hr class="pk-rule">` : part ? `<h2 class="pk-h">${part}</h2><hr class="pk-rule">` : '';
        const note = i === chunks.length - 1 && p.note.trim() ? `<div class="pk-note">${paragraphsHtml(p.note)}</div>` : '';
        out.push(`<section class="pk-page pk-fit">${head}<div class="pk-grid pk-n${per}">${cards.join('')}</div>${note}</section>`);
      });
    } else if (p.type === 'photos') {
      const cards = p.items.filter((it) => safeSrc(photos[it.ref] ?? '')).map((it) => cardHtml([photos[it.ref]], it.caption, ''));
      if (cards.length === 0) continue;
      out.push(`<section class="pk-page">${heading(p.heading)}<div class="pk-grid">${cards.join('')}</div>${p.note.trim() ? `<div class="pk-note">${paragraphsHtml(p.note)}</div>` : ''}</section>`);
    } else {
      if (!p.heading.trim() && !p.body.trim()) continue;
      out.push(`<section class="pk-page pk-text">${heading(p.heading)}${paragraphsHtml(p.body)}</section>`);
    }
  }

  // zadnja stranica: samo ono što korisnik stvarno ima (prazno polje se ne piše)
  const o = orderPageModel(input);
  const online = o.shop
    ? `<a class="pk-online pk-online-main" href="${escapeHtml(o.shop.url)}" target="_blank" rel="noopener noreferrer"><b class="pk-online-t">${escapeHtml(o.shop.title)}</b><span>${escapeHtml(o.shop.body)}</span><b>${escapeHtml(o.shop.btn)} →</b></a>`
    : '';
  const steps = o.steps.length
    ? `${o.stepsTitle ? `<h3 class="pk-sub pk-sub-contact">${escapeHtml(o.stepsTitle)}</h3>` : ''}${o.badge ? `<span class="pk-pill">${escapeHtml(o.badge)}</span>` : ''}<ol class="pk-steps">${o.steps
        .map((st, i) => `<li class="pk-step${i === o.steps.length - 1 ? ' pk-step-last' : ''}"><span class="pk-n">${i + 1}</span><div><b>${escapeHtml(st.title)}</b>${st.desc ? `<p>${escapeHtml(st.desc)}</p>` : ''}</div></li>`)
        .join('')}</ol>`
    : '';
  const owner = o.owner ? `<p class="pk-owner"><span>${escapeHtml(o.owner.label)}:</span> <b>${escapeHtml(o.owner.name)}</b></p>` : '';
  const links = o.contacts
    .map((c) => `<a class="pk-link${c.main ? ' pk-link-main' : ''}" href="${escapeHtml(c.href)}" target="_blank" rel="noopener noreferrer"><b>${escapeHtml(c.label)}</b><span>${escapeHtml(c.value)}</span></a>`)
    .join('');
  const hasContact = o.contacts.length > 0 || !!o.owner;
  out.push(
    `<section class="pk-page pk-order"><h2 class="pk-h">${escapeHtml(o.heading)}</h2><hr class="pk-rule">${online}${steps}${o.note ? `<div class="pk-note">${paragraphsHtml(o.note)}</div>` : ''}${hasContact ? `<h3 class="pk-sub pk-sub-contact">${escapeHtml(o.contactHeading)}</h3>${owner}<div class="pk-contact">${links}</div>` : ''}</section>`,
  );
  return out;
}

/** Cijela samostalna .html datoteka. */
export function buildBookletHtml(input: BookletBuildInput): string {
  const { draft, contact } = input;
  const L = LABELS[draft.lang];
  const pages = bookletPages(input);
  const n = pages.length;
  const title = escapeHtml(draft.title || L.defaultTitle);
  const pageHtml = pages.map((p, i) => `<div data-bk-page="${i + 1}"${i === 0 ? '' : ' hidden'}>${p}</div>`).join('\n');
  const dots = pages.map((_, i) => `<button type="button" data-bk-dot aria-label="${escapeHtml(L.page)} ${i + 1}" aria-current="${i === 0}"></button>`).join('');
  const footer = [contact.businessName, contact.shopUrl.replace(/^https?:\/\//i, '').replace(/\/$/, '')].filter(Boolean).join(' · ');
  return `<!doctype html>
<html lang="${draft.lang}" class="lang-${draft.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${CSS}</style>
</head>
<body class="lang-${draft.lang}">
<div class="bk-wrap">
<div class="bk-shell">
<div class="bk-frame">
<div class="bk-bar"><div class="bk-title">${BOOK}<span>${title} — ${escapeHtml(L.page)} <span id="bk-count">1</span> ${escapeHtml(L.of)} ${n}</span></div></div>
<div id="bk-body">
${pageHtml}
</div>
<div class="bk-bar bk-bottom">
<button type="button" id="bk-prev" class="bk-btn">${CHEVRON_L}<span>${escapeHtml(L.prev)}</span></button>
<div class="bk-dots">${dots}</div>
<button type="button" id="bk-next" class="bk-btn" data-next="${escapeHtml(L.next)}" data-restart="${escapeHtml(L.restart)}" data-close="${escapeHtml(L.close)}"><span id="bk-next-label">${escapeHtml(L.next)}</span>${CHEVRON_R}</button>
</div>
</div>
${footer ? `<p class="bk-note">${escapeHtml(footer)}</p>` : ''}
</div>
</div>
<script>${SCRIPT}</script>
</body>
</html>`;
}
