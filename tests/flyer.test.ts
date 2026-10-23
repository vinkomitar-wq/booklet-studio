// Letak: broj stavki po predlošku, normalizacija, model za crtanje (kontakt, QR, cijene), upozorenja.
import assert from 'node:assert/strict';
import { BookletContact } from '../src/lib/booklet';
import { FLYER_SLOTS, Flyer, flyerIssues, flyerModel, newFlyer, normalizeFlyers, setLayout, toggleFlyerItem } from '../src/lib/flyer';
import type { Item } from '../src/lib/studio';

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
const items: Item[] = [
  { id: 'a', title: 'A', price: '฿1', desc: 'da', images: [IMG] },
  { id: 'b', title: 'B', price: '฿2', desc: '', images: [IMG] },
  { id: 'c', title: 'C', price: '', desc: '', images: [] },
  { id: 'd', title: 'D', price: '฿4', desc: '', images: [IMG] },
  { id: 'e', title: 'E', price: '฿5', desc: '', images: [IMG] },
  { id: 'f', title: 'F', price: '฿6', desc: '', images: [IMG] },
];
const contact: BookletContact = { businessName: 'S', ownerName: '', phoneDisplay: '+66 94', phoneE164: '6694', whatsappE164: '66945411179', lineUrl: 'https://line.me/x', lineDisplay: '', email: 'a@b.co', shopUrl: 'https://shop.example.com/' };
const flyer = (o: Partial<Flyer> = {}): Flyer => ({ ...newFlyer('en'), layout: 'grid4', itemIds: ['a', 'b'], ...o });

t('predlošci: 1, 2 i 4 stavke', () => assert.deepEqual(FLYER_SLOTS, { feature: 1, two: 2, grid4: 4 }));
t('normalizeFlyers: smeće daje ispravne letke, višak stavki iznad predloška otpada, jedinstveni id-evi', () => {
  const out = normalizeFlyers([{ id: 'x', layout: 'feature', itemIds: ['a', 'b', 'c'], paper: 'A9', lang: 'xx', title: ' T ' }, { id: 'x', layout: 'nepoznato' }, null, 'junk', { id: 'z', itemIds: [1, 'q'], showQr: false }], 'th');
  assert.equal(out.length, 3);
  assert.deepEqual(out[0].itemIds, ['a'], 'feature drži jednu stavku');
  assert.equal(out[0].paper, 'A4');
  assert.equal(out[0].lang, 'th');
  assert.equal(out[0].title, 'T');
  assert.equal(out[1].layout, 'grid4');
  assert.notEqual(out[0].id, out[1].id);
  assert.deepEqual(out[2].itemIds, ['q']);
  assert.equal(out[2].showQr, false);
  assert.deepEqual(normalizeFlyers('nope'), []);
  assert.equal(normalizeFlyers(Array.from({ length: 300 }, (_, i) => ({ id: `i${i}` }))).length, 100);
});
t('setLayout: manji predložak skraćuje popis (redoslijed ostaje)', () => {
  assert.deepEqual(setLayout(flyer({ itemIds: ['a', 'b', 'd', 'e'] }), 'two').itemIds, ['a', 'b']);
  assert.deepEqual(setLayout(flyer({ itemIds: ['a', 'b'] }), 'grid4').itemIds, ['a', 'b']);
});
t('toggleFlyerItem: dodaje, miče, a pun predložak ODBIJA novu stavku (ne istiskuje staru)', () => {
  const f = flyer({ layout: 'two', itemIds: ['a', 'b'] });
  const r = toggleFlyerItem(f, 'd');
  assert.equal(r.full, true);
  assert.deepEqual(r.flyer.itemIds, ['a', 'b']);
  assert.deepEqual(toggleFlyerItem(f, 'a').flyer.itemIds, ['b']);
  assert.deepEqual(toggleFlyerItem(flyer({ itemIds: ['a'] }), 'b').flyer.itemIds, ['a', 'b']);
});
t('flyerModel: stavke bez slike i nepostojeće ne ulaze, cijene se skrivaju, opis ide uz stavku', () => {
  const m = flyerModel(flyer({ itemIds: ['a', 'c', 'zz', 'b'] }), items, contact);
  assert.deepEqual(m.cells.map((c) => c.title), ['A', 'B']);
  assert.equal(m.cells[0].desc, 'da');
  assert.deepEqual(flyerModel(flyer({ showPrices: false }), items, contact).cells.map((c) => c.price), ['', '']);
});
t('flyerModel: kontakt samo što postoji; QR vodi na web, inače na WhatsApp, inače nema; isključen QR = nema', () => {
  const m = flyerModel(flyer(), items, contact);
  assert.deepEqual(m.contacts.map((c) => c.label), ['WhatsApp', 'LINE', 'Phone', 'Email', 'Website']);
  assert.equal(m.qr, 'https://shop.example.com/');
  assert.equal(m.contacts.find((c) => c.label === 'Website')?.value, 'shop.example.com');
  assert.equal(flyerModel(flyer(), items, { ...contact, shopUrl: '' }).qr, 'https://wa.me/66945411179');
  assert.equal(flyerModel(flyer(), items, { ...contact, shopUrl: '', whatsappE164: '' }).qr, null);
  assert.equal(flyerModel(flyer({ showQr: false }), items, contact).qr, null);
  const bare = flyerModel(flyer(), items, { ...contact, whatsappE164: '', lineUrl: '', lineDisplay: '', phoneDisplay: '', phoneE164: '', email: '', shopUrl: '' });
  assert.deepEqual(bare.contacts, [], 'prazno se ne ispisuje');
});
t('flyerModel: jezik letka bira oznake (th)', () => {
  const m = flyerModel(flyer({ lang: 'th' }), items, contact);
  assert.ok(m.contacts.some((c) => c.label === 'อีเมล'));
});
t('flyerIssues: nema stavki, nepostojeća stavka', () => {
  assert.deepEqual(flyerIssues(flyer({ itemIds: [] }), items), ['no-items']);
  assert.deepEqual(flyerIssues(flyer({ itemIds: ['c'] }), items), ['no-items']);
  assert.deepEqual(flyerIssues(flyer({ itemIds: ['a', 'zz'] }), items), ['missing-items']);
  assert.deepEqual(flyerIssues(flyer({ itemIds: ['a'] }), items), []);
});

if (failed) {
  console.error(`\n${failed} testova palo`);
  process.exit(1);
}
console.log('\nflyer: svi testovi prolaze');
