import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import PlatformTabs from "./platform-tabs";
import DownloadResults from "./download-results";
import type { Platform } from "@shared/schema";
import type { DownloadResponse } from "@shared/schema";

const platformPlaceholders = {
  instagram: "Paste Instagram reel or video URL here",
  youtube: "Paste YouTube video URL here",
  tiktok: "Paste TikTok video URL here"
};

export default function Downloader() {
  const [url, setUrl] = useState("");
  const [currentPlatform, setCurrentPlatform] = useState<Platform>("instagram");
  const [results, setResults] = useState<DownloadResponse | null>(null);
  const [lastDownloadTime, setLastDownloadTime] = useState(0);
  const { toast } = useToast();
  const urlInputRef = useRef<HTMLInputElement>(null);

  const RATE_LIMIT = 30000; // 30 seconds

  const downloadMutation = useMutation({
    mutationFn: async (downloadUrl: string) => {
      const response = await apiRequest("POST", "/api/download", { url: downloadUrl });
      return response.json() as Promise<DownloadResponse>;
    },
    onSuccess: (data) => {
      if (data.success) {
        setResults(data);
        setLastDownloadTime(Date.now());
        startCountdown();
        toast({
          title: "Success!",
          description: `Successfully extracted ${data.links?.length || 0} media links`,
        });
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to extract media",
          variant: "destructive",
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Network error or server unavailable. Please try again.",
        variant: "destructive",
      });
      console.error("Download error:", error);
    },
  });

  const [countdown, setCountdown] = useState(0);

  const startCountdown = () => {
    let timeLeft = RATE_LIMIT / 1000;
    setCountdown(timeLeft);

    const timer = setInterval(() => {
      timeLeft--;
      setCountdown(timeLeft);

      if (timeLeft <= 0) {
        clearInterval(timer);
        setCountdown(0);
      }
    }, 1000);
  };

  const handleDownload = async () => {
    if (!urlInputRef.current) {
      toast({
        title: "Error", 
        description: "Input field not found",
        variant: "destructive",
      });
      return;
    }

    const url = urlInputRef.current.value?.trim();
    if (!url) {
      toast({
        title: "Error",
        description: "Please enter a valid URL",
        variant: "destructive",
      });
      return;
    }

    // Rate limiting check
    const now = Date.now();
    const timeRemaining = RATE_LIMIT - (now - lastDownloadTime);

    if (timeRemaining > 0) {
      const seconds = Math.ceil(timeRemaining / 1000);
      toast({
        title: "Rate Limited",
        description: `Please wait ${seconds} seconds before downloading again`,
        variant: "destructive",
      });
      return;
    }

    setResults(null);
    downloadMutation.mutate(url);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleDownload();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    setTimeout(() => {
      const target = e.currentTarget;
      if (target && target.value) {
        const pastedUrl = target.value.toLowerCase();
        let detectedPlatform: Platform | null = null;

        if (pastedUrl.includes('instagram.com') || pastedUrl.includes('instagr.am')) {
          detectedPlatform = 'instagram';
        } else if (pastedUrl.includes('youtube.com') || pastedUrl.includes('youtu.be')) {
          detectedPlatform = 'youtube';
        } else if (pastedUrl.includes('tiktok.com')) {
          detectedPlatform = 'tiktok';
        }

        if (detectedPlatform && detectedPlatform !== currentPlatform) {
          setCurrentPlatform(detectedPlatform);
        }
      }
    }, 100);
  };

  const isLoading = downloadMutation.isPending;
  const isDisabled = isLoading || countdown > 0;

  return (
    <div className="glass-container rounded-3xl p-10 max-w-lg w-full text-center shadow-2xl">
      <PlatformTabs 
        currentPlatform={currentPlatform} 
        onPlatformChange={(platform) => {
          setCurrentPlatform(platform);
          setResults(null);
        }} 
      />

      {/* Title Section */}
      <h1 className="text-5xl font-light mb-4 tracking-tight text-white">Downloader</h1>
      <p className="text-xl font-light mb-6 opacity-90 text-white">Hi, I'm Ryan Gosling. 👋</p>

      {/* Bio Section */}
      <div className="text-left text-sm opacity-90 leading-relaxed mb-8 text-white">
        This is my first personal project — a simple all-in-one downloader for Instagram, YouTube, and TikTok.<br /><br />
        I built this tool to learn how full-stack development works using Node.js and a clean modern UI.<br /><br />
        Feel free to use it and share feedback. Thanks for visiting!
      </div>

      {/* Input Section */}
      <div className="flex gap-3 mb-8">
        <Input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyPress={handleKeyPress}
          onPaste={handlePaste}
          placeholder={platformPlaceholders[currentPlatform]}
          className="flex-1 py-3.5 px-5 text-sm border-none rounded-xl outline-none bg-white bg-opacity-90 text-gray-800 placeholder-gray-600 transition-all duration-300 focus:bg-white focus:ring-4 focus:ring-white focus:ring-opacity-30"
          ref={urlInputRef}
        />
        <Button
          onClick={handleDownload}
          disabled={isDisabled}
          className="bg-blue-500 hover:bg-blue-600 text-white border-none py-3.5 px-6 text-sm font-semibold rounded-xl cursor-pointer transition-all duration-300 hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none min-w-[120px]"
        >
          {isLoading ? 'Processing...' : countdown > 0 ? `Wait ${countdown}s` : 'Download'}
        </Button>
      </div>

      {/* Results Section */}
      {results && <DownloadResults results={results} />}
    </div>
  );
}