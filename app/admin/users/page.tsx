"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { Shield, ShieldOff, Trash2, UserCircle } from "lucide-react";

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

interface AdminUsersProps {
  onBack?: () => void;
}

export default function AdminUsers({ onBack }: AdminUsersProps = {}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<Stats>({ totalUsers: 0, adminUsers: 0 });
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && (!user || !user.isAdmin)) {
      router.push("/");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user?.isAdmin) {
      loadUsers();
    }
  }, [user]);

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

      // Reload users
      loadUsers();
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

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading || !user?.isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-4">User Management</h1>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-3">
                <UserCircle className="h-8 w-8 text-blue-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Total Users</p>
                  <p className="text-2xl font-bold">{stats.totalUsers}</p>
                </div>
              </div>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-3">
                <Shield className="h-8 w-8 text-green-500" />
                <div>
                  <p className="text-sm text-muted-foreground">
                    Administrators
                  </p>
                  <p className="text-2xl font-bold">{stats.adminUsers}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

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
            <div className="w-full overflow-x-hidden">
              <table className="w-full table-auto">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      User
                    </th>
                    <th className="hidden sm:table-cell px-3 sm:px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Auth Method
                    </th>
                    <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Role
                    </th>
                    <th className="hidden md:table-cell px-3 sm:px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Created
                    </th>
                    <th className="hidden lg:table-cell px-3 sm:px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Last Login
                    </th>
                    <th className="px-3 sm:px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {users.map((u) => (
                    <tr
                      key={u.id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-3 sm:px-6 py-4">
                        <div className="flex items-center gap-3">
                          <UserCircle className="h-8 w-8 text-muted-foreground" />
                          <div>
                            <div className="font-medium">
                              {u.name || "No name"}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {u.email}
                            </div>
                            {u.id === user.id && (
                              <span className="text-xs text-primary">
                                (You)
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="hidden sm:table-cell px-3 sm:px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground">
                          {u.oidcProvider || "Local"}
                        </span>
                      </td>
                      <td className="px-3 sm:px-6 py-4">
                        {u.isDefaultAdmin ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-500/10 text-purple-500 border border-purple-500/20">
                            <Shield className="h-3 w-3" />
                            Default Admin
                          </span>
                        ) : u.isAdmin ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-500 border border-green-500/20">
                            <Shield className="h-3 w-3" />
                            Admin
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                            User
                          </span>
                        )}
                      </td>
                      <td className="hidden md:table-cell px-3 sm:px-6 py-4 text-sm text-muted-foreground">
                        {formatDate(u.createdAt)}
                      </td>
                      <td className="hidden lg:table-cell px-3 sm:px-6 py-4 text-sm text-muted-foreground">
                        {formatDate(u.lastLoginAt)}
                      </td>
                      <td className="px-3 sm:px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => toggleAdmin(u.id, u.isAdmin)}
                            disabled={
                              u.isDefaultAdmin ||
                              (u.id === user.id &&
                                u.isAdmin &&
                                stats.adminUsers <= 1)
                            }
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed hover:bg-muted"
                            title={
                              u.isDefaultAdmin
                                ? "Default admin cannot have admin status removed"
                                : u.isAdmin
                                ? "Remove admin"
                                : "Make admin"
                            }
                          >
                            {u.isAdmin ? (
                              <>
                                <ShieldOff className="h-3.5 w-3.5" />
                                Remove Admin
                              </>
                            ) : (
                              <>
                                <Shield className="h-3.5 w-3.5" />
                                Make Admin
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => deleteUser(u.id, u.email)}
                            disabled={u.isDefaultAdmin || u.id === user.id}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded transition-colors text-destructive hover:bg-destructive/10 disabled:opacity-50 disabled:cursor-not-allowed"
                            title={
                              u.isDefaultAdmin
                                ? "Default admin cannot be deleted"
                                : u.id === user.id
                                ? "Cannot delete yourself"
                                : "Delete user"
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
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

        {/* Info note */}
        <div className="mt-6 p-4 bg-muted/50 border border-border rounded-lg">
          <p className="text-sm text-muted-foreground">
            <strong>Note:</strong> Deleting a user will permanently remove all
            their data including subscriptions, watch history, and settings.
            This action cannot be undone.
          </p>
        </div>
      </div>
    </div>
  );
}
