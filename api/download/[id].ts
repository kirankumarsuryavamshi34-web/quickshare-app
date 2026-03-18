import { files } from "../upload";

export default function handler(req: any, res: any) {
  const { id } = req.query;
  const file = files.get(id);

  if (!file) return res.status(404).send("File not found");

  if (Date.now() > file.expiresAt) {
    files.delete(id);
    return res.status(410).send("File Expired");
  }

  if (file.downloadCount >= file.maxDownloads) {
    files.delete(id);
    return res.status(410).send("Download limit reached");
  }

  file.downloadCount++;

  // Delete if limit reached
  if (file.downloadCount >= file.maxDownloads) {
    files.delete(id);
  }

   // Set Content-Type if we stored mimetype, otherwise fallback
  if (file.mimetype) {
    res.setHeader("Content-Type", file.mimetype);
  } else {
    res.setHeader("Content-Type", "application/octet-stream");
  }
  res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);

  // Send raw buffer
  return res.send(file.buffer);
  
}