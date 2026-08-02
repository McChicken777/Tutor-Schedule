import type { Report } from "@workspace/db";

export function mapReportRow(
  report: Report,
  reporterName: string,
  targetPreview: string | null,
  reportedUserName: string | null,
) {
  const reporterId = report.reporterRole === "student" ? report.reporterStudentId : report.reporterTeacherId;
  const reportedUserId =
    report.reportedUserRole === "student"
      ? report.reportedStudentId
      : report.reportedUserRole === "teacher"
        ? report.reportedTeacherId
        : null;

  return {
    id: report.id,
    reporterRole: report.reporterRole as "student" | "teacher",
    reporterId: reporterId as number,
    reporterName,
    targetType: report.targetType as "message" | "homework_file" | "general",
    targetId: report.targetId ?? null,
    targetPreview,
    reportedUserRole: (report.reportedUserRole as "student" | "teacher" | null) ?? null,
    reportedUserId: reportedUserId ?? null,
    reportedUserName,
    body: report.body,
    status: report.status as "open" | "resolved" | "actioned",
    createdAt: report.createdAt,
  };
}
