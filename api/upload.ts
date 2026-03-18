// api/upload.ts
/**
 * Upload API: receives multipart/form-data with field "file",
 * writes the file blob and a meta.json to Vercel Blob using @vercel/blob.
 *
 * Requires env:
 *  - BLOB_READ_WRITE_TOKEN  (sensitive)  -- required for put()
 *  - BLOB_PUBLIC_BASE_URL   (optional, used by other endpoints to fetch meta.json)
 *
 * Install: npm i @vercel/blob multer uuid
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import { put } from "@vercel/blob";

const upload = multer({ storage: multer.memoryStorage() });

// disable built-in body parsing so multer can read multipart
export const config = { api: { bodyParser: false } };

// small helper to run multer as middleware in serverless handler
function runMiddleware(req: VercelRequest, res: VercelResponse, fn: Function) {
  return new Promise((resolve, reject) => {
    fn(req as any, res as any, (result: any) => {
      if (result instanceof Error) return reject(result);
      return resolve(result);
    });
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // ensure the blob token exists
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error("Missing BLOB_READ_WRITE_TOKEN env var");
    return res.status(500).json({ error: "Server misconfigured" });
  }

  try {
    // run multer to parse multipart
    await runMiddleware(req, res, upload.single("file"));

    const file = (req as any).file;
    if (!file) return res.status(400).json({ error: "No file uploaded" });

    const id = uuidv4();
    const filename = file.originalname;
    const encodedName = encodeURIComponent(filename);
    const fileKey = `quickshare/${id}/${encodedName}`;   // where the blob will be stored
    const metaKey = `quickshare/${id}/meta.json`;       // meta.json path

    // upload file blob (public access so browsers can download directly)
    // put() will use process.env.BLOB_READ_WRITE_TOKEN automatically
    const putFileRes = await put(fileKey, file.buffer, { access: "public" });
    const fileUrl = putFileRes?.url;
    if (!fileUrl) {
      console.error("put(file) did not return url", putFileRes);
      return res.status(500).json({ error: "Failed to upload file to blob" });
    }

    // metadata about the file
    const meta = {
      id,
      filename,
      size: file.size,
      url: fileUrl,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
      downloadCount: 0,
      maxDownloads: 10,
    };

    // save meta.json as public blob (so file-info endpoint can fetch it via public URL)
    const putMetaRes = await put(metaKey, Buffer.from(JSON.stringify(meta)), { access: "public" });
    const metaUrl = putMetaRes?.url;
    if (!metaUrl) {
      console.error("put(meta) failed", putMetaRes);
      // still return file metadata (but indicate meta not saved)
      return res.status(500).json({ error: "Failed to save metadata" });
    }

    // Return metadata (including public file url and meta url). Frontend uses data.url for QR / link.
    return res.status(200).json(meta);
  } catch (err: any) {
    console.error("Upload error:", err);
    return res.status(500).json({ error: "File upload failed", detail: String(err) });
  }
}