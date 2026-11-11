import { pgTable, uuid, varchar, text, timestamp, boolean, index } from "drizzle-orm/pg-core";

export const rooms = pgTable("rooms", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: varchar("code", { length: 8 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  sourceLang: varchar("source_lang", { length: 12 }).notNull().default("en"),
  pin: varchar("pin", { length: 12 }),
  hostSecret: varchar("host_secret", { length: 64 }),
  isClosed: boolean("is_closed").notNull().default(false),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  liveText: text("live_text"),
  liveSourceLang: varchar("live_source_lang", { length: 12 }),
  liveSpeaker: varchar("live_speaker", { length: 80 }),
  liveUpdatedAt: timestamp("live_updated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    originalText: text("original_text").notNull(),
    sourceLang: varchar("source_lang", { length: 12 }).notNull().default("en"),
    speakerName: varchar("speaker_name", { length: 80 }).notNull().default("Speaker"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("messages_room_created_idx").on(t.roomId, t.createdAt)]
);

export const translations = pgTable(
  "translations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    targetLang: varchar("target_lang", { length: 12 }).notNull(),
    translatedText: text("translated_text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("translations_msg_lang_idx").on(t.messageId, t.targetLang)]
);

export const presence = pgTable(
  "presence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    displayName: varchar("display_name", { length: 80 }).notNull(),
    participantKey: varchar("participant_key", { length: 64 }),
    langs: varchar("langs", { length: 120 }).notNull().default("en"),
    isMuted: boolean("is_muted").notNull().default(false),
    isKicked: boolean("is_kicked").notNull().default(false),
    isHost: boolean("is_host").notNull().default(false),
    lastSeen: timestamp("last_seen", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("presence_room_seen_idx").on(t.roomId, t.lastSeen)]
);

export type Room = typeof rooms.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Translation = typeof translations.$inferSelect;
export type Presence = typeof presence.$inferSelect;
