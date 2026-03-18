// src/App.tsx
// This is the final corrected frontend component.
// It POSTs multipart to /api/upload and expects JSON { id, filename, url, expiresAt, ... }
// It checks Content-Type before parsing and shows helpful errors if server returns HTML.

import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  Upload, File, Copy, Check, AlertCircle, Sun, Moon,
  X, FileText, Image as ImageIcon, Music, Video, Archive
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import QRCode from "qrcode";

type View = "upload" | "success" | "download";

interface FileInfo { id: string; filename: string; size: number; url: string; expiresAt: number; }

const FileIcon = ({ filename }: { filename: string }) => {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (['jpg','jpeg','png','gif','svg','webp'].includes(ext || "")) return <ImageIcon />;
  if (['mp4','mov','webm'].includes(ext || "")) return <Video />;
  if (['mp3','wav'].includes(ext || "")) return <Music />;
  if (['pdf','doc','txt','md'].includes(ext || "")) return <FileText />;
  if (['zip','rar','7z'].includes(ext || "")) return <Archive />;
  return <File />;
};

export default function App() {
  const [view, setView] = useState<View>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadedInfo, setUploadedInfo] = useState<FileInfo | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isDark, setIsDark] = useState(() => localStorage.getItem("theme")==="dark");

  const xhrRef = useRef<XMLHttpRequest | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    localStorage.setItem("theme", isDark ? "dark" : "light");
  }, [isDark]);

  useEffect(() => {
    const path = window.location.pathname;
    if (path.startsWith("/download/")) {
      const id = path.split("/")[2];
      if (id) fetchFileInfo(id);
    }
  }, []);

  const fetchFileInfo = async (id: string) => {
    try {
      const r = await fetch(`/api/file-info?id=${encodeURIComponent(id)}`);
      if (!r.ok) throw new Error("File not found or expired");
      const data = await r.json();
      setUploadedInfo({ id, ...data });
      setView("download");
    } catch (err: any) {
      setError(err.message || "File not found or expired");
      setView("upload");
      window.history.pushState({}, "", "/");
    }
  };

  const handleFileSelection = (f: File) => {
    if (f.size > 50 * 1024 * 1024) { setError("File size exceeds 50MB"); return; }
    setFile(f); setError(null);
  };

  const onDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); const ff = e.dataTransfer.files[0]; if (ff) handleFileSelection(ff); }, []);

  const uploadFile = () => {
    if (!file) return;
    setUploading(true); setProgress(0); setError(null);

    const formData = new FormData();
    formData.append("file", file);

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;

    xhr.upload.addEventListener("progress", (e) => { if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100)); });

    xhr.addEventListener("load", async () => {
      const contentType = xhr.getResponseHeader("content-type") || "";
      const text = xhr.responseText || "";

      if (xhr.status >= 200 && xhr.status < 300) {
        if (contentType.includes("application/json")) {
          try {
            const data = JSON.parse(text);
            if (!data?.url || !data?.id) { setError("Server returned invalid data"); }
            else {
              setUploadedInfo(data);
              const qr = await QRCode.toDataURL(data.url);
              setQrCodeUrl(qr);
              window.history.pushState({}, "", `/download/${data.id}`);
              setView("success");
            }
          } catch (e) {
            setError("Failed to parse server response");
            console.error("parse error", e, text);
          }
        } else {
          // server returned HTML (this produced Unexpected token '<')
          setError("Unexpected server response (HTML). Check server logs.");
          console.error("Server HTML response:", text);
        }
      } else {
        if (contentType.includes("application/json")) {
          try { const errObj = JSON.parse(text); setError(errObj.error || `Upload failed (${xhr.status})`); } catch { setError(`Upload failed (${xhr.status})`); }
        } else {
          setError(`Upload failed (${xhr.status})`);
          console.error("Server error page:", text);
        }
      }

      setUploading(false); xhrRef.current = null;
    });

    xhr.addEventListener("error", () => { setError("Network error"); setUploading(false); xhrRef.current = null; });

    xhr.open("POST", "/api/upload");
    xhr.send(formData);
  };

  const copyLink = () => {
    if (!uploadedInfo) return;
    navigator.clipboard.writeText(uploadedInfo.url);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#F8F9FD] dark:bg-black flex items-center justify-center p-6">
      <button onClick={() => setIsDark(!isDark)} className="fixed top-6 right-6 p-3 bg-white rounded">{isDark ? <Sun/> : <Moon/>}</button>

      <AnimatePresence mode="wait">
        {view==="upload" && (
          <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} className="w-full max-w-md bg-white p-8 rounded-2xl">
            <div className="text-center">
              <div className="inline-block p-3 bg-indigo-50 rounded mb-4"><Upload/></div>
              <h1 className="text-2xl font-bold">QuickShare</h1>
            </div>

            {error && <div className="mt-4 p-3 bg-red-50 text-red-700 rounded">{error}</div>}

            <div onDragOver={(e)=>e.preventDefault()} onDrop={onDrop} className={`relative border-2 border-dashed rounded p-8 mt-6 text-center ${file?"bg-emerald-50":""}`}>
              {file ? <div><strong>{file.name}</strong><div className="text-sm text-gray-500">{(file.size/1024/1024).toFixed(2)} MB</div></div> : <div>Drop your file here or click to browse</div>}
              <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e)=>e.target.files && handleFileSelection(e.target.files[0])} disabled={uploading} />
            </div>

            {uploading && <div className="mt-4">{progress}%</div>}

            <button onClick={uploadFile} disabled={!file || uploading} className="w-full mt-6 py-3 bg-indigo-600 text-white rounded">Generate Secure Link</button>
          </motion.div>
        )}

        {view==="success" && uploadedInfo && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="w-full max-w-md bg-white p-8 rounded-2xl">
            <h2 className="text-xl font-bold">Ready to share!</h2>
            <div className="mt-2 break-words text-sm">{uploadedInfo.url}</div>
            <div className="mt-3 flex gap-2">
              <button onClick={copyLink} className="px-3 py-1 bg-gray-200 rounded">{copied?"Copied":"Copy"}</button>
              <a href={uploadedInfo.url} target="_blank" rel="noreferrer" className="px-3 py-1 bg-indigo-600 text-white rounded">Open</a>
            </div>
            {qrCodeUrl && <img src={qrCodeUrl} alt="QR" className="mt-4 w-40 mx-auto" />}
            <button onClick={()=>{ setView("upload"); setFile(null); setUploadedInfo(null); }} className="mt-4 bg-gray-100 px-4 py-2 rounded">Upload another</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}