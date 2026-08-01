import type { TestHomework, TestHomeworkFile } from "@workspace/db";

function mapFile(f: TestHomeworkFile) {
  return {
    id: f.id,
    slot: f.slot,
    key: f.key,
    name: f.name,
    mime: f.mime,
    url: f.url ?? null,
    linkedFileId: f.linkedFileId ?? null,
    originalFileId: f.originalFileId ?? null,
    sortOrder: f.sortOrder,
    createdAt: f.createdAt,
  };
}

export function mapTestHomework(hw: TestHomework, files: TestHomeworkFile[] = []) {
  const bySlot = (slot: TestHomeworkFile["slot"]) =>
    files
      .filter((f) => f.slot === slot)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(mapFile);

  return {
    id: hw.id,
    assignedText: hw.assignedText ?? null,
    submittedText: hw.submittedText ?? null,
    tutorFeedback: hw.tutorFeedback ?? null,
    grade: hw.grade ?? null,
    submittedAt: hw.submittedAt ?? null,
    reviewedAt: hw.reviewedAt ?? null,
    studentReviewSeenAt: hw.studentReviewSeenAt ?? null,
    createdAt: hw.createdAt,
    assignedFiles: bySlot("assigned"),
    submissionFiles: bySlot("submission"),
    reviewFiles: bySlot("review"),
  };
}
