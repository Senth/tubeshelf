"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle,
  Copy,
  ExternalLink,
  Loader2,
  ThumbsUp,
  Trash2,
  XCircle,
} from "lucide-react";

interface YouTubeClientConfig {
  clientId: string;
  configured: boolean;
  redirectUri: string;
  scope: string;
  encryptionKeyConfigured: boolean;
}

export function AdminYouTube() {
  const [config, setConfig] = useState<YouTubeClientConfig | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const loadConfig = async () => {
    try {
      const res = await fetch("/api/admin/youtube");
      if (!res.ok) throw new Error("Failed to load configuration");
      const data: YouTubeClientConfig = await res.json();
      setConfig(data);
      setClientId(data.clientId || "");
    } catch (err) {
      setMessage({
        type: "error",
        text: "Could not load the YouTube configuration.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setSaving(true);

    try {
      const res = await fetch("/api/admin/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: clientId.trim(), clientSecret }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Failed to save" });
        return;
      }

      setConfig(data);
      setClientSecret("");
      setMessage({ type: "success", text: "OAuth client saved." });
    } catch {
      setMessage({ type: "error", text: "An error occurred while saving." });
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setMessage(null);
    setSaving(true);
    try {
      const res = await fetch("/api/admin/youtube", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Failed to remove" });
        return;
      }
      setConfig(data);
      setClientId("");
      setClientSecret("");
      setMessage({ type: "success", text: "OAuth client removed." });
    } catch {
      setMessage({ type: "error", text: "An error occurred while removing." });
    } finally {
      setSaving(false);
    }
  };

  const handleCopyRedirect = async () => {
    if (!config?.redirectUri) return;
    try {
      await navigator.clipboard.writeText(config.redirectUri);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setMessage({
        type: "error",
        text: "Could not copy — select the URI and copy it manually.",
      });
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <Loader2 className="w-8 h-8 text-muted-foreground mx-auto mb-4 animate-spin" />
        <p className="text-muted-foreground">Loading YouTube settings...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <ThumbsUp className="w-6 h-6 text-primary" />
        <div>
          <h2 className="text-2xl font-bold">YouTube Integration</h2>
          <p className="text-sm text-muted-foreground">
            Optional. Lets users like videos from the built-in player.
          </p>
        </div>
      </div>

      {message && (
        <div
          className={`flex items-start gap-2 p-3 rounded-lg text-sm ${
            message.type === "success"
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "bg-red-500/10 text-red-600 dark:text-red-400"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      <div className="bg-card/50 border border-border/30 rounded-xl p-6 space-y-4">
        <h3 className="font-semibold">Before you start</h3>
        <p className="text-sm text-muted-foreground">
          Liking a video is an action on a real YouTube account, so it cannot be
          done from the embedded player. TubeShelf calls the YouTube Data API
          instead, which needs an OAuth client from your own Google Cloud
          project. Each user then connects their own YouTube account under
          Profile Settings.
        </p>

        <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
          <li>
            Create a project and enable the <strong>YouTube Data API v3</strong>{" "}
            for it.
          </li>
          <li>
            Configure the OAuth consent screen and add the scope{" "}
            <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">
              {config?.scope}
            </code>
            .
          </li>
          <li>
            Create an OAuth client of type <strong>Web application</strong> and
            add the redirect URI below.
          </li>
          <li>Paste the client ID and secret into the form.</li>
        </ol>

        <div className="flex flex-wrap gap-3 pt-1">
          <a
            href="https://developers.google.com/youtube/registering_an_application"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Registering an application (official guide)
          </a>
          <a
            href="https://developers.google.com/youtube/v3/getting-started"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            YouTube Data API: getting started
          </a>
          <a
            href="https://console.cloud.google.com/apis/credentials"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Google Cloud credentials console
          </a>
        </div>
      </div>

      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="text-sm text-amber-700 dark:text-amber-300 space-y-1">
          <p>
            While the OAuth consent screen is in <strong>Testing</strong>,
            Google expires refresh tokens after 7 days and everyone has to
            reconnect. Publishing the app keeps them alive. YouTube scopes are
            sensitive, so an unverified published app shows a &ldquo;Google
            hasn&rsquo;t verified this app&rdquo; warning that you click through
            once, and is capped at 100 users.
          </p>
          <p>
            Quota: liking costs 50 units of the default 10,000 per day, so
            roughly 200 likes daily across the instance.
          </p>
        </div>
      </div>

      {!config?.encryptionKeyConfigured && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-600 dark:text-red-400" />
          <p className="text-sm text-red-700 dark:text-red-300">
            No <code className="font-mono text-xs">BETTER_AUTH_SECRET</code> (or{" "}
            <code className="font-mono text-xs">OIDC_ENCRYPTION_KEY</code>) is
            set. The client secret and user tokens are encrypted with it, so
            saving will fail until one is configured.
          </p>
        </div>
      )}

      <form
        onSubmit={handleSave}
        className="bg-card/50 border border-border/30 rounded-xl p-6 space-y-4"
      >
        <div>
          <label className="block text-sm font-medium mb-2">
            Authorized redirect URI
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={config?.redirectUri || ""}
              readOnly
              className="w-full px-3 py-2 bg-muted border border-border rounded-lg font-mono text-sm text-muted-foreground"
            />
            <button
              type="button"
              onClick={handleCopyRedirect}
              className="px-3 py-2 border border-border rounded-lg hover:bg-muted transition cursor-pointer flex items-center gap-1.5 text-sm whitespace-nowrap"
            >
              <Copy className="w-3.5 h-3.5" />
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">
            Add this exact value to the OAuth client in Google Cloud. If you
            reach TubeShelf on several hostnames, add one entry per hostname.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Client ID *</label>
          <input
            type="text"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            required
            className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary font-mono text-sm"
            placeholder="1234567890-abcdefg.apps.googleusercontent.com"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Client Secret {config?.configured ? "(Optional)" : "*"}
          </label>
          <input
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            required={!config?.configured}
            autoComplete="off"
            className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary font-mono text-sm"
            placeholder={
              config?.configured
                ? "Leave empty to keep current secret"
                : "••••••••••••••••"
            }
          />
          <p className="text-xs text-muted-foreground mt-1.5">
            {config?.configured
              ? "Only enter a value if you want to replace the stored secret."
              : "Stored encrypted, never displayed after saving."}
          </p>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={saving || !clientId.trim()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-2 text-sm font-medium"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save OAuth client
          </button>

          {config?.configured && (
            <button
              type="button"
              onClick={handleClear}
              disabled={saving}
              className="px-4 py-2 border border-border rounded-lg hover:bg-muted transition disabled:opacity-50 cursor-pointer flex items-center gap-2 text-sm"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remove
            </button>
          )}

          <span className="text-sm text-muted-foreground ml-auto">
            {config?.configured ? "Configured" : "Not configured"}
          </span>
        </div>
      </form>
    </div>
  );
}

export default AdminYouTube;
