// api/upload.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import multer from "multer";
import { put } from "@vercel/blob";
import { nanoid } from "nanoid";
import { files, type FileRecord } from "./store";

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

async function safeJsonError(
  res: VercelResponse,
  status: number,
  message: string,
  details?: any
) {
  res.setHeader("Content-Type", "application/json");
  return res.status(status).json({
    error: message,
    details: details ? String(details) : undefined,
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") {
      return safeJsonError(res, 405, "Method not allowed");
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.VERCEL_BLOB_READ_WRITE_TOKEN) {
      return safeJsonError(
        res,
        500,
        "Server misconfiguration: missing blob token. Please set BLOB_READ_WRITE_TOKEN in Vercel settings."
      );
    }

    await runMiddleware(req, res, upload.single("file"));

    const file = (req as any).file;
    const passwordRaw = (req as any).body?.password ?? "";
    const password = typeof passwordRaw === "string" ? passwordRaw.trim() || null : null;

    if (!file) {
      return safeJsonError(res, 400, "No file uploaded");
    }

    // unique password among active files
    if (password) {
      for (const existing of files.values()) {
        if (
          existing.password === password &&
          existing.expiresAt > Date.now() &&
          existing.downloadCount < existing.maxDownloads
        ) {
          return safeJsonError(
            res,
            400,
            "This password is already in use by an active file. Choose another."
          );
        }
      }
    }

    // short unique id
    let id = nanoid(6);
    while (files.has(id)) {
      id = nanoid(6);
    }

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

    const expiresAt = Date.now() + 10 * 60 * 1000;

    const fileData: FileRecord = {
      id,
      filename: file.originalname,
      size: file.size,
      url: `${req.headers.origin || `https://${req.headers.host || process.env.VERCEL_URL || ""}`}/${id}`,
      expiresAt,
      downloadCount: 0,
      maxDownloads: 10,
      password,
      hasPassword: !!password,
      blobUrl: blobResult?.url ?? null,
    };

    files.set(id, fileData);

    return res.status(200).json({
      id,
      filename: file.originalname,
      size: file.size,
      url: fileData.url,
      expiresAt,
      downloadCount: 0,
      maxDownloads: 10,
      hasPassword: !!password,
      blobUrl: blobResult?.url ?? null,
    });
  } catch (topErr) {
    console.error("UPLOAD handler top-level error:", topErr);
    return safeJsonError(res, 500, "Unexpected server error during upload", String(topErr));
  }
}