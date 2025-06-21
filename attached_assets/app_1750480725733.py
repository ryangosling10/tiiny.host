
import os
import re
import json
import time
import requests
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import yt_dlp
from urllib.parse import urlparse
import tempfile
import threading

app = Flask(__name__)
CORS(app)

# Rate limiting storage
rate_limit_storage = {}
RATE_LIMIT_WINDOW = 30  # seconds

class MultiPlatformExtractor:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        })

    def extract_instagram(self, url):
        """Extract Instagram media using multiple methods"""
        methods = [
            self._instagram_yt_dlp,
            self._instagram_api_method,
            self._instagram_embed_method
        ]
        
        for method in methods:
            try:
                result = method(url)
                if result['success']:
                    return result
            except Exception as e:
                print(f"Method {method.__name__} failed: {str(e)}")
                continue
        
        return {'success': False, 'error': 'All Instagram extraction methods failed'}

    def _instagram_yt_dlp(self, url):
        """Extract using yt-dlp"""
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': False,
            'format': 'best',
            'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        }
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            
            links = []
            if 'formats' in info:
                # Get video formats
                video_formats = [f for f in info['formats'] if f.get('vcodec') != 'none']
                if video_formats:
                    best_video = max(video_formats, key=lambda x: x.get('height', 0))
                    links.append({
                        'label': f"Video {best_video.get('height', 'unknown')}p",
                        'url': best_video['url'],
                        'quality': str(best_video.get('height', 'unknown'))
                    })
            
            if 'url' in info and not links:
                links.append({
                    'label': 'Instagram Media',
                    'url': info['url'],
                    'quality': 'original'
                })
            
            return {
                'success': True,
                'links': links,
                'title': info.get('title', 'Instagram Media'),
                'source': 'yt-dlp'
            }

    def _instagram_api_method(self, url):
        """Extract using Instagram's internal API"""
        # Extract shortcode
        shortcode_match = re.search(r'(?:\/p\/|\/reel\/|\/tv\/)([a-zA-Z0-9_-]+)', url)
        if not shortcode_match:
            raise Exception('Invalid Instagram URL format')
        
        shortcode = shortcode_match.group(1)
        
        # Try Instagram's GraphQL API
        api_url = f"https://www.instagram.com/graphql/query/"
        
        # This is a simplified approach - Instagram's API is complex and changes frequently
        headers = {
            'X-IG-App-ID': '936619743392459',
            'X-ASBD-ID': '129477',
            'X-IG-WWW-Claim': '0',
            'X-Requested-With': 'XMLHttpRequest',
        }
        
        # Try different query hashes (these change frequently)
        query_hashes = [
            '9f8827793ef34641b2fb195d4d41151c',
            'e769aa130647d2354c40ea6a439bfc08'
        ]
        
        for query_hash in query_hashes:
            try:
                params = {
                    'query_hash': query_hash,
                    'variables': json.dumps({
                        'shortcode': shortcode,
                        'child_comment_count': 3,
                        'fetch_comment_count': 40,
                        'parent_comment_count': 24,
                        'has_threaded_comments': True
                    })
                }
                
                response = self.session.get(api_url, params=params, headers=headers, timeout=10)
                if response.status_code == 200:
                    data = response.json()
                    if 'data' in data and 'shortcode_media' in data['data']:
                        media = data['data']['shortcode_media']
                        return self._parse_instagram_media(media)
            except:
                continue
        
        raise Exception('Instagram API extraction failed')

    def _instagram_embed_method(self, url):
        """Extract using Instagram embed method"""
        shortcode_match = re.search(r'(?:\/p\/|\/reel\/|\/tv\/)([a-zA-Z0-9_-]+)', url)
        if not shortcode_match:
            raise Exception('Invalid Instagram URL format')
        
        shortcode = shortcode_match.group(1)
        
        # Try multiple approaches
        methods = [
            f"https://www.instagram.com/p/{shortcode}/embed/",
            f"https://www.instagram.com/p/{shortcode}/?__a=1",
        ]
        
        for embed_url in methods:
            try:
                headers = {
                    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Accept-Encoding': 'gzip, deflate',
                    'DNT': '1',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1',
                }
                
                response = self.session.get(embed_url, headers=headers, timeout=10)
                content = response.text
                
                # Multiple patterns to try
                patterns = [
                    r'"video_url":"([^"]+)"',
                    r'"display_url":"([^"]+)"',
                    r'videoUrl":"([^"]+)"',
                    r'src="([^"]*\.mp4[^"]*)"',
                ]
                
                links = []
                
                for pattern in patterns:
                    matches = re.findall(pattern, content)
                    for match in matches:
                        clean_url = match.replace('\\u0026', '&').replace('\\/', '/').replace('\\', '')
                        if clean_url.startswith('http') and any(ext in clean_url for ext in ['.mp4', '.jpg', '.jpeg']):
                            label = 'Instagram Video' if '.mp4' in clean_url else 'Instagram Image'
                            links.append({
                                'label': label,
                                'url': clean_url,
                                'quality': 'original'
                            })
                            break
                    
                    if links:
                        break
                
                if links:
                    return {
                        'success': True,
                        'links': links,
                        'title': 'Instagram Media',
                        'source': 'embed'
                    }
                    
            except Exception as e:
                continue
        
        raise Exception('No media found in embed')

    def _parse_instagram_media(self, media):
        """Parse Instagram media data"""
        links = []
        
        if media.get('is_video') and media.get('video_url'):
            links.append({
                'label': 'Instagram Video',
                'url': media['video_url'],
                'quality': 'original'
            })
        elif media.get('display_url'):
            links.append({
                'label': 'Instagram Image',
                'url': media['display_url'],
                'quality': 'original'
            })
        
        return {
            'success': True,
            'links': links,
            'title': media.get('edge_media_to_caption', {}).get('edges', [{}])[0].get('node', {}).get('text', 'Instagram Media')[:50],
            'source': 'instagram_api'
        }

    def extract_youtube(self, url):
        """Extract YouTube video using yt-dlp"""
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'format': 'best/bestvideo+bestaudio/best[height<=1080]',
        }
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            
            links = []
            if 'formats' in info:
                # Get best video formats
                video_formats = [f for f in info['formats'] 
                               if f.get('vcodec') != 'none' and f.get('url')]
                video_formats.sort(key=lambda x: x.get('height', 0), reverse=True)
                
                for fmt in video_formats[:3]:  # Top 3 qualities
                    links.append({
                        'label': f"Video {fmt.get('height', 'unknown')}p ({fmt.get('ext', 'mp4')})",
                        'url': fmt['url'],
                        'quality': str(fmt.get('height', 'unknown'))
                    })
                
                # Add audio-only option
                audio_formats = [f for f in info['formats'] 
                               if f.get('acodec') != 'none' and f.get('vcodec') == 'none']
                if audio_formats:
                    best_audio = max(audio_formats, key=lambda x: x.get('abr', 0))
                    links.append({
                        'label': f"Audio Only ({best_audio.get('ext', 'mp3')})",
                        'url': best_audio['url'],
                        'quality': 'audio'
                    })
            
            return {
                'success': True,
                'links': links,
                'title': info.get('title', 'YouTube Video'),
                'source': 'yt-dlp'
            }

    def extract_tiktok(self, url):
        """Extract TikTok video using yt-dlp"""
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
        }
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            
            links = []
            if 'formats' in info:
                video_formats = [f for f in info['formats'] if f.get('url')]
                for fmt in video_formats:
                    links.append({
                        'label': f"TikTok Video ({fmt.get('ext', 'mp4')})",
                        'url': fmt['url'],
                        'quality': str(fmt.get('height', 'original'))
                    })
            elif 'url' in info:
                links.append({
                    'label': 'TikTok Video',
                    'url': info['url'],
                    'quality': 'original'
                })
            
            return {
                'success': True,
                'links': links,
                'title': info.get('title', 'TikTok Video'),
                'source': 'yt-dlp'
            }

# Initialize extractor
extractor = MultiPlatformExtractor()

def detect_platform(url):
    """Detect platform from URL"""
    url_lower = url.lower()
    if 'instagram.com' in url_lower or 'instagr.am' in url_lower:
        return 'instagram'
    elif 'youtube.com' in url_lower or 'youtu.be' in url_lower:
        return 'youtube'
    elif 'tiktok.com' in url_lower:
        return 'tiktok'
    return None

def check_rate_limit(client_ip):
    """Check if client is rate limited"""
    current_time = time.time()
    if client_ip in rate_limit_storage:
        last_request = rate_limit_storage[client_ip]
        if current_time - last_request < RATE_LIMIT_WINDOW:
            return False
    
    rate_limit_storage[client_ip] = current_time
    return True

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/download', methods=['POST'])
def download():
    try:
        data = request.get_json()
        url = data.get('url', '').strip()
        
        if not url:
            return jsonify({'success': False, 'error': 'Invalid URL'}), 400
        
        # Rate limiting
        client_ip = request.remote_addr
        if not check_rate_limit(client_ip):
            remaining_time = RATE_LIMIT_WINDOW - (time.time() - rate_limit_storage[client_ip])
            return jsonify({
                'success': False, 
                'error': f'⏰ Rate limit exceeded. Please wait {int(remaining_time)} seconds.'
            }), 429
        
        # Detect platform
        platform = detect_platform(url)
        if not platform:
            return jsonify({
                'success': False, 
                'error': '❌ Please provide a valid Instagram, YouTube, or TikTok URL.'
            }), 400
        
        print(f"🔍 Processing {platform} request for: {url}")
        
        # Extract media based on platform
        if platform == 'instagram':
            result = extractor.extract_instagram(url)
        elif platform == 'youtube':
            result = extractor.extract_youtube(url)
        elif platform == 'tiktok':
            result = extractor.extract_tiktok(url)
        else:
            return jsonify({'success': False, 'error': 'Unsupported platform'}), 400
        
        if result['success']:
            print(f"✅ Successfully extracted {len(result['links'])} media links")
            return jsonify({
                'success': True,
                'links': result['links'],
                'title': result.get('title', ''),
                'source': result.get('source', 'unknown'),
                'platform': platform
            })
        else:
            error_messages = {
                'instagram': "⚠️ Unable to fetch media from Instagram. The post might be private, deleted, or temporarily unavailable.",
                'youtube': "⚠️ Unable to fetch video from YouTube. The video might be private, deleted, age-restricted, or temporarily unavailable.",
                'tiktok': "⚠️ Unable to fetch video from TikTok. The video might be private, deleted, or temporarily unavailable."
            }
            
            return jsonify({
                'success': False,
                'error': error_messages.get(platform, result.get('error', 'Unknown error'))
            }), 500
            
    except Exception as e:
        print(f"❌ Error in download endpoint: {str(e)}")
        return jsonify({
            'success': False,
            'error': '⚠️ Internal server error. Please try again later.'
        }), 500

@app.route('/health')
def health():
    return jsonify({'status': 'healthy', 'timestamp': time.time()})

if __name__ == '__main__':
    print("✅ Multi-Platform Downloader by Ryan Gosling starting...")
    print("📱 Supports: Instagram, YouTube, TikTok")
    print("🐍 Running Python backend with multiple extraction methods")
    app.run(host='0.0.0.0', port=5000, debug=False)
