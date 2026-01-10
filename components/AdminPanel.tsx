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
}

export function AdminPanel({
  onNavigateToOIDC,
  onNavigateToUsers,
  onNavigateToSystem,
}: AdminPanelProps) {
  const [stats, setStats] = useState({
    totalUsers: 0,
    adminUsers: 0,
    oidcConfigured: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
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
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-6">
        <Shield className="w-6 h-6 text-primary" />
        <h2 className="text-2xl font-bold">Admin Panel</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <button
              key={section.title}
              onClick={section.onClick}
              className="group relative bg-card border border-border rounded-lg p-5 hover:border-primary/50 hover:shadow-lg transition-all duration-200 text-left overflow-hidden"
            >
              {/* Background gradient on hover */}
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-primary/0 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />

              <div className="relative z-10 flex flex-col h-full">
                {/* Icon and title */}
                <div className="flex items-start justify-between mb-3">
                  <div
                    className={`p-2.5 rounded-lg bg-primary/10 ${section.color}`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                </div>

                <h3 className="font-semibold text-sm mb-1">{section.title}</h3>
                <p className="text-xs text-muted-foreground mb-3 flex-1">
                  {section.description}
                </p>

                {/* Stat */}
                <div className="text-xs font-medium text-primary">
                  {section.stat}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
