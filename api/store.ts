// api/store.ts
import { kv } from "@vercel/kv";

export type FileRecord = {
  id: string;
  filename: string;
  size: number;
  url: string;
  expiresAt: number;
  downloadCount: number;
  maxDownloads: number;
  password: string | null;
  hasPassword: boolean;
  blobUrl: string | null;
};

// ✅ store file with TTL (10 minutes)
export async function setFile(id: string, data: FileRecord) {
  await kv.set(id, data, { ex: 600 });
}

// ✅ get file safely
export async function getFile(id: string): Promise<FileRecord | null> {
  const data = await kv.get(id);
  return data as FileRecord | null;
}

// ✅ delete file
export async function deleteFile(id: string) {
  await kv.del(id);
}