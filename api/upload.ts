// api/upload.ts
import { put } from "@vercel/blob";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";

const upload = multer({ storage: multer.memoryStorage() });

export const config = {
  api: { bodyParser: false },
};

function runMiddleware(req: any, res: any, fn: Function) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result: any) => {
      if (result instanceof Error) return reject(result);
      resolve(result);
    });
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // parse multipart with multer
    await runMiddleware(req, res, upload.single("file"));
    const f = (req as any).file;
    if (!f) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // generate id and upload path
    const id = uuidv4();
    const filenameSafe = f.originalname.replace(/\s+/g, "_");
    const key = `uploads/${id}-${filenameSafe}`;

    // NOTE: require BLOB_READ_WRITE_TOKEN in Vercel env vars
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      console.error("Missing BLOB_READ_WRITE_TOKEN env var");
      return res.status(500).json({ error: "Server misconfiguration (missing token)" });
    }

    // Upload to Vercel Blob
    const blob = await put(key, f.buffer, {
      access: "public",
      // pass token explicitly (safe server-side)
      token,
      // you can add contentType if you want:
      // contentType: f.mimetype
    });

    // Build response
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
    return res.status(200).json({
      id,
      filename: f.originalname,
      size: f.size,
      url: blob.url,
      expiresAt,
      downloadCount: 0,
      maxDownloads: 10,
    });
  } catch (err: any) {
    console.error("Upload handler error:", err && err.stack ? err.stack : err);
    // If blob library throws an error, return JSON so client can parse it
    return res.status(500).json({ error: "Upload failed", details: String(err?.message || err) });
  }
}