import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import { PDFDocument } from "pdf-lib";
import { Button } from "@/components/ui/button";
import { Eraser, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

const COLORS = ["#ef4444", "#2563eb", "#16a34a", "#111827"];
const WIDTHS = [2, 4, 8];

interface AnnotationEditorProps {
  fileUrl: string;
  mimeType: string;
  onSave: (blob: Blob, mimeType: string) => void | Promise<void>;
  onCancel: () => void;
}

function getCanvasPos(e: React.PointerEvent, canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) * canvas.width) / rect.width,
    y: ((e.clientY - rect.top) * canvas.height) / rect.height,
  };
}

export default function AnnotationEditor({ fileUrl, mimeType, onSave, onCancel }: AnnotationEditorProps) {
  const isPdf = mimeType === "application/pdf";
  const [pages, setPages] = useState<HTMLCanvasElement[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [strokeWidth, setStrokeWidth] = useState(WIDTHS[1]);

  const originalsRef = useRef<HTMLCanvasElement[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const work: HTMLCanvasElement[] = [];
        const originals: HTMLCanvasElement[] = [];

        if (isPdf) {
          const doc = await pdfjsLib.getDocument({ url: fileUrl, withCredentials: true }).promise;
          for (let i = 1; i <= doc.numPages; i++) {
            const page = await doc.getPage(i);
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement("canvas");
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await page.render({ canvasContext: canvas.getContext("2d")!, viewport, canvas }).promise;

            const original = document.createElement("canvas");
            original.width = canvas.width;
            original.height = canvas.height;
            original.getContext("2d")!.drawImage(canvas, 0, 0);

            work.push(canvas);
            originals.push(original);
          }
        } else {
          const img = new Image();
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error("Could not load this image for annotation."));
            img.src = fileUrl;
          });
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          canvas.getContext("2d")!.drawImage(img, 0, 0);

          const original = document.createElement("canvas");
          original.width = canvas.width;
          original.height = canvas.height;
          original.getContext("2d")!.drawImage(canvas, 0, 0);

          work.push(canvas);
          originals.push(original);
        }

        if (!cancelled) {
          originalsRef.current = originals;
          setPages(work);
          setPageIndex(0);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load file for annotation.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [fileUrl, isPdf]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = pages[pageIndex];
    if (!container || !canvas) return;
    container.innerHTML = "";
    canvas.style.maxWidth = "100%";
    canvas.style.height = "auto";
    canvas.style.touchAction = "none";
    canvas.style.display = "block";
    canvas.style.margin = "0 auto";
    container.appendChild(canvas);
  }, [pages, pageIndex]);

  const draw = (canvas: HTMLCanvasElement, from: { x: number; y: number }, to: { x: number; y: number }) => {
    const ctx = canvas.getContext("2d")!;
    ctx.strokeStyle = color;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const canvas = pages[pageIndex];
    if (!canvas) return;
    drawingRef.current = true;
    const pos = getCanvasPos(e, canvas);
    lastPointRef.current = pos;
    draw(canvas, pos, pos);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drawingRef.current) return;
    const canvas = pages[pageIndex];
    if (!canvas) return;
    const pos = getCanvasPos(e, canvas);
    const last = lastPointRef.current ?? pos;
    draw(canvas, last, pos);
    lastPointRef.current = pos;
  };

  const handlePointerUp = () => {
    drawingRef.current = false;
    lastPointRef.current = null;
  };

  const handleClearPage = () => {
    const canvas = pages[pageIndex];
    const original = originalsRef.current[pageIndex];
    if (!canvas || !original) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(original, 0, 0);
  };

  const handleSave = async () => {
    if (pages.length === 0) return;
    setSaving(true);
    try {
      if (isPdf) {
        const pdfDoc = await PDFDocument.create();
        for (const canvas of pages) {
          const dataUrl = canvas.toDataURL("image/png");
          const pngBytes = await fetch(dataUrl).then((r) => r.arrayBuffer());
          const pngImage = await pdfDoc.embedPng(pngBytes);
          const page = pdfDoc.addPage([canvas.width, canvas.height]);
          page.drawImage(pngImage, { x: 0, y: 0, width: canvas.width, height: canvas.height });
        }
        const bytes = await pdfDoc.save();
        await onSave(new Blob([bytes as BlobPart], { type: "application/pdf" }), "application/pdf");
      } else {
        const canvas = pages[0];
        const blob: Blob = await new Promise((resolve, reject) => {
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Failed to export image"))), "image/png");
        });
        await onSave(blob, "image/png");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save annotated file.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`w-7 h-7 rounded-full border-2 transition ${color === c ? "border-foreground scale-110" : "border-transparent"}`}
              style={{ backgroundColor: c }}
              aria-label={`Color ${c}`}
            />
          ))}
          <div className="w-px h-6 bg-border mx-1" />
          {WIDTHS.map((w) => (
            <button
              key={w}
              onClick={() => setStrokeWidth(w)}
              className={`flex items-center justify-center w-8 h-8 rounded-md border transition ${
                strokeWidth === w ? "border-primary bg-primary/10" : "border-border hover:bg-accent"
              }`}
              aria-label={`Stroke width ${w}`}
            >
              <span className="rounded-full bg-foreground" style={{ width: w + 2, height: w + 2 }} />
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={handleClearPage} disabled={loading || pages.length === 0}>
          <Eraser className="w-4 h-4 mr-1" /> Clear {isPdf && pages.length > 1 ? "page" : ""}
        </Button>
      </div>

      <div className="bg-accent/20 border border-border rounded-xl p-3 max-h-[60vh] overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-64 text-muted-foreground gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading file...
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-64 text-destructive text-sm text-center px-6">{error}</div>
        ) : (
          <div
            ref={containerRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            className="cursor-crosshair"
          />
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

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={loading || saving || pages.length === 0}>
          {saving ? "Saving..." : "Save Annotated File"}
        </Button>
      </div>
    </div>
  );
}
