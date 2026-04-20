import { getDeviceById, getDevices, type Device } from '../devices';
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

    .frame-wrap {
      background: #ffffff;
      border-radius: 14px;
      overflow: hidden;
      box-shadow: 0 20px 60px rgba(0,0,0,0.55);
      transform-origin: center center;
    }
    iframe {
      display: block;
      border: 0;
      background: #ffffff;
    }

    /* Device picker panel slides in from the right, sits left of the sidebar */
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
    }
    .picker-panel.open { display: flex; }
    .picker-header {
      padding: 10px 12px;
      border-bottom: 1px solid #3a3f45;
      font-size: 13px;
      font-weight: 600;
    }
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

  // Top bar
  const topbar = document.createElement('div');
  topbar.className = 'topbar';
  const topLabel = document.createElement('span');
  topLabel.className = 'label';
  const topDims = document.createElement('span');
  topDims.className = 'dims';
  topbar.appendChild(topLabel);
  topbar.appendChild(topDims);

  // Stage
  const stage = document.createElement('div');
  stage.className = 'stage';
  const frameWrap = document.createElement('div');
  frameWrap.className = 'frame-wrap';
  const iframe = document.createElement('iframe');
  iframe.setAttribute(
    'allow',
    'fullscreen; geolocation; camera; microphone; clipboard-read; clipboard-write',
  );
  iframe.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
  frameWrap.appendChild(iframe);
  stage.appendChild(frameWrap);

  // Picker panel (initially hidden)
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

  // Click outside picker closes it
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

  handle.iframe.style.width = `${w}px`;
  handle.iframe.style.height = `${h}px`;

  handle.topLabel.textContent = `${device.name}${
    handle.state.orientation === 'landscape' ? ' · landscape' : ''
  }`;
  handle.topDims.textContent = `${w}×${h} @${device.devicePixelRatio}x`;

  if (handle.iframe.src !== window.location.href) {
    handle.iframe.src = window.location.href;
  }

  renderPicker(handle, '');
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
