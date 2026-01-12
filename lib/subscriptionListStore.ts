import { getDb } from "./db";
import { migrateFromJson } from "./migrate";

export interface SubscriptionInList {
  id: string;
  channelId: string;
  title: string;
  url: string;
  thumbnail?: string;
  addedAt: string;
  lastUploadedAt?: string;
}

export interface SubscriptionList {
  id: string;
  name: string;
  subscriptions: SubscriptionInList[];
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionListsData {
  lists: SubscriptionList[];
  defaultListId: string;
}

// Run migration on first import
let migrationPromise: Promise<void> | null = null;
async function ensureMigration() {
  if (!migrationPromise) {
    migrationPromise = migrateFromJson().catch((err) => {
      console.error("Migration failed:", err);
    });
  }
  await migrationPromise;
}

async function ensureDefaultList(userId: string) {
  const db = getDb();
  const exists = db
    .prepare(
      "SELECT COUNT(*) as count FROM subscription_lists WHERE user_id = ?"
    )
    .get(userId) as { count: number };

  if (exists.count === 0) {
    db.prepare(
      "INSERT OR IGNORE INTO subscription_lists (id, name, user_id, created_at) VALUES (?, ?, ?, ?)"
    ).run(`default-${userId}`, "Default", userId, new Date().toISOString());
  }
}

export async function readLists(
  userId: string
): Promise<SubscriptionListsData> {
  await ensureMigration();
  await ensureDefaultList(userId);

  const db = getDb();

  const lists = db
    .prepare(
      "SELECT id, name, created_at as createdAt FROM subscription_lists WHERE user_id = ? ORDER BY created_at"
    )
    .all(userId) as Array<{ id: string; name: string; createdAt: string }>;

  const result: SubscriptionList[] = [];
  let defaultListId = `default-${userId}`;

  for (const list of lists) {
    const subscriptions = db
      .prepare(
        "SELECT id, channel_id as channelId, title, url, thumbnail, added_at as addedAt, last_uploaded_at as lastUploadedAt FROM subscriptions WHERE list_id = ? ORDER BY added_at DESC"
      )
      .all(list.id) as SubscriptionInList[];

    result.push({
      id: list.id,
      name: list.name,
      subscriptions,
      createdAt: list.createdAt,
      updatedAt: list.createdAt, // SQLite doesn't track update time separately
    });
  }

  return {
    lists: result,
    defaultListId,
  };
}

export async function writeLists(data: SubscriptionListsData, userId: string) {
  await ensureMigration();
  const db = getDb();

  db.exec("BEGIN TRANSACTION");

  try {
    // Clear existing data for this user only
    db.prepare(
      "DELETE FROM subscriptions WHERE list_id IN (SELECT id FROM subscription_lists WHERE user_id = ?)"
    ).run(userId);
    db.prepare("DELETE FROM subscription_lists WHERE user_id = ?").run(userId);

    // Insert lists and subscriptions
    const listStmt = db.prepare(
      "INSERT INTO subscription_lists (id, name, user_id, created_at) VALUES (?, ?, ?, ?)"
    );
    const subStmt = db.prepare(
      "INSERT INTO subscriptions (list_id, channel_id, title, url, thumbnail, added_at, last_uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );

    for (const list of data.lists) {
      listStmt.run(list.id, list.name, userId, list.createdAt);

      for (const sub of list.subscriptions) {
        subStmt.run(
          list.id,
          sub.channelId,
          sub.title,
          sub.url,
          sub.thumbnail || null,
          sub.addedAt,
          sub.lastUploadedAt || null
        );
      }
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export async function createList(
  name: string,
  userId: string
): Promise<SubscriptionList> {
  await ensureMigration();
  const db = getDb();

  const newList: SubscriptionList = {
    id: Date.now().toString(),
    name,
    subscriptions: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  db.prepare(
    "INSERT INTO subscription_lists (id, name, user_id, created_at) VALUES (?, ?, ?, ?)"
  ).run(newList.id, name, userId, newList.createdAt);

  return newList;
}

export async function updateList(
  id: string,
  updates: Partial<SubscriptionList>,
  userId: string
) {
  await ensureMigration();
  const db = getDb();

  if (updates.name) {
    db.prepare(
      "UPDATE subscription_lists SET name = ? WHERE id = ? AND user_id = ?"
    ).run(updates.name, id, userId);
  }
}

export async function deleteList(id: string, userId: string) {
  await ensureMigration();
  if (id === "default") {
    throw new Error("Cannot delete default list");
  }

  const db = getDb();
  db.prepare("DELETE FROM subscription_lists WHERE id = ? AND user_id = ?").run(
    id,
    userId
  );
  // Subscriptions are cascade deleted
}

export async function addSubscriptionToList(
  listId: string,
  subscription: SubscriptionInList,
  userId: string
) {
  await ensureMigration();
  const db = getDb();

  // Verify list ownership
  const listOwner = db
    .prepare("SELECT user_id FROM subscription_lists WHERE id = ?")
    .get(listId) as { user_id: string } | undefined;

  if (!listOwner || listOwner.user_id !== userId) {
    throw new Error("List not found or access denied");
  }

  const existing = db
    .prepare(
      "SELECT id FROM subscriptions WHERE list_id = ? AND channel_id = ?"
    )
    .get(listId, subscription.channelId);

  if (!existing) {
    db.prepare(
      "INSERT INTO subscriptions (list_id, channel_id, title, url, thumbnail, added_at, last_uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(
      listId,
      subscription.channelId,
      subscription.title,
      subscription.url,
      subscription.thumbnail || null,
      subscription.addedAt,
      subscription.lastUploadedAt || null
    );
  }
}

export async function removeSubscriptionFromList(
  listId: string,
  channelId: string,
  userId: string
) {
  await ensureMigration();
  const db = getDb();

  // Verify list ownership
  const listOwner = db
    .prepare("SELECT user_id FROM subscription_lists WHERE id = ?")
    .get(listId) as { user_id: string } | undefined;

  if (!listOwner || listOwner.user_id !== userId) {
    throw new Error("List not found or access denied");
  }

  db.prepare(
    "DELETE FROM subscriptions WHERE list_id = ? AND channel_id = ?"
  ).run(listId, channelId);
}

export async function clearListSubscriptions(listId: string, userId: string) {
  await ensureMigration();
  const db = getDb();

  // Verify list ownership
  const listOwner = db
    .prepare("SELECT user_id FROM subscription_lists WHERE id = ?")
    .get(listId) as { user_id: string } | undefined;

  if (!listOwner || listOwner.user_id !== userId) {
    throw new Error("List not found or access denied");
  }

  db.prepare("DELETE FROM subscriptions WHERE list_id = ?").run(listId);
}

export async function clearAllSubscriptions(userId: string) {
  await ensureMigration();
  const db = getDb();

  db.prepare(
    "DELETE FROM subscriptions WHERE list_id IN (SELECT id FROM subscription_lists WHERE user_id = ?)"
  ).run(userId);
}

export async function moveSubscription(
  fromListId: string,
  toListId: string,
  channelId: string,
  userId: string
) {
  await ensureMigration();
  const db = getDb();

  // Verify ownership of both lists
  const fromList = db
    .prepare("SELECT user_id FROM subscription_lists WHERE id = ?")
    .get(fromListId) as { user_id: string } | undefined;
  const toList = db
    .prepare("SELECT user_id FROM subscription_lists WHERE id = ?")
    .get(toListId) as { user_id: string } | undefined;

  if (
    !fromList ||
    fromList.user_id !== userId ||
    !toList ||
    toList.user_id !== userId
  ) {
    throw new Error("One or both lists not found or access denied");
  }

  const existing = db
    .prepare(
      "SELECT id FROM subscriptions WHERE list_id = ? AND channel_id = ?"
    )
    .get(toListId, channelId);

  if (existing) {
    // Already in target list, just remove from source
    db.prepare(
      "DELETE FROM subscriptions WHERE list_id = ? AND channel_id = ?"
    ).run(fromListId, channelId);
  } else {
    // Move to target list
    db.prepare(
      "UPDATE subscriptions SET list_id = ? WHERE list_id = ? AND channel_id = ?"
    ).run(toListId, fromListId, channelId);
  }
}
