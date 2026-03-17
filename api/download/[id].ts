import { files } from "../upload";

export default function handler(req: any, res: any) {
  const { id } = req.query;
  const file = files.get(id);

  if (!file) return res.status(404).send("File not found");

  if (Date.now() > file.expiresAt) {
    files.delete(id);
    return res.status(410).send("Expired");
  }

  if (file.downloadCount >= file.maxDownloads) {
    files.delete(id);
    return res.status(410).send("Download limit reached");
  }

  file.downloadCount++;

  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${file.filename}"`
  );

  res.send(file.buffer);

  // Delete if limit reached
  if (file.downloadCount >= file.maxDownloads) {
    files.delete(id);
  }
}