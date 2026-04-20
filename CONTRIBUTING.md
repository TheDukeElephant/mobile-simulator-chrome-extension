# Contributing

Thanks for your interest in contributing to **Mobile Simulator**! This project is an open-source Chrome extension intended to make mobile / tablet UI testing one-click easy.

## Getting started

```bash
git clone https://github.com/TheDukeElephant/mobile-simulator-chrome-extension.git
cd mobile-simulator-chrome-extension
npm install
npm run dev   # HMR build, writes to dist/
```

Then load the `dist/` folder via `chrome://extensions` → **Developer mode** → **Load unpacked**.

For a production-style build:

```bash
npm run build
```

## Project layout

```
src/
  background/
    service-worker.ts   # message router, scripting injection, badge
    dnr-rules.ts        # per-tab DNR session rules (strip X-Frame-Options, CSP)
  content/
    overlay.ts          # injected overlay + iframe
    overlay.css         # host-page styles for the overlay root
  devices/
    devices.json        # curated device catalog
    index.ts            # typed loader
  popup/
    index.html
    popup.ts            # device picker UI
    popup.css
  shared/
    messages.ts         # typed message contracts (popup ↔ sw ↔ content)
  manifest.ts           # MV3 manifest definition (consumed by @crxjs/vite-plugin)
public/icons/           # extension icons
scripts/
  generate-icons.mjs    # placeholder icon generator
```

## Conventions

- **TypeScript strict mode.** Prefer narrow types and avoid `any`.
- **Formatting:** Prettier (config in `.prettierrc.json`), 100-char width, single quotes, trailing commas.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`…). Keep them small and focused.
- **PRs:** Reference an issue when applicable. Include a screenshot or short clip if you change UI.

## Adding a device

Edit `src/devices/devices.json` and append an entry. Keep the list sorted within each category. Use real CSS-pixel viewport dimensions (not physical pixel counts).

```json
{
  "id": "kebab-case-id",
  "name": "Display Name",
  "category": "phone",
  "width": 390,
  "height": 844,
  "devicePixelRatio": 3,
  "userAgent": "Mozilla/5.0 …"
}
```

## Filing bugs

Please include:

- The site you tested on (URL).
- The device preset you picked.
- Chrome version.
- Console output from the extension's service worker (`chrome://extensions` → click **service worker** under the extension).

## Licensing

By contributing, you agree your contributions are licensed under the [MIT License](LICENSE).
