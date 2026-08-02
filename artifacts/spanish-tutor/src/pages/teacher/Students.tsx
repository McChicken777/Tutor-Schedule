import { useState } from "react";
import { useListTeacherStudents, useGetTeacherStudent, useGrantPackage, useListTeacherHomework } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getListTeacherStudentsQueryKey, getGetTeacherStudentQueryKey } from "@workspace/api-client-react";
import { HomeworkCard } from "@/pages/teacher/Homework";
import ErrorState from "@/components/ErrorState";

export default function TeacherStudents() {
  const { data: students, isLoading, error, refetch } = useListTeacherStudents();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  return (
    <div className="p-6 md:p-10 bg-background min-h-full">
      <h1 className="text-3xl font-serif font-bold text-foreground mb-8">Students</h1>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !students || students.length === 0 ? (
        <div className="p-12 bg-card border border-border rounded-3xl text-center text-muted-foreground">
          No students found.
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-accent/50">
              <tr>
                <th className="p-4 font-medium text-muted-foreground">Name</th>
                <th className="p-4 font-medium text-muted-foreground">Email</th>
                <th className="p-4 font-medium text-muted-foreground">Credits Left</th>
                <th className="p-4 font-medium text-muted-foreground">Bookings</th>
                <th className="p-4 font-medium text-muted-foreground">Joined</th>
                <th className="p-4 font-medium text-muted-foreground text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {students.map(s => (
                <tr key={s.id} className="hover:bg-accent/20 transition">
                  <td className="p-4 font-medium text-foreground">{s.displayName}</td>
                  <td className="p-4 text-muted-foreground">{s.email}</td>
                  <td className="p-4 font-bold text-primary">{s.totalCredits - s.usedCredits}</td>
                  <td className="p-4 text-foreground">{s.totalBookings}</td>
                  <td className="p-4 text-muted-foreground">{format(new Date(s.createdAt), "MMM yyyy")}</td>
                  <td className="p-4 text-right">
                    <Dialog onOpenChange={(open) => { if(open) setSelectedId(s.id); else setSelectedId(null); }}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm">View</Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Student Details</DialogTitle>
                        </DialogHeader>
                        {selectedId === s.id && <StudentDetail id={s.id} />}
                      </DialogContent>
                    </Dialog>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StudentDetail({ id }: { id: number }) {
  const { data: student, isLoading } = useGetTeacherStudent(id);
  const { data: homeworkList } = useListTeacherHomework({ studentId: id, submitted: false });
  const grantMutation = useGrantPackage();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [grantCredits, setGrantCredits] = useState(5);

  if (isLoading || !student) return <Skeleton className="h-64 w-full" />;

  const handleGrant = () => {
    grantMutation.mutate({ data: { studentId: id, totalCredits: grantCredits } }, {
      onSuccess: () => {
        toast({ title: "Credits granted" });
        qc.invalidateQueries({ queryKey: getGetTeacherStudentQueryKey(id) });
        qc.invalidateQueries({ queryKey: getListTeacherStudentsQueryKey() });
      }
    });
  };

  return (
    <div className="space-y-8 py-4">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-foreground">{student.displayName}</h2>
          <p className="text-muted-foreground">{student.email}</p>
        </div>
      </div>

      <div className="bg-accent/30 p-6 rounded-2xl border border-border">
        <h3 className="font-bold text-lg mb-4">Grant Credits</h3>
        <div className="flex gap-4">
          <Input
            type="number"
            value={grantCredits}
            onChange={(e) => setGrantCredits(Number(e.target.value))}
            className="w-24 bg-background"
            min={1}
          />
          <Button onClick={handleGrant} disabled={grantMutation.isPending}>Grant</Button>
        </div>
      </div>

      <div>
        <h3 className="font-bold text-lg mb-4">Current Packages</h3>
        {student.packages && student.packages.length > 0 ? (
          <div className="grid gap-3">
            {student.packages.map(pkg => (
              <div key={pkg.id} className="bg-card border border-border p-4 rounded-xl flex justify-between items-center">
                <div>
                  <span className="text-sm text-muted-foreground">Purchased {format(new Date(pkg.purchasedAt), "MMM d")}</span>
                </div>
                <div className="font-bold text-primary">
                  {pkg.remainingCredits} / {pkg.totalCredits} credits left
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">No active packages.</p>
        )}
      </div>

      <div>
        <h3 className="font-bold text-lg mb-4">Homework</h3>
        {!homeworkList || homeworkList.length === 0 ? (
          <p className="text-muted-foreground">No homework assigned yet.</p>
        ) : (
          <div className="space-y-4">
            {homeworkList.filter(hw => !hw.submittedAt).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {homeworkList.filter(hw => !hw.submittedAt).map(hw => (
                  <span key={hw.id} className="inline-flex items-center px-3 py-1.5 rounded-md text-sm font-medium bg-accent text-muted-foreground">
                    {hw.lessonTypeName} ({format(new Date(hw.lessonDate), "MMM d")}) — Assigned, not yet submitted
                  </span>
                ))}
              </div>
            )}
            {homeworkList.filter(hw => hw.submittedAt).map(hw => (
              <HomeworkCard key={hw.id} hw={hw} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
