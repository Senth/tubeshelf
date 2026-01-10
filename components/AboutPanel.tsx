"use client";

import React, { useEffect, useState } from "react";
import { Monitor } from "lucide-react";

export function AboutPanel() {
  const [version, setVersion] = useState<string>("...");

  useEffect(() => {
    fetch("/api/version")
      .then((res) => res.json())
      .then((data) => setVersion(data.version))
      .catch(() => setVersion("unknown"));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-8">
        <Monitor className="w-7 h-7 text-primary" />
        <h2 className="text-2xl sm:text-3xl font-bold">About</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Information about TubeShelf and your installation
      </p>

      <div className="bg-card/50 border border-border/30 rounded-xl p-5 space-y-4 backdrop-blur-sm">
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Version</span>
          <span className="font-mono font-semibold text-foreground">
            v{version}
          </span>
        </div>
        <div className="border-t border-border/30 pt-4 flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Application</span>
          <span className="font-semibold text-foreground">TubeShelf</span>
        </div>
      </div>
    </div>
  );
}
