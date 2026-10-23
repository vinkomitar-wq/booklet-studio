// Ručna provjera Firestore dijela na emulatoru (NIJE dio `npm test`; treba Java i firebase-tools):
//   cd <mapa s firebase.json za emulator, port 8097> && npx firebase-tools emulators:exec --only firestore --project demo-test "npx --prefix <booklet-studio> tsx <booklet-studio>/tests/remote.emulator.ts"
// Pravila baze se ovdje NE provjeravaju (to rade testovi u dućanu); provjerava se samo ponašanje povlačenja/slanja.
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase/app';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { makeRemote } from '../src/lib/firestoreRemote';
import { applyChanges, emptyMeta, snapshotOf, syncOnce, toRecords, type StudioState } from '../src/lib/sync';
import { defaultDraft } from '../src/lib/booklet';
import { defaultSettings } from '../src/lib/studio';

const db = getFirestore(initializeApp({ projectId: 'demo-test' }));
connectFirestoreEmulator(db, '127.0.0.1', 8097);
const remote = makeRemote(db);

const IMG = (n: number) => `data:image/jpeg;base64,${'A'.repeat(100_000)}${n}`;
const state: StudioState = {
  items: Array.from({ length: 110 }, (_, i) => ({ id: `i${i}`, title: `Item ${i}`, price: '', desc: '', images: [IMG(i)] })),
  flyers: [],
  draft: { ...defaultDraft('en'), title: 'Emulator' },
  settings: { ...defaultSettings('en'), businessName: 'Emu' },
  photos: {},
};
const a = await syncOnce(toRecords(state), emptyMeta('u'), remote);
assert.equal(a.pushError, undefined, a.pushError);
console.log('poslano', a.pushed, 'zapisa (110 stavki po ~100 KB: više paketa, jer paket smije imati do 2,5 MB)');
const blank: StudioState = { items: [], flyers: [], draft: defaultDraft('en'), settings: defaultSettings('en'), photos: {} };
const local = toRecords(blank);
const b = await syncOnce(local, emptyMeta('u'), remote);
const got = applyChanges(blank, b.changes, snapshotOf(local), 'en');
assert.equal(got.items.length, 110, 'stranice po 40 dokumenata: sve stignu');
assert.equal(got.draft.title, 'Emulator');
assert.equal(got.settings.businessName, 'Emu');
const again = await syncOnce(toRecords(got), b.meta, remote);
assert.equal(again.pushed, 0);
assert.equal(again.changes.upserts.length, 0, 'preklapanje (>=) ne izaziva izmjene');
// brisanje
const fewer = { ...got, items: got.items.slice(1) };
const del = await syncOnce(toRecords(fewer), again.meta, remote);
assert.equal(del.pushed, 2, 'nadgrobna oznaka + redoslijed');
const c = await syncOnce(toRecords(blank), emptyMeta('u'), remote);
const got2 = applyChanges(blank, c.changes, snapshotOf(toRecords(blank)), 'en');
assert.equal(got2.items.length, 109);
console.log('emulator OK');
process.exit(0);
