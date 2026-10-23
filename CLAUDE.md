# CLAUDE.md — Booklet Studio

Odgovaraj **hrvatski, koncizno**. Vlasnik (Vinko) nije tehnički: objašnjavaj jasno, bez žargona.

## Što je ovo
- Samostalna aplikacija (React + Vite, PWA) za izradu **knjižica** i **letaka** (prvi korisnik: Parry, slikane cipele; ali je opća). NIJE vezana uz trgovinu `parry-shoe-shop`.
- Podaci su u uređaju (IndexedDB) i radi se **bez interneta**. Uz prijavu Google (samo administratori Parryjeva dućana) usklađuju se između uređaja kroz Firebase projekt `payc-141f9`, kolekcija `studio` (pravila su u repou `parry-shoe-shop`, `firestore.rules`; objavljuju se same kad prođu testovi). Sigurnosna kopija je JSON datoteka (slike unutra) i ostaje kao zasebna zaštita. U repo NIKAD ne ide ništa osobno (telefon, slike, cijene) ni tajni ključevi; Firebase web-konfiguracija je javna.
- **Sinkronizacija** (`src/lib/sync.ts`, čisto, pod testom): svaki zapis (stavka, letak, slika stranice, knjižica, postavke, redoslijed) ima otisak; šalje se samo izmijenjeno, povlači samo novije od zadnjeg kruga (upit „što je novo", **bez slušatelja** — dnevna kvota čitanja dijeli se s dućanom). Sukob = lokalno pobjeđuje; brisanje je nadgrobna oznaka (`deleted`), ne pravo brisanje; početna/prazna knjižica i postavke se ne šalju i ne gaze ono što je već na poslužitelju; `uiLang` je lokalan. Zapis veći od `MAX_PAYLOAD` se ne šalje i to piše na ekranu (Firestore dokument ≤ 1 MiB). Stanje se na uređaj upisuje PRIJE evidencije „usklađeno" (inače pad usred kruga pošalje staro preko novog).
- Fotografije stranica „photos" su zasebni zapisi: stranica nosi samo id (`ph…`), slika je u `photos` (IndexedDB) — stari zapisi s cijelom slikom u stranici sele se sami pri učitavanju (`externalizePhotos`), a sigurnosna kopija ih vraća kao `data:` (`inlinePhotos`).
- `src/lib/firestoreRemote.ts` se prije promjena može provjeriti na emulatoru: `tests/remote.emulator.ts` (ručno, nije dio `npm test`).
- **Uvoz iz web-dućana** (`src/lib/shopImport.ts`, čisto, pod testom; dohvat je u `cloud.ts`): čita `app_data/main_app_state.pck_collection` i slike `shop_images/{id}` (javno čitljivo, **samo čita**, dućan se ne mijenja). Uvozi samo vidljive cipele koje još nisu uvezene (`Item.shopId`); uvezeno/uređeno se nikad ne gazi; slike se čitaju samo za nove cipele (svaka je jedno čitanje, kvota se dijeli s dućanom); cipela kojoj dohvat slike padne se NE uvozi napola. Cijena: `฿X`, ili `from ฿X` kad se po veličini mijenja (dućan raspon računa i iz zalihe — to se ovdje ne gleda). **NEPROVJERENO uživo** (iz sandboxa nema Firestorea): oblik dokumenta preuzet iz koda dućana (`lib/images.ts`, `cloudSync.ts`).
- Objava: GitHub Pages iz `main` (`.github/workflows/pages.yml`). `base: './'` u `vite.config.ts` mora ostati — radi na bilo kojoj putanji.

## Pravila
- **Sve što korisnik vidi: tajlandski i engleski** (`src/i18n.ts`, `LABELS` u `src/lib/booklet.ts`). Nikad hrvatski. Komentari u kodu su hrvatski.
- `src/lib/booklet.ts` je čista (bez ovisnosti) i **glavna kopija je OVDJE**. Trgovina `parry-shoe-shop` ima stariju, specijaliziranu kopiju za cipele; one se više ne usklađuju. U kodu se stavke još zovu shoe (povijest); korisnik to nikad ne vidi.
- Aplikacija je **opća** (proizvodi, usluge, ponude), ne samo cipele i brodske ture. Nikakav tekst o cipelama, brodovima ili Phuketu ne smije biti u zadanim vrijednostima; takvi tekstovi su samo **predlošci** koje korisnik sam uključi i uređuje (`boatTripPreset` u `studio.ts`).
- Kontakt se ne pogađa: telefon samo u međunarodnom obliku (`toE164`); broj s nulom na početku se odbija i to se piše na ekranu.
- Tihi `catch` je zabranjen: svaka radnja javlja uspjeh i grešku na ekranu.
- Provjera prije commita: `npm test && npx tsc --noEmit && npm run build`.
