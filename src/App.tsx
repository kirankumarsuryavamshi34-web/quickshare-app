// src/App.tsx
import React, { useEffect, useState, useRef } from "react";
import QRCode from "qrcode";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload, File, Download, Copy, Check, Clock,
  AlertCircle, Sun, Moon, X, FileText, Image as ImageIcon,
  Music, Video, Archive, ExternalLink
} from "lucide-react";

type View = "upload" | "success" | "download";

interface UploadedInfo {
  id: string;
  url: string;
  expiresAt: number;
  size: number;
  maxDownloads: number;
  downloadCount: number;
  filename?: string;
  hasPassword?: boolean;
}

export default function App() {
  const [view, setView] = useState<View>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadedInfo, setUploadedInfo] = useState<UploadedInfo | null>(null);
  const [qr, setQr] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(false);

  const xhrRef = useRef<XMLHttpRequest | null>(null);

  useEffect(() => {
    // Apply theme class to document
    document.documentElement.classList.toggle("dark", isDark);
    localStorage.setItem("theme", isDark ? "dark" : "light");
  }, [isDark]);

  useEffect(() => {
    // if visiting /download/:id, fetch file-info automatically
    const path = window.location.pathname;
    if (path.startsWith("/download/")) {
      const id = path.split("/")[2];
      if (id) {
        fetchFileInfo(id);
      }
    }
  }, []);

  async function fetchFileInfo(id: string) {
    try {
      const res = await fetch(`/api/file-info?id=${encodeURIComponent(id)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "File not found or expired");
      }
      const data = await res.json();
      setUploadedInfo(data);
      setView("download");
    } catch (err: any) {
      setError(err.message || "File not found or expired");
      window.history.pushState({}, "", "/");
      setView("upload");
    }
  }

  function onFileChosen(f?: File) {
    if (!f) return;
    if (f.size > 50 * 1024 * 1024) {
      setError("File must be <= 50MB");
      return;
    }
    setFile(f);
    setError(null);
  }

  function cancelUpload() {
    if (xhrRef.current) {
      xhrRef.current.abort();
      xhrRef.current = null;
    }
    setUploading(false);
    setProgress(0);
  }

  async function upload() {
    if (!file) return;
    setUploading(true);
    setProgress(0);
    setError(null);

    const form = new FormData();
    form.append("file", file);
    if (password) form.append("password", password);
    form.append("maxDownloads", "10");

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = async () => {
      setUploading(false);
      try {
        const ct = xhr.getResponseHeader("content-type") || "";
        const text = xhr.responseText || "";

        if (xhr.status >= 200 && xhr.status < 300) {
          // expect JSON
          if (!ct.includes("application/json")) {
            // sometimes Vercel returns HTML on error; present informative message
            throw new Error("Server returned invalid response (not JSON).");
          }
          const data = JSON.parse(text);
          setUploadedInfo(data);
          const q = await QRCode.toDataURL(data.url);
          setQr(q);
          setView("success");
          // update browser path to download link so receiver can open directly
          window.history.pushState({}, "", `/download/${data.id}`);
        } else {
          let parsed = null;
          try { parsed = JSON.parse(text); } catch (e) {}
          const msg = parsed?.error || parsed?.message || `Upload failed (${xhr.status})`;
          setError(msg);
        }
      } catch (err: any) {
        setError(err.message || "Upload failed. Please try again.");
      }
    };

    xhr.onerror = () => {
      setUploading(false);
      setError("Network error during upload");
    };

    xhr.open("POST", "/api/upload");
    xhr.send(form);
  }

  async function handleReceiverDownload(providedPassword?: string) {
    if (!uploadedInfo) return;
    // Hit /api/download/:id with optional password query param
    const id = uploadedInfo.id;
    try {
      const url = new URL(`/api/download/${id}`, window.location.origin);
      if (providedPassword) url.searchParams.set("password", providedPassword);
      const res = await fetch(url.toString());
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || `Download failed (${res.status})`);
      }
      // When server responds with file bytes this triggers browser download because endpoint sets headers.
      // To navigate to url directly (so browser handles attachment) we can window.location = download-url with credentials in query:
      // But we already successfully fetched; if it's redirect to blob URL, do full redirect:
      if (res.redirected) {
        window.location.href = res.url;
      } else {
        // If the server returns bytes in this fetch (arraybuffer), create blob and download
        const buf = await res.arrayBuffer();
        const blob = new Blob([buf]);
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        // Reveal filename if server gave it via file-info? fetch file-info with reveal=true
        let fname = "download.bin";
        try {
          const meta = await fetch(`/api/file-info?id=${id}&reveal=true`);
          if (meta.ok) {
            const md = await meta.json();
            fname = md.filename || fname;
          }
        } catch (e) {}
        a.download = fname;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }

      // After successful download, refresh file info to update counts or detect removal
      setTimeout(() => {
        fetchFileInfo(id);
      }, 1200);

    } catch (err: any) {
      setError(err.message || "Download failed");
    }
  }

  const copy = async () => {
    if (!uploadedInfo) return;
    await navigator.clipboard.writeText(uploadedInfo.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // UI pieces
  return (
    <div className="min-h-screen bg-[#F8F9FD] dark:bg-black flex items-center justify-center p-6 font-sans">
      <div className="fixed top-6 left-6 flex items-center gap-2">
        <div className="p-2 bg-indigo-600 text-white rounded-xl">
          <ExternalLink size={18} />
        </div>
        QuickShare
      </div>

      <button className="fixed top-6 right-6 p-3 rounded" onClick={() => setIsDark(!isDark)}>
        {isDark ? <Sun /> : <Moon />}
      </button>

      <AnimatePresence mode="wait">
        {view === "upload" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="w-full max-w-md bg-white dark:bg-gray-900 rounded-[2rem] shadow-2xl p-8 border">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center p-3 bg-indigo-50 text-indigo-600 rounded-2xl mb-4">
                <Upload size={28} />
              </div>
              <h1 className="text-3xl font-bold">QuickShare</h1>
              <p className="text-sm text-gray-500">Fast, temporary, and secure file sharing</p>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 rounded">
                <div className="flex justify-between items-start">
                  <div><AlertCircle /> <strong className="block">Something went wrong</strong> <div className="text-sm">{error}</div></div>
                  <button onClick={() => setError(null)}><X /></button>
                </div>
              </div>
            )}

            <div className={`border-2 border-dashed rounded p-8 text-center mb-4 ${file ? "border-emerald-400 bg-emerald-50/30" : "border-gray-200"}`}>
              <div className="mb-3">
                {file ? <File /> : <Upload />}
              </div>
              <div>
                {file ? (<div className="font-semibold">{file.name}<div className="text-xs text-gray-500">{prettySize(file.size)}</div></div>) : (<div className="font-bold">Drop your file here or click to browse</div>)}
                <div className="mt-3">
                  <input type="file" onChange={(e) => onFileChosen(e.target.files?.[0])} className="block mx-auto" />
                </div>
              </div>
            </div>

            <label className="block text-xs text-gray-600 mb-2">Password (optional — required to open without token)</label>
            <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter unique password (optional)" className="w-full p-3 mb-4 border rounded" />

            {uploading && <div className="mb-4 text-sm">Uploading: {progress}%</div>}

            <button disabled={!file || uploading} onClick={upload} className={`w-full py-3 rounded-lg text-white ${file ? "bg-indigo-600" : "bg-gray-300"}`}>Generate Secure Link</button>
          </motion.div>
        )}

        {view === "success" && uploadedInfo && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="w-full max-w-md bg-white dark:bg-gray-900 rounded-[2rem] shadow-2xl p-8 border">
            <div className="text-center mb-4">
              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3"><Check size={40} /></div>
              <h2 className="text-2xl font-bold">Ready to share!</h2>
              <div className="text-sm text-gray-500 mt-2 flex items-center justify-center gap-2"><Clock size={14}/> Expires in <span className="font-mono ml-1">{timeLeft(uploadedInfo.expiresAt)}</span></div>
            </div>

            <div className="p-4 bg-gray-50 rounded mb-4 flex items-center justify-between">
              <div className="break-all text-sm">{uploadedInfo.url}</div>
              <button onClick={copy} className="ml-3 p-2 bg-white rounded">{copied ? <Check /> : <Copy />}</button>
            </div>

            <div className="bg-white p-4 rounded mb-4 text-center">
              <img src={qr} alt="QR" className="w-40 mx-auto" />
              <div className="text-xs text-gray-500 mt-2">Scan to download</div>
            </div>

            <button className="w-full py-3 bg-gray-100 rounded" onClick={() => {
              setView("upload");
              setFile(null);
              setUploadedInfo(null);
              setPassword("");
              window.history.pushState({}, "", "/");
            }}>Upload another file</button>
          </motion.div>
        )}

        {view === "download" && uploadedInfo && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="w-full max-w-md bg-white dark:bg-gray-900 rounded-[2rem] shadow-2xl p-8 border">
            <div className="text-center mb-4">
              <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-3"><File /></div>
              <h2 className="text-2xl font-bold">Secure Download</h2>
              <div className="text-sm text-gray-500 mt-2">This file is temporary and private.</div>
            </div>

            <div className="p-4 bg-amber-50 rounded mb-4">
              <div className="text-sm">This file will be removed after reaching the download limit or expiry.</div>
              <div className="flex gap-3 mt-3">
                <div className="bg-white p-2 rounded text-center flex-1">
                  <div className="text-xs text-gray-400">Downloads</div>
                  <div className="font-bold">{uploadedInfo.downloadCount} / {uploadedInfo.maxDownloads}</div>
                </div>
                <div className="bg-white p-2 rounded text-center flex-1">
                  <div className="text-xs text-gray-400">Expires</div>
                  <div className="font-bold">{timeLeft(uploadedInfo.expiresAt)}</div>
                </div>
              </div>
            </div>

            {uploadedInfo.hasPassword && (
              <div className="mb-4">
                <label className="block text-xs text-gray-600 mb-2">Enter password to download</label>
                <input id="recv-pass" className="w-full p-3 border rounded" placeholder="File password" />
                <div className="mt-2">
                  <button className="w-full py-2 bg-indigo-600 text-white rounded" onClick={() => {
                    const val = (document.getElementById("recv-pass") as HTMLInputElement).value;
                    handleReceiverDownload(val);
                  }}>Unlock & Download</button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <button onClick={() => handleReceiverDownload()} className="w-full py-3 bg-indigo-600 text-white rounded">Download (via link/QR)</button>
              <button onClick={() => { window.location.href = "/"; }} className="w-full py-2 bg-gray-100 rounded">Use QuickShare / Upload your own file</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// small helpers
function prettySize(bytes: number) {
  if (!bytes) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes","KB","MB","GB"];
  const i = Math.floor(Math.log(bytes)/Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}
function timeLeft(ts:number) {
  const s = Math.max(0, Math.floor((ts - Date.now())/1000));
  const m = Math.floor(s/60);
  const sec = s%60;
  return `${m}:${sec.toString().padStart(2,"0")}`;
}