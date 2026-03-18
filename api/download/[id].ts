// api/download/[id].ts
/**
 * Redirects to the file's public blob URL.
 * URL used for sharing is /download/<id> so link is user-friendly.
 *
 * Uses BLOB_PUBLIC_BASE_URL + quickshare/{id}/meta.json to find meta and then redirects to meta.url
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import fetch from "node-fetch";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const id = req.query.id as string | undefined;
  if (!id) return res.status(400).send("Missing id");

  const base = process.env.BLOB_PUBLIC_BASE_URL;
  if (!base) return res.status(500).send("Server misconfigured: missing BLOB_PUBLIC_BASE_URL");

  try {
    const metaKey = `quickshare/${id}/meta.json`;
    const metaUrl = `${base.replace(/\/$/, "")}/${metaKey}`;
    const r = await fetch(metaUrl);

    if (!r.ok) return res.status(404).send("File not found or expired");
    const meta = await r.json();

    if (!meta?.url) return res.status(404).send("File not found");
    if (Date.now() > meta.expiresAt) return res.status(410).send("Expired");

    // redirect user to the public blob URL (fast, served by Vercel Storage CDN)
    return res.redirect(302, meta.url);
  } catch (err: any) {
    console.error("download error:", err);
    return res.status(500).send("Server error");
  }
}