# CLAUDE.md — Booklet Studio

Odgovaraj **hrvatski, koncizno**. Vlasnik (Vinko) nije tehnički: objašnjavaj jasno, bez žargona.

## Što je ovo
- Samostalna aplikacija (React + Vite, PWA) za izradu **knjižica** (i kasnije letaka) cipela koje Parry slika. NIJE vezana uz trgovinu `parry-shoe-shop`.
- Podaci su **samo u uređaju** (IndexedDB); sigurnosna kopija je JSON datoteka. Ništa se ne šalje na server. U repo NIKAD ne ide ništa osobno (telefon, slike, cijene).
- Objava: GitHub Pages iz `main` (`.github/workflows/pages.yml`). `base: './'` u `vite.config.ts` mora ostati — radi na bilo kojoj putanji.

## Pravila
- **Sve što korisnik vidi: tajlandski i engleski** (`src/i18n.ts`, `LABELS` u `src/lib/booklet.ts`). Nikad hrvatski. Komentari u kodu su hrvatski.
- `src/lib/booklet.ts` je **ista datoteka** kao u `parry-shoe-shop` (čista, bez ovisnosti). Mijenja li se pravilo knjižice, mijenja se u oba repoa.
- Kontakt se ne pogađa: telefon samo u međunarodnom obliku (`toE164`); broj s nulom na početku se odbija i to se piše na ekranu.
- Tihi `catch` je zabranjen: svaka radnja javlja uspjeh i grešku na ekranu.
- Provjera prije commita: `npm test && npx tsc --noEmit && npm run build`.
