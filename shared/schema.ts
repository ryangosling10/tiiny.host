import { z } from "zod";
import { pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";

export const downloadRequestSchema = z.object({
  url: z.string().url("Please provide a valid URL"),
});

export const downloadLinkSchema = z.object({
  label: z.string(),
  url: z.string().url(),
  quality: z.string().optional(),
});

export const downloadResponseSchema = z.object({
  success: z.boolean(),
  links: z.array(downloadLinkSchema).optional(),
  title: z.string().optional(),
  source: z.string().optional(),
  platform: z.string().optional(),
  thumbnail: z.string().optional(),
  error: z.string().optional(),
});

export type DownloadRequest = z.infer<typeof downloadRequestSchema>;
export type DownloadLink = z.infer<typeof downloadLinkSchema>;
export type DownloadResponse = z.infer<typeof downloadResponseSchema>;

// Platform types
export type Platform = 'instagram' | 'youtube' | 'tiktok';

export const platformSchema = z.enum(['instagram', 'youtube', 'tiktok']);

// Database Tables
export const downloadHistory = pgTable("download_history", {
  id: serial("id").primaryKey(),
  url: text("url").notNull(),
  platform: varchar("platform", { length: 20 }).notNull(),
  title: text("title"),
  extractedAt: timestamp("extracted_at").defaultNow().notNull(),
  clientIp: varchar("client_ip", { length: 45 }),
  success: varchar("success", { length: 10 }).notNull(),
});

export const downloadHistoryRelations = relations(downloadHistory, ({ many }) => ({
  links: many(downloadLinks),
}));

export const downloadLinks = pgTable("download_links", {
  id: serial("id").primaryKey(),
  downloadId: serial("download_id").notNull(),
  label: text("label").notNull(),
  url: text("url").notNull(),
  quality: varchar("quality", { length: 20 }),
});

export const downloadLinksRelations = relations(downloadLinks, ({ one }) => ({
  download: one(downloadHistory, {
    fields: [downloadLinks.downloadId],
    references: [downloadHistory.id],
  }),
}));

// Insert schemas
export const insertDownloadHistorySchema = createInsertSchema(downloadHistory).omit({
  id: true,
  extractedAt: true,
});

export const insertDownloadLinksSchema = createInsertSchema(downloadLinks).omit({
  id: true,
});

// Types
export type DownloadHistory = typeof downloadHistory.$inferSelect;
export type InsertDownloadHistory = z.infer<typeof insertDownloadHistorySchema>;
export type DownloadLinks = typeof downloadLinks.$inferSelect;
export type InsertDownloadLinks = z.infer<typeof insertDownloadLinksSchema>;
