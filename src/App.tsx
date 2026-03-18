import React, { useState, useCallback, useEffect, useRef } from "react";
import { 
  Upload, File, Download, Copy, Check, QrCode, Trash2, 
  Clock, AlertCircle, Sun, Moon, X, FileText, Image as ImageIcon, 
  Music, Video, Archive, ExternalLink
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import QRCode from "qrcode";

type View = "upload" | "success" | "download";

interface FileInfo {
  id: string;
  filename: string;
  size: number;
  url: string;
  expiresAt: number;
  downloadCount: number;
  maxDownloads: number;
}

const FileIcon = ({ filename, size = 32 }: { filename: string, size?: number }) => {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext || '')) return <ImageIcon size={size} />;
  if (['mp4', 'webm', 'mov', 'avi'].includes(ext || '')) return <Video size={size} />;
  if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext || '')) return <Music size={size} />;
  if (['pdf', 'doc', 'docx', 'txt', 'md'].includes(ext || '')) return <FileText size={size} />;
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext || '')) return <Archive size={size} />;
  return <File size={size} />;
};

const Countdown = ({ expiresAt, onExpire }: { expiresAt: number, onExpire: () => void }) => {
  const [timeLeft, setTimeLeft] = useState(Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)));

  useEffect(() => {
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0) {
        clearInterval(timer);
        onExpire();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [expiresAt, onExpire]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  return (
    <span className="font-mono font-medium">
      {minutes}:{seconds.toString().padStart(2, '0')}
    </span>
  );
};

export default function App() {
  const [view, setView] = useState<View>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadedInfo, setUploadedInfo] = useState<FileInfo | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("theme") === "dark";
    }
    return false;
  });
  
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  // Apply theme
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [isDark]);

  useEffect(() => {
  const onErr = (msg: any, url?: string, line?: number, col?: number, error?: Error) => {
    console.error("GLOBAL ERROR:", { msg, url, line, col, error });
  };
  window.addEventListener("error", onErr);
  window.addEventListener("unhandledrejection", (e) => {
    console.error("Unhandled rejection:", e.reason);
  });
  return () => {
    window.removeEventListener("error", onErr);
  };
}, []);

  const fetchFileInfo = async (id: string) => {
    try {
      const res = await fetch(`/api/file-info?id=${id}`);
      if (!res.ok) throw new Error("File not found or expired");
      const data = await res.json();
      setUploadedInfo({ id, ...data });
      setView("download");
    } catch (err: any) {
      setError(err.message);
      setView("upload");
      window.history.pushState({}, "", "/");
    }
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFileSelection(droppedFile);
  }, []);

  const handleFileSelection = (selectedFile: File) => {
    if (selectedFile.size > 50 * 1024 * 1024) {
      setError("File size exceeds 50MB limit");
      return;
    }
    setFile(selectedFile);
    setError(null);
  };

  const cancelUpload = () => {
    if (xhrRef.current) {
      xhrRef.current.abort();
      setUploading(false);
      setProgress(0);
    }
  };

  const uploadFile = async () => {
    if (!file) return;
    setUploading(true);
    setProgress(0);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        setProgress(percent);
      }
    });

xhr.addEventListener("load", async () => {
  if (xhr.status >= 200 && xhr.status < 300) {
    const data = JSON.parse(xhr.responseText);

    setUploadedInfo(data);

    const shareUrl = data.url; // ✅ FIX

    const qr = await QRCode.toDataURL(shareUrl);
    setQrCodeUrl(qr);

    setView("success");
  } else {
    setError("Upload failed");
  }

  setUploading(false);
});

    xhr.addEventListener("error", () => {
      setError("Network error occurred.");
      setUploading(false);
    });

    xhr.open("POST", "/api/upload");
    xhr.send(formData);
  };

  const copyLink = () => {
    if (!uploadedInfo) return;
    navigator.clipboard.writeText(uploadedInfo.url);
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const renderUpload = () => (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="w-full max-w-md bg-white dark:bg-gray-900 rounded-[2rem] shadow-2xl p-8 border border-gray-100 dark:border-gray-800 transition-all"
    >
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center p-3 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-2xl mb-4">
          <Upload size={28} />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2 tracking-tight">QuickShare</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm">Fast, temporary, and secure file sharing</p>
      </div>

      {error && (
        <motion.div 
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="mb-6 p-4 bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 rounded-2xl flex items-start gap-3 text-sm border border-red-100 dark:border-red-900/20"
        >
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">Something went wrong</p>
            <p className="opacity-80">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="hover:opacity-70">
            <X size={16} />
          </button>
        </motion.div>
      )}

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className={`relative border-2 border-dashed rounded-[2rem] p-12 transition-all duration-300 flex flex-col items-center justify-center gap-4 group ${
          file 
            ? "border-emerald-400 bg-emerald-50/30 dark:bg-emerald-900/10" 
            : "border-gray-200 dark:border-gray-700 hover:border-indigo-400 hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10"
        }`}
      >
        <div className={`p-5 rounded-2xl transition-transform duration-300 group-hover:scale-110 ${
          file ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400" : "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400"
        }`}>
          {file ? <FileIcon filename={file.name} size={40} /> : <Upload size={40} />}
        </div>
        
        <div className="text-center">
          {file ? (
            <>
              <p className="font-bold text-gray-900 dark:text-white truncate max-w-[240px] text-lg">{file.name}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">{formatSize(file.size)}</p>
            </>
          ) : (
            <>
              <p className="font-bold text-gray-900 dark:text-white text-lg">Drop your file here</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">or click to browse</p>
              <p className="mt-2 text-[10px] text-gray-400 uppercase tracking-widest font-bold">Max 50MB &bull; 10m Expiry</p>
            </>
          )}
        </div>

        <input
          type="file"
          className="absolute inset-0 opacity-0 cursor-pointer"
          onChange={(e) => e.target.files?.[0] && handleFileSelection(e.target.files[0])}
          disabled={uploading}
        />
      </div>

      {uploading && (
        <div className="mt-8 space-y-3">
          <div className="flex justify-between items-end">
            <div className="space-y-1">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Uploading</p>
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{progress}% complete</p>
            </div>
            <button 
              onClick={cancelUpload}
              className="text-xs font-bold text-red-500 hover:text-red-600 uppercase tracking-wider"
            >
              Cancel
            </button>
          </div>
          <div className="h-3 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden p-1">
            <motion.div 
              className="h-full bg-indigo-600 rounded-full shadow-[0_0_10px_rgba(79,70,229,0.4)]"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ type: "spring", bounce: 0, duration: 0.5 }}
            />
          </div>
        </div>
      )}

      {!uploading && (
        <button
          disabled={!file}
          onClick={uploadFile}
          className="w-full mt-8 py-5 bg-indigo-600 text-white rounded-2xl font-bold shadow-xl shadow-indigo-200 dark:shadow-none hover:bg-indigo-700 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:shadow-none disabled:translate-y-0 transition-all flex items-center justify-center gap-3"
        >
          <Upload size={20} />
          Generate Secure Link
        </button>
      )}

      <div className="mt-8 grid grid-cols-2 gap-4">
        <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-2xl flex items-center gap-3 border border-gray-100 dark:border-gray-800">
          <div className="p-2 bg-white dark:bg-gray-800 rounded-xl text-indigo-500 shadow-sm">
            <Clock size={16} />
          </div>
          <div className="text-[10px]">
            <p className="text-gray-400 font-bold uppercase tracking-tighter">Expiry</p>
            <p className="text-gray-700 dark:text-gray-300 font-bold">10 Minutes</p>
          </div>
        </div>
        <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-2xl flex items-center gap-3 border border-gray-100 dark:border-gray-800">
          <div className="p-2 bg-white dark:bg-gray-800 rounded-xl text-emerald-500 shadow-sm">
            <Trash2 size={16} />
          </div>
          <div className="text-[10px]">
            <p className="text-gray-400 font-bold uppercase tracking-tighter">Limit</p>
            <p className="text-gray-700 dark:text-gray-300 font-bold">10 Downloads</p>
          </div>
        </div>
      </div>
    </motion.div>
  );

  const renderSuccess = () => (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="w-full max-w-md bg-white dark:bg-gray-900 rounded-[2rem] shadow-2xl p-8 border border-gray-100 dark:border-gray-800 transition-all"
    >
      <div className="text-center mb-8">
        <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-[1.5rem] flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-100 dark:shadow-none">
          <Check size={40} />
        </div>
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Ready to share!</h2>
        <div className="flex items-center justify-center gap-2 text-gray-500 dark:text-gray-400 text-sm mt-1">
          <Clock size={14} />
          <span>Expires in </span>
          {uploadedInfo && (
            <Countdown 
              expiresAt={uploadedInfo.expiresAt} 
              onExpire={() => {
                setView("upload");
                setError("Your previous link has expired.");
              }} 
            />
          )}
        </div>
      </div>

      <div className="space-y-6">
        <div className="group relative">
          <div className="p-5 bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 flex items-center justify-between gap-4 transition-all hover:border-indigo-200 dark:hover:border-indigo-900">
            <div className="flex-1 truncate text-sm font-mono text-gray-600 dark:text-gray-300">
              {uploadedInfo?.url}
            </div>
            <button 
              onClick={copyLink}
              className="shrink-0 p-3 bg-white dark:bg-gray-700 rounded-xl shadow-sm hover:shadow-md transition-all text-gray-500 hover:text-indigo-600 active:scale-95"
            >
              {copied ? <Check size={20} className="text-emerald-500" /> : <Copy size={20} />}
            </button>
          </div>
          {copied && (
            <motion.p 
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute -bottom-6 left-0 right-0 text-center text-[10px] font-bold text-emerald-500 uppercase tracking-widest"
            >
              Copied to clipboard
            </motion.p>
          )}
        </div>

        <div className="flex flex-col items-center gap-5 p-8 bg-gray-50 dark:bg-gray-800 rounded-[2rem] border border-gray-100 dark:border-gray-700">
          <div className="bg-white p-4 rounded-2xl shadow-xl">
            <img src={qrCodeUrl} alt="QR Code" className="w-44 h-44" />
          </div>
          <div className="text-center space-y-1">
            <p className="text-[10px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-[0.2em]">Scan to download</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Perfect for mobile sharing</p>
          </div>
        </div>

        <div className="pt-4 flex flex-col gap-3">
          <button
            onClick={() => {
              setView("upload");
              setFile(null);
              setUploadedInfo(null);
            }}
            className="w-full py-4 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-2xl font-bold hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
          >
            Upload another file
          </button>
        </div>
      </div>
    </motion.div>
  );

  const renderDownload = () => (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="w-full max-w-md bg-white dark:bg-gray-900 rounded-[2rem] shadow-2xl p-8 border border-gray-100 dark:border-gray-800 transition-all"
    >
      <div className="text-center mb-8">
        <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-[1.5rem] flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-50 dark:shadow-none">
          {uploadedInfo && <FileIcon filename={uploadedInfo.filename} size={40} />}
        </div>
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white truncate px-4 tracking-tight">{uploadedInfo?.filename}</h2>
        <p className="text-gray-500 dark:text-gray-400 font-medium mt-1">{formatSize(uploadedInfo?.size || 0)}</p>
      </div>

      <div className="p-5 bg-amber-50 dark:bg-amber-900/10 text-amber-700 dark:text-amber-400 rounded-2xl border border-amber-100 dark:border-amber-900/20 mb-8">
        <div className="flex items-start gap-3 text-sm mb-3">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <p className="font-medium leading-snug">This file is temporary and will be deleted after reaching the download limit or expiry.</p>
        </div>
        
        {uploadedInfo && (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white/50 dark:bg-black/20 p-2 rounded-xl text-center">
              <p className="text-[9px] font-bold uppercase tracking-tighter opacity-60">Downloads</p>
              <p className="text-sm font-bold">{uploadedInfo.downloadCount} / {uploadedInfo.maxDownloads}</p>
            </div>
            <div className="bg-white/50 dark:bg-black/20 p-2 rounded-xl text-center">
              <p className="text-[9px] font-bold uppercase tracking-tighter opacity-60">Expires In</p>
              <p className="text-sm font-bold">
                <Countdown 
                  expiresAt={uploadedInfo.expiresAt} 
                  onExpire={() => {
                    setView("upload");
                    setError("This file has expired.");
                  }} 
                />
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <a
          href={uploadedInfo?.url}
          className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-bold shadow-xl shadow-indigo-200 dark:shadow-none hover:bg-indigo-700 hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-3"
          onClick={() => {
            // If it's the last download, go back to upload after a bit
            if (uploadedInfo && uploadedInfo.downloadCount + 1 >= uploadedInfo.maxDownloads) {
              setTimeout(() => {
                window.history.pushState({}, "", "/");
                setView("upload");
                setUploadedInfo(null);
                setError("File reached max downloads and was removed.");
              }, 1500);
            } else {
              // Just refresh info to show updated count
              setTimeout(() => {
                if (uploadedInfo?.id) fetchFileInfo(uploadedInfo.id);
              }, 1500);
            }
          }}
        >
          <Download size={20} />
          Download Now
        </a>

        <button
          onClick={() => {
            window.history.pushState({}, "", "/");
            setView("upload");
            setUploadedInfo(null);
            setFile(null);
            setError(null);
          }}
          className="w-full py-4 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-2xl font-bold hover:bg-gray-200 dark:hover:bg-gray-700 transition-all flex items-center justify-center gap-2"
        >
          <Upload size={18} />
          Upload your own file
        </button>
      </div>
    </motion.div>
  );

  return (
    <div className="min-h-screen bg-[#F8F9FD] dark:bg-black flex items-center justify-center p-6 font-sans transition-colors selection:bg-indigo-100 dark:selection:bg-indigo-900/40">
      <div className="fixed top-8 left-8 flex items-center gap-2 font-bold text-gray-900 dark:text-white tracking-tight">
        <div className="p-2 bg-indigo-600 text-white rounded-xl">
          <ExternalLink size={18} />
        </div>
        QuickShare
      </div>

      <button 
        onClick={() => setIsDark(!isDark)}
        className="fixed top-8 right-8 p-3 bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-800 text-gray-500 dark:text-gray-400 hover:text-indigo-600 transition-all hover:scale-105 active:scale-95"
      >
        {isDark ? <Sun size={20} /> : <Moon size={20} />}
      </button>

      <AnimatePresence mode="wait">
        {view === "upload" && renderUpload()}
        {view === "success" && renderSuccess()}
        {view === "download" && renderDownload()}
      </AnimatePresence>
      
      <div className="fixed bottom-8 flex flex-col items-center gap-2">
        <div className="flex items-center gap-4 text-gray-400 dark:text-gray-600 text-[10px] font-bold tracking-[0.2em] uppercase">
          <span>Secure</span>
          <span className="w-1 h-1 bg-gray-300 dark:bg-gray-800 rounded-full" />
          <span>Temporary</span>
          <span className="w-1 h-1 bg-gray-300 dark:bg-gray-800 rounded-full" />
          <span>Private</span>
        </div>
      </div>
    </div>
  );
}
