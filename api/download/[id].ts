import type { VercelRequest, VercelResponse } from "@vercel/node";
import { del } from "@vercel/blob";
import { files } from "../store.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
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

    if (!file || Date.now() > file.expiresAt) {
      files.delete(fileId);
      return res.status(404).send("File not found or expired");
    }

    if (file.hasPassword && file.password !== password) {
      return res.status(401).send("Invalid password");
    }

    const blobUrl = file.blobUrl;
    if (!file.blobUrl) {
      files.delete(fileId);
      return res.status(404).send("File not found or expired");
    }

    file.downloadCount += 1;

    if (file.downloadCount >= file.maxDownloads) {
      setTimeout(async () => {
        try {
          await del(file.blobUrl);
        } catch {}
        files.delete(fileId);
      }, 1000);
    }

    return res.redirect(blobUrl);
  } catch (error: any) {
    console.error("DOWNLOAD ERROR:", error);
    return res.status(500).send(error?.message || "Download failed");
  }
}