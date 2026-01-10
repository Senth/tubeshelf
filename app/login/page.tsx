"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle, Mail, Lock, User } from "lucide-react";

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
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
    name?: string;
  }>({});
  const [loading, setLoading] = useState(false);
  const [oidcProviders, setOidcProviders] = useState<OIDCProvider[]>([]);
  const [oidcOnly, setOidcOnly] = useState(false);
  const [publicRegistration, setPublicRegistration] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const router = useRouter();

  const validateEmail = (emailValue: string): string | null => {
    if (!emailValue) return null;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailValue)) {
      return "Please enter a valid email address";
    }
    return null;
  };

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
        if (settingsData.publicRegistration !== undefined) {
          setPublicRegistration(settingsData.publicRegistration);
        }
        setSettingsLoaded(true);
      })
      .catch(() => {
        // Silently fail - default to allowing password login
        setOidcOnly(false);
        setPublicRegistration(false);
        setSettingsLoaded(true);
      });
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setFieldErrors({});

    // Client-side validation
    const newFieldErrors: typeof fieldErrors = {};

    if (!email) {
      newFieldErrors.email = "Email address is required";
    } else {
      const emailError = validateEmail(email);
      if (emailError) newFieldErrors.email = emailError;
    }

    if (!password) {
      newFieldErrors.password = "Password is required";
    }

    if (!isLogin && publicRegistration && !name) {
      newFieldErrors.name = "Name is required";
    }

    if (Object.keys(newFieldErrors).length > 0) {
      setFieldErrors(newFieldErrors);
      setError("Please correct the errors below");
      return;
    }

    setLoading(true);

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
        {/* Top Error Toast */}
        {error && (
          <div className="mb-4 animate-in slide-in-from-top-4 fade-in duration-300">
            <div className="bg-red-500/15 border-l-4 border-red-500 bg-gradient-to-r from-red-500/15 via-red-500/10 to-transparent backdrop-blur-sm rounded-r-lg px-4 py-3 shadow-lg">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-red-700 dark:text-red-400 font-medium text-sm">
                  {error}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="bg-card rounded-lg shadow-lg p-8">
          {/* Tubeshelf Branding */}
          <div className="text-center mb-8">
            <div className="inline-block mb-4">
              {/* Light mode icon */}
              <svg
                width="80"
                height="80"
                viewBox="0 0 100 100"
                xmlns="http://www.w3.org/2000/svg"
                className="dark:hidden"
              >
                <rect
                  x="0"
                  y="0"
                  width="100"
                  height="100"
                  rx="18"
                  fill="#e0e0e0"
                />
                <rect x="18" y="58" width="64" height="12" fill="#333" />
                <rect x="18" y="66" width="64" height="4" fill="#555" />
                <rect x="26" y="38" width="12" height="26" fill="#666" />
                <rect x="44" y="32" width="12" height="32" fill="#888" />
                <polygon points="62,32 78,50 62,64" fill="#d32f2f" />
              </svg>
              {/* Dark mode icon */}
              <svg
                width="80"
                height="80"
                viewBox="0 0 100 100"
                xmlns="http://www.w3.org/2000/svg"
                className="hidden dark:block"
              >
                <rect
                  x="0"
                  y="0"
                  width="100"
                  height="100"
                  rx="18"
                  fill="#1e1e1e"
                />
                <rect x="18" y="58" width="64" height="12" fill="#3b3b3b" />
                <rect x="18" y="66" width="64" height="4" fill="#2a2a2a" />
                <rect x="26" y="38" width="12" height="26" fill="#666" />
                <rect x="44" y="32" width="12" height="32" fill="#777" />
                <polygon points="62,32 78,50 62,64" fill="#d32f2f" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-foreground">TubeShelf</h1>
          </div>

          <h2 className="text-xl font-semibold text-center mb-6 text-foreground">
            {oidcOnly ? "Sign In" : isLogin ? "Sign In" : "Create Account"}
          </h2>

          {!settingsLoaded ? (
            <div className="flex justify-center items-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
            </div>
          ) : (
            <>
              {!oidcOnly && (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {!isLogin && publicRegistration && (
                    <div>
                      <label
                        htmlFor="name"
                        className="block text-sm font-medium mb-2 flex items-center gap-2"
                      >
                        <User className="w-4 h-4" />
                        Name
                      </label>
                      <div>
                        <input
                          id="name"
                          type="text"
                          value={name}
                          onChange={(e) => {
                            setName(e.target.value);
                            if (fieldErrors.name) {
                              setFieldErrors({
                                ...fieldErrors,
                                name: undefined,
                              });
                            }
                          }}
                          className={`w-full px-3 py-2 bg-background border rounded focus:outline-none focus:ring-2 transition-all ${
                            fieldErrors.name
                              ? "border-red-500 focus:ring-red-500/50 focus:border-red-500"
                              : "border-border focus:ring-primary"
                          }`}
                          placeholder="Your name"
                          autoComplete="name"
                        />
                        {fieldErrors.name && (
                          <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            {fieldErrors.name}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  <div>
                    <label
                      htmlFor="email"
                      className="block text-sm font-medium mb-2 flex items-center gap-2"
                    >
                      <Mail className="w-4 h-4" />
                      Email
                    </label>
                    <div>
                      <input
                        id="email"
                        type="text"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (fieldErrors.email) {
                            setFieldErrors({
                              ...fieldErrors,
                              email: undefined,
                            });
                          }
                        }}
                        className={`w-full px-3 py-2 bg-background border rounded focus:outline-none focus:ring-2 transition-all ${
                          fieldErrors.email
                            ? "border-red-500 focus:ring-red-500/50 focus:border-red-500"
                            : "border-border focus:ring-primary"
                        }`}
                        placeholder="you@example.com"
                        autoComplete="email"
                      />
                      {fieldErrors.email && (
                        <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          {fieldErrors.email}
                        </p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="password"
                      className="block text-sm font-medium mb-2 flex items-center gap-2"
                    >
                      <Lock className="w-4 h-4" />
                      Password
                    </label>
                    <div>
                      <input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (fieldErrors.password) {
                            setFieldErrors({
                              ...fieldErrors,
                              password: undefined,
                            });
                          }
                        }}
                        className={`w-full px-3 py-2 bg-background border rounded focus:outline-none focus:ring-2 transition-all ${
                          fieldErrors.password
                            ? "border-red-500 focus:ring-red-500/50 focus:border-red-500"
                            : "border-border focus:ring-primary"
                        }`}
                        placeholder="••••••••"
                        autoComplete={
                          isLogin ? "current-password" : "new-password"
                        }
                      />
                      {fieldErrors.password && (
                        <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          {fieldErrors.password}
                        </p>
                      )}
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground py-3 rounded-lg font-semibold transition transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-md hover:shadow-lg cursor-pointer"
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
                        className="w-full bg-accent hover:bg-accent/90 text-accent-foreground py-3 rounded-lg font-semibold transition transform hover:scale-105 active:scale-95 shadow-md hover:shadow-lg cursor-pointer"
                      >
                        Sign in with {provider.name}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {!oidcOnly && (
                <div className="mt-6 text-center text-sm">
                  {publicRegistration ? (
                    <button
                      type="button"
                      onClick={() => {
                        setIsLogin(!isLogin);
                        setError("");
                      }}
                      className="text-primary hover:underline cursor-pointer font-medium transition"
                    >
                      {isLogin
                        ? "Don't have an account? Sign up"
                        : "Already have an account? Sign in"}
                    </button>
                  ) : isLogin ? null : (
                    // If registration is disabled and user is on signup page, force back to login
                    <div className="text-muted-foreground">
                      Registration is currently disabled.{" "}
                      <button
                        type="button"
                        onClick={() => {
                          setIsLogin(true);
                          setError("");
                        }}
                        className="text-primary hover:underline cursor-pointer font-medium transition"
                      >
                        Return to sign in
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
