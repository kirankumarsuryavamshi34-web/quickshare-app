import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  Upload,
  File,
  Download,
  Copy,
  Check,
  Trash2,
  Clock,
  AlertCircle,
  Sun,
  Moon,
  X,
  FileText,
  Image as ImageIcon,
  Music,
  Video,
  Archive,
  ExternalLink,
  Lock,
  Shield,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import QRCode from "qrcode";

type View = "upload" | "success" | "download";

interface FileInfo {
  id: string;
  filename?: string;
  size: number;
  url: string;
  expiresAt: number;
  downloadCount?: number;
  maxDownloads?: number;
  hasPassword?: boolean;
}

interface UploadResponse {
  id?: string;
  filename?: string;
  size?: number;
  url?: string;
  expiresAt?: number;
  downloadCount?: number;
  maxDownloads?: number;
  hasPassword?: boolean;
  blobUrl?: string | null;
  error?: string;
}

const SHORT_ID_REGEX = /^\/(?:download\/)?([A-Za-z0-9_-]{6})$/;

const FileIcon = ({
  filename,
  size = 32,
}: {
  filename: string;
  size?: number;
}) => {
  const ext = filename.split(".").pop()?.toLowerCase();

  if (["jpg", "jpeg", "png", "gif", "svg", "webp"].includes(ext || "")) {
    return <ImageIcon size={size} />;
  }
  if (["mp4", "webm", "mov", "avi", "mkv"].includes(ext || "")) {
    return <Video size={size} />;
  }
  if (["mp3", "wav", "ogg", "m4a"].includes(ext || "")) {
    return <Music size={size} />;
  }
  if (["pdf", "doc", "docx", "txt", "md"].includes(ext || "")) {
    return <FileText size={size} />;
  }
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext || "")) {
    return <Archive size={size} />;
  }
  return <File size={size} />;
};

const Countdown = ({
  expiresAt,
  onExpire,
}: {
  expiresAt: number;
  onExpire: () => void;
}) => {
  const [timeLeft, setTimeLeft] = useState(
    Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))
  );

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
    <span className="font-mono font-semibold">
      {minutes}:{seconds.toString().padStart(2, "0")}
    </span>
  );
};

export default function App() {
  const [view, setView] = useState<View>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [receiverPassword, setReceiverPassword] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadedInfo, setUploadedInfo] = useState<FileInfo | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("theme") === "dark";
    }
    return false;
  });
  const [dragActive, setDragActive] = useState(false);

  const xhrRef = useRef<XMLHttpRequest | null>(null);

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
    const path = window.location.pathname;
    const match = path.match(/^\/([A-Za-z0-9_-]{6})$/);

    if (match?.[1]) {
      fetchFileInfo(match[1]);
    }
  }, []);

  const parseServerResponse = (
    xhr: XMLHttpRequest
  ): { ok: boolean; json?: any; text?: string } => {
    const raw = xhr.responseText || "";
    const ct = (xhr.getResponseHeader("content-type") || "").toLowerCase();

    if (ct.includes("application/json")) {
      try {
        return { ok: true, json: JSON.parse(raw) };
      } catch (e) {
        return { ok: false, text: `Invalid JSON response: ${String(e)}` };
      }
    }

    return {
      ok: false,
      text: raw || `Server returned status ${xhr.status}`,
    };
  };

  const fetchFileInfo = async (id: string) => {
    try {
      const res = await fetch(`/api/file-info?id=${encodeURIComponent(id)}`);
      const contentType = res.headers.get("content-type") || "";

      let data: any = null;

      if (contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(text || "Invalid server response");
      }

      if (!res.ok) {
        throw new Error(data?.error || "File not found or expired");
      }

      setUploadedInfo(data);
      setView("download");
      setError(null);
    } catch (err: any) {
      setError(err.message || "File not found or expired");
      setView("upload");
      window.history.replaceState({}, "", "/");
    }
  };

  const handleFileSelection = (selectedFile: File) => {
    if (selectedFile.size > 50 * 1024 * 1024) {
      setError("File size exceeds 50MB limit");
      return;
    }

    setFile(selectedFile);
    setError(null);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      handleFileSelection(droppedFile);
    }
  }, []);

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
    if (password.trim()) {
      formData.append("password", password.trim());
    }

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        setProgress(percent);
      }
    });

    xhr.addEventListener("load", async () => {
      setUploading(false);

      const parsed = parseServerResponse(xhr);

      if (!parsed.ok) {
        setError(parsed.text || "Upload failed. Please try again.");
        return;
      }

      const responseData: UploadResponse = parsed.json;

      if (xhr.status < 200 || xhr.status >= 300) {
        setError(responseData.error || "Upload failed. Please try again.");
        return;
      }

      if (
        !responseData.id ||
        !responseData.url ||
        !responseData.expiresAt ||
        typeof responseData.size !== "number"
      ) {
        setError("Invalid server response");
        return;
      }

      const normalized: FileInfo = {
        id: responseData.id,
        filename: responseData.filename,
        size: responseData.size,
        url: responseData.url,
        expiresAt: responseData.expiresAt,
        downloadCount: responseData.downloadCount ?? 0,
        maxDownloads: responseData.maxDownloads ?? 10,
        hasPassword: responseData.hasPassword ?? false,
      };

      setUploadedInfo(normalized);

      try {
        const qr = await QRCode.toDataURL(responseData.url);
        setQrCodeUrl(qr);
      } catch {
        setQrCodeUrl("");
      }

      setView("success");
      setPassword("");
      window.history.replaceState({}, "", "/");
    });

    xhr.addEventListener("error", () => {
      setUploading(false);
      setError("Network error occurred.");
    });

    xhr.addEventListener("abort", () => {
      setUploading(false);
      setError("Upload cancelled.");
    });

    xhr.open("POST", "/api/upload");
    xhr.send(formData);
  };

  const copyLink = async () => {
    if (!uploadedInfo?.url) return;
    try {
      await navigator.clipboard.writeText(uploadedInfo.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Unable to copy link");
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const handleDownload = () => {
    if (!uploadedInfo) return;

    let downloadUrl = `/${uploadedInfo.id}`;

    if (uploadedInfo.hasPassword) {
      if (!receiverPassword.trim()) {
        setError("Password is required to open this file.");
        return;
      }
      downloadUrl += `?password=${encodeURIComponent(receiverPassword.trim())}`;
    }

    window.open(downloadUrl, "_blank");
  };

  const resetToUpload = () => {
    setView("upload");
    setFile(null);
    setUploadedInfo(null);
    setQrCodeUrl("");
    setCopied(false);
    setError(null);
    setPassword("");
    setReceiverPassword("");
    setProgress(0);
    window.history.replaceState({}, "", "/");
  };

  const renderUpload = () => (
    <motion.div
      key="upload"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18 }}
      transition={{ duration: 0.22 }}
      className="w-full max-w-[34rem] rounded-[2.2rem] border border-slate-200/80 dark:border-slate-800 bg-white/95 dark:bg-[#0b0f19]/95 shadow-[0_20px_70px_rgba(15,23,42,0.12)] backdrop-blur p-8 md:p-10"
    >
      <div className="text-center mb-8">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[1.4rem] bg-gradient-to-br from-indigo-100 to-violet-100 dark:from-indigo-900/40 dark:to-violet-900/30 text-indigo-600 dark:text-indigo-400 shadow-sm">
          <Upload size={30} />
        </div>
        <h1 className="text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          QuickShare
        </h1>
        <p className="mt-3 text-lg text-slate-500 dark:text-slate-400">
          Fast, temporary, and secure file sharing
        </p>
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="mb-6 rounded-[1.6rem] border border-red-100 dark:border-red-900/20 bg-red-50 dark:bg-red-950/20 p-5 text-red-600 dark:text-red-400"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 shrink-0" size={20} />
            <div className="flex-1">
              <p className="font-bold text-xl">Something went wrong</p>
              <p className="mt-1 text-base opacity-90 break-words">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="hover:opacity-70">
              <X size={18} />
            </button>
          </div>
        </motion.div>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        className={`relative rounded-[2rem] border-2 border-dashed p-10 transition-all duration-300 ${
          dragActive
            ? "border-indigo-400 bg-indigo-50/60 dark:bg-indigo-900/10"
            : file
            ? "border-emerald-400 bg-emerald-50/40 dark:bg-emerald-900/10"
            : "border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40 hover:border-indigo-300"
        }`}
      >
        <input
          type="file"
          className="absolute inset-0 cursor-pointer opacity-0"
          onChange={(e) => e.target.files?.[0] && handleFileSelection(e.target.files[0])}
          disabled={uploading}
        />

        <div className="flex flex-col items-center justify-center text-center">
          <div
            className={`mb-5 flex h-20 w-20 items-center justify-center rounded-[1.6rem] ${
              file
                ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
                : "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400"
            }`}
          >
            {file ? <FileIcon filename={file.name} size={36} /> : <Upload size={36} />}
          </div>

          {file ? (
            <>
              <p className="max-w-[18rem] truncate text-2xl font-bold text-slate-900 dark:text-white">
                {file.name}
              </p>
              <p className="mt-2 text-base font-medium text-slate-500 dark:text-slate-400">
                {formatSize(file.size)}
              </p>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                Drop your file here or click to browse
              </p>
              <p className="mt-3 text-base text-slate-500 dark:text-slate-400">
                Max 50MB • Link expires in 10 minutes
              </p>
            </>
          )}
        </div>
      </div>

      <div className="mt-6">
        <label className="mb-2 block text-sm font-semibold text-slate-600 dark:text-slate-300">
          Password (optional — required to open without token)
        </label>
        <div className="relative">
          <Lock
            size={18}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter unique password (optional)"
            className="w-full rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-12 py-4 text-lg text-slate-900 dark:text-white outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 dark:focus:ring-indigo-900/30"
          />
        </div>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          One active file can use one password. Duplicate passwords are rejected until expiry or max downloads.
        </p>
      </div>

      {uploading && (
        <div className="mt-6 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Uploading
              </p>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                {progress}% complete
              </p>
            </div>
            <button
              onClick={cancelUpload}
              className="text-sm font-bold text-red-500 hover:text-red-600"
            >
              Cancel
            </button>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.2 }}
            />
          </div>
        </div>
      )}

      <button
        disabled={!file || uploading}
        onClick={uploadFile}
        className="mt-7 flex w-full items-center justify-center gap-3 rounded-[1.4rem] bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-5 text-lg font-bold text-white shadow-[0_14px_35px_rgba(79,70,229,0.28)] transition hover:-translate-y-0.5 hover:from-indigo-700 hover:to-violet-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
      >
        <Upload size={20} />
        Generate Secure Link
      </button>

      <div className="mt-7 grid grid-cols-2 gap-4">
        <div className="rounded-[1.4rem] border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-4">
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-white dark:bg-slate-800 text-indigo-500 shadow-sm">
            <Clock size={18} />
          </div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Expiry</p>
          <p className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-200">
            10 Minutes
          </p>
        </div>

        <div className="rounded-[1.4rem] border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-4">
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-white dark:bg-slate-800 text-emerald-500 shadow-sm">
            <Trash2 size={18} />
          </div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Limit</p>
          <p className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-200">
            10 Downloads
          </p>
        </div>
      </div>
    </motion.div>
  );

  const renderSuccess = () => (
    <motion.div
      key="success"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.22 }}
      className="w-full max-w-[34rem] rounded-[2.2rem] border border-slate-200/80 dark:border-slate-800 bg-white/95 dark:bg-[#0b0f19]/95 shadow-[0_20px_70px_rgba(15,23,42,0.12)] p-8 md:p-10"
    >
      <div className="text-center mb-8">
        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-[1.7rem] bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 shadow-lg">
          <Check size={40} />
        </div>
        <h2 className="text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Ready to share!
        </h2>
        <div className="mt-3 flex items-center justify-center gap-2 text-slate-500 dark:text-slate-400">
          <Clock size={14} />
          <span>Expires in</span>
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
        <div className="rounded-[1.5rem] border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1 break-all text-sm font-mono text-slate-600 dark:text-slate-300">
              {uploadedInfo?.url}
            </div>
            <button
              onClick={copyLink}
              className="rounded-xl bg-white dark:bg-slate-700 p-3 text-slate-500 transition hover:text-indigo-600 shadow-sm"
            >
              {copied ? <Check size={18} className="text-emerald-500" /> : <Copy size={18} />}
            </button>
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-8 text-center">
          <div className="mx-auto w-fit rounded-[1.5rem] bg-white p-4 shadow-lg">
            {qrCodeUrl ? (
              <img src={qrCodeUrl} alt="QR Code" className="h-48 w-48" />
            ) : (
              <div className="flex h-48 w-48 items-center justify-center text-slate-400">
                QR unavailable
              </div>
            )}
          </div>
          <p className="mt-5 text-xs font-bold uppercase tracking-[0.25em] text-slate-400">
            Scan to open
          </p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Share via QR, password, or direct link
          </p>
        </div>

        <button
          onClick={resetToUpload}
          className="w-full rounded-[1.4rem] bg-slate-100 dark:bg-slate-800 py-4 text-lg font-bold text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 dark:hover:bg-slate-700"
        >
          Upload another file
        </button>
      </div>
    </motion.div>
  );

  const renderDownload = () => (
    <motion.div
      key="download"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18 }}
      transition={{ duration: 0.22 }}
      className="w-full max-w-[34rem] rounded-[2.2rem] border border-slate-200/80 dark:border-slate-800 bg-white/95 dark:bg-[#0b0f19]/95 shadow-[0_20px_70px_rgba(15,23,42,0.12)] p-8 md:p-10"
    >
      <div className="text-center mb-8">
        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-[1.7rem] bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 shadow-lg">
          <Shield size={38} />
        </div>
        <h2 className="text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Secure Download
        </h2>
        <p className="mt-3 text-slate-500 dark:text-slate-400">
          This file is private and temporary
        </p>
      </div>

      <div className="mb-6 rounded-[1.6rem] border border-amber-100 dark:border-amber-900/20 bg-amber-50 dark:bg-amber-950/10 p-5 text-amber-700 dark:text-amber-400">
        <div className="flex items-start gap-3">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <div className="flex-1 text-sm leading-relaxed">
            Filename is hidden for privacy. The file will be deleted after expiry or when the maximum download limit is reached.
          </div>
        </div>

        {uploadedInfo && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white/70 dark:bg-black/20 p-3 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider opacity-60">
                Downloads
              </p>
              <p className="mt-1 text-sm font-bold">
                {uploadedInfo.downloadCount ?? 0} / {uploadedInfo.maxDownloads ?? 10}
              </p>
            </div>
            <div className="rounded-xl bg-white/70 dark:bg-black/20 p-3 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider opacity-60">
                Expires In
              </p>
              <p className="mt-1 text-sm font-bold">
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

      {uploadedInfo?.hasPassword && (
        <div className="mb-6">
          <label className="mb-2 block text-sm font-semibold text-slate-600 dark:text-slate-300">
            Enter file password
          </label>
          <div className="relative">
            <Lock
              size={18}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={receiverPassword}
              onChange={(e) => setReceiverPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-12 py-4 text-lg text-slate-900 dark:text-white outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 dark:focus:ring-indigo-900/30"
            />
          </div>
        </div>
      )}

      <div className="space-y-4">
        <button
          onClick={handleDownload}
          className="flex w-full items-center justify-center gap-3 rounded-[1.4rem] bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-5 text-lg font-bold text-white shadow-[0_14px_35px_rgba(79,70,229,0.28)] transition hover:-translate-y-0.5 hover:from-indigo-700 hover:to-violet-700"
        >
          <Download size={20} />
          Download Now
        </button>

        <button
          onClick={resetToUpload}
          className="w-full rounded-[1.4rem] bg-slate-100 dark:bg-slate-800 py-4 text-lg font-bold text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 dark:hover:bg-slate-700"
        >
          Use QuickShare / Upload your own file
        </button>
      </div>
    </motion.div>
  );

  return (
    <div className="min-h-screen bg-[#f6f7fb] dark:bg-[#020617] transition-colors">
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute left-[-10%] top-[-10%] h-[24rem] w-[24rem] rounded-full bg-indigo-200/30 blur-3xl dark:bg-indigo-900/20" />
        <div className="absolute bottom-[-10%] right-[-10%] h-[24rem] w-[24rem] rounded-full bg-violet-200/30 blur-3xl dark:bg-violet-900/20" />
      </div>

      <div className="flex min-h-screen flex-col">
        <div className="flex items-center justify-between px-6 py-6 md:px-8">
          <div className="flex items-center gap-3 font-semibold text-slate-800 dark:text-white">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md">
              <ExternalLink size={18} />
            </div>
            <span className="text-[1.8rem] font-semibold tracking-tight">QuickShare</span>
          </div>

          <button
            onClick={() => setIsDark(!isDark)}
            className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/80 p-3 text-slate-600 dark:text-slate-300 shadow-sm transition hover:scale-105"
          >
            {isDark ? <Sun size={22} /> : <Moon size={22} />}
          </button>
        </div>

        <div className="flex flex-1 items-center justify-center px-4 pb-8">
          <AnimatePresence mode="wait">
            {view === "upload" && renderUpload()}
            {view === "success" && renderSuccess()}
            {view === "download" && renderDownload()}
          </AnimatePresence>
        </div>

        <div className="pb-8 text-center">
          <div className="inline-flex items-center gap-4 rounded-full border border-slate-200/70 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60 px-5 py-3 text-[11px] font-bold uppercase tracking-[0.28em] text-slate-400 dark:text-slate-500 shadow-sm">
            <span>Secure</span>
            <span className="h-1 w-1 rounded-full bg-slate-300 dark:bg-slate-700" />
            <span>Temporary</span>
            <span className="h-1 w-1 rounded-full bg-slate-300 dark:bg-slate-700" />
            <span>Private</span>
          </div>
        </div>
      </div>
    </div>
  );
}