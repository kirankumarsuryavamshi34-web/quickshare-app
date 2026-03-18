// api/upload.ts
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

// In-memory store for quick dev fallback.
// If you configure Vercel Blob (see instructions after code), that will be used instead.
type FileRecord = {
  id: string;
  filename: string;
  size: number;
  buffer?: Buffer;         // present when using in-memory
  blobPath?: string;       // present when using blob
  password?: string | null;
  url: string;
  expiresAt: number;
  downloadCount: number;
  maxDownloads: number;
};

const files = new Map<string, FileRecord>();

// Run middleware helper (multer)
function runMiddleware(req: VercelRequest, res: VercelResponse, fn: Function) {
  return new Promise((resolve, reject) => {
    fn(req as any, res as any, (result: any) => {
      if (result instanceof Error) return reject(result);
      return resolve(result);
    });
  });
}

// If you configure Vercel Blob, we will attempt to put blob there.
// Required envs: BLOB_READ_WRITE_TOKEN and BLOB_STORE_NAME
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_BLOB_TOKEN || "";
const BLOB_STORE = process.env.BLOB_STORE_NAME || ""; // e.g. "quickshare-storage"
let blobClientAvailable = false;
let putFromBuffer: (path: string, buffer: Buffer, opts?: any) => Promise<{ url: string }>;

if (BLOB_TOKEN && BLOB_STORE) {
  try {
    // dynamic import so app still runs without dependency for local dev.
    // You must add @vercel/blob to dependencies for this to actually work in production.
    // npm i @vercel/blob
    // See instructions below.
    // IMPORTANT: the put interface differs by release; this uses the put helper pattern.
    // We'll import the library if present.
    // NOTE: if @vercel/blob isn't installed, this block fails and fallback stays to in-memory.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { put } = require("@vercel/blob");
    putFromBuffer = async (path: string, buffer: Buffer, opts = {}) => {
      // put returns { url } in recent versions
      // path example: `uploads/myfile-uuid.pdf`
      return await put(path, buffer, opts);
    };
    blobClientAvailable = true;
    console.log("Vercel Blob integration available");
  } catch (err: any) {
    console.warn("Vercel Blob not initialized (dependency missing or import failed). Falling back to in-memory store.", err?.message || err);
    blobClientAvailable = false;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await runMiddleware(req, res, upload.single("file"));

    const file = (req as any).file as { originalname: string; buffer: Buffer; size: number } | undefined;
    const password = (req as any).body?.password ? String((req as any).body.password).trim() : null;
    const maxDownloads = Number((req as any).body?.maxDownloads || 10);

    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // If a password is provided, ensure uniqueness among active files
    if (password) {
      for (const rec of files.values()) {
        if (rec.password && rec.password === password) {
          return res.status(409).json({ error: "Password already in use by an active file. Choose a different password or wait for that file to expire." });
        }
      }
    }

    const id = uuidv4();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
    const recordBase = {
      id,
      filename: file.originalname,
      size: file.size,
      password,
      url: `${getBaseUrl(req)}/download/${id}`,
      expiresAt,
      downloadCount: 0,
      maxDownloads,
    } as FileRecord;

    // If blob available, store there
    if (blobClientAvailable && putFromBuffer) {
      // choose path inside blob store
      const path = `uploads/${id}-${sanitizeFilename(file.originalname)}`;
      try {
        const { url } = await putFromBuffer(path, file.buffer, { access: "private", token: BLOB_TOKEN, store: BLOB_STORE });
        const rec: FileRecord = {
          ...recordBase,
          blobPath: path,
          url, // the URL returned by blob put
        };
        files.set(id, rec);
      } catch (err: any) {
        console.error("Blob put failed, falling back to in-memory. Error:", err?.message || err);
        const rec: FileRecord = { ...recordBase, buffer: file.buffer };
        files.set(id, rec);
      }
    } else {
      // fallback: keep file buffer in memory
      const rec: FileRecord = { ...recordBase, buffer: file.buffer };
      files.set(id, rec);
    }

    // Auto-delete after expiry (in-memory housekeeping)
    setTimeout(() => {
      files.delete(id);
    }, 10 * 60 * 1000);

    // Respond with metadata for UI
    return res.status(200).json({
      id,
      url: `${getBaseUrl(req)}/download/${id}`,
      expiresAt,
      size: file.size,
      maxDownloads,
      downloadCount: 0,
      // do not include filename for sender view? sender already sees it client-side; include for sender-only if needed
      filename: file.originalname,
    });

  } catch (error) {
    console.error("Upload error:", error);
    return res.status(500).json({ error: "File upload failed", details: String(error) });
  }
}

// Helper functions
function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9.\-_]/g, "_").slice(0, 200);
}

function getBaseUrl(req: VercelRequest) {
  // prefer header forwarded host if present
  const proto = (req.headers["x-forwarded-proto"] as string) || "https";
  const host = (req.headers["x-forwarded-host"] as string) || (req.headers.host as string) || "localhost:3000";
  return `${proto}://${host}`;
}

// export store so other api routes can access it (file-info/download)
export { files };