import type { VercelRequest, VercelResponse } from "@vercel/node";
import { del } from "@vercel/blob";
import { getFile, setFile, deleteFile } from "../store.js";

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

    const file: any = await getFile(fileId);

    if (!file) {
      return res.status(404).send("File not found or expired");
    }

    // expiry check
    if (Date.now() > file.expiresAt) {
      await deleteFile(fileId);
      return res.status(404).send("File not found or expired");
    }

    // password check
    if (file.hasPassword && file.password !== password) {
      return res.status(401).send("Invalid password");
    }

    if (!file.blobUrl) {
      await deleteFile(fileId);
      return res.status(404).send("File not found or expired");
    }

    // increment download count
    file.downloadCount += 1;

    // update in KV
    await setFile(fileId, file);

    // delete after max downloads
    if (file.downloadCount >= file.maxDownloads) {
      setTimeout(async () => {
        try {
          await del(file.blobUrl);
        } catch {}
        await deleteFile(fileId);
      }, 1000);
    }

    return res.redirect(file.blobUrl);
  } catch (error: any) {
    console.error("DOWNLOAD ERROR:", error);
    return res.status(500).send(error?.message || "Download failed");
  }
}