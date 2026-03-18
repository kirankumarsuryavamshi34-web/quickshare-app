// src/App.tsx
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Upload, File, Download, Copy, Check, Trash2,
  Clock, AlertCircle, Sun, Moon, X, FileText, Image as ImageIcon,
  Music, Video, Archive, ExternalLink
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import QRCode from "qrcode";

type View = "upload" | "success" | "download";

interface FileInfo {
  id: string;
  size: number;
  url?: string; // present for sender after upload
  expiresAt: number;
  downloadCount: number;
  maxDownloads: number;
  requiresPassword?: boolean;
}

export default function App() {
  const [view, setView] = useState<View>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadedInfo, setUploadedInfo] = useState<FileInfo | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("theme") === "dark";
    return false;
  });

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

  // If user navigates to /download/:id we fetch file-info
  useEffect(() => {
    const path = window.location.pathname;
    if (path.startsWith("/download/")) {
      const id = path.split("/")[2];
      if (id) {
        setView("download");
        fetchFileInfo(id);
      }
    }
  }, []);

  const fetchFileInfo = async (id: string) => {
    try {
      setError(null);
      const res = await fetch(`/api/file-info?id=${encodeURIComponent(id)}`);
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error((j && j.error) || "File not found or expired");
      }
      const data = await res.json();
      setUploadedInfo({ id, ...data });
      setView("download");
    } catch (err: any) {
      setError(err.message || "Could not fetch file info");
      setView("upload");
      window.history.pushState({}, "", "/");
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
    if (password.trim()) formData.append("password", password.trim());

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
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          // response contains: id, url, expiresAt, size, maxDownloads
          setUploadedInfo(data);
          const shareUrl = data.url;
          const qr = await QRCode.toDataURL(shareUrl);
          setQrCodeUrl(qr);
          setView("success");
          // update browser URL to share path with token so sender can open link
          // (keeps sender on same page but shows download path)
          try {
            const url = new URL(shareUrl);
            window.history.replaceState({}, "", url.pathname + url.search);
          } catch {}
        } catch (e) {
          setError("Invalid server response");
        }
      } else {
        // try parse json error
        let msg = "Upload failed. Please try again.";
        try {
          const j = JSON.parse(xhr.responseText);
          if (j && j.error) msg = j.error;
        } catch {}
        setError(msg);
      }
    });

    xhr.addEventListener("error", () => {
      setError("Network error occurred.");
      setUploading(false);
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
      setError("Unable to copy to clipboard");
    }
  };

  // DOWNLOAD FUNCTIONS FOR DOWNLOAD PAGE
  const performTokenDownload = (id: string, token: string) => {
    // open direct link => browser handles download headers
    window.location.href = `/api/download/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`;
  };

  const performPasswordDownload = async (id: string, pw: string) => {
    try {
      setError(null);
      const resp = await fetch(`/api/download/${encodeURIComponent(id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      if (!resp.ok) {
        const j = await resp.json().catch(() => null);
        throw new Error((j && j.error) || `Download failed (${resp.status})`);
      }
      // read response as arrayBuffer and download client-side (so we can use filename from header)
      const arr = await resp.arrayBuffer();
      const contentDisposition = resp.headers.get("content-disposition");
      const filenameMatch = contentDisposition ? contentDisposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)/i) : null;
      const filename = filenameMatch ? decodeURIComponent(filenameMatch[1]) : `download-${id}`;

      const blob = new Blob([arr], { type: resp.headers.get("content-type") || "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      // after download, refresh file info to update counts or show expiry message
      await fetchFileInfo(id);
    } catch (err: any) {
      setError(err.message || "Download failed");
    }
  };

  // UI pieces
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
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6 p-4 bg-red-50 text-red-600 rounded-2xl">
          <div className="flex justify-between items-start">
            <div>
              <p className="font-semibold">Something went wrong</p>
              <p className="opacity-80 text-sm">{error}</p>
            </div>
            <button onClick={() => setError(null)}><X /></button>
          </div>
        </motion.div>
      )}

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer?.files?.[0];
          if (f) handleFileSelection(f);
        }}
        className={`relative border-2 border-dashed rounded-[1rem] p-8 transition-all duration-300 flex flex-col items-center justify-center gap-4 ${
          file ? "border-emerald-400 bg-emerald-50/30" : "border-gray-200 hover:border-indigo-400 hover:bg-indigo-50/10"
        }`}
      >
        <div className="p-4 rounded-2xl bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600">
          {file ? <File /> : <Upload />}
        </div>

        <div className="text-center">
          {file ? (
            <>
              <p className="font-bold text-gray-900 dark:text-white truncate max-w-[260px]">{file.name}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            </>
          ) : (
            <>
              <p className="font-bold text-gray-900 dark:text-white">Drop your file here</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">or click to browse</p>
              <p className="mt-2 text-[10px] text-gray-400 uppercase font-bold">Max 50MB • 10m Expiry</p>
            </>
          )}
        </div>

        <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => e.target.files?.[0] && handleFileSelection(e.target.files[0])} disabled={uploading} />
      </div>

      <div className="mt-4">
        <label className="text-xs font-bold text-gray-500">Password (optional — required to open without token)</label>
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter password (optional)" className="w-full mt-2 p-3 rounded border" />
        <p className="text-[11px] text-gray-400 mt-1">If set, recipient can open file by entering this password. Password must be unique among active files.</p>
      </div>

      {uploading && (
        <div className="mt-6">
          <div className="flex justify-between items-center mb-2">
            <div>
              <p className="text-xs font-bold uppercase">Uploading</p>
              <p className="text-sm font-semibold">{progress}% complete</p>
            </div>
            <button onClick={cancelUpload} className="text-xs text-red-500">Cancel</button>
          </div>
          <div className="h-3 w-full bg-gray-100 rounded-full overflow-hidden">
            <motion.div className="h-full bg-indigo-600" initial={{ width: 0 }} animate={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {!uploading && (
        <button disabled={!file} onClick={uploadFile} className="w-full mt-6 py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700">
          <Upload size={18} /> &nbsp; Generate Secure Link
        </button>
      )}
    </motion.div>
  );

  const renderSuccess = () => (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-md bg-white dark:bg-gray-900 rounded-[2rem] shadow-2xl p-8">
      <div className="text-center mb-6">
        <div className="w-20 h-20 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Check size={40} />
        </div>
        <h2 className="text-3xl font-bold">Ready to share!</h2>
        <p className="text-sm text-gray-500 mt-1">Expires in <span className="font-mono">{uploadedInfo ? Math.max(0, Math.floor((uploadedInfo.expiresAt - Date.now()) / 1000 / 60)) : "0"}m</span></p>
      </div>

      <div className="mb-4">
        <div className="p-4 border rounded flex items-center justify-between">
          <div className="truncate text-sm">{uploadedInfo?.url}</div>
          <button onClick={copyLink} className="ml-4 p-2 rounded bg-white">
            {copied ? <Check /> : <Copy />}
          </button>
        </div>
      </div>

      <div className="mb-4">
        <div className="bg-white p-4 rounded text-center">
          {qrCodeUrl ? <img src={qrCodeUrl} alt="QR" className="mx-auto w-40 h-40" /> : <div className="h-40" />}
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={() => { setView("upload"); setFile(null); setUploadedInfo(null); setPassword(""); setQrCodeUrl(""); window.history.pushState({}, "", "/"); }} className="flex-1 py-3 rounded bg-gray-100">Upload another file</button>
        <a href={uploadedInfo?.url} className="flex-1 py-3 rounded bg-indigo-600 text-white text-center">Open share link</a>
      </div>
    </motion.div>
  );

  const renderDownload = () => {
    // parse token from url
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token") || undefined;
    const id = uploadedInfo?.id;

    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-md bg-white dark:bg-gray-900 rounded-[2rem] shadow-2xl p-8">
        <div className="text-center mb-6">
          <div className="w-20 h-20 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <File />
          </div>
          <h2 className="text-2xl font-bold">A file has been shared with you</h2>
          <p className="text-sm text-gray-500 mt-1">Temporary & secure</p>
        </div>

        {error && <div className="bg-red-100 text-red-600 p-2 rounded mb-4">{error}</div>}

        <div className="mb-4 p-4 border rounded">
          <p className="text-sm text-gray-500">Expires in</p>
          <p className="font-bold">{uploadedInfo ? Math.max(0, Math.floor((uploadedInfo.expiresAt - Date.now()) / 1000 / 60)) : 0} minutes</p>
          <p className="text-sm text-gray-500 mt-2">Downloads: {uploadedInfo?.downloadCount} / {uploadedInfo?.maxDownloads}</p>
        </div>

        {token ? (
          <button onClick={() => id && token && performTokenDownload(id, token)} className="w-full py-3 bg-indigo-600 text-white rounded mb-2">Download via link/QR</button>
        ) : (
          <>
            {uploadedInfo?.requiresPassword ? (
              <>
                <p className="text-sm text-gray-500">This file requires a password to download.</p>
                <input placeholder="Enter password" className="w-full p-3 rounded mt-2" onKeyDown={(e) => { if (e.key === "Enter" && id) performPasswordDownload(id, (e.target as HTMLInputElement).value); }} />
                <button className="w-full mt-3 py-3 bg-indigo-600 text-white rounded" onClick={() => {
                  const input = document.querySelector<HTMLInputElement>("input[placeholder='Enter password']");
                  if (!input) return setError("Enter password");
                  const pw = input.value.trim();
                  if (!pw) return setError("Enter password");
                  if (id) performPasswordDownload(id, pw);
                }}>Download with password</button>
              </>
            ) : (
              <>
                {/* If no password and no token, still require some server rule; here we present a button that performs a GET (public). */}
                <button onClick={() => { if (id) window.location.href = `/api/download/${encodeURIComponent(id)}`; }} className="w-full py-3 bg-indigo-600 text-white rounded">Download</button>
              </>
            )}
          </>
        )}

        <button onClick={() => { setView("upload"); setFile(null); setUploadedInfo(null); window.history.pushState({}, "", "/"); }} className="w-full mt-3 py-3 bg-gray-100 rounded">Upload your own file</button>

      </motion.div>
    );
  };

  return (
    <div className="min-h-screen bg-[#F8F9FD] dark:bg-black flex items-center justify-center p-6">
      <div className="fixed top-6 left-6 font-bold">
        <div className="inline-flex items-center gap-2">
          <div className="p-2 bg-indigo-600 text-white rounded"><ExternalLink /></div>
          QuickShare
        </div>
      </div>

      <button onClick={() => setIsDark(!isDark)} className="fixed top-6 right-6 p-3 bg-white rounded">
        {isDark ? <Sun /> : <Moon />}
      </button>

      <AnimatePresence mode="wait">
        {view === "upload" && renderUpload()}
        {view === "success" && uploadedInfo && renderSuccess()}
        {view === "download" && uploadedInfo && renderDownload()}
      </AnimatePresence>
    </div>
  );
}