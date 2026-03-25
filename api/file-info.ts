import type { VercelRequest, VercelResponse } from "@vercel/node";
import { files } from "./store.js";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const id = req.query.id as string;

    if (!id) {
      return res.status(400).json({ error: "Missing file id" });
    }

    const file = files.get(id);

    if (!file || Date.now() > file.expiresAt) {
      files.delete(id);
      return res.status(404).json({ error: "File not found or expired" });
    }

    return res.status(200).json({
      id: file.id,
      size: file.size,
      url: file.url,
      expiresAt: file.expiresAt,
      downloadCount: file.downloadCount,
      maxDownloads: file.maxDownloads,
      hasPassword: file.hasPassword,
    });
  } catch (error: any) {
    console.error("FILE INFO ERROR:", error);
    return res.status(500).json({
      error: error?.message || "Internal server error",
    });
  }
}