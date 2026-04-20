# Mobile Simulator — Chrome Extension

Preview any website inside an accurately sized mobile or tablet viewport. One click to pick a device, the current page is reloaded inside an iframe sized exactly like a real iPhone, Pixel, Galaxy, iPad, etc.

> **Status:** v0.1 — early, but functional. Open source under the [MIT license](LICENSE).

## Features (v0.1)

- **One-click toggle**: clicking the toolbar icon instantly emulates the current page using your last-used device (defaults to iPhone 15 the first time). Click again to exit.
- **In-overlay controls**: a top bar shows the active device + dimensions; a right-side sidebar holds **Close**, **Change device** (opens an inline picker with search), and **Rotate** (portrait ↔ landscape).
- 25+ curated device presets (iPhone SE → 16 Pro Max, Pixel 7–9, Galaxy S23/S24, iPad mini/Air/Pro, Galaxy Tab, and more).
- Pixel-accurate viewport sizing (DPR is recorded but not yet faked inside the iframe — see Limitations).
- Per-tab activation; switch tabs without losing the page you're working on.
- Bypasses common framing blockers (`X-Frame-Options`, CSP `frame-ancestors`) only on the active tab while emulation is on.
- Last-used device + orientation are remembered across tabs and sessions.
- Keyboard shortcut: `Esc` closes the overlay.

## Roadmap

| Feature | Status |
| --- | --- |
| Viewport sizing | ✅ v0.1 |
| One-click toggle + in-overlay controls | ✅ v0.1 |
| Rotate portrait / landscape | ✅ v0.1 |
| Last-device memory + per-tab activation | ✅ v0.1 |
| User-Agent spoofing | 🛠 v0.2 |
| Touch event simulation | 🛠 v0.2 |
| Device frames (bezel / notch) | 🛠 v0.3 |
| Screenshot the emulated viewport | 🛠 v0.3 |
| Custom user-defined devices | 🛠 v0.3 |

Issues are open for each — contributions welcome (see [CONTRIBUTING.md](CONTRIBUTING.md)).

## Install (from source)

Until the extension is published to the Chrome Web Store, install it locally:

1. Clone the repo and build:
   ```bash
   git clone https://github.com/TheDukeElephant/mobile-simulator-chrome-extension.git
   cd mobile-simulator-chrome-extension
   npm install
   npm run build
   ```
2. Open `chrome://extensions` in Chrome.
3. Toggle **Developer mode** (top right).
4. Click **Load unpacked** and select the generated `dist/` folder.
5. Pin the extension's icon to the toolbar.

## Usage

1. Open any website.
2. Click the **Mobile Simulator** toolbar icon — the page is instantly reloaded inside your last-used device's viewport.
3. Use the right-side sidebar:
   - **✕** — close emulation (or press `Esc`).
   - **Devices** — open the picker to switch devices.
   - **↻** — toggle portrait ↔ landscape.
4. Click the toolbar icon again to exit.

## How it works

- A **content script** injects a Shadow-DOM-isolated overlay containing an `<iframe>` set to `window.location.href` with the chosen device's dimensions. The overlay also hosts the top info bar, right-side sidebar, and inline device picker.
- A **service worker** registers per-tab `declarativeNetRequest` session rules that strip `X-Frame-Options` and `Content-Security-Policy` (frame-ancestors) headers — only on the tab being emulated, only while emulation is active. Rules are cleaned up automatically on stop or tab close.
- The **toolbar action** has no popup; clicking it directly toggles emulation. Device + orientation choices made inside the overlay are sent to the service worker via typed message contracts (`src/shared/messages.ts`).

## Limitations

- **`window.devicePixelRatio`** inside the iframe still reflects the real display, not the emulated device. Faking DPR requires the Chrome DevTools Protocol (`chrome.debugger`), which is being explored for v0.2.
- **User-Agent** is not spoofed in v0.1, so server-rendered mobile/desktop variants depend on the `Sec-CH-UA-Mobile` / UA your real browser sends. Coming in v0.2.
- **Same-origin iframe restrictions** still apply. Some pages may behave subtly differently (e.g. sites that detect being framed via JS rather than headers).
- Sites delivered with extremely strict CSPs that pin specific `frame-ancestors` allow-lists at the application layer (not just headers) may still refuse to render.

## Contributing

PRs and issues are very welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, conventions, and project layout.

## License

[MIT](LICENSE) © TheDukeElephant and Mobile Simulator contributors.
