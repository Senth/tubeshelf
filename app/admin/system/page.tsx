"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import {
  Shield,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Lock,
} from "lucide-react";

interface AdminSystemProps {
  onBack?: () => void;
}

export default function AdminSystem({ onBack }: AdminSystemProps = {}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [oidcOnly, setOidcOnly] = useState(false);
  const [hasOIDCProvider, setHasOIDCProvider] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    if (!loading && (!user || !user.isAdmin)) {
      router.push("/");
    }
  }, [user, loading, router]);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const [settingsRes, oidcRes] = await Promise.all([
        fetch("/api/admin/system-settings"),
        fetch("/api/admin/oidc-providers"),
      ]);

      const [settingsData, oidcData] = await Promise.all([
        settingsRes.json(),
        oidcRes.json(),
      ]);

      setOidcOnly(settingsData.oidcOnly || false);
      setHasOIDCProvider(
        !!(
          oidcData.providers &&
          oidcData.providers.length > 0 &&
          oidcData.providers.some((p: any) => p.enabled)
        )
      );
    } catch (error) {
      console.error("Failed to load settings:", error);
    } finally {
      setLoadingSettings(false);
    }
  };

  const handleSave = async () => {
    setMessage(null);
    setSaving(true);

    try {
      const response = await fetch("/api/admin/system-settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          oidcOnly,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage({
          type: "error",
          text: data.error || "Failed to save settings",
        });
        // On error, reload to get the actual state from server
        setTimeout(() => {
          loadSettings();
        }, 500);
        return;
      }

      setMessage({ type: "success", text: "Settings saved successfully" });
      // Trust the state we just saved - don't reload immediately
      // This avoids the toggle sliding back due to timing issues
    } catch (error) {
      setMessage({ type: "error", text: "An error occurred while saving" });
      console.error("Save error:", error);
      // On error, reload to get the actual state from server
      setTimeout(() => {
        loadSettings();
      }, 500);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = (checked: boolean) => {
    if (checked && !hasOIDCProvider) {
      setMessage({
        type: "error",
        text: "Cannot enable OIDC-only login without an enabled OIDC provider",
      });
      return;
    }
    setOidcOnly(checked);
    setMessage(null);
  };

  if (loading || loadingSettings) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!user || !user.isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() =>
              onBack ? onBack() : (window.location.href = "/?page=admin")
            }
            className="text-sm text-muted-foreground hover:text-foreground mb-4 cursor-pointer bg-transparent border-none"
          >
            ← Back to Admin Panel
          </button>
          <div className="flex items-center gap-3 mb-2">
            <Shield className="w-8 h-8 text-primary" />
            <h1 className="text-3xl font-bold">System Settings</h1>
          </div>
          <p className="text-muted-foreground">
            Configure system-wide authentication and security settings
          </p>
        </div>

        {/* Settings Card */}
        <div className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-6">
            Authentication Settings
          </h2>

          {/* Warning if OIDC not configured */}
          {!hasOIDCProvider && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 mb-6 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-yellow-500">
                  OIDC Provider Required
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  You must configure and enable an OIDC provider before
                  disabling password login to prevent being locked out.
                </p>
              </div>
            </div>
          )}

          {/* OIDC-Only Login */}
          <div
            className={`rounded-lg p-6 border-2 transition-all mb-6 ${
              oidcOnly
                ? "bg-blue-500/5 border-blue-500/50"
                : "bg-card border-border"
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  {oidcOnly && (
                    <Lock className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  )}
                  <label className="block text-lg font-semibold">
                    OIDC-Only Login
                  </label>
                  {oidcOnly && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/30 text-blue-700 dark:text-blue-400 border border-blue-500/40">
                      <CheckCircle className="w-3 h-3" />
                      Enabled
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mb-3">
                  When enabled, users can only authenticate via OIDC provider.
                  Local password login will be hidden from the login page.
                </p>
                {hasOIDCProvider && (
                  <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1 mt-2">
                    <CheckCircle className="w-3.5 h-3.5" />
                    OIDC provider is configured and enabled
                  </p>
                )}
              </div>

              {/* Toggle Switch */}
              <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={oidcOnly}
                  onChange={(e) => handleToggle(e.target.checked)}
                  disabled={!hasOIDCProvider}
                />
                <div className="w-14 h-8 bg-gray-300 dark:bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-500/30 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-1 after:start-1 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-blue-600 peer-disabled:opacity-40 peer-disabled:cursor-not-allowed"></div>
              </label>
            </div>
          </div>

          {/* Message */}
          {message && (
            <div
              className={`rounded-lg p-4 mb-6 border ${
                message.type === "success"
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                  : "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400"
              }`}
            >
              <div className="flex items-center gap-2">
                {message.type === "success" ? (
                  <CheckCircle className="w-5 h-5 flex-shrink-0" />
                ) : (
                  <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                )}
                <p className="text-sm font-medium">{message.text}</p>
              </div>
            </div>
          )}

          {/* Save Button */}
          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
