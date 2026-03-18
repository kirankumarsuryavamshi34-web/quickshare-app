// api/file-info.ts
/**
 * Returns the metadata for a given id: /api/file-info?id=<id>
 * Implementation fetches public meta.json using BLOB_PUBLIC_BASE_URL.
 *
 * If you prefer to use SDK `get()` instead of a public URL, I can provide a variant.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import fetch from "node-fetch";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const id = (req.query.id || (req.query as any).fileId) as string | undefined;
  if (!id) return res.status(400).json({ error: "Missing id" });

  // require BLOB_PUBLIC_BASE_URL so we can construct the meta.json URL
  const base = process.env.BLOB_PUBLIC_BASE_URL;
  if (!base) {
    console.error("Missing BLOB_PUBLIC_BASE_URL");
    return res.status(500).json({ error: "Server misconfigured: set BLOB_PUBLIC_BASE_URL" });
  }

  try {
    const metaKey = `quickshare/${id}/meta.json`;
    const metaUrl = `${base.replace(/\/$/, "")}/${metaKey}`;

    const r = await fetch(metaUrl);
    if (!r.ok) return res.status(404).json({ error: "File not found or expired" });

    const meta = await r.json();
    if (!meta || !meta.expiresAt) return res.status(404).json({ error: "Meta missing or invalid" });

    if (Date.now() > meta.expiresAt) {
      return res.status(404).json({ error: "File expired" });
    }

    return res.status(200).json(meta);
  } catch (err: any) {
    console.error("file-info error:", err);
    return res.status(500).json({ error: "Failed to load file info", detail: String(err) });
  }
}