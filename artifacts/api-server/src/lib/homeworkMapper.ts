import type { Homework } from "@workspace/db";

export function mapHomeworkFields(hw: Homework) {
  return {
    id: hw.id,
    bookingId: hw.bookingId,
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
    reminderActive: hw.reminderActive,
  };
}

export function mapHomeworkRow(
  hw: Homework,
  opts: { studentId: number; studentName: string; lessonTypeName: string; lessonDate: Date },
) {
  return {
    ...mapHomeworkFields(hw),
    studentId: opts.studentId,
    studentName: opts.studentName,
    lessonTypeName: opts.lessonTypeName,
    lessonDate: opts.lessonDate,
  };
}
