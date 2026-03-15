import type { VercelRequest, VercelResponse } from "@vercel/node";
import multer from "multer";

const upload = multer({
  storage: multer.memoryStorage(),
});

export const config = {
  api: {
    bodyParser: false,
  },
};

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

    return res.status(200).json({
      message: "Upload successful",
      filename: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
    });

  } catch (error) {
    console.error("Upload error:", error);

    return res.status(500).json({
      error: "File upload failed",
    });
  }
}