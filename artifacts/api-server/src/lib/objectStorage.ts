import { Client } from "@replit/object-storage";

const client = new Client();

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
] as const;

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export type UploadContext =
  | "homework-assigned"
  | "homework-submission"
  | "homework-review"
  | "test-homework-assigned"
  | "test-homework-submission"
  | "test-homework-review";

export function buildKey(bookingId: number, context: UploadContext, fileName: string): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${context}/${bookingId}/${Date.now()}-${safeName}`;
}

export async function putObject(key: string, buffer: Buffer): Promise<void> {
  const { ok, error } = await client.uploadFromBytes(key, buffer);
  if (!ok) {
    throw new Error(`Failed to upload object ${key}: ${error?.message ?? "unknown error"}`);
  }
}

export async function getObject(key: string): Promise<Buffer> {
  const result = await client.downloadAsBytes(key);
  if (!result.ok) {
    throw new Error(`Failed to download object ${key}: ${result.error?.message ?? "unknown error"}`);
  }
  return result.value[0];
}
