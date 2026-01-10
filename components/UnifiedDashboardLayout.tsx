"use client";

import React, { useState, ReactNode, useEffect } from "react";
import {
  Settings,
  Bookmark,
  Clock,
  Shield,
  User,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { Button } from "./ui/button";

interface DashboardSection {
  id: string;
  label: string;
  icon: ReactNode;
  description: string;
  category: "profile" | "content" | "preferences" | "admin";
  badge?: string | number;
}

interface UnifiedDashboardLayoutProps {
  children: ReactNode;
  currentSection: string;
  onSectionChange: (sectionId: string) => void;
  sections: DashboardSection[];
  title?: string;
  showSidebar?: boolean;
}

const sectionCategories = {
  profile: "Profile & Account",
  content: "Content Library",
  preferences: "Settings",
  admin: "Administration",
};

export function UnifiedDashboardLayout({
  children,
  currentSection,
  onSectionChange,
  sections,
  title = "Dashboard",
  showSidebar = true,
}: UnifiedDashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [version, setVersion] = useState<string>("");

  useEffect(() => {
    fetch("/api/version")
      .then((res) => res.json())
      .then((data) => setVersion(data.version))
      .catch(() => setVersion(""));
  }, []);

  // Group sections by category
  const groupedSections = sections.reduce((acc, section) => {
    if (!acc[section.category]) {
      acc[section.category] = [];
    }
    acc[section.category].push(section);
    return acc;
  }, {} as Record<string, DashboardSection[]>);

  const currentSectionData = sections.find((s) => s.id === currentSection);

  return (
    <div className="min-h-screen bg-background flex flex-col lg:flex-row gap-4 p-4 lg:p-6">
      {/* Sidebar */}
      {showSidebar && (
        <aside
          className={`
            border border-border/50 bg-card/50 backdrop-blur-sm
            transition-all duration-300 ease-out rounded-2xl
            ${sidebarOpen ? "w-64" : "w-20"}
            overflow-hidden flex flex-col
            lg:relative fixed left-4 top-4 h-[calc(100vh-2rem)] z-30
            lg:static lg:h-auto lg:top-auto lg:left-auto
          `}
        >
          {/* Sidebar Header */}
          <div className="border-b border-border/30 p-4 flex items-center justify-between">
            {sidebarOpen && (
              <h2 className="font-semibold text-foreground truncate">Menu</h2>
            )}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 rounded-md hover:bg-primary/5 transition-colors hidden lg:block"
              aria-label="Toggle sidebar"
            >
              <ChevronRight
                className={`w-4 h-4 transition-transform duration-300 ${
                  !sidebarOpen ? "rotate-180" : ""
                }`}
              />
            </button>
          </div>

          {/* Sidebar Content - Scrollable */}
          <div className="flex-1 overflow-y-auto py-4 min-h-0">
            {Object.entries(sectionCategories).map(
              ([categoryKey, categoryLabel]) => {
                const categorySections = groupedSections[categoryKey] || [];
                if (categorySections.length === 0) return null;

                return (
                  <div key={categoryKey} className="mb-4">
                    {sidebarOpen && (
                      <div className="px-4 py-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          {categoryLabel}
                        </p>
                      </div>
                    )}
                    <div className="space-y-1 px-2">
                      {categorySections.map((section) => {
                        const isActive = currentSection === section.id;
                        return (
                          <button
                            key={section.id}
                            onClick={() => {
                              onSectionChange(section.id);
                              // Close sidebar on mobile after selection
                              if (window.innerWidth < 1024) {
                                setSidebarOpen(false);
                              }
                            }}
                            className={`
                            w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                            transition-all duration-150
                            focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-0
                            ${
                              section.id === "danger-zone"
                                ? isActive
                                  ? "bg-red-500/15 text-red-600 dark:text-red-400 font-medium"
                                  : "text-red-600 dark:text-red-400 hover:bg-red-500/10"
                                : isActive
                                ? "bg-primary/10 text-primary font-medium"
                                : "text-muted-foreground hover:text-foreground hover:bg-primary/5"
                            }
                          `}
                            title={section.label}
                          >
                            <span className="w-5 h-5 flex-shrink-0 flex items-center justify-center">
                              {section.icon}
                            </span>
                            {sidebarOpen && (
                              <>
                                <span className="flex-1 text-left truncate">
                                  {section.label}
                                </span>
                                {section.badge && (
                                  <span className="bg-primary text-primary-foreground text-xs font-bold rounded-full px-1.5 min-w-[20px] text-center flex-shrink-0">
                                    {section.badge}
                                  </span>
                                )}
                              </>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              }
            )}
          </div>

          {/* Version Display at Bottom - Always Visible */}
          {sidebarOpen && version && (
            <div className="border-t border-border/30 px-4 py-3 bg-card/30 flex-shrink-0">
              <p className="text-xs text-muted-foreground/60 text-center">
                TubeShelf v{version}
              </p>
            </div>
          )}
        </aside>
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden rounded-2xl bg-card/50 border border-border/50 backdrop-blur-sm">
        {/* Header */}
        <div className="border-b border-border/30 bg-card/30 sticky top-0 z-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 flex items-center justify-between">
            {!showSidebar && (
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="lg:hidden p-1.5 rounded-md hover:bg-primary/5 transition-colors mr-2"
                aria-label="Toggle sidebar"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            )}
            <div>
              <h1 className="text-3xl font-bold text-foreground">
                {currentSectionData?.label || title}
              </h1>
              {currentSectionData?.description && (
                <p className="text-sm text-muted-foreground mt-2">
                  {currentSectionData.description}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden w-full min-w-0">
          <div className="max-w-full px-3 sm:px-4 lg:px-6 py-6 sm:py-8">
            {children}
          </div>
        </div>
      </main>

      {/* Mobile Overlay */}
      {sidebarOpen && showSidebar && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}

export function DashboardCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="bg-card/50 border border-border/30 rounded-xl shadow-sm overflow-hidden backdrop-blur-sm">
      <div className="border-b border-border/20 px-6 py-5">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        {description && (
          <p className="text-sm text-muted-foreground mt-2">{description}</p>
        )}
      </div>
      <div className="px-6 py-6">{children}</div>
      {footer && (
        <div className="border-t border-border/20 px-6 py-4 bg-muted/20 flex items-center justify-end gap-2">
          {footer}
        </div>
      )}
    </div>
  );
}
