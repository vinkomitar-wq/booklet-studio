// Slike stranica: prelamanje teksta, ZIP, i da model stranica za slike prati isti pravila kao HTML knjižica.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BookletBuildInput, BookletContact, BookletDraft, BookletShoe, bookletOutline, bookletPages, defaultDraft } from '../src/lib/booklet';
import { pageModels } from '../src/lib/pageModel';
import { crc32, makeZip } from '../src/lib/zip';
import { wrapText } from '../src/lib/wrap';

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

const m = (s: string) => s.length * 10; // svaki znak 10 px
const split = (s: string) => s.split(/(\s+)/).filter((x) => x !== '');

t('wrapText: lomi po riječima, ne prelazi širinu, čuva odlomke', () => {
  const lines = wrapText(m, 'aaaa bbbb cccc dddd', 90, { segment: split });
  assert.deepEqual(lines, ['aaaa bbbb', 'cccc dddd']);
  assert.ok(lines.every((l) => m(l) <= 90));
  assert.deepEqual(wrapText(m, 'ab\n\ncd', 100, { segment: split }), ['ab', '', 'cd']);
  assert.deepEqual(wrapText(m, '', 100, { segment: split }), []);
});
t('wrapText: preduga riječ se lomi po znakovima (tajlandski bez razmaka ne smije izaći iz okvira)', () => {
  const lines = wrapText(m, 'x'.repeat(25), 100, { segment: split });
  assert.ok(lines.length >= 3 && lines.every((l) => m(l) <= 100));
  assert.equal(lines.join(''), 'x'.repeat(25), 'ništa se ne gubi');
});
t('wrapText: maxLines završava s „…" i stane u širinu', () => {
  const lines = wrapText(m, 'one two three four five six seven eight', 80, { segment: split, maxLines: 2 });
  assert.equal(lines.length, 2);
  assert.ok(lines[1].endsWith('…') && m(lines[1]) <= 80);
  assert.equal(wrapText(m, 'short', 100, { segment: split, maxLines: 2 }).join('|'), 'short', 'kratko se ne dira');
});
t('wrapText: pravi Intl.Segmenter dijeli tajlandski na više od jedne riječi', () => {
  const lines = wrapText(m, 'สวัสดีครับยินดีต้อนรับสู่ร้านของเรา', 120);
  assert.ok(lines.length > 1 && lines.every((l) => m(l) <= 120));
});

t('zip: CRC32 poznate vrijednosti', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  assert.equal(crc32(new Uint8Array()), 0);
});
t('zip: neovisni alat (python zipfile) čita datoteke, nazive i sadržaj', () => {
  const files = [
    { name: 'Booklet-01.jpg', data: new Uint8Array([1, 2, 3, 250, 255]) },
    { name: 'Booklet-02.jpg', data: new Uint8Array(70000).map((_, i) => i % 251) },
  ];
  const dir = mkdtempSync(join(tmpdir(), 'zip-'));
  const path = join(dir, 'a.zip');
  writeFileSync(path, makeZip(files, new Date(2026, 9, 23, 18, 30, 10)));
  const out = execFileSync('python3', ['-I', '-c', 'import zipfile,sys,json;z=zipfile.ZipFile(sys.argv[1]);print(json.dumps({"bad":z.testzip(),"names":z.namelist(),"sizes":[len(z.read(n)) for n in z.namelist()],"first":list(z.read(z.namelist()[0]))}))', path]).toString();
  const r = JSON.parse(out);
  assert.equal(r.bad, null);
  assert.deepEqual(r.names, ['Booklet-01.jpg', 'Booklet-02.jpg']);
  assert.deepEqual(r.sizes, [5, 70000]);
  assert.deepEqual(r.first, [1, 2, 3, 250, 255]);
});

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const contact: BookletContact = { businessName: 'Studio', ownerName: 'Owner', phoneDisplay: '', phoneE164: '', whatsappE164: '66945411179', lineUrl: '', lineDisplay: '', email: '', shopUrl: 'https://shop.example.com/' };
const items: BookletShoe[] = Array.from({ length: 14 }, (_, i) => ({ id: `s${i + 1}`, title: `Item ${i + 1}`, images: i === 6 ? [] : [PNG], priceText: '฿1', desc: i === 0 ? 'desc' : '' }));
const build = (draft: Partial<BookletDraft>, photos: Record<string, string> = {}): BookletBuildInput => ({
  draft: { ...defaultDraft('en'), ...draft },
  shoes: items,
  photos,
  contact,
});
const shoesPage = (ids: string[], perPage?: number, extra: object = {}) => ({ id: 'p1', type: 'shoes' as const, heading: 'H', shoeIds: ids, note: '', perPage, ...extra });

t('model stranica za slike = HTML knjižica: isti broj stranica za više sastava (stavke bez slike, podjela, fotografije, prazne stranice)', () => {
  const ids = items.map((s) => s.id);
  const cases: [string, BookletBuildInput][] = [
    ['prazno', build({})],
    ['14 stavki po 6', build({ pages: [shoesPage(ids)] })],
    ['14 po 4', build({ pages: [shoesPage(ids, 4)] })],
    ['14 po 9', build({ pages: [shoesPage(ids, 9)] })],
    ['samo stavka bez slike', build({ pages: [shoesPage(['s7'])] })],
    ['dvije stranice + tekst + prazan tekst', build({ pages: [shoesPage(['s1', 's2']), { ...shoesPage(['s3']), id: 'p2' }, { id: 't1', type: 'text', heading: 'T', body: 'x' }, { id: 't2', type: 'text', heading: '', body: '' }] })],
    ['15 fotografija', build({ pages: [{ id: 'f', type: 'photos', heading: 'P', items: Array.from({ length: 15 }, (_, i) => ({ ref: `r${i}`, caption: '' })), note: '' }] }, Object.fromEntries(Array.from({ length: 15 }, (_, i) => [`r${i}`, PNG])))],
    ['fotografije bez učitane slike', build({ pages: [{ id: 'f', type: 'photos', heading: 'P', items: [{ ref: 'x', caption: '' }], note: '' }] })],
  ];
  for (const [name, input] of cases) {
    const usable = new Set(items.filter((s) => s.images.length > 0).map((s) => s.id));
    const html = bookletPages(input).length;
    const model = pageModels(input).length;
    const outline = bookletOutline(input.draft, { shoe: (id) => usable.has(id), photo: (ref) => !!input.photos[ref] }).length;
    assert.equal(model, html, `${name}: model ${model} ≠ html ${html}`);
    assert.equal(outline, html, `${name}: pregled ${outline} ≠ html ${html}`);
  }
});
t('model: stavke bez slike ne ulaze, cijene se skrivaju, opis i napomena samo na zadnjem dijelu', () => {
  const ids = items.map((s) => s.id);
  const pages = pageModels(build({ pages: [shoesPage(ids, 6, { note: 'Note' })], showPrices: false }));
  const grids = pages.filter((p) => p.kind === 'grid');
  assert.equal(grids.length, 3);
  const cells = grids.flatMap((g) => (g.kind === 'grid' ? g.cells : []));
  assert.equal(cells.length, 13, 'jedna bez slike izostavljena');
  assert.ok(cells.every((c) => c.price === ''));
  assert.equal(cells[0].desc, 'desc');
  assert.deepEqual(grids.map((g) => (g.kind === 'grid' ? g.note : 'x')), ['', '', 'Note']);
  assert.deepEqual(grids.map((g) => (g.kind === 'grid' ? [g.part, g.parts] : [])), [[1, 3], [2, 3], [3, 3]]);
});
t('model: naslovnica uzima izabranu, inače prvu sliku; zadnja stranica nosi korake i kontakt', () => {
  const p = pageModels(build({ pages: [shoesPage(['s1'])], steps: [{ title: 'A', desc: '' }], stepsBadge: 'B' }));
  assert.equal(p[0].kind, 'cover');
  assert.equal(p[0].kind === 'cover' && p[0].image, PNG);
  const last = p.at(-1)!;
  assert.ok(last.kind === 'order' && last.model.steps.length === 1 && last.model.badge === 'B' && last.model.contacts.some((c) => c.label === 'WhatsApp'));
});

if (failed) {
  console.error(`\n${failed} testova palo`);
  process.exit(1);
}
console.log('\nrender: svi testovi prolaze');
