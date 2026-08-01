import { useEffect, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";
import { Button } from "@/components/ui/button";
import { Eraser, ChevronLeft, ChevronRight, Loader2, Pen, Type } from "lucide-react";
import { useFilePages } from "./useFilePages";

const COLORS = ["#ef4444", "#2563eb", "#16a34a", "#111827"];
const WIDTHS = [2, 4, 8];
const TEXT_FONT_SIZE = 24;

interface AnnotationEditorProps {
  fileUrl: string;
  mimeType: string;
  onSave: (blob: Blob, mimeType: string) => void | Promise<void>;
  onCancel: () => void;
}

function getCanvasPos(e: React.PointerEvent | { clientX: number; clientY: number }, canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) * canvas.width) / rect.width,
    y: ((e.clientY - rect.top) * canvas.height) / rect.height,
  };
}

export default function AnnotationEditor({ fileUrl, mimeType, onSave, onCancel }: AnnotationEditorProps) {
  const { isPdf, pages, pageIndex, setPageIndex, loading, error: loadError, originalsRef } = useFilePages(fileUrl, mimeType);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [strokeWidth, setStrokeWidth] = useState(WIDTHS[1]);
  const [tool, setTool] = useState<"pen" | "text">("pen");
  const [textInput, setTextInput] = useState<{ x: number; y: number; left: number; top: number; value: string } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (loadError) setError(loadError);
  }, [loadError]);

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

    if (tool === "text") {
      const container = containerRef.current;
      if (!container) return;
      const containerRect = container.getBoundingClientRect();
      const pos = getCanvasPos(e, canvas);
      setTextInput({
        x: pos.x,
        y: pos.y,
        left: e.clientX - containerRect.left,
        top: e.clientY - containerRect.top,
        value: "",
      });
      return;
    }

    drawingRef.current = true;
    const pos = getCanvasPos(e, canvas);
    lastPointRef.current = pos;
    draw(canvas, pos, pos);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (tool !== "pen" || !drawingRef.current) return;
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

  const commitTextInput = () => {
    if (!textInput) return;
    const canvas = pages[pageIndex];
    if (canvas && textInput.value.trim()) {
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = color;
      ctx.font = `${TEXT_FONT_SIZE}px sans-serif`;
      ctx.textBaseline = "top";
      ctx.fillText(textInput.value, textInput.x, textInput.y);
    }
    setTextInput(null);
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
          <button
            onClick={() => setTool("pen")}
            className={`flex items-center justify-center w-8 h-8 rounded-md border transition ${
              tool === "pen" ? "border-primary bg-primary/10" : "border-border hover:bg-accent"
            }`}
            aria-label="Pen tool"
          >
            <Pen className="w-4 h-4" />
          </button>
          <button
            onClick={() => setTool("text")}
            className={`flex items-center justify-center w-8 h-8 rounded-md border transition ${
              tool === "text" ? "border-primary bg-primary/10" : "border-border hover:bg-accent"
            }`}
            aria-label="Text tool"
          >
            <Type className="w-4 h-4" />
          </button>
          <div className="w-px h-6 bg-border mx-1" />
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
              disabled={tool === "text"}
            >
              <span className="rounded-full bg-foreground" style={{ width: w + 2, height: w + 2 }} />
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={handleClearPage} disabled={loading || pages.length === 0}>
          <Eraser className="w-4 h-4 mr-1" /> Clear {isPdf && pages.length > 1 ? "page" : ""}
        </Button>
      </div>

      <div className="relative bg-accent/20 border border-border rounded-xl p-3 max-h-[60vh] overflow-auto">
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
            className={tool === "text" ? "cursor-text" : "cursor-crosshair"}
          />
        )}
        {textInput && (
          <input
            autoFocus
            value={textInput.value}
            onChange={(e) => setTextInput({ ...textInput, value: e.target.value })}
            onBlur={commitTextInput}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitTextInput();
              if (e.key === "Escape") setTextInput(null);
            }}
            style={{
              position: "absolute",
              left: textInput.left,
              top: textInput.top,
              color,
              fontSize: TEXT_FONT_SIZE * 0.75,
              transform: "translateY(-50%)",
            }}
            className="bg-background/90 border border-dashed border-primary rounded px-1 outline-none"
            placeholder="Type..."
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
