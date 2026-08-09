import type { PackageRequest } from "@workspace/db";

export function mapPackageRequest(request: PackageRequest, lessonTypeName: string) {
  return {
    id: request.id,
    studentId: request.studentId,
    lessonTypeId: request.lessonTypeId,
    lessonTypeName,
    quantity: request.quantity,
    totalCents: request.totalCents,
    status: request.status,
    note: request.note ?? null,
    requestedAt: request.requestedAt,
    resolvedAt: request.resolvedAt ?? null,
  };
}
