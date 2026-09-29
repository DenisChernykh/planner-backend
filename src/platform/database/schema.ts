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
    revision: text("revision").notNull().default("initial"),
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

export const planningEntryCommands = sqliteTable("planning_entry_commands", {
  id: text("id").primaryKey(),
  result: text("result").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const reminderSettings = sqliteTable("reminder_settings", {
  ownerId: text("owner_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  timeZone: text("time_zone").notNull().default("Asia/Yekaterinburg"),
  quietStart: text("quiet_start").notNull().default("23:00"),
  quietEnd: text("quiet_end").notNull().default("08:00"),
  eveningTime: text("evening_time").notNull().default("21:00"),
  nextEveningAt: integer("next_evening_at"),
});

export const goalReminders = sqliteTable(
  "goal_reminders",
  {
    goalId: text("goal_id")
      .primaryKey()
      .references(() => planGoals.id, { onDelete: "cascade" }),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mode: text("mode").notNull(),
    time: text("time").notNull(),
    weekdays: text("weekdays").notNull(),
    nextRunAt: integer("next_run_at"),
  },
  (table) => [index("goal_reminders_due_idx").on(table.nextRunAt)],
);

export const telegramLinks = sqliteTable("telegram_links", {
  ownerId: text("owner_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  chatId: text("chat_id").notNull().unique(),
  telegramUserId: text("telegram_user_id").notNull().unique(),
  status: text("status").notNull(),
});

export const telegramLinkTokens = sqliteTable("telegram_link_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  ownerId: text("owner_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at").notNull(),
});

export const reminderJobs = sqliteTable(
  "reminder_jobs",
  {
    id: text("id").primaryKey(),
    eventKey: text("event_key").notNull().unique(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    goalId: text("goal_id").references(() => planGoals.id, { onDelete: "cascade" }),
    localDate: text("local_date").notNull(),
    kind: text("kind").notNull(),
    status: text("status").notNull(),
    dueAt: integer("due_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
    leaseUntil: integer("lease_until"),
    chatId: text("chat_id"),
    messageId: integer("message_id"),
    expectedRevision: text("expected_revision"),
    payload: text("payload").notNull().default("[]"),
    attempts: integer("attempts").notNull().default(0),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("reminder_jobs_due_idx").on(table.status, table.dueAt),
    index("reminder_jobs_reply_idx").on(table.chatId, table.messageId),
  ],
);
