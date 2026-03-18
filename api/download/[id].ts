// api/download/[id].ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { files } from "../upload"; // path depends on your project layout

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const id = (req.query?.id || (req.url && req.url.split("/").pop())) as string | undefined;
    if (!id) return res.status(400).send("Missing id");

    const rec = files.get(id);
    if (!rec) return res.status(404).send("File not found or expired.");

    // If file is password protected, check query param or POST body:
    // We'll allow ?password=... or Authorization header 'Bearer <password>' or POST { password }
    // For GET request with password query:
    const provided = (req.query?.password as string) || (req.headers.authorization ? String(req.headers.authorization).replace(/^Bearer\s+/i, "") : undefined);

    if (rec.password) {
      if (!provided || provided !== rec.password) {
        // If request does not provide correct password, return 401
        return res.status(401).send("Password required or incorrect.");
      }
    }

    const now = Date.now();
    if (rec.expiresAt < now) {
      files.delete(id);
      return res.status(404).send("File expired");
    }

    // Increment download count and possibly delete after max reach
    rec.downloadCount = (rec.downloadCount || 0) + 1;
    if (rec.downloadCount >= rec.maxDownloads) {
      // remove after sending (we'll let sending continue then delete record)
    }

    // If buffer present -> stream from memory
    if (rec.buffer) {
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${rec.filename}"`);
      res.setHeader("Content-Length", String(rec.size));
      res.status(200).send(rec.buffer);

      // Remove if over limit
      if (rec.downloadCount >= rec.maxDownloads) files.delete(id);
      return;
    }

    // If using blob (URL present), redirect to blob URL (it might be private — if private you must sign or serve differently)
    if (rec.url) {
      // If you saved file to Vercel Blob and rec.url is a signed URL, redirect to it.
      return res.redirect(302, rec.url);
    }

    // fallback:
    return res.status(500).send("File cannot be served.");
  } catch (err: any) {
    console.error("download error:", err);
    return res.status(500).send("Server error");
  }
}