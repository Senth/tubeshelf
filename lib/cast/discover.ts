/**
 * Cast device discovery over mDNS (`_googlecast._tcp`). Every device with
 * Chromecast built-in advertises there, Android TVs included, and the friendly
 * name rides along in the TXT record.
 *
 * ponytail: SSDP/DIAL-only devices (old smart TV YouTube apps without
 * Chromecast built-in) are not found. Add an SSDP pass if someone reports one.
 */

import { Bonjour } from "bonjour-service";

export interface CastDevice {
  /** IP address the cast client connects to. */
  host: string;
  /** Friendly name, e.g. "Living Room TV". */
  name: string;
}

const SCAN_MS = 2500;
const MAX_ROUNDS = 3;

function pickIpv4(addresses: string[] | undefined, host: string): string {
  const ipv4 = addresses?.find((address) => /^\d+\.\d+\.\d+\.\d+$/.test(address));
  if (ipv4) return ipv4;
  // mDNS hostnames ("LivingRoom.local") resolve badly on some setups, but it is
  // better than nothing when no A record came through.
  return host || "";
}

function scanRound(bonjour: Bonjour): Promise<CastDevice[]> {
  const byHost = new Map<string, CastDevice>();
  return new Promise((resolve) => {
    const browser = bonjour.find({ type: "googlecast" }, (service: any) => {
      const host = pickIpv4(service.addresses, service.host || "");
      if (!host || byHost.has(host)) return;
      const name = service.txt?.fn || service.name || host;
      byHost.set(host, { host, name });
    });
    setTimeout(() => {
      try {
        browser.stop();
      } catch {
        // Already torn down.
      }
      resolve([...byHost.values()]);
    }, SCAN_MS);
  });
}

/**
 * One round of mDNS is not reliable on every network (multicast replies get
 * dropped), so scan repeatedly until something shows up or the budget ends.
 */
export async function discoverCastDevices(): Promise<CastDevice[]> {
  const bonjour = new Bonjour();
  const found = new Map<string, CastDevice>();
  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const devices = await scanRound(bonjour);
      for (const device of devices) found.set(device.host, device);
      if (found.size > 0) break;
    }
  } finally {
    try {
      bonjour.destroy();
    } catch {
      // Ignore teardown races.
    }
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}
