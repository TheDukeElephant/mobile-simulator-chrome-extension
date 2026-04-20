import devicesData from './devices.json';

export type DeviceCategory = 'phone' | 'tablet';

export interface Device {
  id: string;
  name: string;
  category: DeviceCategory;
  width: number;
  height: number;
  devicePixelRatio: number;
  userAgent: string;
}

const devices = devicesData as Device[];

export function getDevices(): Device[] {
  return devices;
}

export function getDeviceById(id: string): Device | undefined {
  return devices.find((d) => d.id === id);
}
