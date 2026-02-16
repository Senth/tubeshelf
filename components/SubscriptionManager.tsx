"use client";

import { useMemo, useState } from "react";
import { X, Plus, Trash2, ArrowRightLeft, Upload, Download } from "lucide-react";
import type { SubscriptionList } from "@/lib/subscriptionListStore";

interface SubscriptionManagerProps {
  lists: SubscriptionList[];
  currentListId: string;
  onSelectList: (id: string) => void;
  onCreateList: (name: string) => Promise<void> | void;
  onDeleteList: (id: string) => Promise<void> | void;
  onAdd: (input: string) => Promise<void> | void;
  onRemove: (channelId: string) => Promise<void> | void;
  onMove: (channelId: string, targetListId: string) => Promise<void> | void;
  onImport: (data: string, format?: string) => Promise<void> | void;
  onExport: (format: "opml" | "json") => Promise<void> | void;
  isOpen: boolean;
  onClose: () => void;
}

export function SubscriptionManager({
  lists,
  currentListId,
  onSelectList,
  onCreateList,
  onDeleteList,
  onAdd,
  onRemove,
  onMove,
  onImport,
  onExport,
  isOpen,
  onClose,
}: SubscriptionManagerProps) {
  const [input, setInput] = useState("");
  const [newListName, setNewListName] = useState("");
  const [importText, setImportText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentList = useMemo(
    () => lists.find((l) => l.id === currentListId) || lists[0],
    [lists, currentListId]
  );

  if (!isOpen) {
    return null;
  }

  const withBusy = async (task: () => Promise<void> | void) => {
    try {
      setBusy(true);
      setError(null);
      await task();
    } catch (err: any) {
      setError(err?.message || "Operation failed");
    } finally {
      setBusy(false);
    }
  };

  const handleFileImport = async (file: File) => {
    const text = await file.text();
    const format = file.name.toLowerCase().endsWith(".json") ? "json" : "opml";
    await withBusy(() => onImport(text, format));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-6xl max-h-[90vh] overflow-hidden rounded-xl bg-card border border-border shadow-2xl flex flex-col">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-xl font-bold">Manage Subscriptions</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-md hover:bg-muted transition"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-0 flex-1 min-h-0">
          <aside className="border-r border-border p-4 space-y-3 overflow-auto">
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wide text-muted-foreground">
                Lists
              </label>
              <div className="space-y-2">
                {lists.map((list) => (
                  <button
                    key={list.id}
                    type="button"
                    onClick={() => onSelectList(list.id)}
                    className={`w-full text-left px-3 py-2 rounded-md border transition ${
                      list.id === currentListId
                        ? "border-primary bg-primary/10"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    <div className="font-medium truncate">{list.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {list.subscriptions.length} channels
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-3 border-t border-border space-y-2">
              <input
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                placeholder="New list name"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
              <button
                type="button"
                disabled={busy || !newListName.trim()}
                onClick={() =>
                  withBusy(async () => {
                    await onCreateList(newListName.trim());
                    setNewListName("");
                  })
                }
                className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm disabled:opacity-50"
              >
                <Plus className="w-4 h-4" /> Create List
              </button>
              {currentList && lists.length > 1 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => withBusy(() => onDeleteList(currentList.id))}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-destructive/30 text-destructive px-3 py-2 text-sm disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" /> Delete Current List
                </button>
              )}
            </div>

            <div className="pt-3 border-t border-border space-y-2">
              <label className="text-xs uppercase tracking-wide text-muted-foreground">
                Import / Export
              </label>
              <label className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm cursor-pointer hover:bg-muted">
                <Upload className="w-4 h-4" /> Import File
                <input
                  type="file"
                  accept=".opml,.xml,.json,text/xml,application/xml,application/json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      void handleFileImport(file);
                    }
                    e.currentTarget.value = "";
                  }}
                />
              </label>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder="Paste OPML or JSON here"
                className="w-full min-h-24 rounded-md border border-border bg-background px-3 py-2 text-xs"
              />
              <button
                type="button"
                disabled={busy || !importText.trim()}
                onClick={() => withBusy(() => onImport(importText, "opml"))}
                className="w-full rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50"
              >
                Import Pasted Data
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => withBusy(() => onExport("opml"))}
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50"
                >
                  <Download className="w-4 h-4" /> OPML
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => withBusy(() => onExport("json"))}
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50"
                >
                  <Download className="w-4 h-4" /> JSON
                </button>
              </div>
            </div>
          </aside>

          <section className="p-4 sm:p-6 overflow-auto space-y-4">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Channel URL, @handle, channel ID, or video URL"
                className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
              <button
                type="button"
                disabled={busy || !input.trim() || !currentList}
                onClick={() =>
                  withBusy(async () => {
                    await onAdd(input.trim());
                    setInput("");
                  })
                }
                className="inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm disabled:opacity-50"
              >
                <Plus className="w-4 h-4" /> Add
              </button>
            </div>

            {!currentList ? (
              <div className="text-sm text-muted-foreground">No list selected.</div>
            ) : currentList.subscriptions.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                This list is empty. Add a channel to get started.
              </div>
            ) : (
              <div className="space-y-2">
                {currentList.subscriptions.map((sub) => (
                  <div
                    key={`${currentList.id}:${sub.channelId}`}
                    className="rounded-lg border border-border p-3 flex flex-col sm:flex-row sm:items-center gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{sub.title}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {sub.channelId}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        defaultValue={currentList.id}
                        onChange={(e) => {
                          const target = e.target.value;
                          if (target && target !== currentList.id) {
                            void withBusy(() => onMove(sub.channelId, target));
                          }
                        }}
                        className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                        title="Move to list"
                      >
                        {lists.map((list) => (
                          <option key={list.id} value={list.id}>
                            {list.name}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() => withBusy(() => onMove(sub.channelId, currentList.id))}
                        className="hidden"
                        aria-hidden="true"
                      >
                        <ArrowRightLeft className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => withBusy(() => onRemove(sub.channelId))}
                        className="inline-flex items-center gap-1 rounded-md border border-destructive/30 text-destructive px-2 py-1 text-xs disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
