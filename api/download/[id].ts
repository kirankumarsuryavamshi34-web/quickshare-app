import type { VercelRequest, VercelResponse } from "@vercel/node";
import { del, list } from "@vercel/blob";
import { files } from "../upload";

async function getBlobUrl(prefix: string) {
  const result = await list({
    prefix,
    limit: 1,
  });
  return result.blobs[0]?.url || null;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { id } = req.query;
    const fileId = Array.isArray(id) ? id[0] : id;
    const password =
      typeof req.query.password === "string" ? req.query.password.trim() : "";

    if (!fileId) {
      return res.status(400).json({ error: "Missing file id" });
    }

    const file = files.get(fileId);

    if (!file) {
      return res.status(404).send("File not found or expired");
    }

    if (Date.now() > file.expiresAt) {
      const expiredBlobUrl = await getBlobUrl(`quickshare/${file.id}-`);
      if (expiredBlobUrl) {
        try {
          await del(expiredBlobUrl);
        } catch {}
      }
      files.delete(fileId);
      return res.status(404).send("File not found or expired");
    }

    if (file.hasPassword && file.password !== password) {
      return res.status(401).send("Invalid password");
    }

    const blobUrl = await getBlobUrl(`quickshare/${file.id}-`);

    if (!blobUrl) {
      files.delete(fileId);
      return res.status(404).send("File not found or expired");
    }

    file.downloadCount += 1;

    if (file.downloadCount >= file.maxDownloads) {
      setTimeout(async () => {
        try {
          await del(blobUrl);
        } catch {}
        files.delete(fileId);
      }, 1500);
    }

    return res.redirect(blobUrl);
  } catch (error: any) {
    console.error("DOWNLOAD ERROR:", error);
    return res.status(500).send(error?.message || "Download failed");
  }
}