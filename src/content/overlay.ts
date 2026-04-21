import {
  getChassis,
  getChromeLayout,
  getDeviceById,
  getDevices,
  type Device,
} from '../devices';
import type {
  EmulateStartMessage,
  EmulateStoppedNotice,
  ExtensionMessage,
  Orientation,
  RotateMessage,
  SelectDeviceMessage,
} from '../shared/messages';

const ROOT_ID = '__mobile_simulator_root__';

interface OverlayHandle {
  root: HTMLElement;
  shadow: ShadowRoot;
  iframe: HTMLIFrameElement;
  chassis: HTMLElement;
  screen: HTMLElement;
  notchEl: HTMLElement;
  statusBar: HTMLElement;
  statusTime: HTMLElement;
  urlBar: HTMLElement;
  urlText: HTMLElement;
  loadingBar: HTMLElement;
  iosToolbar: HTMLElement;
  homeIndicator: HTMLElement;
  topLabel: HTMLElement;
  topDims: HTMLElement;
  pickerPanel: HTMLElement;
  pickerList: HTMLElement;
  pickerSearch: HTMLInputElement;
  state: { deviceId: string; orientation: Orientation };
}

let overlay: OverlayHandle | null = null;

function buildOverlay(initialDeviceId: string, initialOrientation: Orientation): OverlayHandle {
  const root = document.createElement('div');
  root.id = ROOT_ID;
  document.documentElement.appendChild(root);

  const shadow = root.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; }

    .backdrop {
      position: fixed;
      inset: 0;
      background:
        radial-gradient(ellipse at 30% 20%, #34373c 0%, transparent 60%),
        radial-gradient(ellipse at 80% 80%, #2c2f33 0%, transparent 60%),
        #1f2226;
      color: #e6edf3;
      display: grid;
      grid-template-columns: 1fr 64px;
      grid-template-rows: 56px 1fr;
      grid-template-areas:
        "topbar  sidebar"
        "stage   sidebar";
    }

    .topbar {
      grid-area: topbar;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      background: #1a1d20;
      border-bottom: 1px solid #2f3338;
      padding: 0 16px;
      font-size: 14px;
      font-weight: 500;
    }
    .topbar .label { font-weight: 600; }
    .topbar .dims {
      color: #9ba2aa;
      font-variant-numeric: tabular-nums;
      font-size: 12px;
      padding: 2px 8px;
      border: 1px solid #3a3f45;
      border-radius: 999px;
    }

    .sidebar {
      grid-area: sidebar;
      background: #1a1d20;
      border-left: 1px solid #2f3338;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 12px 0;
      gap: 8px;
    }
    .sidebar .spacer { flex: 1; }

    .icon-btn {
      width: 44px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: 1px solid transparent;
      border-radius: 10px;
      color: #e6edf3;
      cursor: pointer;
      transition: background 120ms, border-color 120ms;
    }
    .icon-btn:hover { background: #2a2f35; border-color: #3a3f45; }
    .icon-btn.active { background: #2a2f35; border-color: #2f81f7; }
    .icon-btn.danger { color: #f85149; }
    .icon-btn.danger:hover { background: #f85149; color: #ffffff; border-color: #f85149; }
    .icon-btn svg { width: 22px; height: 22px; }

    .stage {
      grid-area: stage;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      padding: 28px;
    }

    /* === Device chassis (the physical phone body, around the screen) === */
    .chassis {
      position: relative;
      background: var(--chassis, #1d1d1f);
      transform-origin: center center;
      box-shadow:
        0 30px 80px rgba(0, 0, 0, 0.55),
        0 0 0 1px rgba(255, 255, 255, 0.04) inset,
        0 1px 0 rgba(255, 255, 255, 0.06) inset;
    }

    /* Side hardware buttons (volume, power, silence switch) */
    .btn {
      position: absolute;
      background: var(--button, #2c2c2e);
      border-radius: 1.5px;
      box-shadow: inset 0 0 1px rgba(0, 0, 0, 0.5);
    }
    .btn.left  { left: -1.5px; width: 3px; }
    .btn.right { right: -1.5px; width: 3px; }

    /* === Inner screen (content area) === */
    .screen {
      position: relative;
      background: #ffffff;
      overflow: hidden;
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
    }

    /* Status bar */
    .status-bar {
      flex: 0 0 auto;
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 26px;
      font-size: 16px;
      font-weight: 600;
      color: #000000;
      background: #ffffff;
      position: relative;
      z-index: 2;
      letter-spacing: -0.02em;
      font-feature-settings: 'tnum';
    }
    .status-bar.ios-island { padding-top: 8px; align-items: flex-start; padding-left: 32px; padding-right: 32px; }
    .status-bar.ios-island .status-time { padding-top: 16px; font-size: 17px; }
    .status-bar.ios-island .status-right { padding-top: 18px; }
    .status-bar .status-right {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .status-bar .icon { display: block; }
    .status-bar .icon-signal { width: 18px; height: 11px; }
    .status-bar .icon-wifi { width: 17px; height: 12px; }
    .status-bar .icon-battery { width: 27px; height: 12px; }

    /* === URL bar variants === */
    .url-bar {
      flex: 0 0 auto;
      width: 100%;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      background: #f1f3f4;
      position: relative;
      z-index: 2;
    }
    .url-bar.android.top { border-bottom: 1px solid #d8dadd; box-shadow: 0 2px 4px rgba(0,0,0,0.04); }
    .url-bar.ios.classic { background: #f6f6f6; border-top: 1px solid #d8dadd; }
    .url-bar .pill {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 12px;
      background: #ffffff;
      border-radius: 999px;
      font-size: 13px;
      color: #1f2329;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      border: 1px solid #e6e8ea;
    }
    .url-bar.ios.classic .pill {
      background: #e3e3e8;
      border: none;
      color: #000;
      justify-content: center;
    }
    .url-bar svg { width: 18px; height: 18px; color: #5f6368; flex-shrink: 0; }
    .url-bar.android svg { color: #5f6368; }
    .url-bar.ios.classic svg { color: #1f2329; }
    .url-bar .lock { width: 12px; height: 12px; }

    /* iOS notched: floating "liquid glass" capsule with Aa + URL + reload
       (matches iOS 17 Safari bottom bar layout) */
    .url-bar.ios.floating {
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      bottom: 56px;
      width: calc(100% - 16px);
      max-width: 420px;
      height: 44px;
      padding: 0 6px;
      background: rgba(248, 248, 248, 0.72);
      border: 0.5px solid rgba(0, 0, 0, 0.06);
      border-radius: 999px;
      backdrop-filter: blur(28px) saturate(200%);
      -webkit-backdrop-filter: blur(28px) saturate(200%);
      box-shadow:
        0 6px 20px rgba(0, 0, 0, 0.12),
        0 1px 0 rgba(255, 255, 255, 0.85) inset;
      z-index: 4;
      gap: 0;
    }
    .url-bar.ios.floating .pill {
      flex: 1;
      background: transparent;
      border: none;
      padding: 0;
      display: flex;
      align-items: center;
      gap: 0;
      overflow: visible;
    }
    .url-bar.ios.floating .aa-btn,
    .url-bar.ios.floating .reload-btn {
      flex: 0 0 auto;
      width: 32px;
      height: 32px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: 0;
      border-radius: 999px;
      color: #1f2329;
      cursor: default;
      padding: 0;
    }
    .url-bar.ios.floating .aa-btn { font-weight: 600; line-height: 1; gap: 1px; }
    .url-bar.ios.floating .aa-btn .aa-small { font-size: 11px; }
    .url-bar.ios.floating .aa-btn .aa-big { font-size: 15px; }
    .url-bar.ios.floating .reload-btn svg { width: 16px; height: 16px; }
    .url-bar.ios.floating .url-content {
      flex: 1 1 auto;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      min-width: 0;
      padding: 0 4px;
      color: #1f2329;
      font-size: 14px;
      font-weight: 400;
      overflow: hidden;
    }
    .url-bar.ios.floating .url-content .url-text {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .url-bar.ios.floating .lock { width: 11px; height: 11px; flex-shrink: 0; color: #1f2329; }

    /* iOS bottom action toolbar (back / forward / share / bookmarks / tabs) */
    .ios-toolbar {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 50px;
      padding: 0 22px 14px;
      display: none;
      align-items: center;
      justify-content: space-between;
      background: linear-gradient(to bottom, rgba(248, 248, 248, 0) 0%, rgba(248, 248, 248, 0.55) 60%, rgba(248, 248, 248, 0.7) 100%);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      z-index: 3;
      pointer-events: none;
    }
    .ios-toolbar.visible { display: flex; }
    .ios-toolbar .tool {
      width: 36px;
      height: 36px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: #007aff;
    }
    .ios-toolbar .tool.disabled { color: #c5c7cc; }
    .ios-toolbar .tool svg { width: 22px; height: 22px; }

    /* Loading progress bar inside the URL bar */
    .loading-bar {
      position: absolute;
      bottom: 0;
      left: 0;
      height: 2px;
      width: 0%;
      background: #2f81f7;
      border-radius: 1px;
      opacity: 0;
      transition: width 0.4s ease, opacity 0.3s ease;
      pointer-events: none;
    }
    .url-bar.ios.floating .loading-bar { bottom: 4px; left: 14px; right: 14px; width: auto; }
    .url-bar.loading .loading-bar { width: 70%; opacity: 1; }
    .url-bar.loading-done .loading-bar { width: 100%; opacity: 0; }

    /* Home indicator */
    .home-indicator {
      flex: 0 0 auto;
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      pointer-events: none;
    }
    .home-indicator .pill {
      width: 134px;
      height: 5px;
      background: #1f2329;
      border-radius: 3px;
      margin: 8px 0 8px;
    }
    .home-indicator.android .pill {
      width: 108px;
      height: 4px;
      background: #5f6368;
      border-radius: 2px;
      margin: 10px 0 10px;
    }
    .home-indicator.floating {
      position: absolute;
      left: 0; right: 0;
      bottom: 0;
      z-index: 4;
    }
    .home-indicator.floating .pill { background: #1f2329; opacity: 0.85; }

    iframe {
      flex: 1 1 auto;
      display: block;
      border: 0;
      background: #ffffff;
      width: 100%;
      min-height: 0;
    }

    /* Notch / Dynamic Island overlay */
    .notch {
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      background: #000000;
      z-index: 5;
      pointer-events: none;
      display: none;
    }
    .notch.visible { display: block; }
    .notch.notch-classic {
      top: 0;
      border-bottom-left-radius: 18px;
      border-bottom-right-radius: 18px;
    }
    .notch.notch-island { border-radius: 999px; }

    /* Picker panel */
    .picker-panel {
      position: absolute;
      top: 56px;
      right: 64px;
      width: 320px;
      max-height: calc(100vh - 56px - 16px);
      background: #1f2226;
      border-left: 1px solid #3a3f45;
      border-bottom: 1px solid #3a3f45;
      box-shadow: -8px 8px 24px rgba(0,0,0,0.4);
      display: none;
      flex-direction: column;
      overflow: hidden;
      z-index: 10;
    }
    .picker-panel.open { display: flex; }
    .picker-header { padding: 10px 12px; border-bottom: 1px solid #3a3f45; font-size: 13px; font-weight: 600; }
    .picker-search {
      margin: 8px 12px;
      padding: 6px 8px;
      border: 1px solid #3a3f45;
      border-radius: 6px;
      background: #15181c;
      color: #e6edf3;
      font-size: 13px;
      outline: none;
    }
    .picker-search:focus { border-color: #2f81f7; }
    .picker-list { overflow-y: auto; padding-bottom: 8px; }
    .group-label {
      padding: 8px 12px 4px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #9ba2aa;
    }
    .device-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 7px 12px;
      width: 100%;
      background: transparent;
      border: 0;
      color: #e6edf3;
      cursor: pointer;
      text-align: left;
      font-size: 13px;
    }
    .device-row:hover { background: #2a2f35; }
    .device-row.active { background: #1c3a5e; }
    .device-row .dims-cell { color: #9ba2aa; font-size: 11px; font-variant-numeric: tabular-nums; }
    .empty { padding: 24px 12px; text-align: center; color: #9ba2aa; font-size: 13px; }
  `;
  shadow.appendChild(style);

  const backdrop = document.createElement('div');
  backdrop.className = 'backdrop';

  const topbar = document.createElement('div');
  topbar.className = 'topbar';
  const topLabel = document.createElement('span');
  topLabel.className = 'label';
  const topDims = document.createElement('span');
  topDims.className = 'dims';
  topbar.appendChild(topLabel);
  topbar.appendChild(topDims);

  const stage = document.createElement('div');
  stage.className = 'stage';

  // Chassis (outer phone body)
  const chassis = document.createElement('div');
  chassis.className = 'chassis';

  // Side buttons (filled in by applyState; up to 4 elements)
  const btnSilent = makeButton('left');
  const btnVolUp = makeButton('left');
  const btnVolDn = makeButton('left');
  const btnPower = makeButton('right');
  chassis.appendChild(btnSilent);
  chassis.appendChild(btnVolUp);
  chassis.appendChild(btnVolDn);
  chassis.appendChild(btnPower);

  // Inner screen
  const screen = document.createElement('div');
  screen.className = 'screen';
  chassis.appendChild(screen);

  // Status bar
  const statusBar = document.createElement('div');
  statusBar.className = 'status-bar';
  const statusTime = document.createElement('span');
  statusTime.className = 'status-time';
  const statusRight = document.createElement('span');
  statusRight.className = 'status-right';
  statusRight.innerHTML = `
    <svg class="icon icon-signal" viewBox="0 0 18 11" fill="currentColor" aria-hidden="true">
      <rect x="0"  y="7"   width="3" height="4"   rx="0.8"/>
      <rect x="5"  y="5"   width="3" height="6"   rx="0.8"/>
      <rect x="10" y="2.5" width="3" height="8.5" rx="0.8"/>
      <rect x="15" y="0"   width="3" height="11"  rx="0.8"/>
    </svg>
    <svg class="icon icon-wifi" viewBox="0 0 17 12" fill="currentColor" aria-hidden="true">
      <path d="M8.5 11.4a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4z"/>
      <path d="M4 7.6a6.3 6.3 0 0 1 9 0l-1.4 1.3a4.3 4.3 0 0 0-6.2 0L4 7.6z"/>
      <path d="M1.1 4.5a10.4 10.4 0 0 1 14.8 0l-1.4 1.3a8.4 8.4 0 0 0-12 0L1.1 4.5z"/>
    </svg>
    <svg class="icon icon-battery" viewBox="0 0 27 12" fill="none" aria-hidden="true">
      <rect x="0.5" y="0.5" width="23" height="11" rx="3" stroke="currentColor" stroke-width="1" opacity="0.45"/>
      <rect x="2" y="2" width="18" height="8" rx="1.6" fill="currentColor"/>
      <rect x="24.5" y="4" width="2" height="4" rx="0.8" fill="currentColor" opacity="0.45"/>
    </svg>
  `;
  statusBar.appendChild(statusTime);
  statusBar.appendChild(statusRight);

  // URL bar
  const urlBar = document.createElement('div');
  urlBar.className = 'url-bar';
  const urlPill = document.createElement('div');
  urlPill.className = 'pill';
  urlPill.innerHTML = `
    <button class="aa-btn" tabindex="-1" aria-hidden="true"><span class="aa-small">A</span><span class="aa-big">A</span></button>
    <div class="url-content">
      <svg class="lock" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M3 5V4a3 3 0 0 1 6 0v1h1v6H2V5h1zm1 0h4V4a2 2 0 0 0-4 0v1z"/></svg>
      <span class="url-text"></span>
    </div>
    <button class="reload-btn" tabindex="-1" aria-hidden="true">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9"/><polyline points="13.5 2 13.5 5 10.5 5"/></svg>
    </button>
  `;
  const urlText = urlPill.querySelector('.url-text') as HTMLSpanElement;
  urlBar.appendChild(urlPill);
  const loadingBar = document.createElement('div');
  loadingBar.className = 'loading-bar';
  urlBar.appendChild(loadingBar);

  // iOS bottom action toolbar (back / forward / share / bookmarks / tabs)
  const iosToolbar = document.createElement('div');
  iosToolbar.className = 'ios-toolbar';
  iosToolbar.innerHTML = `
    <span class="tool disabled" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></span>
    <span class="tool disabled" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg></span>
    <span class="tool" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M8 8l4-4 4 4"/><path d="M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5"/></svg></span>
    <span class="tool" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/></svg></span>
    <span class="tool" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="7" width="13" height="13" rx="2"/><rect x="7" y="4" width="13" height="13" rx="2"/></svg></span>
  `;

  // Iframe
  const iframe = document.createElement('iframe');
  iframe.setAttribute(
    'allow',
    'fullscreen; geolocation; camera; microphone; clipboard-read; clipboard-write',
  );
  iframe.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');

  // Home indicator
  const homeIndicator = document.createElement('div');
  homeIndicator.className = 'home-indicator';
  const homePill = document.createElement('div');
  homePill.className = 'pill';
  homeIndicator.appendChild(homePill);

  // Notch overlay
  const notchEl = document.createElement('div');
  notchEl.className = 'notch';

  screen.appendChild(statusBar);
  screen.appendChild(urlBar);
  screen.appendChild(iframe);
  screen.appendChild(iosToolbar);
  screen.appendChild(homeIndicator);
  screen.appendChild(notchEl);

  stage.appendChild(chassis);

  // Picker panel
  const pickerPanel = document.createElement('div');
  pickerPanel.className = 'picker-panel';
  const pickerHeader = document.createElement('div');
  pickerHeader.className = 'picker-header';
  pickerHeader.textContent = 'Select a device';
  const pickerSearch = document.createElement('input');
  pickerSearch.className = 'picker-search';
  pickerSearch.type = 'search';
  pickerSearch.placeholder = 'Search devices…';
  pickerSearch.autocomplete = 'off';
  const pickerList = document.createElement('div');
  pickerList.className = 'picker-list';
  pickerPanel.appendChild(pickerHeader);
  pickerPanel.appendChild(pickerSearch);
  pickerPanel.appendChild(pickerList);
  stage.appendChild(pickerPanel);

  // Sidebar
  const sidebar = document.createElement('div');
  sidebar.className = 'sidebar';

  const closeBtn = makeIconButton(ICONS.close, 'Close (Esc)');
  closeBtn.classList.add('danger');
  closeBtn.addEventListener('click', () => {
    teardown();
    chrome.runtime.sendMessage({ type: 'EMULATE_STOPPED_NOTICE' } satisfies EmulateStoppedNotice);
  });

  const changeBtn = makeIconButton(ICONS.devices, 'Change device');
  changeBtn.addEventListener('click', () => {
    pickerPanel.classList.toggle('open');
    changeBtn.classList.toggle('active', pickerPanel.classList.contains('open'));
    if (pickerPanel.classList.contains('open')) {
      pickerSearch.focus();
      pickerSearch.select();
    }
  });

  const rotateBtn = makeIconButton(ICONS.rotate, 'Rotate');
  rotateBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'ROTATE' } satisfies RotateMessage);
  });

  sidebar.appendChild(closeBtn);
  const spacer = document.createElement('div');
  spacer.className = 'spacer';
  sidebar.appendChild(changeBtn);
  sidebar.appendChild(rotateBtn);
  sidebar.appendChild(spacer);

  backdrop.appendChild(topbar);
  backdrop.appendChild(stage);
  backdrop.appendChild(sidebar);
  shadow.appendChild(backdrop);

  stage.addEventListener('click', (e) => {
    if (!pickerPanel.classList.contains('open')) return;
    if (e.target instanceof Node && pickerPanel.contains(e.target)) return;
    pickerPanel.classList.remove('open');
    changeBtn.classList.remove('active');
  });

  // Loading bar wired to iframe load lifecycle
  iframe.addEventListener('load', () => {
    urlBar.classList.remove('loading');
    urlBar.classList.add('loading-done');
    setTimeout(() => urlBar.classList.remove('loading-done'), 350);
  });

  return {
    root,
    shadow,
    iframe,
    chassis,
    screen,
    notchEl,
    statusBar,
    statusTime,
    urlBar,
    urlText,
    loadingBar,
    iosToolbar,
    homeIndicator,
    topLabel,
    topDims,
    pickerPanel,
    pickerList,
    pickerSearch,
    state: { deviceId: initialDeviceId, orientation: initialOrientation },
  };
}

const ICONS = {
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`,
  devices: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="3"/><line x1="11" y1="18" x2="13" y2="18"/></svg>`,
  rotate: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8"/><polyline points="21 3 21 8 16 8"/><path d="M21 12a9 9 0 0 1-15.5 6.3L3 16"/><polyline points="3 21 3 16 8 16"/></svg>`,
};

function makeIconButton(svg: string, title: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'icon-btn';
  btn.title = title;
  btn.setAttribute('aria-label', title);
  btn.innerHTML = svg;
  return btn;
}

function makeButton(side: 'left' | 'right'): HTMLDivElement {
  const el = document.createElement('div');
  el.className = `btn ${side}`;
  return el;
}

function effectiveDimensions(device: Device, orientation: Orientation): { w: number; h: number } {
  if (orientation === 'landscape') return { w: device.height, h: device.width };
  return { w: device.width, h: device.height };
}

function formatTime(): string {
  const d = new Date();
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function safeHostPath(): string {
  try {
    const u = new URL(window.location.href);
    return u.host + (u.pathname === '/' ? '' : u.pathname);
  } catch {
    return window.location.href;
  }
}

/**
 * Side-button positions per platform / category. All values in CSS pixels of
 * the screen height (portrait); the helper auto-mirrors for landscape via the
 * chassis rotation. Buttons that don't apply for a device are positioned
 * off-screen by setting height to 0.
 */
function getButtonLayout(device: Device): {
  silent?: { top: number; height: number };
  volUp?: { top: number; height: number };
  volDn?: { top: number; height: number };
  power?: { top: number; height: number };
} {
  if (device.category === 'tablet') {
    return {
      power: { top: 60, height: 50 },
      volUp: { top: 60, height: 80 },
    };
  }
  if (device.platform === 'ios') {
    if (device.notch) {
      // Modern iPhones: silent switch + 2 long volume buttons on left,
      // long power button on right.
      return {
        silent: { top: 90, height: 30 },
        volUp: { top: 140, height: 65 },
        volDn: { top: 215, height: 65 },
        power: { top: 165, height: 100 },
      };
    }
    // Classic iPhone: silent switch + 2 small round volume buttons,
    // small power button on right.
    return {
      silent: { top: 60, height: 22 },
      volUp: { top: 100, height: 42 },
      volDn: { top: 152, height: 42 },
      power: { top: 60, height: 42 },
    };
  }
  // Android phones: typical layout — power + volume on right side.
  return {
    power: { top: 200, height: 60 },
    volUp: { top: 130, height: 100 },
  };
}

function applyState(handle: OverlayHandle): void {
  const device = getDeviceById(handle.state.deviceId);
  if (!device) return;
  const { w: screenW, h: screenH } = effectiveDimensions(device, handle.state.orientation);

  const chrome = getChromeLayout(device);
  const chassis = getChassis(device);

  // Total chassis box = screen + bezel on each side
  const chassisW = screenW + chassis.width * 2;
  const chassisH = screenH + chassis.width * 2;

  const stage = handle.chassis.parentElement!;
  const stageRect = stage.getBoundingClientRect();
  const padding = 32;
  const availableW = stageRect.width - padding;
  const availableH = stageRect.height - padding;
  const scale = Math.min(1, availableW / chassisW, availableH / chassisH);

  // Apply chassis sizing
  handle.chassis.style.width = `${chassisW}px`;
  handle.chassis.style.height = `${chassisH}px`;
  handle.chassis.style.padding = `${chassis.width}px`;
  handle.chassis.style.transform = scale < 1 ? `scale(${scale})` : 'none';
  handle.chassis.style.borderRadius = `${device.cornerRadius + chassis.width}px`;
  handle.chassis.style.setProperty('--chassis', chassis.color);
  handle.chassis.style.setProperty('--button', chassis.buttonColor);

  // Inner screen rounding
  handle.screen.style.borderRadius = `${device.cornerRadius}px`;

  // Hardware buttons
  const layout = getButtonLayout(device);
  const buttons = handle.chassis.querySelectorAll<HTMLDivElement>('.btn');
  // children order: silent, volUp, volDn, power
  const order: Array<keyof typeof layout> = ['silent', 'volUp', 'volDn', 'power'];
  buttons.forEach((btn, i) => {
    const key = order[i];
    if (!key) return;
    const cfg = layout[key];
    if (!cfg) {
      btn.style.display = 'none';
      return;
    }
    btn.style.display = 'block';
    btn.style.top = `${cfg.top}px`;
    btn.style.height = `${cfg.height}px`;
  });

  // Status bar
  handle.statusBar.style.height = `${chrome.statusBarHeight}px`;
  handle.statusTime.textContent = formatTime();
  handle.statusBar.classList.toggle(
    'ios-island',
    device.platform === 'ios' && device.notch?.type === 'dynamic-island',
  );

  // URL bar variant + position
  handle.urlBar.className = 'url-bar';
  let floatingUrl = false;
  if (chrome.urlBarPosition === 'top') {
    handle.urlBar.classList.add('android', 'top');
    handle.urlBar.style.position = '';
    handle.urlBar.style.height = `${chrome.urlBarHeight}px`;
  } else if (device.platform === 'ios' && device.notch) {
    // Floating liquid-glass pill (iOS 17+ Safari style)
    handle.urlBar.classList.add('ios', 'floating');
    floatingUrl = true;
  } else {
    // Classic iOS bottom bar (iPhone 5/SE)
    handle.urlBar.classList.add('ios', 'classic');
    handle.urlBar.style.position = '';
    handle.urlBar.style.height = `${chrome.urlBarHeight}px`;
  }
  handle.urlText.textContent = safeHostPath();

  // Home indicator
  if (chrome.homeIndicatorHeight === 0) {
    handle.homeIndicator.style.display = 'none';
  } else {
    handle.homeIndicator.style.display = 'flex';
    handle.homeIndicator.classList.toggle('android', device.platform === 'android');
    if (device.platform === 'ios' && device.notch) {
      // Floats on top of content alongside the URL bar
      handle.homeIndicator.classList.add('floating');
      handle.homeIndicator.style.height = '';
    } else {
      handle.homeIndicator.classList.remove('floating');
      handle.homeIndicator.style.height = `${chrome.homeIndicatorHeight}px`;
    }
  }

  // Re-arrange children:
  //  - Android (top URL): status -> urlBar -> iframe -> homeIndicator
  //  - iOS classic (bottom URL): status -> iframe -> urlBar
  //  - iOS notched (floating URL + toolbar + home): status -> iframe; rest overlay
  const s = handle.screen;
  s.appendChild(handle.statusBar);
  if (chrome.urlBarPosition === 'top') {
    s.appendChild(handle.urlBar);
    s.appendChild(handle.iframe);
    s.appendChild(handle.homeIndicator);
    handle.iosToolbar.classList.remove('visible');
  } else if (floatingUrl) {
    s.appendChild(handle.iframe);
    s.appendChild(handle.urlBar);
    s.appendChild(handle.iosToolbar);
    s.appendChild(handle.homeIndicator);
    handle.iosToolbar.classList.add('visible');
  } else {
    s.appendChild(handle.iframe);
    s.appendChild(handle.urlBar);
    handle.iosToolbar.classList.remove('visible');
  }
  s.appendChild(handle.notchEl);

  // Top label
  handle.topLabel.textContent = `${device.name}${
    handle.state.orientation === 'landscape' ? ' · landscape' : ''
  }`;
  handle.topDims.textContent = `${screenW}×${screenH} @${device.devicePixelRatio}x`;

  // Trigger loading state on URL bar when src changes
  if (handle.iframe.src !== window.location.href) {
    handle.urlBar.classList.add('loading');
    handle.urlBar.classList.remove('loading-done');
    handle.iframe.src = window.location.href;
  }

  applyNotch(handle, device);
  renderPicker(handle, '');
}

function applyNotch(handle: OverlayHandle, device: Device): void {
  const notch = device.notch;
  if (!notch || handle.state.orientation !== 'portrait') {
    handle.notchEl.classList.remove('visible', 'notch-classic', 'notch-island');
    return;
  }
  handle.notchEl.classList.add('visible');
  handle.notchEl.classList.toggle('notch-classic', notch.type === 'notch');
  handle.notchEl.classList.toggle('notch-island', notch.type === 'dynamic-island');
  handle.notchEl.style.width = `${notch.width}px`;
  handle.notchEl.style.height = `${notch.height}px`;
  handle.notchEl.style.top = `${notch.topOffset}px`;
}

function renderPicker(handle: OverlayHandle, filter: string): void {
  const term = filter.trim().toLowerCase();
  const all = getDevices();
  const matched = term
    ? all.filter(
        (d) =>
          d.name.toLowerCase().includes(term) ||
          `${d.width}x${d.height}`.includes(term.replace('×', 'x')),
      )
    : all;

  handle.pickerList.innerHTML = '';
  if (matched.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No devices match your search.';
    handle.pickerList.appendChild(empty);
    return;
  }

  const phones = matched.filter((d) => d.category === 'phone');
  const tablets = matched.filter((d) => d.category === 'tablet');
  if (phones.length) appendGroup(handle, 'Phones', phones);
  if (tablets.length) appendGroup(handle, 'Tablets', tablets);
}

function appendGroup(handle: OverlayHandle, label: string, devices: Device[]): void {
  const heading = document.createElement('div');
  heading.className = 'group-label';
  heading.textContent = label;
  handle.pickerList.appendChild(heading);

  for (const device of devices) {
    const row = document.createElement('button');
    row.className = 'device-row';
    if (device.id === handle.state.deviceId) row.classList.add('active');
    row.innerHTML = `<span class="name-cell"></span><span class="dims-cell"></span>`;
    (row.querySelector('.name-cell') as HTMLSpanElement).textContent = device.name;
    (row.querySelector('.dims-cell') as HTMLSpanElement).textContent =
      `${device.width}×${device.height}`;
    row.addEventListener('click', () => {
      chrome.runtime.sendMessage({
        type: 'SELECT_DEVICE',
        deviceId: device.id,
      } satisfies SelectDeviceMessage);
      handle.pickerPanel.classList.remove('open');
    });
    handle.pickerList.appendChild(row);
  }
}

function teardown(): void {
  if (overlay) {
    overlay.root.remove();
    overlay = null;
  }
  window.removeEventListener('resize', onResize);
  window.removeEventListener('keydown', onKeydown);
}

function onResize(): void {
  if (!overlay) return;
  applyState(overlay);
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && overlay) {
    teardown();
    chrome.runtime.sendMessage({ type: 'EMULATE_STOPPED_NOTICE' } satisfies EmulateStoppedNotice);
  }
}

function start(deviceId: string, orientation: Orientation): void {
  const device = getDeviceById(deviceId);
  if (!device) return;

  if (!overlay) {
    overlay = buildOverlay(deviceId, orientation);
    overlay.pickerSearch.addEventListener('input', () => {
      renderPicker(overlay!, overlay!.pickerSearch.value);
    });
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKeydown);
  } else {
    overlay.state = { deviceId, orientation };
  }
  applyState(overlay);
}

chrome.runtime.onMessage.addListener((rawMessage) => {
  const msg = rawMessage as ExtensionMessage;
  switch (msg.type) {
    case 'EMULATE_START': {
      const m = msg as EmulateStartMessage;
      start(m.deviceId, m.orientation);
      break;
    }
    case 'EMULATE_STOP':
      teardown();
      break;
    default:
      break;
  }
});
