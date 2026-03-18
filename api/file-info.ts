import { files } from "./upload";

export default function handler(req: any, res: any) {
  const { id } = req.query;

  const file = files.get(id);

  if (!file) {
    return res.status(404).json({ error: "File not found or expired" });
  }

  return res.status(200).json({
    filename: file.filename,
    size: file.size,
    expiresAt: file.expiresAt,
    downloadCount: file.downloadCount,
    maxDownloads: file.maxDownloads,
  });
}