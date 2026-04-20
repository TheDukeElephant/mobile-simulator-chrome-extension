import { getChromeLayout, getDeviceById, getDevices, type Device } from '../devices';
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
  frameWrap: HTMLElement;
  notchEl: HTMLElement;
  statusBar: HTMLElement;
  statusTime: HTMLElement;
  urlBar: HTMLElement;
  urlText: HTMLElement;
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
      background: #2a2d31;
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
      background: #1f2226;
      border-bottom: 1px solid #3a3f45;
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
      background: #1f2226;
      border-left: 1px solid #3a3f45;
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
      padding: 24px;
    }

    /* Device frame: the entire phone screen rectangle, rounded to match the
       real device's display corner radius. */
    .frame-wrap {
      position: relative;
      background: #ffffff;
      overflow: hidden;
      box-shadow: 0 20px 60px rgba(0,0,0,0.55);
      transform-origin: center center;
      display: flex;
      flex-direction: column;
    }

    /* Browser chrome bars */
    .status-bar {
      flex: 0 0 auto;
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 18px;
      font-size: 14px;
      font-weight: 600;
      color: #000000;
      background: #ffffff;
      position: relative;
      z-index: 1;
    }
    .status-bar.ios-island { padding-top: 4px; }
    .status-bar .status-right {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-weight: 500;
    }
    .status-bar .icon { width: 16px; height: 12px; }

    .url-bar {
      flex: 0 0 auto;
      width: 100%;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      background: #f1f3f4;
      border-color: #d8dadd;
    }
    .url-bar.ios { background: #f6f6f6; }
    .url-bar.ios.bottom { border-top: 1px solid #d8dadd; }
    .url-bar.android.top { border-bottom: 1px solid #d8dadd; }
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
    .url-bar.ios .pill { background: #e3e3e8; border: none; color: #000; justify-content: center; }
    .url-bar svg { width: 18px; height: 18px; color: #5f6368; flex-shrink: 0; }
    .url-bar.android svg { color: #5f6368; }
    .url-bar.ios svg { color: #1f2329; }
    .url-bar .lock { width: 12px; height: 12px; }

    .home-indicator {
      flex: 0 0 auto;
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #ffffff;
    }
    .home-indicator.dark { background: #ffffff; }
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

    iframe {
      flex: 1 1 auto;
      display: block;
      border: 0;
      background: #ffffff;
      width: 100%;
      min-height: 0;
    }

    /* Notch / Dynamic Island overlay sits above the status bar */
    .notch {
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      background: #000000;
      z-index: 3;
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

  // Device frame
  const frameWrap = document.createElement('div');
  frameWrap.className = 'frame-wrap';

  // Status bar
  const statusBar = document.createElement('div');
  statusBar.className = 'status-bar';
  const statusTime = document.createElement('span');
  statusTime.className = 'status-time';
  const statusRight = document.createElement('span');
  statusRight.className = 'status-right';
  statusRight.innerHTML = `
    <svg class="icon" viewBox="0 0 18 12" fill="currentColor"><path d="M1 9h2v2H1zm4-2h2v4H5zm4-2h2v6H9zm4-2h2v8h-2z"/></svg>
    <svg class="icon" viewBox="0 0 18 12" fill="currentColor"><path d="M9 2C5.5 2 2.7 4.3 1 6.5l1.4 1.1C3.9 5.6 6.3 4 9 4s5.1 1.6 6.6 3.6L17 6.5C15.3 4.3 12.5 2 9 2zm0 4c-1.7 0-3.2.9-4 2l1.4 1c.6-.7 1.6-1 2.6-1s2 .3 2.6 1L13 8c-.8-1.1-2.3-2-4-2z"/></svg>
    <svg class="icon" viewBox="0 0 24 12" fill="none" stroke="currentColor" stroke-width="1"><rect x="1" y="2" width="20" height="8" rx="2"/><rect x="2.5" y="3.5" width="15" height="5" fill="currentColor" stroke="none"/><rect x="22" y="4.5" width="1.5" height="3" fill="currentColor" stroke="none"/></svg>
  `;
  statusBar.appendChild(statusTime);
  statusBar.appendChild(statusRight);

  // URL bar
  const urlBar = document.createElement('div');
  urlBar.className = 'url-bar';
  const urlPill = document.createElement('div');
  urlPill.className = 'pill';
  urlPill.innerHTML = `
    <svg class="lock" viewBox="0 0 12 12" fill="currentColor"><path d="M3 5V4a3 3 0 0 1 6 0v1h1v6H2V5h1zm1 0h4V4a2 2 0 0 0-4 0v1z"/></svg>
    <span class="url-text"></span>
  `;
  const urlText = urlPill.querySelector('.url-text') as HTMLSpanElement;
  urlBar.appendChild(urlPill);

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

  // Default order: status -> urlBar -> iframe -> homeIndicator (Android-like)
  // applyState will reorder for iOS bottom URL.
  frameWrap.appendChild(statusBar);
  frameWrap.appendChild(urlBar);
  frameWrap.appendChild(iframe);
  frameWrap.appendChild(homeIndicator);
  frameWrap.appendChild(notchEl);

  stage.appendChild(frameWrap);

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

  return {
    root,
    shadow,
    iframe,
    frameWrap,
    notchEl,
    statusBar,
    statusTime,
    urlBar,
    urlText,
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

function applyState(handle: OverlayHandle): void {
  const device = getDeviceById(handle.state.deviceId);
  if (!device) return;
  const { w, h } = effectiveDimensions(device, handle.state.orientation);

  const stage = handle.frameWrap.parentElement!;
  const stageRect = stage.getBoundingClientRect();
  const padding = 32;
  const availableW = stageRect.width - padding;
  const availableH = stageRect.height - padding;
  const scale = Math.min(1, availableW / w, availableH / h);

  handle.frameWrap.style.width = `${w}px`;
  handle.frameWrap.style.height = `${h}px`;
  handle.frameWrap.style.transform = scale < 1 ? `scale(${scale})` : 'none';
  handle.frameWrap.style.borderRadius = `${device.cornerRadius}px`;

  // Browser chrome
  const chrome = getChromeLayout(device);

  // Status bar
  handle.statusBar.style.height = `${chrome.statusBarHeight}px`;
  handle.statusTime.textContent = formatTime();
  handle.statusBar.classList.toggle(
    'ios-island',
    device.platform === 'ios' && device.notch?.type === 'dynamic-island',
  );

  // URL bar styling per platform
  handle.urlBar.classList.toggle('ios', device.platform === 'ios');
  handle.urlBar.classList.toggle('android', device.platform === 'android');
  handle.urlBar.classList.toggle('top', chrome.urlBarPosition === 'top');
  handle.urlBar.classList.toggle('bottom', chrome.urlBarPosition === 'bottom');
  handle.urlBar.style.height = `${chrome.urlBarHeight}px`;
  handle.urlText.textContent = safeHostPath();

  // Home indicator
  handle.homeIndicator.style.display = chrome.homeIndicatorHeight > 0 ? 'flex' : 'none';
  handle.homeIndicator.style.height = `${chrome.homeIndicatorHeight}px`;
  handle.homeIndicator.classList.toggle('android', device.platform === 'android');

  // Re-arrange chrome for bottom URL bar (iOS notched + classic)
  // Order: statusBar -> iframe -> urlBar -> homeIndicator
  // For Android (top URL): statusBar -> urlBar -> iframe -> homeIndicator
  const wrap = handle.frameWrap;
  wrap.appendChild(handle.statusBar);
  if (chrome.urlBarPosition === 'top') {
    wrap.appendChild(handle.urlBar);
    wrap.appendChild(handle.iframe);
  } else {
    wrap.appendChild(handle.iframe);
    wrap.appendChild(handle.urlBar);
  }
  wrap.appendChild(handle.homeIndicator);
  wrap.appendChild(handle.notchEl); // notch always last so it overlays

  // Iframe takes remaining space (set by flex: 1 1 auto)
  handle.iframe.style.height = '';

  // Top label
  handle.topLabel.textContent = `${device.name}${
    handle.state.orientation === 'landscape' ? ' · landscape' : ''
  }`;
  handle.topDims.textContent = `${w}×${h} @${device.devicePixelRatio}x`;

  if (handle.iframe.src !== window.location.href) {
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
