import { files } from "./upload";

export default function handler(req: any, res: any) {
  const { id } = req.query;

  const file = files.get(id);

  if (!file) {
    return res.status(404).json({ error: "File not found" });
  }

  if (Date.now() > file.expiresAt) {
    files.delete(id);
    return res.status(410).json({ error: "File expired" });
  }

  if (file.downloadCount >= file.maxDownloads) {
    files.delete(id);
    return res.status(410).json({ error: "Download limit reached" });
  }

  file.downloadCount++;

  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${file.filename}"`
  );

  res.setHeader("Content-Type", file.mimetype || "application/octet-stream");

  return res.send(file.buffer);
}