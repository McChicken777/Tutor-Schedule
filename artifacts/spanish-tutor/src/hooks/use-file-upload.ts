import { useMutation } from "@tanstack/react-query";

export type UploadContext =
  | "homework-assigned"
  | "homework-submission"
  | "homework-review"
  | "test-homework-assigned"
  | "test-homework-submission"
  | "test-homework-review";

export interface UploadedFile {
  key: string;
  fileName: string;
  mimeType: string;
  size: number;
}

interface UploadFileParams {
  file: File;
  context: UploadContext;
  bookingId: number;
}

async function uploadFile({ file, context, bookingId }: UploadFileParams): Promise<UploadedFile> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("context", context);
  formData.append("bookingId", String(bookingId));

  const response = await fetch("/api/uploads", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error ?? `Upload failed (${response.status})`);
  }

  return response.json();
}

export function useFileUpload() {
  return useMutation({
    mutationFn: uploadFile,
  });
}
