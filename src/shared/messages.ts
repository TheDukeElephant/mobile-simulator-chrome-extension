// Typed message contracts shared across popup, service worker, and content script.

export type Orientation = 'portrait' | 'landscape';

export interface EmulateStartMessage {
  type: 'EMULATE_START';
  deviceId: string;
}

export interface EmulateStopMessage {
  type: 'EMULATE_STOP';
}

export interface EmulateStatusRequest {
  type: 'EMULATE_STATUS_REQUEST';
}

export interface EmulateStatusResponse {
  type: 'EMULATE_STATUS_RESPONSE';
  active: boolean;
  deviceId: string | null;
}

// Sent from content script to background to notify state changes (e.g. user clicks close).
export interface EmulateStoppedNotice {
  type: 'EMULATE_STOPPED_NOTICE';
}

export type ExtensionMessage =
  | EmulateStartMessage
  | EmulateStopMessage
  | EmulateStatusRequest
  | EmulateStatusResponse
  | EmulateStoppedNotice;
