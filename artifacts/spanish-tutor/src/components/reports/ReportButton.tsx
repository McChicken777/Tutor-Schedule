import { useState } from "react";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import ReportDialog, { type ReportTarget } from "./ReportDialog";

interface ReportButtonProps {
  role: "student" | "teacher";
  target: ReportTarget;
  variant?: "icon" | "header";
  className?: string;
}

export default function ReportButton({ role, target, variant = "icon", className }: ReportButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {variant === "header" ? (
        <Button variant="outline" size="sm" className={className} onClick={() => setOpen(true)}>
          <Flag className="w-4 h-4 mr-2" /> Report an issue
        </Button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`p-1 rounded hover:bg-accent-foreground/10 text-muted-foreground hover:text-destructive transition-colors ${className ?? ""}`}
          aria-label="Report"
        >
          <Flag className="w-3.5 h-3.5" />
        </button>
      )}
      <ReportDialog role={role} target={target} open={open} onOpenChange={setOpen} />
    </>
  );
}
