# CLAUDE.md — Booklet Studio

Odgovaraj **hrvatski, koncizno**. Vlasnik (Vinko) nije tehnički: objašnjavaj jasno, bez žargona.

## Što je ovo
- Samostalna aplikacija (React + Vite, PWA) za izradu **knjižica** (i kasnije letaka) cipela koje Parry slika. NIJE vezana uz trgovinu `parry-shoe-shop`.
- Podaci su **samo u uređaju** (IndexedDB); sigurnosna kopija je JSON datoteka. Ništa se ne šalje na server. U repo NIKAD ne ide ništa osobno (telefon, slike, cijene).
- Objava: GitHub Pages iz `main` (`.github/workflows/pages.yml`). `base: './'` u `vite.config.ts` mora ostati — radi na bilo kojoj putanji.

## Pravila
- **Sve što korisnik vidi: tajlandski i engleski** (`src/i18n.ts`, `LABELS` u `src/lib/booklet.ts`). Nikad hrvatski. Komentari u kodu su hrvatski.
- `src/lib/booklet.ts` je čista (bez ovisnosti) i **glavna kopija je OVDJE**. Trgovina `parry-shoe-shop` ima stariju, specijaliziranu kopiju za cipele; one se više ne usklađuju. U kodu se stavke još zovu shoe (povijest); korisnik to nikad ne vidi.
- Aplikacija je **opća** (proizvodi, usluge, ponude), ne samo cipele i brodske ture. Nikakav tekst o cipelama, brodovima ili Phuketu ne smije biti u zadanim vrijednostima; takvi tekstovi su samo **predlošci** koje korisnik sam uključi i uređuje (`boatTripPreset` u `studio.ts`).
- Kontakt se ne pogađa: telefon samo u međunarodnom obliku (`toE164`); broj s nulom na početku se odbija i to se piše na ekranu.
- Tihi `catch` je zabranjen: svaka radnja javlja uspjeh i grešku na ekranu.
- Provjera prije commita: `npm test && npx tsc --noEmit && npm run build`.
