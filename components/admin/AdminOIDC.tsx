"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  CheckCircle,
  XCircle,
  Loader2,
  ChevronDown,
  X,
  AlertCircle,
  CheckCheck,
  Trash2,
  Edit2,
  Key,
  Shield,
  Settings,
  Zap,
  Copy,
  Eye,
  EyeOff,
} from "lucide-react";

interface OIDCProvider {
  id: string;
  name: string;
  issuer: string;
  baseUrl?: string;
  discoveryUrl?: string;
  domain?: string;
  redirectUri: string;
  clientId: string;
  scopes?: string;
  autoProvision?: boolean;
  enabled: boolean;
  groupClaimName?: string;
  adminGroupValue?: string;
  createdAt: string;
}

export function AdminOIDC() {
  const { user, loading } = useAuth();
  const [provider, setProvider] = useState<OIDCProvider | null>(null);
  const [formData, setFormData] = useState({
    id: "oidc",
    name: "",
    issuer: "",
    baseUrl: "",
    discoveryUrl: "",
    domain: "",
    clientId: "",
    clientSecret: "",
    scopes: "openid profile email groups",
    autoProvision: false,
    groupClaimName: "",
    adminGroupValue: "",
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [scopeInput, setScopeInput] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [testingIssuer, setTestingIssuer] = useState(false);
  const [issuerTestResult, setIssuerTestResult] = useState<{
    status: "success" | "error";
    message: string;
  } | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasInitializedRef = useRef(false);
  const isDeletingRef = useRef(false);
  const [lastSavedData, setLastSavedData] = useState(formData);

  useEffect(() => {
    if (user?.isAdmin && !hasInitializedRef.current) {
      hasInitializedRef.current = true;
      loadProviders();
    }
  }, [user]);

  // Clear success message when tab loses focus (navigating away)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setSuccess("");
        setError("");
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // Auto-save form data with debounce
  useEffect(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        // Skip auto-save if we're deleting
        if (isDeletingRef.current) {
          return;
        }

        setError("");

        // Check if anything actually changed
        if (JSON.stringify(formData) === JSON.stringify(lastSavedData)) {
          return;
        }

        // Only save if we have required fields
        // When creating new (POST), clientSecret is required
        // When updating (PATCH), clientSecret is optional
        if (!formData.name || !formData.issuer || !formData.clientId) {
          return;
        }
        if (!provider && !formData.clientSecret) {
          return;
        }

        const method = provider ? "PATCH" : "POST";
        const response = await fetch("/api/admin/oidc-providers", {
          method,
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...formData,
            id: provider?.id || "oidc",
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          setError(data.error || "Failed to save provider");
          return;
        }

        // Update provider state with response data if available
        if (data.provider) {
          setProvider(data.provider);
        }

        setLastSavedData(formData);
        setSuccess("Changes saved successfully");
        setTimeout(() => setSuccess(""), 3000);
      } catch (err) {
        setError("An error occurred while saving");
        console.error("Auto-save provider error:", err);
      }
    }, 1000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [formData, provider, lastSavedData]);

  const loadProviders = async () => {
    try {
      const response = await fetch("/api/admin/oidc-providers");
      const data = await response.json();
      if (data.providers && data.providers.length > 0) {
        const p = data.providers[0];
        setProvider(p);
        setFormData({
          id: "oidc",
          name: p.name,
          issuer: p.issuer,
          baseUrl: p.baseUrl || "",
          discoveryUrl: p.discoveryUrl || "",
          domain: p.domain || "",
          clientId: p.clientId,
          clientSecret: "",
          scopes: p.scopes || "openid profile email groups",
          autoProvision: p.autoProvision !== undefined ? p.autoProvision : true,
          groupClaimName: p.groupClaimName || "",
          adminGroupValue: p.adminGroupValue || "",
        });
        setLastSavedData({
          id: "oidc",
          name: p.name,
          issuer: p.issuer,
          baseUrl: p.baseUrl || "",
          discoveryUrl: p.discoveryUrl || "",
          domain: p.domain || "",
          clientId: p.clientId,
          clientSecret: "",
          scopes: p.scopes || "openid profile email groups",
          autoProvision: p.autoProvision !== undefined ? p.autoProvision : true,
          groupClaimName: p.groupClaimName || "",
          adminGroupValue: p.adminGroupValue || "",
        });
      }
    } catch (err) {
      console.error("Failed to load provider:", err);
    }
  };

  const handleDelete = async () => {
    if (!provider) return;
    if (
      !confirm(
        "Are you sure you want to delete this OIDC provider? This cannot be undone."
      )
    ) {
      return;
    }
    try {
      isDeletingRef.current = true;
      const response = await fetch("/api/admin/oidc-providers?id=oidc", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const emptyForm = {
        id: "oidc",
        name: "",
        issuer: "",
        baseUrl: "",
        discoveryUrl: "",
        domain: "",
        clientId: "",
        clientSecret: "",
        scopes: "openid profile email groups",
        autoProvision: false,
        groupClaimName: "",
        adminGroupValue: "",
      };

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error || "Failed to delete provider");
        isDeletingRef.current = false;
        return;
      }

      setProvider(null);
      setFormData(emptyForm);
      setLastSavedData(emptyForm);
      setSuccess("Provider deleted successfully");
      setTimeout(() => setSuccess(""), 3000);
      isDeletingRef.current = false;
    } catch (err) {
      console.error("Delete provider error:", err);
      setError("Failed to delete provider");
      isDeletingRef.current = false;
    }
  };

  const handleTestIssuer = async () => {
    if (!formData.issuer) {
      setIssuerTestResult({
        status: "error",
        message: "Please enter an issuer URL first",
      });
      return;
    }

    setTestingIssuer(true);
    setIssuerTestResult(null);

    try {
      const wellKnownUrl = `${formData.issuer.replace(
        /\/$/,
        ""
      )}/.well-known/openid-configuration`;
      const response = await fetch(wellKnownUrl);

      if (!response.ok) {
        setIssuerTestResult({
          status: "error",
          message: `Failed to fetch discovery document: ${response.status} ${response.statusText}`,
        });
        return;
      }

      const config = await response.json();

      if (
        !config.issuer ||
        !config.authorization_endpoint ||
        !config.token_endpoint
      ) {
        setIssuerTestResult({
          status: "error",
          message:
            "Invalid OIDC discovery document - missing required endpoints",
        });
        return;
      }

      setIssuerTestResult({
        status: "success",
        message: `Valid OIDC provider! Found ${
          Object.keys(config).length
        } configuration fields.`,
      });
    } catch (err: any) {
      setIssuerTestResult({
        status: "error",
        message: err.message || "Failed to connect to issuer URL",
      });
    } finally {
      setTestingIssuer(false);
    }
  };

  const getRedirectUri = () => {
    if (typeof window === "undefined") {
      return "https://your-domain.com/api/auth/oidc/callback";
    }
    return `${window.location.protocol}//${window.location.host}/api/auth/oidc/callback`;
  };

  const getScopes = () => {
    return formData.scopes
      .split(" ")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  };

  const addScope = (scope: string) => {
    const scopes = getScopes();
    if (!scopes.includes(scope)) {
      setFormData({ ...formData, scopes: [...scopes, scope].join(" ") });
    }
  };

  const removeScope = (scope: string) => {
    const scopes = getScopes().filter((s) => s !== scope);
    setFormData({ ...formData, scopes: scopes.join(" ") });
  };

  const handleScopeInputKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === "Enter" || e.key === " " || e.key === ",") {
      e.preventDefault();
      const trimmedInput = scopeInput.trim();
      if (trimmedInput) {
        addScope(trimmedInput);
        setScopeInput("");
      }
    } else if (e.key === "Backspace" && !scopeInput) {
      const scopes = getScopes();
      if (scopes.length > 0) {
        removeScope(scopes[scopes.length - 1]);
      }
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (!user?.isAdmin) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Messages */}
      {error && (
        <div className="flex items-start gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive">
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Error</p>
            <p className="text-sm mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {success && (
        <div className="fixed top-4 right-4 flex items-start gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-lg text-green-500 z-50 animate-in slide-in-from-top-5 fade-in">
          <CheckCheck className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <p className="font-medium">{success}</p>
        </div>
      )}

      {/* OIDC Provider Form */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="text-xl font-bold mb-6">OIDC Provider</h3>

        <form className="space-y-6">
          {/* Info Box */}
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-900 dark:text-blue-100">
                <p className="font-medium mb-2">Redirect URI Configuration</p>
                <p className="mb-3">
                  Configure this URL in your OIDC provider settings:
                </p>
                <div className="flex items-center gap-2 bg-blue-950/20 p-2 rounded font-mono text-xs break-all">
                  {getRedirectUri()}
                  <button
                    type="button"
                    onClick={() => copyToClipboard(getRedirectUri())}
                    className="text-blue-500 hover:text-blue-400 transition ml-auto flex-shrink-0"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Provider Name */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Provider Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              required
              className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="e.g., Corporate SSO, GitHub, Keycloak"
            />
            <p className="text-xs text-muted-foreground mt-1.5">
              Name shown to users on the login page
            </p>
          </div>

          {/* Issuer URL */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Issuer URL *
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                value={formData.issuer}
                onChange={(e) => {
                  setFormData({ ...formData, issuer: e.target.value });
                  setIssuerTestResult(null);
                }}
                required
                className="flex-1 px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary font-mono text-sm"
                placeholder="https://auth.example.com"
              />
              <button
                type="button"
                onClick={handleTestIssuer}
                disabled={testingIssuer || !formData.issuer}
                className="px-4 py-2 bg-secondary hover:bg-secondary/80 text-foreground rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap flex items-center gap-2"
              >
                {testingIssuer ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Testing...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4" />
                    Test
                  </>
                )}
              </button>
            </div>
            {issuerTestResult && (
              <div
                className={`mt-2 px-3 py-2 rounded-lg text-sm flex items-start gap-2 ${
                  issuerTestResult.status === "success"
                    ? "bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20"
                    : "bg-destructive/10 text-destructive border border-destructive/20"
                }`}
              >
                {issuerTestResult.status === "success" ? (
                  <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                )}
                <span>{issuerTestResult.message}</span>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1.5">
              Base URL of your OIDC provider
            </p>
          </div>

          {/* Client Configuration */}
          <div className="border-t border-border pt-6">
            <h4 className="text-sm font-semibold text-muted-foreground mb-4">
              Client Configuration
            </h4>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Client ID *
                </label>
                <input
                  type="text"
                  value={formData.clientId}
                  onChange={(e) =>
                    setFormData({ ...formData, clientId: e.target.value })
                  }
                  required
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary font-mono text-sm"
                  placeholder="tubeshelf"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Client Secret {provider ? "(Optional)" : "*"}
                </label>
                <input
                  type="password"
                  value={formData.clientSecret}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      clientSecret: e.target.value,
                    })
                  }
                  required={!provider}
                  autoComplete="off"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary font-mono text-sm"
                  placeholder={
                    provider
                      ? "Leave empty to keep current secret"
                      : "••••••••••••••••"
                  }
                />
                <p className="text-xs text-muted-foreground mt-1.5">
                  {provider
                    ? "Only enter if you want to update the secret"
                    : "Stored securely, never displayed after creation"}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  OAuth Scopes
                </label>
                <div className="w-full px-3 py-2 bg-background border border-border rounded-lg focus-within:ring-2 focus-within:ring-primary min-h-[42px] flex flex-wrap gap-2 items-center">
                  {getScopes().map((scope) => (
                    <span
                      key={scope}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded text-sm font-mono"
                    >
                      {scope}
                      <button
                        type="button"
                        onClick={() => removeScope(scope)}
                        className="hover:bg-primary/20 rounded p-0.5 transition cursor-pointer"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    value={scopeInput}
                    onChange={(e) => setScopeInput(e.target.value)}
                    onKeyDown={handleScopeInputKeyDown}
                    className="flex-1 min-w-[120px] bg-transparent outline-none font-mono text-sm"
                    placeholder={
                      getScopes().length === 0
                        ? "openid profile email groups"
                        : "Add scope..."
                    }
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">
                  Press Enter, Space, or Comma to add a scope
                </p>
              </div>
            </div>
          </div>

          {/* Options */}
          <div className="border-t border-border pt-6 space-y-3">
            <label className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg border border-border hover:bg-muted/70 cursor-pointer transition">
              <input
                type="checkbox"
                checked={formData.autoProvision}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    autoProvision: e.target.checked,
                  })
                }
                className="mt-1 h-4 w-4 rounded border-border cursor-pointer"
              />
              <div className="flex-1">
                <p className="text-sm font-medium">Auto-provisioning</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Automatically create accounts for new users
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg border border-border hover:bg-muted/70 cursor-pointer transition">
              <input
                type="checkbox"
                checked={provider?.enabled ?? true}
                onChange={() => {
                  // Toggle enabled state via API would go here
                }}
                className="mt-1 h-4 w-4 rounded border-border cursor-pointer"
              />
              <div className="flex-1">
                <p className="text-sm font-medium">Enable provider</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Allow users to authenticate with this provider
                </p>
              </div>
            </label>
          </div>

          {/* Advanced Settings */}
          <div className="border-t border-border pt-6">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between group cursor-pointer hover:bg-muted/50 -mx-6 -mt-6 px-6 pt-6 pb-2 rounded-t-lg transition"
            >
              <h4 className="text-sm font-semibold">Optional Settings</h4>
              <ChevronDown
                className={`h-5 w-5 text-muted-foreground transition-transform ${
                  showAdvanced ? "rotate-180" : ""
                }`}
              />
            </button>

            {showAdvanced && (
              <div className="mt-4 space-y-4 pt-4 border-t border-border">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Base URL (Optional)
                  </label>
                  <input
                    type="url"
                    value={formData.baseUrl}
                    onChange={(e) =>
                      setFormData({ ...formData, baseUrl: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary font-mono text-sm"
                    placeholder="https://auth.example.com"
                  />
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Override if different from issuer
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Discovery URL (Optional)
                  </label>
                  <input
                    type="url"
                    value={formData.discoveryUrl}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        discoveryUrl: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary font-mono text-sm"
                    placeholder="https://auth.example.com/.well-known/openid-configuration"
                  />
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Only if your provider uses a non-standard path
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Domain Restriction (Optional)
                  </label>
                  <input
                    type="text"
                    value={formData.domain}
                    onChange={(e) =>
                      setFormData({ ...formData, domain: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="example.com"
                  />
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Restrict logins to users from a specific domain
                  </p>
                </div>

                <div className="bg-muted/30 rounded-lg p-4">
                  <h5 className="text-sm font-semibold mb-4 flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Auto-Admin from Group Claims
                  </h5>
                  <p className="text-xs text-muted-foreground mb-4">
                    Automatically grant admin role based on group membership
                  </p>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Group Claim Name
                      </label>
                      <input
                        type="text"
                        value={formData.groupClaimName}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            groupClaimName: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary font-mono text-sm"
                        placeholder="groups"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Name of the claim containing user groups
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Admin Group Value
                      </label>
                      <input
                        type="text"
                        value={formData.adminGroupValue}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            adminGroupValue: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary font-mono text-sm"
                        placeholder="admins"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Group value that grants admin status
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Form Actions */}
          <div className="flex gap-3 pt-6 border-t border-border">
            {provider && (
              <button
                type="button"
                onClick={handleDelete}
                className="px-4 py-2 bg-destructive/10 hover:bg-destructive/20 text-destructive rounded-lg font-medium transition cursor-pointer border border-destructive/20 flex items-center gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
