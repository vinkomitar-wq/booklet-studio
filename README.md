# Booklet Studio

Standalone web app for making **booklets** (and later flyers) of painted shoes. Works on phone, tablet and PC, installs as an app, and works offline.

- Add shoes (photos, name, price) — everything is stored **on the device** (IndexedDB), nothing is sent to a server.
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
