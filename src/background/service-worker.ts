import { addBypassRulesForTab, removeBypassRulesForTab } from './dnr-rules';
import { getDeviceById } from '../devices';
import type {
  EmulateStartMessage,
  EmulateStopMessage,
  EmulateStatusResponse,
  ExtensionMessage,
  Orientation,
  SelectDeviceMessage,
} from '../shared/messages';

const LAST_DEVICE_KEY = 'lastDeviceId';
const LAST_ORIENTATION_KEY = 'lastOrientation';
const DEFAULT_DEVICE_ID = 'iphone-15';

interface TabState {
  deviceId: string;
  orientation: Orientation;
}

const tabStates = new Map<number, TabState>();

async function setBadge(tabId: number, on: boolean): Promise<void> {
  await chrome.action.setBadgeBackgroundColor({ color: '#0969da', tabId });
  await chrome.action.setBadgeText({ text: on ? 'ON' : '', tabId });
}

async function getDefaultDeviceId(): Promise<string> {
  const stored = await chrome.storage.local.get(LAST_DEVICE_KEY);
  const id = stored[LAST_DEVICE_KEY] as string | undefined;
  if (id && getDeviceById(id)) return id;
  return DEFAULT_DEVICE_ID;
}

async function getDefaultOrientation(): Promise<Orientation> {
  const stored = await chrome.storage.local.get(LAST_ORIENTATION_KEY);
  const o = stored[LAST_ORIENTATION_KEY] as Orientation | undefined;
  return o === 'landscape' ? 'landscape' : 'portrait';
}

async function persistState(deviceId: string, orientation: Orientation): Promise<void> {
  await chrome.storage.local.set({
    [LAST_DEVICE_KEY]: deviceId,
    [LAST_ORIENTATION_KEY]: orientation,
  });
}

async function startEmulation(
  tabId: number,
  deviceId: string,
  orientation: Orientation,
): Promise<void> {
  const device = getDeviceById(deviceId);
  if (!device) return;

  tabStates.set(tabId, { deviceId, orientation });
  await persistState(deviceId, orientation);
  await addBypassRulesForTab(tabId);

  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'EMULATE_START',
      deviceId,
      orientation,
    } satisfies EmulateStartMessage);
  } catch {
    // Content script may not be ready (e.g. chrome:// page). Surface as no-op.
  }

  await setBadge(tabId, true);
}

async function stopEmulation(tabId: number): Promise<void> {
  const state = tabStates.get(tabId);
  await removeBypassRulesForTab(tabId);

  if (state) {
    try {
      await chrome.tabs.sendMessage(tabId, { type: 'EMULATE_STOP' } satisfies EmulateStopMessage);
    } catch {
      // tab may have navigated/closed; ignore
    }
  }

  tabStates.delete(tabId);
  await setBadge(tabId, false);
}

// Toggle on toolbar icon click — instant emulation with the last-used device.
chrome.action.onClicked.addListener((tab) => {
  if (tab.id === undefined) return;
  const tabId = tab.id;
  if (tabStates.has(tabId)) {
    void stopEmulation(tabId);
  } else {
    void (async () => {
      const deviceId = await getDefaultDeviceId();
      const orientation = await getDefaultOrientation();
      await startEmulation(tabId, deviceId, orientation);
    })();
  }
});

interface RoutedMessage {
  tabId?: number;
}

chrome.runtime.onMessage.addListener((rawMessage, sender, sendResponse) => {
  const msg = rawMessage as ExtensionMessage & RoutedMessage;
  const tabId = msg.tabId ?? sender.tab?.id;

  switch (msg.type) {
    case 'EMULATE_START': {
      if (tabId === undefined) return false;
      const startMsg = msg as EmulateStartMessage;
      void startEmulation(tabId, startMsg.deviceId, startMsg.orientation).then(() =>
        sendResponse({ ok: true }),
      );
      return true;
    }
    case 'EMULATE_STOP':
    case 'EMULATE_STOPPED_NOTICE': {
      if (tabId === undefined) return false;
      void stopEmulation(tabId).then(() => sendResponse({ ok: true }));
      return true;
    }
    case 'SELECT_DEVICE': {
      if (tabId === undefined) return false;
      const selectMsg = msg as SelectDeviceMessage;
      const current = tabStates.get(tabId);
      const orientation = current?.orientation ?? 'portrait';
      void startEmulation(tabId, selectMsg.deviceId, orientation).then(() =>
        sendResponse({ ok: true }),
      );
      return true;
    }
    case 'ROTATE': {
      if (tabId === undefined) return false;
      const current = tabStates.get(tabId);
      if (!current) {
        sendResponse({ ok: false });
        return false;
      }
      const next: Orientation = current.orientation === 'portrait' ? 'landscape' : 'portrait';
      void startEmulation(tabId, current.deviceId, next).then(() => sendResponse({ ok: true }));
      return true;
    }
    case 'EMULATE_STATUS_REQUEST': {
      if (tabId === undefined) {
        sendResponse({
          type: 'EMULATE_STATUS_RESPONSE',
          active: false,
          deviceId: null,
        } satisfies EmulateStatusResponse);
        return false;
      }
      const state = tabStates.get(tabId);
      sendResponse({
        type: 'EMULATE_STATUS_RESPONSE',
        active: state !== undefined,
        deviceId: state?.deviceId ?? null,
      } satisfies EmulateStatusResponse);
      return false;
    }
    default:
      return false;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabStates.has(tabId)) {
    void removeBypassRulesForTab(tabId);
    tabStates.delete(tabId);
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  // Re-emit EMULATE_START after navigation so the freshly-loaded content script
  // restores the overlay automatically.
  if (changeInfo.status === 'complete' && tabStates.has(tabId)) {
    const state = tabStates.get(tabId)!;
    chrome.tabs
      .sendMessage(tabId, {
        type: 'EMULATE_START',
        deviceId: state.deviceId,
        orientation: state.orientation,
      } satisfies EmulateStartMessage)
      .catch(() => {
        // ignore (e.g. navigated to chrome://)
      });
  }
});

export type {}; // ensure this file is treated as a module
