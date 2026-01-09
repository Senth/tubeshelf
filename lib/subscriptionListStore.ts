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

async function ensureDefaultList() {
  const db = getDb();
  const exists = db
    .prepare("SELECT COUNT(*) as count FROM subscription_lists")
    .get() as { count: number };

  if (exists.count === 0) {
    db.prepare("INSERT INTO subscription_lists (id, name) VALUES (?, ?)").run(
      "default",
      "Default"
    );
  }
}

export async function readLists(): Promise<SubscriptionListsData> {
  await ensureMigration();
  await ensureDefaultList();

  const db = getDb();

  const lists = db
    .prepare(
      "SELECT id, name, created_at as createdAt FROM subscription_lists ORDER BY created_at"
    )
    .all() as Array<{ id: string; name: string; createdAt: string }>;

  const result: SubscriptionList[] = [];

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
    defaultListId: "default",
  };
}

export async function writeLists(data: SubscriptionListsData) {
  await ensureMigration();
  const db = getDb();

  db.exec("BEGIN TRANSACTION");

  try {
    // Clear existing data
    db.exec("DELETE FROM subscriptions");
    db.exec("DELETE FROM subscription_lists");

    // Insert lists and subscriptions
    const listStmt = db.prepare(
      "INSERT INTO subscription_lists (id, name, created_at) VALUES (?, ?, ?)"
    );
    const subStmt = db.prepare(
      "INSERT INTO subscriptions (id, list_id, channel_id, title, url, thumbnail, added_at, last_uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    );

    for (const list of data.lists) {
      listStmt.run(list.id, list.name, list.createdAt);

      for (const sub of list.subscriptions) {
        subStmt.run(
          sub.id,
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

export async function createList(name: string): Promise<SubscriptionList> {
  await ensureMigration();
  const db = getDb();

  const newList: SubscriptionList = {
    id: Date.now().toString(),
    name,
    subscriptions: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  db.prepare("INSERT INTO subscription_lists (id, name) VALUES (?, ?)").run(
    newList.id,
    name
  );

  return newList;
}

export async function updateList(
  id: string,
  updates: Partial<SubscriptionList>
) {
  await ensureMigration();
  const db = getDb();

  if (updates.name) {
    db.prepare("UPDATE subscription_lists SET name = ? WHERE id = ?").run(
      updates.name,
      id
    );
  }
}

export async function deleteList(id: string) {
  await ensureMigration();
  if (id === "default") {
    throw new Error("Cannot delete default list");
  }

  const db = getDb();
  db.prepare("DELETE FROM subscription_lists WHERE id = ?").run(id);
  // Subscriptions are cascade deleted
}

export async function addSubscriptionToList(
  listId: string,
  subscription: SubscriptionInList
) {
  await ensureMigration();
  const db = getDb();

  const existing = db
    .prepare(
      "SELECT id FROM subscriptions WHERE list_id = ? AND channel_id = ?"
    )
    .get(listId, subscription.channelId);

  if (!existing) {
    db.prepare(
      "INSERT INTO subscriptions (id, list_id, channel_id, title, url, thumbnail, added_at, last_uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      subscription.id,
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
  channelId: string
) {
  await ensureMigration();
  const db = getDb();

  db.prepare(
    "DELETE FROM subscriptions WHERE list_id = ? AND channel_id = ?"
  ).run(listId, channelId);
}

export async function clearListSubscriptions(listId: string) {
  await ensureMigration();
  const db = getDb();

  db.prepare("DELETE FROM subscriptions WHERE list_id = ?").run(listId);
}

export async function clearAllSubscriptions() {
  await ensureMigration();
  const db = getDb();

  db.exec("DELETE FROM subscriptions");
}

export async function moveSubscription(
  fromListId: string,
  toListId: string,
  channelId: string
) {
  await ensureMigration();
  const db = getDb();

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
