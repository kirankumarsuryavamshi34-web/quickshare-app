// api/download/[id].ts
import type { VercelRequest, VercelResponse } from "@vercel/node";

const internals = require("../upload.ts")?.__internal;

function getFilenameFromDisposition(header: string | null) {
  if (!header) return null;
  const m = header.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)/i);
  return m ? decodeURIComponent(m[1]) : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const files = internals?.files as Map<any, any> | undefined;
  const passwordToId = internals?.passwordToId as Map<any, any> | undefined;

  if (!files) {
    return res.status(500).json({ error: "Internal storage unavailable" });
  }

  const id = typeof req.query.id === "string" ? req.query.id : Array.isArray(req.query.id) ? req.query.id[0] : undefined;
  if (!id) return res.status(400).json({ error: "Missing id" });

  const f = files.get(id);
  if (!f) return res.status(404).json({ error: "File not found or expired" });

  // If GET with token => allow direct file response
  if (req.method === "GET") {
    const token = typeof req.query.token === "string" ? req.query.token : undefined;
    if (!token || token !== f.token) {
      return res.status(401).json({ error: "Invalid or missing token" });
    }

    // Serve file binary directly with filename
    res.setHeader("Content-Type", f.mimetype || "application/octet-stream");
    // Allow frontend fetch to read headers if necessary
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(f.filename)}"`);
    // increment count and maybe delete
    f.downloadCount = (f.downloadCount || 0) + 1;
    if (f.downloadCount >= f.maxDownloads) {
      files.delete(id);
      if (f.password && passwordToId) passwordToId.delete(f.password);
    } else {
      files.set(id, f);
    }

    return res.status(200).send(Buffer.from(f.buffer));
  }

  // If POST => accept JSON body with password to authorize
  if (req.method === "POST") {
    let body: any = {};
    try {
      body = typeof req.body === "object" ? req.body : JSON.parse(String(req.body || "{}"));
    } catch (e) {
      body = {};
    }
    const password = body.password ? String(body.password) : undefined;
    if (!password || password !== f.password) {
      return res.status(401).json({ error: "Invalid password" });
    }

    res.setHeader("Content-Type", f.mimetype || "application/octet-stream");
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(f.filename)}"`);

    f.downloadCount = (f.downloadCount || 0) + 1;
    if (f.downloadCount >= f.maxDownloads) {
      files.delete(id);
      if (f.password && passwordToId) passwordToId.delete(f.password);
    } else {
      files.set(id, f);
    }

    return res.status(200).send(Buffer.from(f.buffer));
  }

  return res.status(405).json({ error: "Method not allowed" });
}