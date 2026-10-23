# Booklet Studio

Standalone web app for making **booklets** and **flyers** of painted shoes. Works on phone, tablet and PC, installs as an app, and works offline.

- Add shoes (photos, name, price) — stored **on the device** (IndexedDB) and works offline. Sign in with Google (shop admin accounts only) in Settings and the same data syncs between phone, tablet and PC.
- Build a booklet: pages of shoes (2 / 4 / 6 / 9 per page, each page fits the screen), own photo pages, text pages, "how to order" last page.
- Export one self-contained `.html` file (open anywhere, no internet needed) and share it through WhatsApp / LINE / mail.
- Backup file (JSON) to keep data safe and move it to another device.

## Develop

```
npm ci
npm run dev        # local
npm test           # booklet + app data tests
npm run build      # → dist/
```

Published by GitHub Pages from `main` (`.github/workflows/pages.yml`).
