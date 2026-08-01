import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useFilePages } from "./useFilePages";

interface FileViewerProps {
  fileUrl: string;
  mimeType: string;
}

export default function FileViewer({ fileUrl, mimeType }: FileViewerProps) {
  const { isPdf, pages, pageIndex, setPageIndex, loading, error } = useFilePages(fileUrl, mimeType);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = pages[pageIndex];
    if (!container || !canvas) return;
    container.innerHTML = "";
    canvas.style.maxWidth = "100%";
    canvas.style.height = "auto";
    canvas.style.display = "block";
    canvas.style.margin = "0 auto";
    container.appendChild(canvas);
  }, [pages, pageIndex]);

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-accent/20 border border-border rounded-xl p-3 max-h-[60vh] overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-64 text-muted-foreground gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading file...
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-64 text-destructive text-sm text-center px-6">{error}</div>
        ) : (
          <div ref={containerRef} />
        )}
      </div>

      {isPdf && pages.length > 1 && (
        <div className="flex items-center justify-center gap-4">
          <Button variant="outline" size="sm" onClick={() => setPageIndex((i) => Math.max(0, i - 1))} disabled={pageIndex === 0}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {pageIndex + 1} of {pages.length}
          </span>
          <Button variant="outline" size="sm" onClick={() => setPageIndex((i) => Math.min(pages.length - 1, i + 1))} disabled={pageIndex === pages.length - 1}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
