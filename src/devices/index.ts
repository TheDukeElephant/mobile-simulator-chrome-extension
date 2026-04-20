import devicesData from './devices.json';

export type DeviceCategory = 'phone' | 'tablet';

export type NotchType = 'notch' | 'dynamic-island';

export interface DeviceNotch {
  type: NotchType;
  /** Width of the notch/island in CSS pixels. */
  width: number;
  /** Height of the notch/island in CSS pixels. */
  height: number;
  /** Distance from the top of the viewport (px). 0 for traditional notch. */
  topOffset: number;
}

export interface Device {
  id: string;
  name: string;
  category: DeviceCategory;
  width: number;
  height: number;
  devicePixelRatio: number;
  userAgent: string;
  /** Optional cutout for iPhones (notch or Dynamic Island). */
  notch?: DeviceNotch;
}

const devices = devicesData as Device[];

export function getDevices(): Device[] {
  return devices;
}

export function getDeviceById(id: string): Device | undefined {
  return devices.find((d) => d.id === id);
}
