import { put } from "@vercel/blob";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";

const upload = multer({ storage: multer.memoryStorage() });

export const config = {
  api: { bodyParser: false },
};

function runMiddleware(req: any, res: any, fn: Function) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result: any) => {
      if (result instanceof Error) return reject(result);
      resolve(result);
    });
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await runMiddleware(req, res, upload.single("file"));
    const file = (req as any).file;

    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const id = uuidv4();

    const blob = await put(`uploads/${id}-${file.originalname}`, file.buffer, {
      access: "public",
    });

    return res.status(200).json({
      id,
      filename: file.originalname,
      size: file.size,
      url: blob.url, // 🔥 MAIN THING
      expiresAt: Date.now() + 10 * 60 * 1000,
      downloadCount: 0,
      maxDownloads: 10,
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Upload failed" });
  }
}