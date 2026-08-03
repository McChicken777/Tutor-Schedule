import { Client } from "@replit/object-storage";
import { randomUUID } from "crypto";

const client = new Client({ bucketId: process.env.OBJECT_STORAGE_BUCKET_ID });

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
] as const;

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

// Annotated/merged review PDFs are assembled client-side from every page of a
// submission and are legitimately much larger than any single raw attachment.
export const MAX_REVIEW_UPLOAD_BYTES = 100 * 1024 * 1024;

export type UploadContext = "homework-assigned" | "homework-submission" | "homework-review";

export function buildKey(bookingId: number, context: UploadContext, fileName: string): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const suffix = randomUUID().slice(0, 8);
  return `${context}/${bookingId}/${Date.now()}-${suffix}-${safeName}`;
}

// A homework-file "attach" call supplies a `key` produced by an earlier /uploads
// call, but nothing stops a client from instead sending someone else's key
// (e.g. from another booking) to have it linked into their own homework record.
// buildKey encodes the booking and context it was issued for, so this checks
// the supplied key actually belongs to the booking/context being attached to.
export function isKeyForBookingContext(key: string, bookingId: number, context: UploadContext): boolean {
  return key.startsWith(`${context}/${bookingId}/`);
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

export async function deleteObject(key: string): Promise<void> {
  const { ok, error } = await client.delete(key, { ignoreNotFound: true });
  if (!ok) {
    throw new Error(`Failed to delete object ${key}: ${error?.message ?? "unknown error"}`);
  }
}
