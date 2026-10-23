// Knjižica primjera (src/lib/booklet.ts): što kupac dobije u datoteci i što se nikad ne smije dogoditi (tuđi kod u HTML-u, prazna stranica, izmišljen kontakt).
// Pokretanje: npm test — pada s izlaznim kodom 1.
import assert from 'node:assert/strict';
import {
  BookletBuildInput,
  BookletContact,
  BookletDraft,
  BookletShoe,
  autoPages,
  bookletFileName,
  bookletOutline,
  cleanPerPage,
  perPageOf,
  shoeChunks,
  buildBookletHtml,
  bookletPages,
  defaultDraft,
  draftIssues,
  escapeHtml,
  movePage,
  normalizeDraft,
  paragraphsHtml,
  priceText,
  safeSrc,
  shareMessage,
  toggleShoe,
  type BookletPage,
  type BookletShoesPage,
} from '../src/lib/booklet';

let failed = 0;
const t = (name: string, fn: () => void) => {
  try {
    fn();
    console.log('ok  ', name);
  } catch (e) {
    failed++;
    console.error('FAIL', name, '\n    ', (e as Error).message.split('\n')[0]);
  }
};

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
const contact: BookletContact = {
  businessName: 'Painting Art',
  ownerName: 'Punika Chaiyawaeng',
  phoneDisplay: '+66 94 541 1179',
  phoneE164: '66945411179',
  whatsappE164: '66945411179',
  lineUrl: 'https://line.me/ti/p/XYZ',
  lineDisplay: '+66 64 948 8883',
  email: 'pa-2533@hotmail.com',
  shopUrl: 'https://shop.example.com/',
};
const shoes: BookletShoe[] = [
  { id: 'a', title: 'Cosmic Splash', images: [PNG, JPG, PNG], priceText: '฿5,990' },
  { id: 'b', title: 'Urban Drift', images: [JPG], priceText: 'from ฿4,990' },
  { id: 'c', title: 'Bez slike', images: [], priceText: '฿1' },
];
const page = (o: Partial<BookletShoesPage> = {}): BookletShoesPage => ({ id: 'p1', type: 'shoes', heading: 'Collection 1', shoeIds: ['a', 'b'], note: '', ...o });
const input = (draft: Partial<BookletDraft> = {}, extra: Partial<BookletBuildInput> = {}): BookletBuildInput => ({
  draft: { ...defaultDraft('en'), title: 'My booklet', pages: [page()], ...draft },
  shoes,
  photos: {},
  contact,
  ...extra,
});

// ---- Sigurnost HTML-a ----
t('naslov i tekstovi su escapeani (nema tuđeg koda)', () => {
  const html = buildBookletHtml(input({ title: '<script>alert(1)</script>"x"', subtitle: '<img src=x onerror=alert(2)>', pages: [page({ heading: '<b>h</b>', note: '<i>n</i>' })] }));
  assert.ok(!html.includes('<script>alert(1)'), 'naslov se izvršava');
  assert.ok(!/<img src=x onerror/.test(html), 'podnaslov se izvršava');
  assert.ok(!html.includes('<b>h</b>') && !html.includes('<i>n</i>'));
  assert.equal((html.match(/<script>/g) ?? []).length, 1, 'samo naša skripta');
});
t('safeSrc: javascript: i data:text/html se odbijaju, slike prolaze', () => {
  assert.equal(safeSrc('javascript:alert(1)'), '');
  assert.equal(safeSrc('data:text/html;base64,PHNjcmlwdD4='), '');
  assert.equal(safeSrc('data:image/svg+xml;base64,PHN2Zz4='), ''); // SVG može nositi skriptu
  assert.equal(safeSrc(PNG), PNG);
  assert.equal(safeSrc('https://x.test/a.jpg'), 'https://x.test/a.jpg');
  assert.equal(safeSrc(''), '');
});
t('slika s opasnim izvorom se ne ispisuje', () => {
  const html = buildBookletHtml(input({ pages: [page({ shoeIds: ['evil'] })] }, { shoes: [{ id: 'evil', title: 'E', images: ['javascript:alert(1)'], priceText: '' }] }));
  assert.ok(!html.includes('javascript:'));
});
t('odlomci: escape i prijelomi redaka', () => {
  assert.equal(paragraphsHtml('a\nb\n\n<x>'), '<p>a<br>b</p><p>&lt;x&gt;</p>');
  assert.equal(paragraphsHtml('  \n\n '), '');
});
t('skripta u datoteci je ispravna JavaScript (ne puca na predlošku)', () => {
  const html = buildBookletHtml(input());
  const src = html.match(/<script>([\s\S]*)<\/script>/)![1];
  assert.doesNotThrow(() => new Function(src));
  assert.ok(/\/\^#p\(\\d\+\)\$\//.test(src), 'regularni izraz za #p3 pokvaren');
});

// ---- Sadržaj ----
t('ispis: skrivene stranice se u ispisu prikazuju (pravilo mora nadjačati [hidden])', () => {
  const css = buildBookletHtml(input()).match(/@media print\{([\s\S]*?)\n\}/)![1];
  assert.ok(css.includes('[data-bk-page][hidden]{display:block!important'), 'u ispisu bi ostala samo trenutna stranica');
});
t('naslovnica + stranice + kako naručiti; točkice i brojač prate broj stranica', () => {
  const html = buildBookletHtml(input());
  assert.equal((html.match(/data-bk-page="\d+"/g) ?? []).length, 3);
  assert.equal((html.match(/data-bk-dot /g) ?? []).length, 3);
  assert.ok(/Page <span id="bk-count">1<\/span> of 3/.test(html));
});
t('stranica bez ijedne cipele sa slikom se izostavlja (kupac ne dobije praznu stranicu)', () => {
  const pages = bookletPages(input({ pages: [page({ shoeIds: ['c'] }), page({ id: 'p2', shoeIds: ['nepoznata'] })] }));
  assert.equal(pages.length, 2); // naslovnica + kako naručiti
});
t('cijene: uključene se vide, isključene ne (ni kao prazan redak)', () => {
  assert.ok(buildBookletHtml(input({ showPrices: true })).includes('฿5,990'));
  const off = buildBookletHtml(input({ showPrices: false }));
  assert.ok(!off.includes('฿5,990') && !off.includes('from ฿4,990') && !off.includes('class="pk-p"'));
});
t('kartica: jedna slika u mreži, dodatne (najviše 2) skrivene za povećanje s oznakom „+N"', () => {
  const html = bookletPages(input())[1];
  assert.equal((html.match(/<img /g) ?? []).length, 3 + 1); // a: glavna + 2 dodatne, b: 1
  assert.equal((html.match(/class="pk-more"[^>]*>\+2</g) ?? []).length, 1); // samo cipela 'a' ima dodatne
  assert.ok(!html.includes('pk-thumbs'));
  const extras = html.match(/<span hidden>(.*?)<\/span>/)![1];
  assert.equal((extras.match(/<img /g) ?? []).length, 2);
});
t('naslovnica: izabrana cipela, inače prva slika koja postoji', () => {
  assert.ok(bookletPages(input({ coverShoeId: 'b' }))[0].includes(JPG));
  assert.ok(bookletPages(input({ coverShoeId: '' }))[0].includes(PNG));
  assert.ok(!bookletPages(input({ pages: [] }))[0].includes('<img'), 'izmišljena naslovnica bez ijedne slike');
});
t('fotografije: samo one koje su stvarno učitane', () => {
  const draft: Partial<BookletDraft> = { pages: [{ id: 'f', type: 'photos', heading: 'Mine', items: [{ ref: 'img:1', caption: 'Rose' }, { ref: 'img:2', caption: 'Lost' }], note: '' }] };
  const html = bookletPages(input(draft, { photos: { 'img:1': PNG } }))[1];
  assert.ok(html.includes('Rose') && !html.includes('Lost'));
  assert.equal(bookletPages(input(draft, { photos: {} })).length, 2, 'stranica bez ijedne fotografije ostaje');
});
t('tekstna stranica: prazna se izostavlja', () => {
  const empty: BookletPage = { id: 't', type: 'text', heading: ' ', body: '' };
  assert.equal(bookletPages(input({ pages: [empty] })).length, 2);
  const full: BookletPage = { id: 't', type: 'text', heading: 'Hi', body: 'Body' };
  assert.equal(bookletPages(input({ pages: [full] })).length, 3);
});

// ---- Jezik ----
t('tajlandski: oznake, lang i klasa', () => {
  const html = buildBookletHtml(input({ lang: 'th' }));
  assert.ok(html.includes('lang="th"') && html.includes('ถัดไป') && html.includes('ก่อนหน้า') && html.includes('กลับหน้าแรก'));
  assert.ok(!html.includes('>Next<') && !html.includes('Prev'));
});
t('engleski: oznake', () => {
  const html = buildBookletHtml(input({ lang: 'en' }));
  assert.ok(html.includes('data-next="Next"') && html.includes('data-restart="Back to start"') && html.includes('How to order'));
});
t('zadnja stranica: narudžba u web trgovini je GLAVNA, na brodu samo uz pred-narudžbu (datum, brod, mjesto)', () => {
  const last = bookletPages(input()).at(-1)!;
  assert.ok(last.includes('pk-online-main') && last.includes('Order on our web store') && last.includes('href="https://shop.example.com/"'));
  assert.ok(last.indexOf('pk-online-main') < last.indexOf('Pre-order'), 'web trgovina dolazi prva');
  assert.ok(last.includes('Limited stock on board') && last.includes('pre-order only'));
  assert.ok(last.includes('Tell us the date, boat and place') && last.includes('(Phuket)'), 'mjesto zasad Phuket');
  assert.ok(!/crew carry sizes|upper deck|How to buy/i.test(last), 'bez tvrdnje da posada nosi sve brojeve');
  assert.ok(!/NARU|HRVATSKI|NAPOMENA|Ručno|kiše/i.test(last), 'nema hrvatskog');
  for (const lang of ['th', 'en'] as const) {
    const h = bookletPages({ ...input({ lang }) }).at(-1)!;
    assert.ok(h.includes('pk-online-main') && h.includes('pk-step-last') && (h.match(/<li class="pk-step/g) ?? []).length === 3);
  }
  const own = bookletPages(input({ orderNote: 'Ship in 7 days' })).at(-1)!;
  assert.ok(own.includes('Ship in 7 days') && own.includes('Tell us the date'), 'vlastiti tekst dolazi uz korake, ne umjesto njih');
});
t('pred-narudžba: WhatsApp poruka traži dizajn, broj, datum, brod i nosi mjesto; mjesto se mijenja ili izostavlja', () => {
  const wa = (draft: Partial<BookletDraft>) => decodeURIComponent((bookletPages(input(draft)).at(-1)!.match(/wa\.me\/66945411179\?text=([^"]+)"[^>]*><b>Pre-order/) ?? [])[1] ?? '');
  const m = wa({});
  assert.ok(/Design:/.test(m) && /Size:/.test(m) && /Date:/.test(m) && /Boat name:/.test(m) && /Place: Phuket/.test(m));
  const k = wa({ boatPlace: 'Krabi' });
  assert.ok(/Place: Krabi/.test(k) && !/Phuket/.test(k));
  assert.ok(!bookletPages(input({ boatPlace: 'Krabi' })).at(-1)!.includes('Phuket'));
  const none = bookletPages(input({ boatPlace: '' })).at(-1)!;
  assert.ok(!none.includes('()') && !/Place:/.test(wa({ boatPlace: '' })), 'bez mjesta nema praznih zagrada ni praznog retka');
});
t('normalizeDraft: boatPlace zadano Phuket, upisano se čuva, prazno ostaje prazno', () => {
  assert.equal(normalizeDraft({}, 'en').boatPlace, 'Phuket');
  assert.equal(normalizeDraft({ boatPlace: ' Krabi ' }, 'en').boatPlace, 'Krabi');
  assert.equal(normalizeDraft({ boatPlace: '' }, 'en').boatPlace, '');
  assert.equal(normalizeDraft({ boatPlace: 'x'.repeat(200) }, 'en').boatPlace.length, 60);
});
t('zadnja stranica: bez adrese trgovine nema web kartice, bez WhatsAppa nema pred-narudžbe', () => {
  const a = bookletPages(input({}, { contact: { ...contact, shopUrl: '' } })).at(-1)!;
  assert.ok(!a.includes('pk-online-main') && a.includes('Pre-order'));
  const b = bookletPages(input({}, { contact: { ...contact, whatsappE164: '' } })).at(-1)!;
  assert.ok(!b.includes('Pre-order on WhatsApp') && b.includes('pk-online-main'));
});

// ---- Kontakt: samo ono što trgovina ima ----
t('kontakt: WhatsApp s unaprijed upisanom porukom, LINE, telefon, e-pošta, web', () => {
  const last = bookletPages(input()).at(-1)!;
  assert.ok(last.includes('https://wa.me/66945411179?text=Hi!%20I%20saw'));
  assert.ok(last.includes('https://line.me/ti/p/XYZ') && last.includes('tel:+66945411179') && last.includes('mailto:pa-2533@hotmail.com') && last.includes('https://shop.example.com/'));
  assert.ok(last.includes('shop.example.com</span>') && !last.includes('>https://shop'), 'web se ispisuje bez https://');
});
t('kontakt: prazno polje se ne ispisuje (nema „mailto:" bez adrese ni lažnog weba)', () => {
  const last = bookletPages(input({}, { contact: { ...contact, email: '', shopUrl: 'localhost', whatsappE164: '', phoneE164: '', phoneDisplay: '' } })).at(-1)!;
  assert.ok(!last.includes('mailto:') && !last.includes('wa.me') && !last.includes('tel:') && !last.includes('>Website<'));
  assert.ok(last.includes('https://line.me'), 'LINE ostaje');
});
t('poruka uz privitak: na jeziku knjižice, s kontaktom', () => {
  const th = shareMessage(defaultDraft('th'), contact);
  assert.ok(th.includes('สวัสดีค่ะ') && th.includes('+66945411179') && th.includes('https://shop.example.com/'));
  assert.ok(shareMessage(defaultDraft('en'), { ...contact, whatsappE164: '', shopUrl: '' }).split('\n').every((l) => l.trim()), 'prazni retci');
});

// ---- Nacrt ----
t('movePage: pomak, rub i nepoznat id vraćaju isti niz', () => {
  const p = [page({ id: '1' }), page({ id: '2' }), page({ id: '3' })];
  assert.deepEqual(movePage(p, '2', -1).map((x) => x.id), ['2', '1', '3']);
  assert.deepEqual(movePage(p, '2', 1).map((x) => x.id), ['1', '3', '2']);
  assert.equal(movePage(p, '1', -1), p);
  assert.equal(movePage(p, '3', 1), p);
  assert.equal(movePage(p, 'x', 1), p);
});
t('toggleShoe: dodaje na kraj, ne duplicira, miče', () => {
  const p = page({ shoeIds: ['a'] });
  assert.deepEqual(toggleShoe(p, 'b').shoeIds, ['a', 'b']);
  assert.deepEqual(toggleShoe(toggleShoe(p, 'b'), 'b').shoeIds, ['a']);
  assert.deepEqual(toggleShoe(p, 'a').shoeIds, []);
});
t('autoPages: jedna stranica po kolekciji, prazne se preskaču, id-evi jedinstveni', () => {
  const out = autoPages([{ id: 'c1', title: 'Collection 1' }, { id: 'c2', title: 'Collection 2' }, { id: 'c3', title: 'Collection 3' }], { c1: ['a', 'b'], c3: ['c'] });
  assert.deepEqual(out.map((p) => (p as BookletShoesPage).heading), ['Collection 1', 'Collection 3']);
  assert.equal(new Set(out.map((p) => p.id)).size, 2);
});
t('draftIssues: nema stranica, prazna stranica, nepoznata cipela', () => {
  const known = new Set(['a', 'b']);
  assert.deepEqual(draftIssues({ ...defaultDraft(), pages: [] }, known).map((i) => i.kind), ['no-pages']);
  const issues = draftIssues({ ...defaultDraft(), pages: [page({ id: 'x', shoeIds: ['gone'] }), { id: 'y', type: 'photos', heading: '', items: [], note: '' }] }, known);
  assert.deepEqual(issues.map((i) => i.kind), ['unknown-shoe', 'empty-page', 'empty-page']);
  assert.deepEqual(draftIssues({ ...defaultDraft(), pages: [page()] }, known), []);
});
t('ime datoteke: samo ASCII, tajlandski naslov daje zadano ime', () => {
  assert.equal(bookletFileName('Hand-Painted Shoes — Examples!'), 'Hand-Painted-Shoes-Examples.html');
  assert.equal(bookletFileName('ตัวอย่างรองเท้าวาดมือ'), 'Painted-Shoes-Booklet.html');
  assert.equal(bookletFileName('Café ñandú'), 'Cafe-nandu.html');
  assert.ok(/^[A-Za-z0-9._-]+$/.test(bookletFileName('../../etc/passwd')));
});
t('cijena: ista za sve veličine bez „from", inače „from"; nema cijene → prazno', () => {
  const f = (n: number) => `฿${n}`;
  assert.equal(priceText({ min: 5990, max: 5990 }, true, 'en', f), '฿5990');
  assert.equal(priceText({ min: 4990, max: 5500 }, false, 'en', f), 'from ฿4990');
  assert.equal(priceText({ min: 4990, max: 5500 }, false, 'th', f), 'เริ่มต้น ฿4990');
  assert.equal(priceText(null, true, 'en', f), '');
  assert.equal(priceText({ min: 0, max: 0 }, true, 'en', f), '');
});
t('normalizeDraft: smeće iz baze daje ispravan nacrt, nepoznate stranice nestaju', () => {
  assert.deepEqual(normalizeDraft(null, 'en'), defaultDraft('en'));
  assert.deepEqual(normalizeDraft('x', 'th'), defaultDraft('th'));
  const d = normalizeDraft({ lang: 'xx', title: 5, pages: [null, { type: 'video' }, { type: 'shoes', shoeIds: ['a', 7, 'b'] }, { type: 'photos', items: [{ ref: '', caption: 'x' }, { ref: 'img:1' }] }, { type: 'text', body: 'b' }] }, 'en');
  assert.equal(d.lang, 'en');
  assert.equal(d.title, defaultDraft('en').title);
  assert.equal(d.pages.length, 3);
  assert.deepEqual((d.pages[0] as BookletShoesPage).shoeIds, ['a', 'b']);
  assert.equal(d.pages[1].type === 'photos' && d.pages[1].items.length, 1);
  assert.equal(new Set(d.pages.map((p) => p.id)).size, 3, 'id-evi moraju biti jedinstveni');
});
t('normalizeDraft: ograničene duljine; cijene uključene osim ako je izrijekom false', () => {
  const d = normalizeDraft({ title: 'x'.repeat(500), showPrices: false, pages: Array.from({ length: 200 }, () => ({ type: 'text', body: 'b' })) }, 'th');
  assert.equal(d.title.length, 120);
  assert.equal(d.pages.length, 60);
  assert.equal(d.showPrices, false);
  assert.equal(normalizeDraft({}, 'th').showPrices, true);
});
t('escapeHtml: sve opasne znakove', () => assert.equal(escapeHtml(`<a href="x">'&</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&lt;/a&gt;'));

// ---- stranice cipela stanu na ekran (21.10.2026., Vinko: „fit to screen / što ide na prvu page, drugu…") ----
const many: BookletShoe[] = Array.from({ length: 13 }, (_, i) => ({ id: `s${i + 1}`, title: `Shoe ${i + 1}`, images: [PNG], priceText: '฿1' }));
const manyInput = (pg: Partial<BookletShoesPage> = {}, extra: Partial<BookletBuildInput> = {}): BookletBuildInput => ({
  ...input({ pages: [page({ shoeIds: many.map((s) => s.id), ...pg })] }),
  shoes: [...shoes, ...many],
  ...extra,
});
const figs = (html: string) => (html.match(/<figure class="pk-card"/g) ?? []).length;
t('cipele se dijele na stranice po 6 (zadano): 13 cipela = 3 stranice, ništa se ne gubi ni ne dvostruko računa', () => {
  const pages = bookletPages(manyInput());
  assert.equal(pages.length, 1 + 3 + 1, 'naslovnica + 3 + zadnja');
  assert.deepEqual([1, 2, 3].map((i) => figs(pages[i])), [6, 6, 1]);
  assert.equal(pages.slice(1, 4).map((h) => h.match(/<img /g)?.length ?? 0).reduce((a, b) => a + b, 0), 13);
});
t('perPage 4 daje 2×2 mrežu i 4 stranice; nevaljana vrijednost pada na zadano', () => {
  const pages = bookletPages(manyInput({ perPage: 4 }));
  assert.equal(pages.length, 1 + 4 + 1);
  assert.ok(pages[1].includes('pk-fit') && pages[1].includes('pk-n4'));
  assert.equal(cleanPerPage(5), undefined);
  assert.equal(cleanPerPage('6'), undefined);
  assert.equal(cleanPerPage(0), undefined);
  assert.equal(perPageOf({ perPage: 99 }), 6);
  assert.equal(normalizeDraft({ pages: [{ type: 'shoes', shoeIds: ['a'], perPage: 9 }] }, 'en').pages[0].type === 'shoes' && (normalizeDraft({ pages: [{ type: 'shoes', shoeIds: ['a'], perPage: 9 }] }, 'en').pages[0] as BookletShoesPage).perPage, 9);
  assert.equal((normalizeDraft({ pages: [{ type: 'shoes', shoeIds: ['a'], perPage: 'x' }] }, 'en').pages[0] as BookletShoesPage).perPage, undefined);
});
t('nastavak stranice nosi isti naslov s oznakom „2 / 3”; jedna stranica bez oznake', () => {
  const pages = bookletPages(manyInput());
  assert.ok(pages[2].includes('Collection 1') && pages[2].includes('2 / 3'));
  assert.ok(!bookletPages(input())[1].includes('pk-part'));
});
t('napomena stranice ide samo na zadnji dio, ne ponavlja se', () => {
  const pages = bookletPages(manyInput({ note: 'Handmade' }));
  assert.deepEqual([1, 2, 3].map((i) => pages[i].includes('Handmade')), [false, false, true]);
});
t('cipele bez slike ne zauzimaju mjesto na stranici', () => {
  const pages = bookletPages({ ...manyInput({ shoeIds: ['c', ...many.slice(0, 6).map((s) => s.id)] }) });
  assert.equal(pages.length, 1 + 1 + 1, 'šest sa slikom stane na jednu stranicu');
  assert.equal(figs(pages[1]), 6);
});
t('shoeChunks: redoslijed ostaje, zadnji komad je ostatak', () => {
  assert.deepEqual(shoeChunks([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(shoeChunks([], 6), []);
});
t('pregled stranica u uređivaču: brojevi stranica i sadržaj isti kao u izvezenoj knjižici', () => {
  const inp = manyInput({ perPage: 4 });
  const usable = new Set(inp.shoes.filter((s) => s.images.length > 0).map((s) => s.id));
  const rows = bookletOutline(inp.draft, { shoe: (id) => usable.has(id) });
  assert.equal(rows.length, bookletPages(inp).length, 'isti broj stranica kao datoteka');
  assert.deepEqual(rows.map((r) => r.no), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(rows.map((r) => r.kind), ['cover', 'shoes', 'shoes', 'shoes', 'shoes', 'order']);
  assert.deepEqual(rows[1].shoeIds, ['s1', 's2', 's3', 's4']);
  assert.deepEqual([rows[4].part, rows[4].parts, rows[4].shoeIds], [4, 4, ['s13']]);
  // i s praznim i tekstualnim stranicama
  const mixed = bookletOutline(
    { ...inp.draft, pages: [page({ id: 'e', shoeIds: ['c'] }), { id: 't', type: 'text', heading: '', body: '' }, { id: 't2', type: 'text', heading: 'Care', body: 'x' }, page({ id: 'x', shoeIds: ['a'] })] },
    { shoe: (id) => usable.has(id) && id !== 'c' },
  );
  assert.deepEqual(mixed.map((r) => [r.no, r.pageId]), [[1, null], [2, 't2'], [3, 'x'], [4, null]]);
});

if (failed) {
  console.error(`\n${failed} testova palo`);
  process.exit(1);
}
console.log('\nbooklet: svi testovi prolaze');
