var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/index.ts
import express2 from "express";

// server/routes.ts
import { createServer } from "http";
import { exec } from "child_process";
import { promisify } from "util";

// shared/schema.ts
var schema_exports = {};
__export(schema_exports, {
  downloadHistory: () => downloadHistory,
  downloadHistoryRelations: () => downloadHistoryRelations,
  downloadLinkSchema: () => downloadLinkSchema,
  downloadLinks: () => downloadLinks,
  downloadLinksRelations: () => downloadLinksRelations,
  downloadRequestSchema: () => downloadRequestSchema,
  downloadResponseSchema: () => downloadResponseSchema,
  insertDownloadHistorySchema: () => insertDownloadHistorySchema,
  insertDownloadLinksSchema: () => insertDownloadLinksSchema,
  platformSchema: () => platformSchema
});
import { z } from "zod";
import { pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";
var downloadRequestSchema = z.object({
  url: z.string().url("Please provide a valid URL")
});
var downloadLinkSchema = z.object({
  label: z.string(),
  url: z.string().url(),
  quality: z.string().optional()
});
var downloadResponseSchema = z.object({
  success: z.boolean(),
  links: z.array(downloadLinkSchema).optional(),
  title: z.string().optional(),
  source: z.string().optional(),
  platform: z.string().optional(),
  thumbnail: z.string().optional(),
  error: z.string().optional()
});
var platformSchema = z.enum(["instagram", "youtube", "tiktok"]);
var downloadHistory = pgTable("download_history", {
  id: serial("id").primaryKey(),
  url: text("url").notNull(),
  platform: varchar("platform", { length: 20 }).notNull(),
  title: text("title"),
  extractedAt: timestamp("extracted_at").defaultNow().notNull(),
  clientIp: varchar("client_ip", { length: 45 }),
  success: varchar("success", { length: 10 }).notNull()
});
var downloadHistoryRelations = relations(downloadHistory, ({ many }) => ({
  links: many(downloadLinks)
}));
var downloadLinks = pgTable("download_links", {
  id: serial("id").primaryKey(),
  downloadId: serial("download_id").notNull(),
  label: text("label").notNull(),
  url: text("url").notNull(),
  quality: varchar("quality", { length: 20 })
});
var downloadLinksRelations = relations(downloadLinks, ({ one }) => ({
  download: one(downloadHistory, {
    fields: [downloadLinks.downloadId],
    references: [downloadHistory.id]
  })
}));
var insertDownloadHistorySchema = createInsertSchema(downloadHistory).omit({
  id: true,
  extractedAt: true
});
var insertDownloadLinksSchema = createInsertSchema(downloadLinks).omit({
  id: true
});

// server/db.ts
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?"
  );
}
var pool = new Pool({ connectionString: process.env.DATABASE_URL });
var db = drizzle({ client: pool, schema: schema_exports });

// server/storage.ts
import { eq } from "drizzle-orm";
var DatabaseStorage = class {
  async saveDownloadHistory(download, links) {
    const [savedDownload] = await db.insert(downloadHistory).values(download).returning();
    if (links.length > 0) {
      const linksWithDownloadId = links.map((link) => ({
        ...link,
        downloadId: savedDownload.id
      }));
      await db.insert(downloadLinks).values(linksWithDownloadId);
    }
    return savedDownload;
  }
  async getDownloadHistory(limit = 50) {
    return await db.select().from(downloadHistory).orderBy(downloadHistory.extractedAt).limit(limit);
  }
  async getDownloadById(id) {
    const [download] = await db.select().from(downloadHistory).where(eq(downloadHistory.id, id));
    return download || void 0;
  }
};
var storage = new DatabaseStorage();

// server/routes.ts
var execAsync = promisify(exec);
var rateLimitMap = /* @__PURE__ */ new Map();
var RATE_LIMIT_WINDOW = 3e4;
function detectPlatform(url) {
  const cleanUrl = url.trim().toLowerCase();
  if (cleanUrl.includes("instagram.com") || cleanUrl.includes("instagr.am")) {
    return "instagram";
  } else if (cleanUrl.includes("youtube.com") || cleanUrl.includes("youtu.be")) {
    return "youtube";
  } else if (cleanUrl.includes("tiktok.com")) {
    return "tiktok";
  }
  return null;
}
function validateUrl(url, platform) {
  const cleanUrl = url.trim();
  switch (platform) {
    case "instagram":
      return /^https?:\/\/(www\.)?(instagram\.com|instagr\.am)\/(p|reel|tv)\/[a-zA-Z0-9_-]+/.test(cleanUrl);
    case "youtube":
      return /^https?:\/\/(www\.)?(youtube\.com\/(watch\?v=|embed\/|v\/)|youtu\.be\/)[a-zA-Z0-9_-]+/.test(cleanUrl);
    case "tiktok":
      return /^https?:\/\/(www\.)?(tiktok\.com|vm\.tiktok\.com)\//.test(cleanUrl);
    default:
      return false;
  }
}
async function checkYtDlp() {
  try {
    await execAsync("yt-dlp --version");
    return true;
  } catch (error) {
    console.log("\u26A0\uFE0F yt-dlp not found, trying to install...");
    try {
      await execAsync("pip install yt-dlp");
      console.log("\u2705 yt-dlp installed successfully");
      return true;
    } catch (installError) {
      console.error("\u274C Failed to install yt-dlp:", installError);
      return false;
    }
  }
}
async function extractWithYtDlp(url, platform) {
  try {
    console.log(`\u{1F3AC} Trying yt-dlp extraction for ${platform}: ${url}`);
    const ytDlpAvailable = await checkYtDlp();
    if (!ytDlpAvailable) {
      throw new Error("yt-dlp not available");
    }
    const { stdout } = await execAsync(`yt-dlp --dump-json --no-download --no-warnings "${url}"`, {
      timeout: 3e4
    });
    const videoInfo = JSON.parse(stdout.trim());
    const links = [];
    if (videoInfo.formats && Array.isArray(videoInfo.formats)) {
      const videoFormats = videoInfo.formats.filter((f) => f.vcodec && f.vcodec !== "none" && f.url).sort((a, b) => (b.height || 0) - (a.height || 0)).slice(0, 3);
      videoFormats.forEach((format) => {
        links.push({
          label: `Video ${format.height || "Unknown"}p (${format.ext || "mp4"})`,
          url: format.url,
          quality: format.height?.toString() || "unknown"
        });
      });
      const audioFormats = videoInfo.formats.filter((f) => f.acodec && f.acodec !== "none" && f.vcodec === "none" && f.url).sort((a, b) => (b.abr || 0) - (a.abr || 0)).slice(0, 1);
      audioFormats.forEach((format) => {
        links.push({
          label: `Audio Only (${format.ext || "mp3"})`,
          url: format.url,
          quality: "audio"
        });
      });
    }
    if (videoInfo.url && links.length === 0) {
      links.push({
        label: `Video (${videoInfo.ext || "mp4"})`,
        url: videoInfo.url,
        quality: "unknown"
      });
    }
    return {
      success: true,
      links,
      title: videoInfo.title || `${platform} Video`,
      source: "yt-dlp",
      platform,
      thumbnail: videoInfo.thumbnail
    };
  } catch (error) {
    console.error(`\u274C yt-dlp error for ${platform}:`, error);
    return {
      success: false,
      error: `Failed to extract ${platform} media: ${error instanceof Error ? error.message : "Unknown error"}`
    };
  }
}
function checkRateLimit(req, res, next) {
  const clientIP = req.ip || req.connection.remoteAddress || "unknown";
  const now = Date.now();
  if (rateLimitMap.has(clientIP)) {
    const lastRequest = rateLimitMap.get(clientIP);
    if (now - lastRequest < RATE_LIMIT_WINDOW) {
      return res.status(429).json({
        success: false,
        error: `\u23F0 Rate limit exceeded. Please wait ${Math.ceil((RATE_LIMIT_WINDOW - (now - lastRequest)) / 1e3)} seconds.`
      });
    }
  }
  rateLimitMap.set(clientIP, now);
  next();
}
async function registerRoutes(app2) {
  app2.post("/api/download", checkRateLimit, async (req, res) => {
    try {
      const validationResult = downloadRequestSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          success: false,
          error: "\u274C Invalid or missing URL."
        });
      }
      const { url } = validationResult.data;
      const cleanUrl = url.trim();
      const platform = detectPlatform(cleanUrl);
      if (!platform) {
        return res.status(400).json({
          success: false,
          error: "\u274C Please provide a valid Instagram, YouTube, or TikTok URL."
        });
      }
      if (!validateUrl(cleanUrl, platform)) {
        return res.status(400).json({
          success: false,
          error: `\u274C Please provide a valid ${platform} URL.`
        });
      }
      console.log(`\u{1F50D} Processing ${platform} request for: ${cleanUrl}`);
      const result = await extractWithYtDlp(cleanUrl, platform);
      if (result.success && result.links && result.links.length > 0) {
        console.log(`\u2705 Successfully extracted ${result.links.length} media links`);
        try {
          const clientIP = req.ip || req.connection.remoteAddress || "unknown";
          await storage.saveDownloadHistory(
            {
              url: cleanUrl,
              platform,
              title: result.title || null,
              clientIp: clientIP,
              success: "true"
            },
            result.links.map((link) => ({
              downloadId: 0,
              // Will be set by the database
              label: link.label,
              url: link.url,
              quality: link.quality || null
            }))
          );
        } catch (dbError) {
          console.warn("Failed to save download history:", dbError);
        }
        return res.json(result);
      } else {
        try {
          const clientIP = req.ip || req.connection.remoteAddress || "unknown";
          await storage.saveDownloadHistory(
            {
              url: cleanUrl,
              platform,
              title: null,
              clientIp: clientIP,
              success: "false"
            },
            []
          );
        } catch (dbError) {
          console.warn("Failed to save failed download history:", dbError);
        }
        throw new Error(result.error || "No media found");
      }
    } catch (error) {
      console.error(`\u274C Download failed:`, error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      res.status(500).json({
        success: false,
        error: `\u26A0\uFE0F Unable to fetch media. ${errorMessage}`
      });
    }
  });
  app2.get("/api/health", (req, res) => {
    res.json({ status: "healthy", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
  });
  app2.get("/api/history", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const history = await storage.getDownloadHistory(limit);
      res.json({ success: true, history });
    } catch (error) {
      console.error("Failed to fetch download history:", error);
      res.status(500).json({ success: false, error: "Failed to fetch download history" });
    }
  });
  const httpServer = createServer(app2);
  checkYtDlp().then((available) => {
    if (available) {
      console.log("\u2705 yt-dlp is ready");
    } else {
      console.log("\u26A0\uFE0F yt-dlp not available, some functionality may be limited");
    }
  });
  return httpServer;
}

// server/vite.ts
import express from "express";
import fs from "fs";
import path2 from "path";
import { createServer as createViteServer, createLogger } from "vite";

// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
var vite_config_default = defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...process.env.NODE_ENV !== "production" && process.env.REPL_ID !== void 0 ? [
      await import("@replit/vite-plugin-cartographer").then(
        (m) => m.cartographer()
      )
    ] : []
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets")
    }
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"]
    }
  }
});

// server/vite.ts
import { nanoid } from "nanoid";
var viteLogger = createLogger();
function log(message, source = "express") {
  const formattedTime = (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}
async function setupVite(app2, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      }
    },
    server: serverOptions,
    appType: "custom"
  });
  app2.use(vite.middlewares);
  app2.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path2.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html"
      );
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app2) {
  const distPath = path2.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app2.use(express.static(distPath));
  app2.use("*", (_req, res) => {
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}

// server/index.ts
var app = express2();
app.use(express2.json());
app.use(express2.urlencoded({ extended: false }));
app.use((req, res, next) => {
  const start = Date.now();
  const path3 = req.path;
  let capturedJsonResponse = void 0;
  const originalResJson = res.json;
  res.json = function(bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path3.startsWith("/api")) {
      let logLine = `${req.method} ${path3} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    }
  });
  next();
});
(async () => {
  const server = await registerRoutes(app);
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const port = 5e3;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true
  }, () => {
    log(`serving on port ${port}`);
  });
})();
