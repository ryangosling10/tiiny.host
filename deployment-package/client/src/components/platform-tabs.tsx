import { Button } from "@/components/ui/button";
import type { Platform } from "@shared/schema";

interface PlatformTabsProps {
  currentPlatform: Platform;
  onPlatformChange: (platform: Platform) => void;
}

export default function PlatformTabs({ currentPlatform, onPlatformChange }: PlatformTabsProps) {
  const platforms: { id: Platform; label: string }[] = [
    { id: 'instagram', label: 'Instagram' },
    { id: 'youtube', label: 'YouTube' },
    { id: 'tiktok', label: 'TikTok' },
  ];

  return (
    <div className="flex glass-tab rounded-2xl mb-8 overflow-hidden">
      {platforms.map((platform) => (
        <Button
          key={platform.id}
          onClick={() => onPlatformChange(platform.id)}
          variant="ghost"
          className={`
            flex-1 py-3 px-4 text-sm font-medium cursor-pointer transition-all duration-300 rounded-none border-none
            ${currentPlatform === platform.id 
              ? 'bg-white bg-opacity-20 border-b-2 border-white text-white' 
              : 'bg-white bg-opacity-10 text-white hover:bg-white hover:bg-opacity-15'
            }
          `}
        >
          {platform.label}
        </Button>
      ))}
    </div>
  );
}
