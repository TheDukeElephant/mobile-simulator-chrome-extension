import { getDevices, type Device } from '../devices';
import type {
  EmulateStartMessage,
  EmulateStopMessage,
  EmulateStatusRequest,
  EmulateStatusResponse,
} from '../shared/messages';

const LAST_DEVICE_KEY = 'lastDeviceId';

const listEl = document.getElementById('device-list') as HTMLDivElement;
const searchEl = document.getElementById('search') as HTMLInputElement;
const stopBtn = document.getElementById('stop-btn') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLSpanElement;

let activeDeviceId: string | null = null;
let lastUsedId: string | null = null;

async function getActiveTabId(): Promise<number | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

async function loadLastDevice(): Promise<void> {
  const result = await chrome.storage.local.get(LAST_DEVICE_KEY);
  lastUsedId = (result[LAST_DEVICE_KEY] as string | undefined) ?? null;
}

async function saveLastDevice(id: string): Promise<void> {
  await chrome.storage.local.set({ [LAST_DEVICE_KEY]: id });
}

async function fetchStatus(): Promise<void> {
  const tabId = await getActiveTabId();
  if (tabId === undefined) return;
  try {
    const req: EmulateStatusRequest = { type: 'EMULATE_STATUS_REQUEST' };
    const res = (await chrome.runtime.sendMessage({ ...req, tabId })) as
      | EmulateStatusResponse
      | undefined;
    if (res?.type === 'EMULATE_STATUS_RESPONSE') {
      activeDeviceId = res.active ? res.deviceId : null;
    }
  } catch {
    activeDeviceId = null;
  }
  updateChrome();
}

function updateChrome(): void {
  if (activeDeviceId) {
    stopBtn.hidden = false;
    statusEl.textContent = 'Emulating — pick another device to switch';
  } else {
    stopBtn.hidden = true;
    statusEl.textContent = lastUsedId
      ? 'Pick a device to start (last used pre-selected)'
      : 'Pick a device to start';
  }
}

function renderList(filter: string): void {
  const term = filter.trim().toLowerCase();
  const all = getDevices();
  const matched = term
    ? all.filter(
        (d) =>
          d.name.toLowerCase().includes(term) ||
          `${d.width}x${d.height}`.includes(term.replace('×', 'x')),
      )
    : all;

  listEl.innerHTML = '';
  if (matched.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No devices match your search.';
    listEl.appendChild(empty);
    return;
  }

  const phones = matched.filter((d) => d.category === 'phone');
  const tablets = matched.filter((d) => d.category === 'tablet');

  if (phones.length) appendGroup('Phones', phones);
  if (tablets.length) appendGroup('Tablets', tablets);
}

function appendGroup(label: string, devices: Device[]): void {
  const heading = document.createElement('div');
  heading.className = 'group-label';
  heading.textContent = label;
  listEl.appendChild(heading);

  for (const device of devices) {
    const row = document.createElement('button');
    row.className = 'device-row';
    if (device.id === (activeDeviceId ?? lastUsedId)) row.classList.add('active');
    row.dataset.deviceId = device.id;
    row.innerHTML = `
      <span class="name"></span>
      <span class="dims"></span>
    `;
    (row.querySelector('.name') as HTMLSpanElement).textContent = device.name;
    (row.querySelector('.dims') as HTMLSpanElement).textContent =
      `${device.width}×${device.height}`;
    row.addEventListener('click', () => {
      void startEmulation(device.id);
    });
    listEl.appendChild(row);
  }
}

async function startEmulation(deviceId: string): Promise<void> {
  const tabId = await getActiveTabId();
  if (tabId === undefined) return;
  const msg: EmulateStartMessage = { type: 'EMULATE_START', deviceId };
  await chrome.runtime.sendMessage({ ...msg, tabId });
  await saveLastDevice(deviceId);
  window.close();
}

async function stopEmulation(): Promise<void> {
  const tabId = await getActiveTabId();
  if (tabId === undefined) return;
  const msg: EmulateStopMessage = { type: 'EMULATE_STOP' };
  await chrome.runtime.sendMessage({ ...msg, tabId });
  window.close();
}

stopBtn.addEventListener('click', () => {
  void stopEmulation();
});

searchEl.addEventListener('input', () => {
  renderList(searchEl.value);
});

(async () => {
  await loadLastDevice();
  await fetchStatus();
  renderList('');
  searchEl.focus();
})();
