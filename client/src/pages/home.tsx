import Downloader from "@/components/downloader";

export default function Home() {
  return (
    <div className="min-h-screen relative">
      {/* Forest Background */}
      <div 
        className="fixed inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: "url('https://images.unsplash.com/photo-1441974231531-c6227db76b6e?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2071&q=80')",
          filter: "blur(2px)",
        }}
      />
      
      {/* Overlay for better text readability */}
      <div className="fixed inset-0 bg-black bg-opacity-40" />
      
      {/* Main Content */}
      <div className="relative z-10 min-h-screen flex items-center justify-center p-5">
        <Downloader />
      </div>
    </div>
  );
}
