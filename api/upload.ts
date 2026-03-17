import type { VercelRequest, VercelResponse } from "@vercel/node";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";

const upload = multer({
  storage: multer.memoryStorage(),
});

export const config = {
  api: {
    bodyParser: false,
  },
};

// 🔥 In-memory storage
const files = new Map();

function runMiddleware(
  req: VercelRequest,
  res: VercelResponse,
  fn: Function
) {
  return new Promise((resolve, reject) => {
    fn(req as any, res as any, (result: any) => {
      if (result instanceof Error) return reject(result);
      return resolve(result);
    });
  });
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await runMiddleware(req, res, upload.single("file"));

    const file = (req as any).file;

    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // 🔥 Generate unique ID
    const id = uuidv4();

    const fileData = {
      id,
      filename: file.originalname,
      size: file.size,
      buffer: file.buffer,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 mins
      downloadCount: 0,
      maxDownloads: 10,
    };

    files.set(id, fileData);

    // 🔥 Auto delete after expiry
    setTimeout(() => {
      files.delete(id);
    }, 10 * 60 * 1000);

    return res.status(200).json({
      id,
      filename: file.originalname,
      size: file.size,
      expiresAt: fileData.expiresAt,
      downloadCount: 0,
      maxDownloads: 10,
    });

  } catch (error) {
    console.error("Upload error:", error);

    return res.status(500).json({
      error: "File upload failed",
    });
  }
}

// 🔥 Export files so other APIs can use it
export { files };