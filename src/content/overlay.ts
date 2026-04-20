import { getDeviceById, type Device } from '../devices';
import type { EmulateStartMessage, EmulateStoppedNotice, ExtensionMessage } from '../shared/messages';

const ROOT_ID = '__mobile_simulator_root__';

interface OverlayHandle {
  root: HTMLElement;
  shadow: ShadowRoot;
  iframe: HTMLIFrameElement;
  frameWrap: HTMLElement;
  label: HTMLElement;
}

let overlay: OverlayHandle | null = null;

function buildOverlay(): OverlayHandle {
  const root = document.createElement('div');
  root.id = ROOT_ID;
  document.documentElement.appendChild(root);

  const shadow = root.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; }
    .backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15, 17, 21, 0.85);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      color: #e6edf3;
    }
    .toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 8px 14px;
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 8px;
      margin-bottom: 14px;
      font-size: 13px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    }
    .label { font-weight: 600; }
    .dims { color: #8b949e; font-variant-numeric: tabular-nums; margin-left: 8px; }
    .close-btn {
      background: transparent;
      color: #f85149;
      border: 1px solid #f85149;
      padding: 4px 10px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      font-family: inherit;
    }
    .close-btn:hover { background: #f85149; color: #ffffff; }
    .frame-wrap {
      background: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 16px 48px rgba(0,0,0,0.6);
      transform-origin: center center;
    }
    iframe {
      display: block;
      border: 0;
      background: #ffffff;
    }
  `;
  shadow.appendChild(style);

  const backdrop = document.createElement('div');
  backdrop.className = 'backdrop';

  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';

  const labelGroup = document.createElement('div');
  const label = document.createElement('span');
  label.className = 'label';
  const dims = document.createElement('span');
  dims.className = 'dims';
  labelGroup.appendChild(label);
  labelGroup.appendChild(dims);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'close-btn';
  closeBtn.textContent = '✕ Close';
  closeBtn.addEventListener('click', () => {
    teardown();
    chrome.runtime.sendMessage({ type: 'EMULATE_STOPPED_NOTICE' } satisfies EmulateStoppedNotice);
  });

  toolbar.appendChild(labelGroup);
  toolbar.appendChild(closeBtn);

  const frameWrap = document.createElement('div');
  frameWrap.className = 'frame-wrap';

  const iframe = document.createElement('iframe');
  iframe.setAttribute('allow', 'fullscreen; geolocation; camera; microphone; clipboard-read; clipboard-write');
  iframe.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
  frameWrap.appendChild(iframe);

  backdrop.appendChild(toolbar);
  backdrop.appendChild(frameWrap);
  shadow.appendChild(backdrop);

  return { root, shadow, iframe, frameWrap, label };
}

function applyDevice(handle: OverlayHandle, device: Device): void {
  const margin = 80; // leave room for the toolbar + breathing space
  const availableW = window.innerWidth - 40;
  const availableH = window.innerHeight - margin;
  const scale = Math.min(1, availableW / device.width, availableH / device.height);

  handle.frameWrap.style.width = `${device.width}px`;
  handle.frameWrap.style.height = `${device.height}px`;
  handle.frameWrap.style.transform = scale < 1 ? `scale(${scale})` : 'none';

  handle.iframe.style.width = `${device.width}px`;
  handle.iframe.style.height = `${device.height}px`;

  handle.label.textContent = device.name;
  const dims = handle.label.nextElementSibling as HTMLElement | null;
  if (dims) dims.textContent = `${device.width}×${device.height} @${device.devicePixelRatio}x`;

  if (handle.iframe.src !== window.location.href) {
    handle.iframe.src = window.location.href;
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
  const deviceId = overlay.root.dataset.deviceId;
  if (!deviceId) return;
  const device = getDeviceById(deviceId);
  if (device) applyDevice(overlay, device);
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && overlay) {
    teardown();
    chrome.runtime.sendMessage({ type: 'EMULATE_STOPPED_NOTICE' } satisfies EmulateStoppedNotice);
  }
}

function start(deviceId: string): void {
  const device = getDeviceById(deviceId);
  if (!device) return;

  if (!overlay) {
    overlay = buildOverlay();
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKeydown);
  }
  overlay.root.dataset.deviceId = deviceId;
  applyDevice(overlay, device);
}

chrome.runtime.onMessage.addListener((rawMessage) => {
  const msg = rawMessage as ExtensionMessage;
  switch (msg.type) {
    case 'EMULATE_START':
      start((msg as EmulateStartMessage).deviceId);
      break;
    case 'EMULATE_STOP':
      teardown();
      break;
    default:
      break;
  }
});
