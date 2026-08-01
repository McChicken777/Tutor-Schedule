import type { TestHomework } from "@workspace/db";

export function mapTestHomework(hw: TestHomework) {
  return {
    id: hw.id,
    assignedText: hw.assignedText ?? null,
    assignedFileUrl: hw.assignedFileUrl ?? null,
    assignedFileKey: hw.assignedFileKey ?? null,
    assignedFileName: hw.assignedFileName ?? null,
    assignedFileMime: hw.assignedFileMime ?? null,
    submittedText: hw.submittedText ?? null,
    fileUrl: hw.fileUrl ?? null,
    submittedFileKey: hw.submittedFileKey ?? null,
    submittedFileName: hw.submittedFileName ?? null,
    submittedFileMime: hw.submittedFileMime ?? null,
    reviewedFileKey: hw.reviewedFileKey ?? null,
    reviewedFileName: hw.reviewedFileName ?? null,
    reviewedFileMime: hw.reviewedFileMime ?? null,
    tutorFeedback: hw.tutorFeedback ?? null,
    grade: hw.grade ?? null,
    submittedAt: hw.submittedAt ?? null,
    reviewedAt: hw.reviewedAt ?? null,
    createdAt: hw.createdAt,
  };
}
