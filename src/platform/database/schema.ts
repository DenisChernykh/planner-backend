import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  displayName: text("display_name"),
  username: text("username"),
  photoUrl: text("photo_url"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const externalIdentities = sqliteTable(
  "external_identities",
  {
    issuer: text("issuer").notNull(),
    subject: text("subject").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.issuer, table.subject] }),
    index("external_identities_user_id_idx").on(table.userId),
  ],
);

export const sessions = sqliteTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ],
);

export const notes = sqliteTable(
  "notes",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("notes_owner_updated_idx").on(
      table.ownerId,
      sql`${table.updatedAt} desc`,
      sql`${table.id} desc`,
    ),
  ],
);

export const planGoals = sqliteTable(
  "plan_goals",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    month: text("month").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    trackingType: text("tracking_type").notNull(),
    trackingConfig: text("tracking_config").notNull(),
    cadencePeriod: text("cadence_period").notNull(),
    targetOccurrences: integer("target_occurrences"),
    sortOrder: integer("sort_order").notNull(),
    deletedAt: integer("deleted_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("plan_goals_owner_month_idx").on(table.ownerId, table.month),
    index("plan_goals_owner_deleted_idx").on(table.ownerId, table.deletedAt),
  ],
);

export const goalEntries = sqliteTable(
  "goal_entries",
  {
    goalId: text("goal_id")
      .notNull()
      .references(() => planGoals.id, { onDelete: "cascade" }),
    localDate: text("local_date").notNull(),
    value: text("value").notNull(),
    met: integer("met", { mode: "boolean" }).notNull(),
    note: text("note"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.goalId, table.localDate] }),
    index("goal_entries_goal_date_idx").on(table.goalId, table.localDate),
  ],
);
