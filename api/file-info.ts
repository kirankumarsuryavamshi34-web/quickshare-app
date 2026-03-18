// api/file-info.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";

const internals = require("./upload.ts")?.__internal;

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const id = typeof req.query.id === "string" ? req.query.id : (Array.isArray(req.query.id) ? req.query.id[0] : undefined);

  if (!id) {
    return res.status(400).json({ error: "Missing id" });
  }

  const files = internals?.files as Map<any, any> | undefined;
  if (!files) {
    return res.status(500).json({ error: "Internal storage unavailable" });
  }

  const f = files.get(id);
  if (!f) {
    return res.status(404).json({ error: "File not found or expired" });
  }

  // Do not return filename (privacy). Return only metadata and whether password is required.
  return res.status(200).json({
    id: f.id,
    size: f.size,
    expiresAt: f.expiresAt,
    downloadCount: f.downloadCount,
    maxDownloads: f.maxDownloads,
    requiresPassword: !!f.password,
    // Do NOT return filename
  });
}