import type { DownloadResponse } from "@shared/schema";

interface DownloadResultsProps {
  results: DownloadResponse;
}

export default function DownloadResults({ results }: DownloadResultsProps) {
  if (!results.success || !results.links || results.links.length === 0) {
    return (
      <div className="mt-8">
        <div className="py-3.5 px-4 rounded-xl mb-5 font-medium text-sm bg-red-100 text-red-800">
          {results.error || "No download links found"}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <h3 className="text-white mb-5 text-lg font-medium">✨ Download Links:</h3>
      
      {/* Show extraction source */}
      {results.source && (
        <div className="mb-3 text-xs opacity-70 text-white">
          Extracted using: {results.source}
        </div>
      )}
      
      {/* Show video title */}
      {results.title && (
        <div className="mb-3 font-medium text-white bg-white bg-opacity-10 py-2.5 px-3 rounded-lg text-sm">
          {results.title}
        </div>
      )}
      
      {/* Show download links */}
      <div className="space-y-3">
        {results.links.map((link, index) => {
          const qualityText = link.quality && link.quality !== 'unknown' ? ` - ${link.quality}p` : '';
          return (
            <a
              key={index}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block py-3.5 px-5 text-sm text-gray-800 no-underline bg-white bg-opacity-90 rounded-xl transition-all duration-300 font-medium hover:bg-white hover:-translate-y-0.5 hover:shadow-xl"
            >
              📥 {link.label}{qualityText}
            </a>
          );
        })}
      </div>
    </div>
  );
}
