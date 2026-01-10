"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  Shield,
  ShieldOff,
  Trash2,
  UserCircle,
  MoreVertical,
} from "lucide-react";

interface User {
  id: string;
  email: string;
  name: string | null;
  isAdmin: boolean;
  isDefaultAdmin: boolean;
  oidcProvider: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

interface Stats {
  totalUsers: number;
  adminUsers: number;
}

export function AdminUsers() {
  const { user, loading } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<Stats>({ totalUsers: 0, adminUsers: 0 });
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuAbove, setMenuAbove] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });
  const menuRefs = useRef<Record<string, HTMLDivElement>>({});
  const buttonRefs = useRef<Record<string, HTMLButtonElement>>({});

  useEffect(() => {
    if (user?.isAdmin) {
      loadUsers();
    }
  }, [user]);

  // Close menu when clicking outside (portal version)
  useEffect(() => {
    if (!openMenuId) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      // Check if click is on the portal menu or the button
      const isPortalClick = target.closest("[data-menu-portal]");
      const isButtonClick = Object.values(buttonRefs.current).some((btn) =>
        btn?.contains(target)
      );

      if (isPortalClick || isButtonClick) {
        return;
      }
      setOpenMenuId(null);
    };

    // Use capture phase to ensure we catch the event
    document.addEventListener("click", handleClickOutside, true);
    return () =>
      document.removeEventListener("click", handleClickOutside, true);
  }, [openMenuId]);

  const loadUsers = async () => {
    try {
      setLoadingData(true);
      const response = await fetch("/api/admin/users");
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to load users");
        return;
      }

      setUsers(data.users);
      setStats(data.stats);
      setError("");
    } catch (err) {
      console.error("Load users error:", err);
      setError("Failed to load users");
    } finally {
      setLoadingData(false);
    }
  };

  const toggleAdmin = async (userId: string, currentIsAdmin: boolean) => {
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isAdmin: !currentIsAdmin }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to update user");
        return;
      }

      setError("");
      // Reload users
      await loadUsers();
    } catch (err) {
      console.error("Toggle admin error:", err);
      setError("Failed to update user");
    }
  };

  const deleteUser = async (userId: string, userEmail: string) => {
    if (
      !confirm(
        `Are you sure you want to delete user "${userEmail}"? This will delete all their data and cannot be undone.`
      )
    ) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to delete user");
        return;
      }

      // Reload users
      loadUsers();
    } catch (err) {
      console.error("Delete user error:", err);
      setError("Failed to delete user");
    }
  };

  const formatRelativeTime = (dateString: string | null) => {
    if (!dateString) return "Never";

    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    if (seconds < 2592000) return `${Math.floor(seconds / 604800)}w ago`;
    if (seconds < 31536000) return `${Math.floor(seconds / 2592000)}mo ago`;

    return `${Math.floor(seconds / 31536000)}y ago`;
  };

  if (!user?.isAdmin) {
    return null;
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground mb-6">
        Manage system users and permissions
      </p>

      {error && (
        <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded mb-6 font-medium">
          {error}
        </div>
      )}

      {/* Users Table */}
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        {loadingData ? (
          <div className="p-8 text-center text-muted-foreground">
            Loading users...
          </div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No users found
          </div>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full text-xs sm:text-sm border-collapse">
              <thead className="bg-muted/50 border-b border-border sticky top-0 z-20">
                <tr>
                  <th className="px-3 py-3 text-left font-medium text-muted-foreground uppercase tracking-wider">
                    User
                  </th>
                  <th className="hidden sm:table-cell px-3 py-3 text-left font-medium text-muted-foreground uppercase tracking-wider">
                    Auth Method
                  </th>
                  <th className="px-3 py-3 text-left font-medium text-muted-foreground uppercase tracking-wider">
                    Role
                  </th>
                  <th className="hidden md:table-cell px-3 py-3 text-left font-medium text-muted-foreground uppercase tracking-wider">
                    Last Active
                  </th>
                  <th className="px-3 py-3 text-right font-medium text-muted-foreground uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map((u) => (
                  <tr
                    key={u.id}
                    className="hover:bg-muted/30 transition-colors border-b border-border relative"
                  >
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <UserCircle className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="font-medium truncate text-xs sm:text-sm">
                            {u.name || "No name"}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {u.email}
                          </div>
                          {u.id === user.id && (
                            <span className="text-xs text-primary">(You)</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="hidden sm:table-cell px-3 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-secondary text-secondary-foreground whitespace-nowrap">
                        {u.oidcProvider || "Local"}
                      </span>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {u.isDefaultAdmin ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-purple-500/10 text-purple-500 border border-purple-500/20">
                          <Shield className="h-3 w-3" />
                          <span className="hidden sm:inline">Default</span>
                          <span className="sm:hidden">Def</span>
                        </span>
                      ) : u.isAdmin ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-500/10 text-green-500 border border-green-500/20">
                          <Shield className="h-3 w-3" />
                          Admin
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">
                          User
                        </span>
                      )}
                    </td>
                    <td className="hidden md:table-cell px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {formatRelativeTime(u.lastLoginAt)}
                    </td>
                    <td className="px-3 py-3 text-right whitespace-nowrap overflow-visible">
                      <div
                        className="relative"
                        ref={(el) => {
                          if (el) menuRefs.current[u.id] = el;
                        }}
                      >
                        <button
                          ref={(el) => {
                            if (el) buttonRefs.current[u.id] = el;
                          }}
                          onClick={() => {
                            if (openMenuId === u.id) {
                              setOpenMenuId(null);
                            } else {
                              setOpenMenuId(u.id);
                              // Check if menu should appear above and calculate position
                              setTimeout(() => {
                                const button = buttonRefs.current[u.id];
                                if (button) {
                                  const rect = button.getBoundingClientRect();
                                  const spaceBelow =
                                    window.innerHeight - rect.bottom;
                                  setMenuAbove(spaceBelow < 150); // 150px threshold for menu height
                                  // Calculate position relative to viewport
                                  setMenuPosition({
                                    top:
                                      spaceBelow < 150
                                        ? rect.top - 150
                                        : rect.bottom + 4,
                                    right: window.innerWidth - rect.right,
                                  });
                                }
                              }, 0);
                            }
                          }}
                          className="p-1.5 rounded-md hover:bg-muted transition-colors"
                          aria-label="Actions"
                        >
                          <MoreVertical className="h-4 w-4 text-muted-foreground" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Portal for dropdown menu */}
      {openMenuId &&
        (() => {
          const currentUser = users.find((u) => u.id === openMenuId);
          return createPortal(
            <div
              data-menu-portal
              className={`fixed w-56 bg-card border border-border/50 rounded-lg shadow-lg z-[9999] overflow-hidden`}
              style={{
                top: `${menuPosition.top}px`,
                right: `${menuPosition.right}px`,
              }}
            >
              {currentUser && (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      toggleAdmin(currentUser.id, currentUser.isAdmin);
                      setOpenMenuId(null);
                    }}
                    disabled={
                      currentUser.isDefaultAdmin ||
                      (currentUser.id === user.id &&
                        currentUser.isAdmin &&
                        stats.adminUsers <= 1)
                    }
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed first:rounded-t-md flex items-start gap-3 border-b border-border/30"
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      {currentUser.isAdmin ? (
                        <ShieldOff className="h-4 w-4" />
                      ) : (
                        <Shield className="h-4 w-4" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">
                        {currentUser.isAdmin ? "Remove Admin" : "Make Admin"}
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      deleteUser(currentUser.id, currentUser.email);
                      setOpenMenuId(null);
                    }}
                    disabled={
                      currentUser.isDefaultAdmin || currentUser.id === user.id
                    }
                    className="w-full text-left px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed last:rounded-b-md flex items-start gap-3"
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      <Trash2 className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">Delete User</div>
                    </div>
                  </button>
                </>
              )}
            </div>,
            document.body
          );
        })()}

      {/* Info note */}
      <div className="mt-6 p-4 bg-muted/50 border border-border rounded-lg">
        <p className="text-sm text-muted-foreground">
          <strong>Note:</strong> Deleting a user will permanently remove all
          their data including subscriptions, watch history, and settings. This
          action cannot be undone.
        </p>
      </div>
    </div>
  );
}
