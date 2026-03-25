// api/store.ts

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

declare global {
  // eslint-disable-next-line no-var
  var __quickshare_files__: Map<string, FileRecord> | undefined;
}

export const files =
  global.__quickshare_files__ || new Map<string, FileRecord>();

global.__quickshare_files__ = files;