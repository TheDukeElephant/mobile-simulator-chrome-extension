import devicesData from './devices.json';

export type DeviceCategory = 'phone' | 'tablet';
export type Platform = 'ios' | 'android';
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
  platform: Platform;
  width: number;
  height: number;
  devicePixelRatio: number;
  /**
   * Display corner radius in CSS pixels. Sourced from Apple's UIScreen
   * displayCornerRadius for iPhones and commonly published values for
   * Android devices. 0 for devices without rounded screen corners.
   */
  cornerRadius: number;
  userAgent: string;
  notch?: DeviceNotch;
  /** Optional override for the chassis bezel thickness (CSS px). */
  bezelWidth?: number;
  /** Optional override for the chassis colour. */
  chassisColor?: string;
}

/** Resolved chassis settings with defaults applied. */
export interface ChassisSpec {
  /** Bezel thickness around the screen in CSS px. */
  width: number;
  /** Outer chassis colour. */
  color: string;
  /** Slightly lighter accent for side buttons. */
  buttonColor: string;
}

export function getChassis(device: Device): ChassisSpec {
  // iPhones with rounded corners have noticeably thinner bezels than
  // older flat-edge designs; tablets get a slightly thicker bezel.
  const defaultWidth = device.category === 'tablet' ? 16 : device.cornerRadius === 0 ? 14 : 11;
  return {
    width: device.bezelWidth ?? defaultWidth,
    color: device.chassisColor ?? '#1d1d1f',
    buttonColor: '#2c2c2e',
  };
}

/**
 * Browser chrome layout returned per platform / device. All measurements in
 * CSS pixels and refer to portrait orientation.
 */
export interface ChromeLayout {
  statusBarHeight: number;
  urlBarHeight: number;
  /** Where the URL bar sits relative to the iframe content area. */
  urlBarPosition: 'top' | 'bottom';
  /** Bottom home-indicator pill height (iOS notched/island devices only). */
  homeIndicatorHeight: number;
}

export function getChromeLayout(device: Device): ChromeLayout {
  if (device.category === 'tablet') {
    // Tablets in landscape browser apps usually maximise content; still
    // show a thin top URL bar + status for realism.
    return {
      statusBarHeight: device.platform === 'ios' ? 24 : 24,
      urlBarHeight: device.platform === 'ios' ? 50 : 48,
      urlBarPosition: 'top',
      homeIndicatorHeight: 0,
    };
  }
  if (device.platform === 'ios') {
    if (device.notch) {
      // Modern iPhones (X and later): status bar around the notch / island,
      // URL pill floats at the bottom over the page (iOS 17+ Safari behaviour),
      // plus the home indicator pill.
      return {
        statusBarHeight: device.notch.type === 'dynamic-island' ? 54 : 44,
        urlBarHeight: 50,
        urlBarPosition: 'bottom',
        homeIndicatorHeight: 34,
      };
    }
    // Classic iPhone (5/SE) — top status bar + bottom URL bar (modern Safari/Chrome).
    return {
      statusBarHeight: 20,
      urlBarHeight: 44,
      urlBarPosition: 'bottom',
      homeIndicatorHeight: 0,
    };
  }
  // Android Chrome: top status + top URL bar + thin gesture indicator.
  return {
    statusBarHeight: 24,
    urlBarHeight: 56,
    urlBarPosition: 'top',
    homeIndicatorHeight: 24,
  };
}

const devices = devicesData as Device[];

export function getDevices(): Device[] {
  return devices;
}

export function getDeviceById(id: string): Device | undefined {
  return devices.find((d) => d.id === id);
}
