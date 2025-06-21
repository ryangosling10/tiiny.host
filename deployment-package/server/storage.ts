import { downloadHistory, downloadLinks, type InsertDownloadHistory, type InsertDownloadLinks, type DownloadHistory } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";

export interface IStorage {
  saveDownloadHistory(download: InsertDownloadHistory, links: InsertDownloadLinks[]): Promise<DownloadHistory>;
  getDownloadHistory(limit?: number): Promise<DownloadHistory[]>;
  getDownloadById(id: number): Promise<DownloadHistory | undefined>;
}

export class DatabaseStorage implements IStorage {
  async saveDownloadHistory(download: InsertDownloadHistory, links: InsertDownloadLinks[]): Promise<DownloadHistory> {
    const [savedDownload] = await db
      .insert(downloadHistory)
      .values(download)
      .returning();

    // Save download links with the download ID
    if (links.length > 0) {
      const linksWithDownloadId = links.map(link => ({
        ...link,
        downloadId: savedDownload.id
      }));
      
      await db
        .insert(downloadLinks)
        .values(linksWithDownloadId);
    }

    return savedDownload;
  }

  async getDownloadHistory(limit: number = 50): Promise<DownloadHistory[]> {
    return await db
      .select()
      .from(downloadHistory)
      .orderBy(downloadHistory.extractedAt)
      .limit(limit);
  }

  async getDownloadById(id: number): Promise<DownloadHistory | undefined> {
    const [download] = await db
      .select()
      .from(downloadHistory)
      .where(eq(downloadHistory.id, id));
    
    return download || undefined;
  }
}

export const storage = new DatabaseStorage();
