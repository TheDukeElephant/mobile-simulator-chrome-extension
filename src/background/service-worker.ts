import { addBypassRulesForTab, removeBypassRulesForTab } from './dnr-rules';
import { getDeviceById } from '../devices';
import type {
  EmulateStartMessage,
  EmulateStopMessage,
  EmulateStatusRequest,
  EmulateStatusResponse,
  EmulateStoppedNotice,
  ExtensionMessage,
} from '../shared/messages';

interface TabState {
  deviceId: string;
}

const tabStates = new Map<number, TabState>();

async function setBadge(tabId: number, on: boolean): Promise<void> {
  await chrome.action.setBadgeBackgroundColor({ color: '#0969da', tabId });
  await chrome.action.setBadgeText({ text: on ? 'ON' : '', tabId });
}

async function handleStart(tabId: number, deviceId: string): Promise<void> {
  const device = getDeviceById(deviceId);
  if (!device) return;

  tabStates.set(tabId, { deviceId });

  await addBypassRulesForTab(tabId);

  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'EMULATE_START',
      deviceId,
    } satisfies EmulateStartMessage);
  } catch {
    // Content script may not be ready (e.g. chrome:// page). Surface as no-op.
  }

  await setBadge(tabId, true);
}

async function handleStop(tabId: number): Promise<void> {
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

interface RoutedMessage {
  tabId?: number;
}

chrome.runtime.onMessage.addListener((rawMessage, sender, sendResponse) => {
  const msg = rawMessage as ExtensionMessage & RoutedMessage;
  const tabId = msg.tabId ?? sender.tab?.id;

  switch (msg.type) {
    case 'EMULATE_START': {
      if (tabId === undefined) return false;
      void handleStart(tabId, (msg as EmulateStartMessage).deviceId).then(() => sendResponse({ ok: true }));
      return true;
    }
    case 'EMULATE_STOP': {
      if (tabId === undefined) return false;
      void handleStop(tabId).then(() => sendResponse({ ok: true }));
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
    case 'EMULATE_STOPPED_NOTICE': {
      if (tabId === undefined) return false;
      void handleStop(tabId);
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
      .sendMessage(tabId, { type: 'EMULATE_START', deviceId: state.deviceId } satisfies EmulateStartMessage)
      .catch(() => {
        // ignore (e.g. navigated to chrome://)
      });
  }
});

export type {}; // ensure this file is treated as a module
