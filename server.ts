import express from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import { createServer as createViteServer } from "vite";
import fs from "fs";

interface FileEntry {
  id: string;
  filename: string;
  buffer: Buffer;
  mimetype: string;
  size: number;
  uploadTime: number;
  expiresAt: number;
  downloadCount: number;
}

const files = new Map<string, FileEntry>();
const EXPIRATION_TIME = 10 * 60 * 1000; // 10 minutes
const MAX_DOWNLOADS = 10;

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// Multer configuration (in-memory)
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// API Routes
app.post("/api/upload", upload.single("file"), (req, res) => {
  console.log("Upload request received");
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const id = uuidv4();
  const now = Date.now();
  
  const fileEntry: FileEntry = {
    id,
    filename: req.file.originalname,
    buffer: req.file.buffer,
    mimetype: req.file.mimetype,
    size: req.file.size,
    uploadTime: now,
    expiresAt: now + EXPIRATION_TIME,
    downloadCount: 0,
  };

  files.set(id, fileEntry);
  console.log(`File stored: ${id} (${fileEntry.filename})`);

  res.json({ 
    id, 
    filename: fileEntry.filename,
    expiresAt: fileEntry.expiresAt,
    maxDownloads: MAX_DOWNLOADS
  });
});

app.get("/api/file-info/:id", (req, res) => {
  const id = req.params.id;
  console.log(`Info request for: ${id}`);
  const file = files.get(id);
  
  if (!file) {
    console.log(`File not found: ${id}`);
    return res.status(404).json({ error: "File not found or expired" });
  }
  
  res.json({
    filename: file.filename,
    size: file.size,
    expiresAt: file.expiresAt,
    downloadCount: file.downloadCount,
    maxDownloads: MAX_DOWNLOADS
  });
});

app.get("/api/download/:id", (req, res) => {
  const id = req.params.id;
  console.log(`Download request for: ${id}`);
  const file = files.get(id);
  
  if (!file) {
    return res.status(404).send("File not found or expired");
  }

  file.downloadCount++;
  console.log(`Download count for ${id}: ${file.downloadCount}`);
  
  res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
  res.setHeader("Content-Type", file.mimetype);
  res.send(file.buffer);

  // Delete after max downloads reached
  if (file.downloadCount >= MAX_DOWNLOADS) {
    files.delete(id);
    console.log(`File reached max downloads and was deleted: ${id}`);
  }
});

// Cleanup task: remove expired files every minute
setInterval(() => {
  const now = Date.now();
  for (const [id, file] of files.entries()) {
    if (now > file.expiresAt) {
      files.delete(id);
      console.log(`Deleted expired file: ${id}`);
    }
  }
}, 60 * 1000);

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    // Ensure Vite middleware is used AFTER our API routes
    // But since we already added API routes to 'app', we just need to make sure
    // Vite middleware doesn't intercept them.
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
