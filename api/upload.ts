import type { VercelRequest, VercelResponse } from "@vercel/node";
import multer from "multer";
import { put, list, del } from "@vercel/blob";
import { v4 as uuidv4 } from "uuid";

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

type FileRecord = {
  id: string;
  filename: string;
  size: number;
  url: string;
  expiresAt: number;
  downloadCount: number;
  maxDownloads: number;
  password: string | null;
  hasPassword: boolean;
};

declare global {
  // eslint-disable-next-line no-var
  var quickshareFiles: Map<string, FileRecord> | undefined;
}

const files = global.quickshareFiles || new Map<string, FileRecord>();
global.quickshareFiles = files;

async function cleanupExpiredFiles() {
  const now = Date.now();

  for (const [id, file] of files.entries()) {
    if (file.expiresAt <= now) {
      try {
        await del(file.url);
      } catch {}
      files.delete(id);
    }
  }
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await cleanupExpiredFiles();
    await runMiddleware(req, res, upload.single("file"));

    const file = (req as any).file;
    const passwordRaw = ((req as any).body?.password || "").trim();
    const password = passwordRaw ? passwordRaw : null;

    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    if (password) {
      for (const existing of files.values()) {
        if (
          existing.password &&
          existing.password === password &&
          existing.expiresAt > Date.now() &&
          existing.downloadCount < existing.maxDownloads
        ) {
          return res.status(400).json({
            error:
              "This password is already being used by another active file. Use a different password.",
          });
        }
      }
    }

    const id = uuidv4();
    const pathname = `quickshare/${id}-${file.originalname}`;

    const blob = await put(pathname, file.buffer, {
      access: "public",
      addRandomSuffix: false,
      contentType: file.mimetype || "application/octet-stream",
    });

    const expiresAt = Date.now() + 10 * 60 * 1000;

    const fileData: FileRecord = {
      id,
      filename: file.originalname,
      size: file.size,
      url: `${req.headers.origin || ""}/download/${id}`,
      expiresAt,
      downloadCount: 0,
      maxDownloads: 10,
      password,
      hasPassword: !!password,
    };

    files.set(id, fileData);

    return res.status(200).json({
      id,
      filename: file.originalname,
      size: file.size,
      url: fileData.url,
      expiresAt,
      downloadCount: 0,
      maxDownloads: 10,
      hasPassword: !!password,
      blobUrl: blob.url,
    });
  } catch (error: any) {
    console.error("UPLOAD ERROR:", error);
    return res.status(500).json({
      error: error?.message || "File upload failed",
    });
  }
}

export { files };