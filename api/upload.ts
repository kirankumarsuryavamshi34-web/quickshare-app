// api/upload.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";

const upload = multer({ storage: multer.memoryStorage() });

export const config = {
  api: { bodyParser: false }, // multer will handle
};

// In-memory store (prototype).
// For production replace with a persistent store or Vercel Blob.
type FileData = {
  id: string;
  filename: string;
  buffer: Buffer;
  size: number;
  mimetype: string;
  token: string; // share token included in link/QR
  password?: string; // optional password
  expiresAt: number;
  downloadCount: number;
  maxDownloads: number;
  createdAt: number;
};

const files = new Map<string, FileData>();
// map password -> fileId to enforce unique password for active files
const passwordToId = new Map<string, string>();

function runMiddleware(req: VercelRequest, res: VercelResponse, fn: Function) {
  return new Promise((resolve, reject) => {
    fn(req as any, res as any, (result: any) => {
      if (result instanceof Error) return reject(result);
      return resolve(result);
    });
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await runMiddleware(req, res, upload.single("file"));

    const file = (req as any).file;
    // text fields (like password) are available on req.body (multer)
    const body = (req as any).body || {};
    const password = body.password ? String(body.password).trim() : undefined;

    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    if (password) {
      // password uniqueness check
      if (passwordToId.has(password)) {
        return res.status(400).json({ error: "Password already in use for another active file" });
      }
      if (password.length < 4) {
        return res.status(400).json({ error: "Password should be at least 4 characters" });
      }
    }

    const id = uuidv4();
    // secure random token for share link
    const token = crypto.randomBytes(18).toString("hex");

    const now = Date.now();
    const expiresAt = now + 10 * 60 * 1000; // 10 minutes (changeable)

    const fileData: FileData = {
      id,
      filename: file.originalname,
      buffer: Buffer.from(file.buffer),
      size: file.size,
      mimetype: file.mimetype || "application/octet-stream",
      token,
      password,
      expiresAt,
      downloadCount: 0,
      maxDownloads: 10,
      createdAt: now,
    };

    files.set(id, fileData);
    if (password) passwordToId.set(password, id);

    // schedule auto-delete at expiry
    setTimeout(() => {
      const f = files.get(id);
      if (f && Date.now() >= f.expiresAt) {
        files.delete(id);
        if (f.password) passwordToId.delete(f.password);
      }
    }, Math.max(1000, expiresAt - Date.now()));

    // Construct share URL using request origin if possible
    const proto = req.headers["x-forwarded-proto"] || req.headers["x-forwarded-protocol"] || (req.headers["referer"] ? new URL(String(req.headers["referer"])).protocol.replace(":", "") : "https");
    const host = req.headers.host || "";
    const origin = proto ? `${proto}://${host}` : `https://${host}`;
    const shareUrl = `${origin}/download/${id}?token=${token}`;

    return res.status(200).json({
      id,
      url: shareUrl,
      expiresAt,
      size: file.size,
      maxDownloads: fileData.maxDownloads,
    });
  } catch (err: any) {
    console.error("Upload error:", err);
    return res.status(500).json({ error: "File upload failed" });
  }
}

// export the maps so other API files in same deployment can reuse (useful for local dev)
module.exports.__internal = { files, passwordToId };