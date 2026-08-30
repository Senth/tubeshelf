"use client";

import { useEffect, useState } from "react";
import { Cast, X } from "lucide-react";
import { Button } from "./ui/button";
import { CastDeviceList, type CastPickedDevice } from "./CastDeviceList";

export type { CastPickedDevice };

interface CastDevicePickerProps {
  videoId: string;
  /** This device's preferred playback speed, applied on the TV when cast starts. */
  speed?: number | null;
  onClose: () => void;
  onStarted: (device: CastPickedDevice) => void;
  onShowToast: (message: string, type: "success" | "error" | "info") => void;
}

export function CastDevicePicker({
  videoId,
  speed,
  onClose,
  onStarted,
  onShowToast,
}: CastDevicePickerProps) {
  const [connectingId, setConnectingId] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const cast = async (device: CastPickedDevice & { online: boolean }) => {
    if (connectingId || !device.online) return;
    setConnectingId(device.id);
    try {
      const res = await fetch("/api/cast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          kind: device.kind,
          id: device.id,
          name: device.name,
          videoId,
          speed: typeof speed === "number" ? speed : undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || `Could not cast to ${device.name}`);
      }
      onStarted({ id: device.id, name: device.name, kind: device.kind });
    } catch (err) {
      onShowToast(
        err instanceof Error ? err.message : `Could not cast to ${device.name}`,
        "error"
      );
      setConnectingId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border/50 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label="Cast to TV"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 bg-gradient-to-r from-primary/5 to-transparent">
          <div className="flex items-center gap-2">
            <Cast className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold">Cast to TV</h3>
          </div>
          <Button
            onClick={onClose}
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <CastDeviceList
          connectingId={connectingId}
          onPick={cast}
          onShowToast={onShowToast}
        />
      </div>
    </div>
  );
}
