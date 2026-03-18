import type { VercelRequest, VercelResponse } from "@vercel/node";
import { list } from "@vercel/blob";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "GET") {
    return res.status(405).send("Method not allowed");
  }

  try {
    const path = req.query.path as string;

    if (!path) {
      return res.status(400).send("Missing blob path");
    }

    const result = await list({
      prefix: path,
      limit: 1,
    });

    const blob = result.blobs[0];

    if (!blob) {
      return res.status(404).send("File not found");
    }

    return res.redirect(blob.url);
  } catch (error: any) {
    console.error("BLOB PROXY ERROR:", error);
    return res.status(500).send(error?.message || "Failed to fetch file");
  }
}