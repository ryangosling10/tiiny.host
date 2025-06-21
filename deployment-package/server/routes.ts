import type { Express } from "express";
import { createServer, type Server } from "http";
import { exec } from "child_process";
import { promisify } from "util";
import { downloadRequestSchema, type DownloadResponse, type Platform } from "@shared/schema";
import { storage } from "./storage";

const execAsync = promisify(exec);

// Rate limiting storage
const rateLimitMap = new Map<string, number>();
const RATE_LIMIT_WINDOW = 30000; // 30 seconds

// Platform detection function
function detectPlatform(url: string): Platform | null {
  const cleanUrl = url.trim().toLowerCase();

  if (cleanUrl.includes('instagram.com') || cleanUrl.includes('instagr.am')) {
    return 'instagram';
  } else if (cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be')) {
    return 'youtube';
  } else if (cleanUrl.includes('tiktok.com')) {
    return 'tiktok';
  }

  return null;
}

// URL validation function
function validateUrl(url: string, platform: Platform): boolean {
  const cleanUrl = url.trim();

  switch (platform) {
    case 'instagram':
      return /^https?:\/\/(www\.)?(instagram\.com|instagr\.am)\/(p|reel|tv)\/[a-zA-Z0-9_-]+/.test(cleanUrl);
    case 'youtube':
      return /^https?:\/\/(www\.)?(youtube\.com\/(watch\?v=|embed\/|v\/)|youtu\.be\/)[a-zA-Z0-9_-]+/.test(cleanUrl);
    case 'tiktok':
      return /^https?:\/\/(www\.)?(tiktok\.com|vm\.tiktok\.com)\//.test(cleanUrl);
    default:
      return false;
  }
}

// Check if yt-dlp is available
async function checkYtDlp(): Promise<boolean> {
  try {
    await execAsync('yt-dlp --version');
    return true;
  } catch (error) {
    console.log('⚠️ yt-dlp not found, trying to install...');
    try {
      await execAsync('pip install yt-dlp');
      console.log('✅ yt-dlp installed successfully');
      return true;
    } catch (installError) {
      console.error('❌ Failed to install yt-dlp:', installError);
      return false;
    }
  }
}

// Extract media using yt-dlp
async function extractWithYtDlp(url: string, platform: Platform): Promise<DownloadResponse> {
  try {
    console.log(`🎬 Trying yt-dlp extraction for ${platform}: ${url}`);

    // Check if yt-dlp is available
    const ytDlpAvailable = await checkYtDlp();
    if (!ytDlpAvailable) {
      throw new Error('yt-dlp not available');
    }

    // Use yt-dlp to extract video information
    const { stdout } = await execAsync(`yt-dlp --dump-json --no-download --no-warnings "${url}"`, {
      timeout: 30000
    });
    
    const videoInfo = JSON.parse(stdout.trim());
    const links = [];

    // Extract video formats
    if (videoInfo.formats && Array.isArray(videoInfo.formats)) {
      // Get best video quality options
      const videoFormats = videoInfo.formats
        .filter((f: any) => f.vcodec && f.vcodec !== 'none' && f.url)
        .sort((a: any, b: any) => (b.height || 0) - (a.height || 0))
        .slice(0, 3); // Top 3 quality options

      videoFormats.forEach((format: any) => {
        links.push({
          label: `Video ${format.height || 'Unknown'}p (${format.ext || 'mp4'})`,
          url: format.url,
          quality: format.height?.toString() || 'unknown'
        });
      });

      // Also get audio-only if available
      const audioFormats = videoInfo.formats
        .filter((f: any) => f.acodec && f.acodec !== 'none' && f.vcodec === 'none' && f.url)
        .sort((a: any, b: any) => (b.abr || 0) - (a.abr || 0))
        .slice(0, 1); // Best audio quality

      audioFormats.forEach((format: any) => {
        links.push({
          label: `Audio Only (${format.ext || 'mp3'})`,
          url: format.url,
          quality: 'audio'
        });
      });
    }

    // Fallback to direct URL if available
    if (videoInfo.url && links.length === 0) {
      links.push({
        label: `Video (${videoInfo.ext || 'mp4'})`,
        url: videoInfo.url,
        quality: 'unknown'
      });
    }

    return {
      success: true,
      links: links,
      title: videoInfo.title || `${platform} Video`,
      source: 'yt-dlp',
      platform: platform,
      thumbnail: videoInfo.thumbnail
    };

  } catch (error) {
    console.error(`❌ yt-dlp error for ${platform}:`, error);
    return { 
      success: false, 
      error: `Failed to extract ${platform} media: ${error instanceof Error ? error.message : 'Unknown error'}` 
    };
  }
}

// Rate limiting middleware
function checkRateLimit(req: any, res: any, next: any) {
  const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();

  if (rateLimitMap.has(clientIP)) {
    const lastRequest = rateLimitMap.get(clientIP)!;
    if (now - lastRequest < RATE_LIMIT_WINDOW) {
      return res.status(429).json({
        success: false,
        error: `⏰ Rate limit exceeded. Please wait ${Math.ceil((RATE_LIMIT_WINDOW - (now - lastRequest)) / 1000)} seconds.`
      });
    }
  }

  rateLimitMap.set(clientIP, now);
  next();
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Download endpoint
  app.post("/api/download", checkRateLimit, async (req, res) => {
    try {
      // Validate request body
      const validationResult = downloadRequestSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          success: false,
          error: "❌ Invalid or missing URL."
        });
      }

      const { url } = validationResult.data;

      // Clean URL and detect platform
      const cleanUrl = url.trim();
      const platform = detectPlatform(cleanUrl);

      if (!platform) {
        return res.status(400).json({
          success: false,
          error: "❌ Please provide a valid Instagram, YouTube, or TikTok URL."
        });
      }

      if (!validateUrl(cleanUrl, platform)) {
        return res.status(400).json({
          success: false,
          error: `❌ Please provide a valid ${platform} URL.`
        });
      }

      console.log(`🔍 Processing ${platform} request for: ${cleanUrl}`);

      // Use yt-dlp for extraction
      const result = await extractWithYtDlp(cleanUrl, platform);
      
      if (result.success && result.links && result.links.length > 0) {
        console.log(`✅ Successfully extracted ${result.links.length} media links`);
        
        // Save to database
        try {
          const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
          await storage.saveDownloadHistory(
            {
              url: cleanUrl,
              platform: platform,
              title: result.title || null,
              clientIp: clientIP,
              success: 'true'
            },
            result.links.map(link => ({
              downloadId: 0, // Will be set by the database
              label: link.label,
              url: link.url,
              quality: link.quality || null
            }))
          );
        } catch (dbError) {
          console.warn('Failed to save download history:', dbError);
          // Continue without failing the request
        }
        
        return res.json(result);
      } else {
        // Save failed attempt to database
        try {
          const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
          await storage.saveDownloadHistory(
            {
              url: cleanUrl,
              platform: platform,
              title: null,
              clientIp: clientIP,
              success: 'false'
            },
            []
          );
        } catch (dbError) {
          console.warn('Failed to save failed download history:', dbError);
        }
        
        throw new Error(result.error || 'No media found');
      }
    } catch (error) {
      console.error(`❌ Download failed:`, error);

      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      res.status(500).json({
        success: false,
        error: `⚠️ Unable to fetch media. ${errorMessage}`
      });
    }
  });

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "healthy", timestamp: new Date().toISOString() });
  });

  // Download history endpoint
  app.get("/api/history", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const history = await storage.getDownloadHistory(limit);
      res.json({ success: true, history });
    } catch (error) {
      console.error("Failed to fetch download history:", error);
      res.status(500).json({ success: false, error: "Failed to fetch download history" });
    }
  });

  const httpServer = createServer(app);

  // Check yt-dlp availability on startup
  checkYtDlp().then(available => {
    if (available) {
      console.log('✅ yt-dlp is ready');
    } else {
      console.log('⚠️ yt-dlp not available, some functionality may be limited');
    }
  });

  return httpServer;
}
