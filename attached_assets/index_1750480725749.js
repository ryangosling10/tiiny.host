
const express = require("express");
const axios = require("axios");
const path = require("path");
const { exec } = require("child_process");
const { promisify } = require("util");

const execAsync = promisify(exec);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, ".")));

// Rate limiting storage
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 30000; // 30 seconds

// Check if yt-dlp is available
async function checkYtDlp() {
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
      console.error('❌ Failed to install yt-dlp:', installError.message);
      return false;
    }
  }
}

// Instagram API fallback function
async function extractInstagramFallback(url) {
  try {
    console.log('🔄 Trying Instagram API fallback...');
    
    // Extract shortcode from URL
    const shortcodeMatch = url.match(/(?:\/p\/|\/reel\/|\/tv\/)([a-zA-Z0-9_-]+)/);
    if (!shortcodeMatch) {
      throw new Error('Invalid Instagram URL format');
    }
    
    const shortcode = shortcodeMatch[1];
    
    // Try to get media info using Instagram's embed endpoint
    const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/`;
    const response = await axios.get(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 10000
    });
    
    // Try to extract video URL from the embed page
    const videoMatch = response.data.match(/"video_url":"([^"]+)"/);
    const imageMatch = response.data.match(/"display_url":"([^"]+)"/);
    
    const links = [];
    
    if (videoMatch) {
      const videoUrl = videoMatch[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
      links.push({
        label: 'Instagram Video',
        url: videoUrl,
        quality: 'original'
      });
    }
    
    if (imageMatch && !videoMatch) {
      const imageUrl = imageMatch[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
      links.push({
        label: 'Instagram Image',
        url: imageUrl,
        quality: 'original'
      });
    }
    
    if (links.length > 0) {
      return {
        success: true,
        links: links,
        title: 'Instagram Media'
      };
    } else {
      throw new Error('No media found');
    }
    
  } catch (error) {
    console.error('❌ Instagram fallback failed:', error.message);
    return { success: false, error: error.message };
  }
}

// yt-dlp extraction function for all platforms
async function extractWithYtDlp(url, platform) {
  try {
    console.log(`🎬 Trying yt-dlp extraction for ${platform}: ${url}`);

    // Check if yt-dlp is available
    const ytDlpAvailable = await checkYtDlp();
    if (!ytDlpAvailable) {
      throw new Error('yt-dlp not available');
    }

    // Use yt-dlp to extract video information with better error handling
    const { stdout } = await execAsync(`yt-dlp --dump-json --no-download --no-warnings "${url}"`, {
      timeout: 30000
    });
    
    const videoInfo = JSON.parse(stdout.trim());

    const links = [];

    // Extract video formats
    if (videoInfo.formats && Array.isArray(videoInfo.formats)) {
      // Get best video quality options
      const videoFormats = videoInfo.formats
        .filter(f => f.vcodec && f.vcodec !== 'none' && f.url)
        .sort((a, b) => (b.height || 0) - (a.height || 0))
        .slice(0, 3); // Top 3 quality options

      videoFormats.forEach((format, i) => {
        links.push({
          label: `Video ${format.height || 'Unknown'}p (${format.ext || 'mp4'})`,
          url: format.url,
          quality: format.height || 'unknown'
        });
      });

      // Also get audio-only if available
      const audioFormats = videoInfo.formats
        .filter(f => f.acodec && f.acodec !== 'none' && f.vcodec === 'none' && f.url)
        .sort((a, b) => (b.abr || 0) - (a.abr || 0))
        .slice(0, 1); // Best audio quality

      audioFormats.forEach((format) => {
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
        url: videoInfo.url
      });
    }

    return {
      success: true,
      links: links,
      title: videoInfo.title || `${platform} Video`,
      duration: videoInfo.duration,
      thumbnail: videoInfo.thumbnail
    };

  } catch (error) {
    console.error(`❌ yt-dlp error for ${platform}:`, error.message);
    
    // Try fallback for Instagram
    if (platform === 'instagram') {
      console.log('🔄 Trying Instagram fallback method...');
      return await extractInstagramFallback(url);
    }
    
    return { success: false, error: error.message };
  }
}

// Rate limiting middleware
function checkRateLimit(req, res, next) {
  const clientIP = req.ip || req.connection.remoteAddress;
  const now = Date.now();

  if (rateLimitMap.has(clientIP)) {
    const lastRequest = rateLimitMap.get(clientIP);
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

// Platform detection function
function detectPlatform(url) {
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
function validateUrl(url, platform) {
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

app.post("/download", checkRateLimit, async (req, res) => {
  const { url } = req.body;

  // Enhanced URL validation
  if (!url || typeof url !== 'string') {
    return res.status(400).json({
      success: false,
      error: "❌ Invalid or missing URL."
    });
  }

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

  // Use yt-dlp for all platforms with fallback
  try {
    const result = await extractWithYtDlp(cleanUrl, platform);
    if (result.success && result.links.length > 0) {
      console.log(`✅ Successfully extracted ${result.links.length} media links`);
      return res.json({ 
        success: true, 
        links: result.links,
        source: 'yt-dlp',
        title: result.title,
        platform: platform,
        thumbnail: result.thumbnail
      });
    } else {
      throw new Error(result.error || 'No media found');
    }
  } catch (error) {
    console.error(`❌ ${platform} extraction failed:`, error.message);

    // Different error messages for different platforms
    let errorMessage;
    switch (platform) {
      case 'instagram':
        errorMessage = "⚠️ Unable to fetch media from Instagram. The post might be private, deleted, or temporarily unavailable.";
        break;
      case 'youtube':
        errorMessage = "⚠️ Unable to fetch video from YouTube. The video might be private, deleted, age-restricted, or temporarily unavailable.";
        break;
      case 'tiktok':
        errorMessage = "⚠️ Unable to fetch video from TikTok. The video might be private, deleted, or temporarily unavailable.";
        break;
      default:
        errorMessage = "⚠️ Unable to fetch media. Please try again later.";
    }

    res.status(500).json({
      success: false,
      error: errorMessage
    });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('💥 Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: "⚠️ Internal server error. Please try again later."
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Multi-Platform Downloader by Ryan Gosling running on port ${PORT}`);
  console.log(`🌐 Server accessible at http://0.0.0.0:${PORT}`);
  console.log(`📱 Supports: Instagram, YouTube, TikTok`);
  
  // Check yt-dlp availability on startup
  checkYtDlp().then(available => {
    if (available) {
      console.log('✅ yt-dlp is ready');
    } else {
      console.log('⚠️ yt-dlp not available, using fallback methods');
    }
  });
});
