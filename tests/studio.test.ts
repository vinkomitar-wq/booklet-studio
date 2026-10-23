// Podaci aplikacije Booklet Studio: telefon bez pogađanja zemlje, ulaz za knjižicu, sigurnosna kopija (tuđa datoteka se odbija).
import assert from 'node:assert/strict';
import { defaultDraft } from '../src/lib/booklet';
import { normalizeFlyers } from '../src/lib/flyer';
import { boatTripPreset, defaultSettings, makeBackup, normalizeItems, normalizeSettings, parseBackup, settingsIssues, toBuildInput, toContact, toE164, type Item } from '../src/lib/studio';

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
const IMG = 'data:image/jpeg;base64,AAAA';

t('toE164: samo međunarodni oblik; nula na početku se NE pogađa (nema zemlje)', () => {
  assert.equal(toE164('+66 94 541 1179'), '66945411179');
  assert.equal(toE164('0066 94 541 1179'), '66945411179');
  assert.equal(toE164('+385 91 234 5678'), '385912345678');
  assert.equal(toE164('+1 (415) 555-0100'), '14155550100');
  assert.equal(toE164('094 541 1179'), '', 'broj s nulom nema pozivni broj zemlje');
  assert.equal(toE164('12345'), '');
  assert.equal(toE164('+' + '1'.repeat(20)), '');
  assert.equal(toE164(''), '');
});
t('settingsIssues: javlja krivi telefon i adresu bez http, prazno nije greška', () => {
  assert.deepEqual(settingsIssues(defaultSettings()), []);
  const s = { ...defaultSettings(), phone: '094', whatsapp: '+66945411179', shopUrl: 'shop.example.com', lineUrl: 'line.me/x' };
  assert.deepEqual(settingsIssues(s).map((i) => i.field).sort(), ['lineUrl', 'phone', 'shopUrl']);
});
t('toContact: neispravno se ne prosljeđuje (nema wa.me s pogrešnim brojem, nema adrese bez http)', () => {
  const c = toContact({ ...defaultSettings(), whatsapp: '0945411179', shopUrl: 'shop.example.com', lineUrl: 'nope' });
  assert.equal(c.whatsappE164, '');
  assert.equal(c.shopUrl, '');
  assert.equal(c.lineUrl, '');
});
t('normalizeItems: samo slike (data:image), najviše 3, jedinstveni id-evi, najviše 500', () => {
  const out = normalizeItems([
    { id: 'a', title: ' X ', price: '฿1', images: [IMG, 'http://x/y.jpg', 'javascript:alert(1)', IMG, IMG, IMG] },
    { id: 'a', title: 'Y', images: [] },
    null,
    'x',
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].title, 'X');
  assert.equal(out[0].images.length, 3);
  assert.notEqual(out[0].id, out[1].id);
  assert.equal(normalizeItems(Array.from({ length: 900 }, (_, i) => ({ id: `s${i}`, title: 't' }))).length, 500);
  assert.deepEqual(normalizeItems('nope'), []);
});
t('toBuildInput: samo korištene cipele; cijene se skrivaju kad je showPrices false', () => {
  const shoes: Item[] = [
    { id: 'a', title: 'A', price: '฿1', desc: 'opis', images: [IMG] },
    { id: 'b', title: 'B', price: '฿2', desc: '', images: [IMG] },
  ];
  const d = { ...defaultDraft('en'), pages: [{ id: 'p', type: 'shoes' as const, heading: '', shoeIds: ['a'], note: '' }] };
  const i = toBuildInput(d, shoes, defaultSettings());
  assert.deepEqual(i.shoes.map((s) => s.id), ['a']);
  assert.equal(i.shoes[0].priceText, '฿1');
  assert.equal(toBuildInput({ ...d, showPrices: false }, shoes, defaultSettings()).shoes[0].priceText, '');
});
t('sigurnosna kopija: krug (spremi → učitaj) čuva sve; tuđa/oštećena/novija datoteka se odbija', () => {
  const shoes: Item[] = [{ id: 'a', title: 'A', price: '฿1', desc: 'opis', images: [IMG] }];
  const settings = normalizeSettings({ businessName: 'Studio', uiLang: 'th' });
  const draft = { ...defaultDraft('th'), title: 'Moja' };
  const flyers = normalizeFlyers([{ id: 'f1', name: 'A', layout: 'two', paper: 'A5', lang: 'th', title: 'T', itemIds: ['a'] }]);
  const text = JSON.stringify(makeBackup(shoes, settings, draft, flyers, new Date('2026-10-23T10:00:00Z')));
  const r = parseBackup(text);
  assert.ok(r.ok);
  if (r.ok) {
    assert.deepEqual(r.items, shoes);
    assert.equal(r.settings.businessName, 'Studio');
    assert.equal(r.draft.title, 'Moja');
    assert.deepEqual(r.flyers, flyers, 'letci putuju u kopiji');
  }
  assert.deepEqual(parseBackup('{not json'), { ok: false, reason: 'not-json' });
  assert.deepEqual(parseBackup('{"app":"other","items":[]}'), { ok: false, reason: 'not-ours' });
  assert.deepEqual(parseBackup('[]'), { ok: false, reason: 'not-ours' });
  assert.deepEqual(parseBackup(JSON.stringify({ app: 'booklet-studio', version: 99, items: [] })), { ok: false, reason: 'newer' });
});

t('stara sigurnosna kopija (verzija 1, „shoes") se i dalje čita; stavke dobivaju prazan opis', () => {
  const old = JSON.stringify({ app: 'booklet-studio', version: 1, savedAt: 'x', shoes: [{ id: 'a', title: 'A', price: '฿1', images: [IMG] }], settings: {}, draft: {} });
  const r = parseBackup(old);
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.items.map((i) => [i.id, i.title, i.desc]), [['a', 'A', '']]);
});
t('kopija iz verzije 2 (bez letaka) se čita, letci su prazni', () => {
  const v2 = JSON.stringify({ app: 'booklet-studio', version: 2, items: [{ id: 'a', title: 'A', images: [IMG] }], settings: {}, draft: {} });
  const r = parseBackup(v2);
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.flyers, []);
});
t('toBuildInput prenosi opis stavke', () => {
  const items: Item[] = [{ id: 'a', title: 'A', price: '', desc: 'Handmade', images: [IMG] }];
  const d = { ...defaultDraft('en'), pages: [{ id: 'p', type: 'shoes' as const, heading: '', shoeIds: ['a'], note: '' }] };
  assert.equal(toBuildInput(d, items, defaultSettings()).shoes[0].desc, 'Handmade');
});
t('predložak „brodska tura": mjesto upisuje korisnik; prazno mjesto se izostavlja; th i en; nema hrvatskog', () => {
  const en = boatTripPreset('en', 'Phuket');
  assert.equal(en.steps.length, 3);
  assert.ok(en.steps[1].desc.includes('(Phuket)') && en.waMessage.includes('Place: Phuket'));
  const krabi = boatTripPreset('en', ' Krabi ');
  assert.ok(krabi.waMessage.includes('Place: Krabi') && !JSON.stringify(krabi).includes('Phuket'));
  const none = boatTripPreset('en', '');
  assert.ok(!none.steps[1].desc.includes('()') && !/Place:/.test(none.waMessage));
  const th = boatTripPreset('th', 'Phuket');
  assert.ok(th.steps[1].desc.includes('(Phuket)') && th.waMessage.includes('Phuket'));
  assert.ok(!/NARU|HRVATSKI|Ručno|kiše/i.test(JSON.stringify([en, th])));
});

if (failed) {
  console.error(`\n${failed} testova palo`);
  process.exit(1);
}
console.log('\nstudio: svi testovi prolaze');
