"use client";

import { useEffect } from "react";
import { X, Check, AlertCircle, Info } from "lucide-react";

export interface ToastProps {
  id: string;
  message: string;
  type?: "success" | "error" | "info";
  duration?: number;
  onUndo?: () => void;
  onClose: (id: string) => void;
}

export function Toast({
  id,
  message,
  type = "success",
  duration = 4000,
  onUndo,
  onClose,
}: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose(id);
    }, duration);

    return () => clearTimeout(timer);
  }, [id, duration, onClose]);

  const icons = {
    success: <Check className="w-5 h-5 text-green-500" />,
    error: <AlertCircle className="w-5 h-5 text-red-500" />,
    info: <Info className="w-5 h-5 text-blue-500" />,
  };

  return (
    <div className="flex items-center gap-3 bg-card border border-border rounded-lg shadow-lg p-4 min-w-80 max-w-md animate-in slide-in-from-bottom-5 fade-in">
      {icons[type]}
      <p className="flex-1 text-sm font-medium">{message}</p>
      <div className="flex items-center gap-2">
        {onUndo && (
          <button
            onClick={() => {
              onUndo();
              onClose(id);
            }}
            className="px-3 py-1.5 text-sm font-semibold bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            Undo
          </button>
        )}
        <button
          onClick={() => onClose(id)}
          className="text-muted-foreground hover:text-foreground transition-colors p-1"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
