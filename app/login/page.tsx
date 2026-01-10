"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface OIDCProvider {
  id: string;
  name: string;
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [oidcProviders, setOidcProviders] = useState<OIDCProvider[]>([]);
  const [oidcOnly, setOidcOnly] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Check if setup is needed
    fetch("/api/setup")
      .then((res) => res.json())
      .then((data) => {
        if (data.needsSetup) {
          router.push("/setup");
        }
      })
      .catch((err) => console.error("Failed to check setup status:", err));

    // Fetch OIDC providers
    fetch("/api/auth/oidc/providers")
      .then((res) => res.json())
      .then((oidcData) => {
        if (oidcData.providers) {
          setOidcProviders(oidcData.providers);
        }
      })
      .catch((err) => console.error("Failed to load OIDC providers:", err));

    // Fetch system settings (public endpoint - no auth required)
    fetch("/api/auth/settings")
      .then((res) => res.json())
      .then((settingsData) => {
        if (settingsData.oidcOnly !== undefined) {
          setOidcOnly(settingsData.oidcOnly);
        }
        setSettingsLoaded(true);
      })
      .catch(() => {
        // Silently fail - default to allowing password login
        setOidcOnly(false);
        setSettingsLoaded(true);
      });
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Validation
    if (!email) {
      setError("Please enter your email address");
      setLoading(false);
      return;
    }
    if (!password) {
      setError("Please enter a password");
      setLoading(false);
      return;
    }
    if (!isLogin && !name) {
      setError("Please enter your name");
      setLoading(false);
      return;
    }

    try {
      const endpoint = isLogin ? "/api/auth/login" : "/api/auth/register";
      const body = isLogin ? { email, password } : { email, password, name };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Authentication failed");
        return;
      }

      // Redirect to home page
      router.push("/");
      router.refresh();
    } catch (err) {
      setError("An error occurred. Please try again.");
      console.error("Auth error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleOIDCLogin = (providerId: string) => {
    window.location.href = `/api/auth/oidc/authorize?provider=${providerId}`;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="bg-card rounded-lg shadow-lg p-8">
          <h1 className="text-2xl font-bold text-center mb-6">
            {oidcOnly ? "Sign In" : isLogin ? "Sign In" : "Create Account"}
          </h1>

          {error && (
            <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded mb-4 font-medium">
              {error}
            </div>
          )}

          {!settingsLoaded ? (
            <div className="flex justify-center items-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
            </div>
          ) : (
            <>
              {!oidcOnly && (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {!isLogin && (
                    <div>
                      <label
                        htmlFor="name"
                        className="block text-sm font-medium mb-2"
                      >
                        Name
                      </label>
                      <input
                        id="name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full px-3 py-2 bg-background border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="Your name"
                        autoComplete="name"
                      />
                    </div>
                  )}

                  <div>
                    <label
                      htmlFor="email"
                      className="block text-sm font-medium mb-2"
                    >
                      Email
                    </label>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-3 py-2 bg-background border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="you@example.com"
                      autoComplete="email"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="password"
                      className="block text-sm font-medium mb-2"
                    >
                      Password
                    </label>
                    <input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-3 py-2 bg-background border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="••••••••"
                      autoComplete={
                        isLogin ? "current-password" : "new-password"
                      }
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground py-2 rounded font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading
                      ? "Please wait..."
                      : isLogin
                      ? "Sign In"
                      : "Sign Up"}
                  </button>
                </form>
              )}

              {oidcProviders.length > 0 && (
                <>
                  {!oidcOnly && (
                    <div className="relative my-6">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-border"></div>
                      </div>
                      <div className="relative flex justify-center text-sm">
                        <span className="px-2 bg-card text-muted-foreground">
                          Or continue with
                        </span>
                      </div>
                    </div>
                  )}

                  <div className={`space-y-2 ${oidcOnly ? "" : "mt-6"}`}>
                    {oidcProviders.map((provider) => (
                      <button
                        key={provider.id}
                        onClick={() => handleOIDCLogin(provider.id)}
                        className="w-full bg-secondary hover:bg-secondary/80 text-foreground py-2 rounded font-medium transition"
                      >
                        Sign in with {provider.name}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {!oidcOnly && (
                <div className="mt-6 text-center text-sm">
                  <button
                    type="button"
                    onClick={() => {
                      setIsLogin(!isLogin);
                      setError("");
                    }}
                    className="text-primary hover:underline cursor-pointer"
                  >
                    {isLogin
                      ? "Don't have an account? Sign up"
                      : "Already have an account? Sign in"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
