import type { Homework, HomeworkFile } from "@workspace/db";

function mapFile(f: HomeworkFile) {
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

export function mapHomeworkFields(hw: Homework, files: HomeworkFile[] = []) {
  const bySlot = (slot: HomeworkFile["slot"]) =>
    files
      .filter((f) => f.slot === slot)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(mapFile);

  return {
    id: hw.id,
    bookingId: hw.bookingId,
    noHomework: hw.noHomework,
    assignedText: hw.assignedText ?? null,
    assignedLinkUrl: hw.assignedLinkUrl ?? null,
    submittedText: hw.submittedText ?? null,
    submittedLinkUrl: hw.submittedLinkUrl ?? null,
    tutorFeedback: hw.tutorFeedback ?? null,
    grade: hw.grade ?? null,
    submittedAt: hw.submittedAt ?? null,
    reviewedAt: hw.reviewedAt ?? null,
    studentReviewSeenAt: hw.studentReviewSeenAt ?? null,
    reminderActive: hw.reminderActive,
    assignedFiles: bySlot("assigned"),
    submissionFiles: bySlot("submission"),
    reviewFiles: bySlot("review"),
  };
}

export function mapHomeworkRow(
  hw: Homework,
  files: HomeworkFile[],
  opts: { studentId: number; studentName: string; lessonTypeName: string; lessonDate: Date },
) {
  return {
    ...mapHomeworkFields(hw, files),
    studentId: opts.studentId,
    studentName: opts.studentName,
    lessonTypeName: opts.lessonTypeName,
    lessonDate: opts.lessonDate,
  };
}
