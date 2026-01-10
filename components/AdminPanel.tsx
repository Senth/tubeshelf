"use client";

import { useState, useEffect } from "react";
import {
  Shield,
  Users,
  KeyRound,
  Settings,
  Loader2,
  ChevronRight,
} from "lucide-react";
import ClientOnly from "./ClientOnly";

interface AdminPanelProps {
  onNavigateToOIDC?: () => void;
  onNavigateToUsers?: () => void;
  onNavigateToSystem?: () => void;
  compact?: boolean;
}

export function AdminPanel({
  onNavigateToOIDC,
  onNavigateToUsers,
  onNavigateToSystem,
  compact = false,
}: AdminPanelProps) {
  const [stats, setStats] = useState({
    totalUsers: 0,
    adminUsers: 0,
    oidcConfigured: false,
  });
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState<string>("...");

  useEffect(() => {
    loadStats();
    loadVersion();
  }, []);

  const loadStats = async () => {
    try {
      const [usersRes, oidcRes] = await Promise.all([
        fetch("/api/admin/users"),
        fetch("/api/admin/oidc-providers"),
      ]);

      const [usersData, oidcData] = await Promise.all([
        usersRes.json(),
        oidcRes.json(),
      ]);

      setStats({
        totalUsers: usersData.users?.length || 0,
        adminUsers: usersData.users?.filter((u: any) => u.isAdmin).length || 0,
        oidcConfigured: !!(oidcData.providers && oidcData.providers.length > 0),
      });
    } catch (error) {
      console.error("Failed to load admin stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadVersion = async () => {
    try {
      const res = await fetch("/api/version");
      const data = await res.json();
      setVersion(data.version);
    } catch (error) {
      console.error("Failed to load version:", error);
      setVersion("unknown");
    }
  };

  const sections = [
    {
      title: "OIDC Provider",
      description: "Configure OpenID Connect authentication",
      icon: KeyRound,
      onClick: onNavigateToOIDC,
      stat: stats.oidcConfigured ? "Configured" : "Not configured",
      color: stats.oidcConfigured
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-amber-600 dark:text-amber-400",
    },
    {
      title: "User Management",
      description: "Manage users and permissions",
      icon: Users,
      onClick: onNavigateToUsers,
      stat: `${stats.totalUsers} users`,
      color: "text-blue-600 dark:text-blue-400",
    },
    {
      title: "System Settings",
      description: "Authentication and security",
      icon: Settings,
      onClick: onNavigateToSystem,
      stat: "Configure system",
      color: "text-purple-600 dark:text-purple-400",
    },
  ];

  if (loading) {
    return (
      <div className="text-center py-12">
        <ClientOnly>
          <Loader2 className="w-8 h-8 text-muted-foreground mx-auto mb-4 animate-spin" />
        </ClientOnly>
        <p className="text-muted-foreground">Loading admin panel...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {!compact && (
        <div className="flex items-center gap-3 mb-8">
          <Shield className="w-6 h-6 text-primary" />
          <h2 className="text-2xl font-bold">Admin Panel</h2>
        </div>
      )}

      <div
        className={`grid gap-6 ${
          compact
            ? "grid-cols-1 md:grid-cols-3"
            : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
        }`}
      >
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <button
              key={section.title}
              onClick={section.onClick}
              className="group relative bg-card/50 border border-border/30 backdrop-blur-sm rounded-xl p-6 hover:border-primary/50 hover:shadow-lg hover:bg-card/70 transition-all duration-200 text-left overflow-hidden"
            >
              {/* Background gradient on hover */}
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-primary/0 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />

              <div className="relative z-10 flex flex-col h-full">
                {/* Icon and title */}
                <div className="flex items-start justify-between mb-4">
                  <div
                    className={`p-3 rounded-xl bg-primary/10 ${section.color}`}
                  >
                    <Icon className="w-6 h-6" />
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                </div>

                <h3 className="font-semibold text-base mb-2">
                  {section.title}
                </h3>
                <p className="text-sm text-muted-foreground mb-4 flex-1">
                  {section.description}
                </p>

                {/* Stat */}
                <div className="text-sm font-medium text-primary">
                  {section.stat}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Version Info Footer */}
      <div className="pt-4 border-t border-border/30 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          TubeShelf Application
        </span>
        <span className="text-xs font-mono text-muted-foreground/70">
          v{version}
        </span>
      </div>
    </div>
  );
}
