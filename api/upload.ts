// api/upload.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import multer from "multer";
import { put } from "@vercel/blob";
import { v4 as uuidv4 } from "uuid";

const upload = multer({
  storage: multer.memoryStorage(),
});

export const config = {
  api: {
    bodyParser: false,
  },
};

function runMiddleware(req: VercelRequest, res: VercelResponse, fn: Function) {
  return new Promise((resolve, reject) => {
    fn(req as any, res as any, (result: any) => {
      if (result instanceof Error) return reject(result);
      return resolve(result);
    });
  });
}

// In-memory map (note: ephemeral on serverless cold starts).
type FileRecord = {
  id: string;
  filename: string;
  size: number;
  url: string;
  expiresAt: number;
  downloadCount: number;
  maxDownloads: number;
  password: string | null;
  hasPassword: boolean;
};

declare global {
  var __quickshare_files__: Map<string, FileRecord> | undefined;
}

const files = global.__quickshare_files__ || new Map<string, FileRecord>();
global.__quickshare_files__ = files;

async function safeJsonError(res: VercelResponse, status: number, message: string, details?: any) {
  // Always send JSON errors so client can parse them safely.
  res.setHeader("Content-Type", "application/json");
  res.status(status).json({ error: message, details: details ? String(details) : undefined });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Top-level try/catch to prevent unhandled exceptions producing HTML
  try {
    if (req.method !== "POST") {
      return safeJsonError(res, 405, "Method not allowed");
    }

    // ensure environment / blob token exists — helpful early fail
    if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.VERCEL_BLOB_READ_WRITE_TOKEN) {
      console.warn("Missing blob token env var. Set BLOB_READ_WRITE_TOKEN or VERCEL_BLOB_READ_WRITE_TOKEN.");
      return safeJsonError(
        res,
        500,
        "Server misconfiguration: missing blob token. Please set BLOB_READ_WRITE_TOKEN in Vercel settings."
      );
    }

    await runMiddleware(req, res, upload.single("file"));

    const file = (req as any).file;
    // multer puts non-file form fields on req.body when bodyParser=false and using multer
    const passwordRaw = (req as any).body?.password ?? "";
    const password = typeof passwordRaw === "string" ? passwordRaw.trim() || null : null;

    if (!file) {
      return safeJsonError(res, 400, "No file uploaded");
    }

    // enforce unique password among active files
    if (password) {
      for (const existing of files.values()) {
        if (
          existing.password &&
          existing.password === password &&
          existing.expiresAt > Date.now() &&
          existing.downloadCount < existing.maxDownloads
        ) {
          return safeJsonError(res, 400, "This password is already in use by an active file. Choose another.");
        }
      }
    }

    // Upload to Vercel Blob — wrap with try/catch to return JSON error on failure.
    const id = uuidv4();
    const pathname = `quickshare/${id}-${file.originalname}`;

    let blobResult;
    try {
      blobResult = await put(pathname, file.buffer, {
        access: "public",
        addRandomSuffix: false,
        contentType: file.mimetype || "application/octet-stream",
      });
    } catch (err) {
      console.error("Blob put failed:", err);
      return safeJsonError(res, 500, "Failed to store file in blob storage", err);
    }

    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    const fileData: FileRecord = {
      id,
      filename: file.originalname,
      size: file.size,
      // generate a link that points to your download handler (the download handler will redirect to blob)
      url: `${req.headers.origin || `https://${req.headers.host || process.env.VERCEL_URL || ""}`}/download/${id}`,
      expiresAt,
      downloadCount: 0,
      maxDownloads: 10,
      password,
      hasPassword: !!password,
    };

    files.set(id, fileData);

    res.setHeader("Content-Type", "application/json");
    return res.status(200).json({
      id,
      filename: file.originalname,
      size: file.size,
      url: fileData.url,
      expiresAt,
      downloadCount: 0,
      maxDownloads: 10,
      hasPassword: !!password,
      // include blob url only for debugging (do not expose in production if you want guarded access)
      blobUrl: blobResult?.url ?? null,
    });
  } catch (topErr) {
    console.error("UPLOAD handler top-level error:", topErr);
    // Even on unexpected exceptions, return JSON
    return safeJsonError(res, 500, "Unexpected server error during upload", String(topErr));
  }
}