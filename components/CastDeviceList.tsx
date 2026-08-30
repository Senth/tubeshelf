"use client";

import { useCallback, useEffect, useState } from "react";
import { Link2, Loader2, RefreshCw, Trash2, Tv } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export interface CastPickedDevice {
  id: string;
  name: string;
  kind: "chromecast" | "lounge";
}

interface CastDeviceListProps {
  /** Set while a cast is starting; the matching row shows a spinner. */
  connectingId?: string | null;
  /** When given, picking a device casts; without it the list is manage-only. */
  onPick?: (device: CastPickedDevice & { online: boolean }) => void;
  onShowToast?: (message: string, type: "success" | "error" | "info") => void;
}

/**
 * The list of castable devices plus the TV-code pairing form. Used by the
 * cast picker (pick a device to cast to) and by the settings panel
 * (link and unlink TVs without starting a cast).
 */
export function CastDeviceList({
  connectingId = null,
  onPick,
  onShowToast,
}: CastDeviceListProps) {
  const [devices, setDevices] = useState<
    (CastPickedDevice & { online: boolean })[] | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [showPairing, setShowPairing] = useState(false);
  const [pairingCode, setPairingCode] = useState("");
  const [pairing, setPairing] = useState(false);

  const load = useCallback(async () => {
    setDevices(null);
    setError(null);
    try {
      const res = await fetch("/api/cast/devices", { credentials: "include" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Could not look for devices");
      setDevices(data.devices ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not look for devices");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pair = async () => {
    if (pairing || pairingCode.trim().length === 0) return;
    setPairing(true);
    try {
      const res = await fetch("/api/cast/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: pairingCode.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "Pairing failed");
      }
      setPairingCode("");
      setShowPairing(false);
      onShowToast?.(`Linked ${data.screen.name}`, "success");
      await load();
    } catch (err) {
      onShowToast?.(
        err instanceof Error ? err.message : "Pairing failed",
        "error"
      );
    } finally {
      setPairing(false);
    }
  };

  const unpair = async (device: CastPickedDevice & { online: boolean }) => {
    if (device.kind !== "lounge") return;
    try {
      await fetch(`/api/cast/pair?screenId=${encodeURIComponent(device.id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      await load();
    } catch {
      onShowToast?.("Could not remove the TV", "error");
    }
  };

  return (
    <>
      <div className="px-4 py-3 min-h-40 max-h-80 overflow-y-auto">
        {devices === null && !error && (
          <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <p className="text-sm">Looking for devices on your network…</p>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center py-6 gap-3 text-muted-foreground">
            <p className="text-sm text-center">{error}</p>
            <Button onClick={load} variant="outline" size="sm">
              <RefreshCw className="w-4 h-4 mr-1" />
              Try again
            </Button>
          </div>
        )}

        {devices !== null && !error && devices.length === 0 && (
          <div className="flex flex-col items-center justify-center py-6 gap-3 text-muted-foreground">
            <Tv className="w-8 h-8 opacity-50" />
            <p className="text-sm text-center">
              No cast devices found. Link your TV with a code below, or make
              sure it is on and connected to the network.
            </p>
            <Button onClick={load} variant="outline" size="sm">
              <RefreshCw className="w-4 h-4 mr-1" />
              Search again
            </Button>
          </div>
        )}

        {devices !== null && !error && devices.length > 0 && (
          <div className="space-y-1">
            {devices.map((device) => (
              <div key={device.id} className="flex items-center gap-1">
                {onPick ? (
                  <button
                    onClick={() => onPick(device)}
                    disabled={!!connectingId || !device.online}
                    className="flex-1 min-w-0 text-left px-3 py-2.5 rounded-lg hover:bg-primary/5 transition-colors flex items-center gap-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
                  >
                    <Tv className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                    <span className="flex-1 min-w-0">
                      <span className="text-sm font-medium block truncate">
                        {device.name}
                      </span>
                      {!device.online && (
                        <span className="text-xs text-muted-foreground">
                          Offline — is the YouTube app open?
                        </span>
                      )}
                    </span>
                    {connectingId === device.id && (
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground flex-shrink-0" />
                    )}
                  </button>
                ) : (
                  <div className="flex-1 min-w-0 px-3 py-2.5 flex items-center gap-3 text-foreground">
                    <Tv className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                    <span className="flex-1 min-w-0">
                      <span className="text-sm font-medium block truncate">
                        {device.name}
                      </span>
                      {!device.online && (
                        <span className="text-xs text-muted-foreground">
                          Offline — is the YouTube app open?
                        </span>
                      )}
                    </span>
                  </div>
                )}
                {device.kind === "lounge" && (
                  <Button
                    onClick={() => unpair(device)}
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label={`Unlink ${device.name}`}
                    title="Unlink this TV"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border/30 px-4 py-3 bg-muted/30">
        {showPairing ? (
          <div className="flex items-center gap-2">
            <Input
              value={pairingCode}
              onChange={(event) =>
                setPairingCode(event.target.value.replace(/[^\d]/g, ""))
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") pair();
              }}
              placeholder="12-digit TV code"
              inputMode="numeric"
              autoFocus
              className="h-8 text-sm"
              aria-label="TV code"
            />
            <Button onClick={pair} size="sm" disabled={pairing || !pairingCode.trim()}>
              {pairing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Link2 className="w-4 h-4" />
              )}
              Pair
            </Button>
            <Button
              onClick={() => setShowPairing(false)}
              variant="ghost"
              size="sm"
              disabled={pairing}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <button
            onClick={() => setShowPairing(true)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-primary/50 rounded"
          >
            <Link2 className="w-3.5 h-3.5" />
            TV not listed? Link it with the code from the YouTube app on your TV
          </button>
        )}
      </div>
    </>
  );
}
