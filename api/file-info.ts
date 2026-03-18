// api/file-info.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { files } from "./upload";

export default function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const id = (req.query?.id || req.query?.file || req.query?.q) as string | undefined;
    if (!id) return res.status(400).json({ error: "Missing id param" });

    const rec = files.get(id);
    if (!rec) return res.status(404).json({ error: "File not found or expired" });

    // If the request includes a special query param `reveal=true` we will include filename.
    // Normal info view for receiver should NOT show filename (per your requirement).
    const reveal = String(req.query?.reveal) === "true";

    const now = Date.now();
    if (rec.expiresAt < now) {
      files.delete(id);
      return res.status(404).json({ error: "File expired" });
    }

    res.status(200).json({
      id: rec.id,
      ...(reveal ? { filename: rec.filename } : {}),
      size: rec.size,
      url: rec.url,
      expiresAt: rec.expiresAt,
      downloadCount: rec.downloadCount,
      maxDownloads: rec.maxDownloads,
      hasPassword: !!rec.password,
    });
  } catch (err: any) {
    console.error("file-info error", err);
    res.status(500).json({ error: "Internal server error" });
  }
}