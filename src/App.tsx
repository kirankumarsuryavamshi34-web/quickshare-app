import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  Upload, File, Copy, Check, AlertCircle, Sun, Moon,
  X, FileText, Image as ImageIcon, Music, Video, Archive
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import QRCode from "qrcode";

type View = "upload" | "success";

interface FileInfo {
  id: string;
  filename: string;
  size: number;
  url: string;
  expiresAt: number;
}

const FileIcon = ({ filename }: { filename: string }) => {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (['jpg','png','jpeg','gif'].includes(ext || "")) return <ImageIcon />;
  if (['mp4','mov'].includes(ext || "")) return <Video />;
  if (['mp3','wav'].includes(ext || "")) return <Music />;
  if (['pdf','doc','txt'].includes(ext || "")) return <FileText />;
  if (['zip','rar'].includes(ext || "")) return <Archive />;
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
  const [isDark, setIsDark] = useState(false);

  const xhrRef = useRef<XMLHttpRequest | null>(null);

  // Theme
  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark") setIsDark(true);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    localStorage.setItem("theme", isDark ? "dark" : "light");
  }, [isDark]);

  const handleFileSelection = (f: File) => {
    if (f.size > 50 * 1024 * 1024) {
      setError("Max file size is 50MB");
      return;
    }
    setFile(f);
    setError(null);
  };

  const uploadFile = () => {
    if (!file) return;

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = async () => {
      try {
        const contentType = xhr.getResponseHeader("content-type") || "";

        if (xhr.status >= 200 && xhr.status < 300) {
          if (!contentType.includes("application/json")) {
            throw new Error("Server returned invalid response");
          }

          const data = JSON.parse(xhr.responseText);

          if (!data.url) throw new Error("Invalid response");

          setUploadedInfo(data);

          const qr = await QRCode.toDataURL(data.url);
          setQrCodeUrl(qr);

          setView("success");
        } else {
          throw new Error(`Upload failed (${xhr.status})`);
        }
      } catch (err: any) {
        console.error(err);
        setError(err.message || "Upload failed");
      }

      setUploading(false);
    };

    xhr.onerror = () => {
      setError("Network error");
      setUploading(false);
    };

    xhr.open("POST", "/api/upload");
    xhr.send(formData);
  };

  const copyLink = () => {
    if (!uploadedInfo) return;
    navigator.clipboard.writeText(uploadedInfo.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-100 dark:bg-black">

      {/* THEME BUTTON */}
      <button
        onClick={() => setIsDark(!isDark)}
        className="absolute top-6 right-6"
      >
        {isDark ? <Sun /> : <Moon />}
      </button>

      <AnimatePresence mode="wait">

        {/* UPLOAD VIEW */}
        {view === "upload" && (
          <motion.div className="bg-white dark:bg-gray-900 p-8 rounded-xl w-96">

            <h1 className="text-2xl font-bold mb-4">QuickShare</h1>

            {error && (
              <div className="bg-red-100 text-red-600 p-2 mb-4 rounded">
                {error}
              </div>
            )}

            <input
              type="file"
              onChange={(e) => e.target.files && handleFileSelection(e.target.files[0])}
            />

            {file && <p className="mt-2">{file.name}</p>}

            {uploading && <p>{progress}%</p>}

            <button
              onClick={uploadFile}
              disabled={!file}
              className="mt-4 bg-indigo-600 text-white px-4 py-2 rounded"
            >
              Upload
            </button>

          </motion.div>
        )}

        {/* SUCCESS VIEW */}
        {view === "success" && uploadedInfo && (
          <motion.div className="bg-white dark:bg-gray-900 p-8 rounded-xl w-96 text-center">

            <h2 className="text-xl font-bold mb-4">Ready!</h2>

            <p className="break-all text-sm">{uploadedInfo.url}</p>

            <button onClick={copyLink} className="mt-2">
              {copied ? "Copied!" : "Copy"}
            </button>

            <img src={qrCodeUrl} className="mt-4 mx-auto w-40" />

            <button
              onClick={() => {
                setView("upload");
                setFile(null);
                setUploadedInfo(null);
              }}
              className="mt-4 bg-gray-200 px-4 py-2 rounded"
            >
              Upload Again
            </button>

          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}