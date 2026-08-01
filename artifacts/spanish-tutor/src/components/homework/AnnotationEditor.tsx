import { useEffect, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";
import { Button } from "@/components/ui/button";
import { Eraser, ChevronLeft, ChevronRight, Loader2, Pen, Type, Move, Check, Trash2 } from "lucide-react";
import { useFilePages } from "./useFilePages";

const COLORS = ["#ef4444", "#2563eb", "#16a34a", "#111827"];
const WIDTHS = [6, 12, 20];
const TEXT_FONT_SIZE = 24;
const MIN_FONT_SIZE = 12;
const MAX_FONT_SIZE = 72;

interface AnnotationEditorProps {
  fileUrl: string;
  mimeType: string;
  onSave: (blob: Blob, mimeType: string) => void | Promise<void>;
  onCancel: () => void;
  saveLabel?: string;
}

interface TextAnnotation {
  id: string;
  pageIndex: number;
  x: number;
  y: number;
  text: string;
  color: string;
  fontSize: number;
}

function getCanvasPos(e: React.PointerEvent | { clientX: number; clientY: number }, canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) * canvas.width) / rect.width,
    y: ((e.clientY - rect.top) * canvas.height) / rect.height,
  };
}

function getScale(canvas: HTMLCanvasElement) {
  return canvas.getBoundingClientRect().width / canvas.width;
}

function canvasToScreen(canvas: HTMLCanvasElement, wrapper: HTMLDivElement, x: number, y: number) {
  const canvasRect = canvas.getBoundingClientRect();
  const wrapperRect = wrapper.getBoundingClientRect();
  const scale = canvasRect.width / canvas.width;
  return {
    left: canvasRect.left - wrapperRect.left + wrapper.scrollLeft + x * scale,
    top: canvasRect.top - wrapperRect.top + wrapper.scrollTop + y * scale,
    scale,
  };
}

export default function AnnotationEditor({ fileUrl, mimeType, onSave, onCancel, saveLabel }: AnnotationEditorProps) {
  const { isPdf, pages, pageIndex, setPageIndex, loading, error: loadError, originalsRef } = useFilePages(fileUrl, mimeType);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [strokeWidth, setStrokeWidth] = useState(WIDTHS[1]);
  const [tool, setTool] = useState<"pen" | "text" | "move">("pen");
  const [textInput, setTextInput] = useState<{ x: number; y: number; left: number; top: number; value: string } | null>(null);
  const [textAnnotations, setTextAnnotations] = useState<TextAnnotation[]>([]);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const draggingRef = useRef<{ id: string; startClientX: number; startClientY: number; startX: number; startY: number } | null>(null);
  const idCounterRef = useRef(0);

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
    // Prevents the browser's default mousedown-driven focus/blur handling from
    // immediately stealing focus back from the text-tool's autoFocus input.
    e.preventDefault();

    const canvas = pages[pageIndex];
    if (!canvas) return;

    if (tool === "move") {
      setSelectedAnnotationId(null);
      return;
    }

    if (tool === "text") {
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      const pos = getCanvasPos(e, canvas);
      const { left, top } = canvasToScreen(canvas, wrapper, pos.x, pos.y);
      setTextInput({ x: pos.x, y: pos.y, left, top, value: "" });
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
    if (textInput.value.trim()) {
      const id = `ann-${++idCounterRef.current}`;
      setTextAnnotations((prev) => [
        ...prev,
        { id, pageIndex, x: textInput.x, y: textInput.y, text: textInput.value, color, fontSize: TEXT_FONT_SIZE },
      ]);
      setSelectedAnnotationId(id);
    }
    setTextInput(null);
  };

  const handleAnnotationPointerDown = (e: React.PointerEvent<HTMLDivElement>, a: TextAnnotation) => {
    // Only intercept in the move tool — otherwise let the click bubble to the
    // container so pen/text tools still work "through" an existing annotation.
    if (tool !== "move") return;
    e.stopPropagation();
    e.preventDefault();
    setSelectedAnnotationId(a.id);
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = { id: a.id, startClientX: e.clientX, startClientY: e.clientY, startX: a.x, startY: a.y };
  };

  const handleAnnotationPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = draggingRef.current;
    const canvas = pages[pageIndex];
    if (!drag || !canvas) return;
    const scale = getScale(canvas);
    const dx = (e.clientX - drag.startClientX) / scale;
    const dy = (e.clientY - drag.startClientY) / scale;
    setTextAnnotations((prev) =>
      prev.map((a) => (a.id === drag.id ? { ...a, x: drag.startX + dx, y: drag.startY + dy } : a)),
    );
  };

  const handleAnnotationPointerUp = () => {
    draggingRef.current = null;
  };

  const resizeAnnotation = (id: string, delta: number) => {
    setTextAnnotations((prev) =>
      prev.map((a) => (a.id === id ? { ...a, fontSize: Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, a.fontSize + delta)) } : a)),
    );
  };

  const deleteAnnotation = (id: string) => {
    setTextAnnotations((prev) => prev.filter((a) => a.id !== id));
    setSelectedAnnotationId((cur) => (cur === id ? null : cur));
  };

  const handleClearPage = () => {
    const canvas = pages[pageIndex];
    const original = originalsRef.current[pageIndex];
    if (!canvas || !original) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(original, 0, 0);
    setTextAnnotations((prev) => prev.filter((a) => a.pageIndex !== pageIndex));
    setSelectedAnnotationId(null);
  };

  const stampAnnotations = (source: HTMLCanvasElement, idx: number) => {
    const anns = textAnnotations.filter((a) => a.pageIndex === idx);
    if (anns.length === 0) return source;
    const clone = document.createElement("canvas");
    clone.width = source.width;
    clone.height = source.height;
    const ctx = clone.getContext("2d")!;
    ctx.drawImage(source, 0, 0);
    for (const a of anns) {
      ctx.fillStyle = a.color;
      ctx.font = `${a.fontSize}px sans-serif`;
      ctx.textBaseline = "top";
      ctx.fillText(a.text, a.x, a.y);
    }
    return clone;
  };

  const handleSave = async () => {
    if (pages.length === 0) return;
    setSaving(true);
    try {
      if (isPdf) {
        const pdfDoc = await PDFDocument.create();
        for (let idx = 0; idx < pages.length; idx++) {
          const canvas = stampAnnotations(pages[idx], idx);
          const dataUrl = canvas.toDataURL("image/png");
          const pngBytes = await fetch(dataUrl).then((r) => r.arrayBuffer());
          const pngImage = await pdfDoc.embedPng(pngBytes);
          const page = pdfDoc.addPage([canvas.width, canvas.height]);
          page.drawImage(pngImage, { x: 0, y: 0, width: canvas.width, height: canvas.height });
        }
        const bytes = await pdfDoc.save();
        await onSave(new Blob([bytes as BlobPart], { type: "application/pdf" }), "application/pdf");
      } else {
        const canvas = stampAnnotations(pages[0], 0);
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

  const currentCanvas = pages[pageIndex];
  const wrapper = wrapperRef.current;

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
          <button
            onClick={() => setTool("move")}
            className={`flex items-center justify-center w-8 h-8 rounded-md border transition ${
              tool === "move" ? "border-primary bg-primary/10" : "border-border hover:bg-accent"
            }`}
            aria-label="Move tool"
          >
            <Move className="w-4 h-4" />
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
              disabled={tool !== "pen"}
            >
              <span className="rounded-full bg-foreground" style={{ width: w + 2, height: w + 2 }} />
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={handleClearPage} disabled={loading || pages.length === 0}>
          <Eraser className="w-4 h-4 mr-1" /> Clear {isPdf && pages.length > 1 ? "page" : ""}
        </Button>
      </div>

      <div ref={wrapperRef} className="relative bg-accent/20 border border-border rounded-xl p-3 max-h-[60vh] overflow-auto">
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
            className={tool === "text" ? "cursor-text" : tool === "move" ? "cursor-default" : "cursor-crosshair"}
          />
        )}

        {!loading &&
          !error &&
          currentCanvas &&
          wrapper &&
          textAnnotations
            .filter((a) => a.pageIndex === pageIndex)
            .map((a) => {
              const { left, top, scale } = canvasToScreen(currentCanvas, wrapper, a.x, a.y);
              const selected = a.id === selectedAnnotationId;
              return (
                <div key={a.id} className="absolute" style={{ left, top }}>
                  <div
                    onPointerDown={(e) => handleAnnotationPointerDown(e, a)}
                    onPointerMove={handleAnnotationPointerMove}
                    onPointerUp={handleAnnotationPointerUp}
                    className={`whitespace-pre px-1 rounded ${tool === "move" ? "cursor-move" : ""} ${
                      selected ? "ring-2 ring-primary" : ""
                    }`}
                    style={{ color: a.color, fontSize: a.fontSize * scale }}
                  >
                    {a.text}
                  </div>
                  {selected && tool === "move" && (
                    <div className="absolute -top-9 left-0 flex items-center gap-1 bg-card border border-border rounded-md shadow px-1 py-1 z-10">
                      <button
                        onClick={() => resizeAnnotation(a.id, -4)}
                        className="w-6 h-6 flex items-center justify-center text-xs font-bold hover:bg-accent rounded"
                        aria-label="Smaller text"
                      >
                        A-
                      </button>
                      <button
                        onClick={() => resizeAnnotation(a.id, 4)}
                        className="w-6 h-6 flex items-center justify-center text-xs font-bold hover:bg-accent rounded"
                        aria-label="Larger text"
                      >
                        A+
                      </button>
                      <button
                        onClick={() => deleteAnnotation(a.id)}
                        className="w-6 h-6 flex items-center justify-center hover:bg-destructive/10 rounded"
                        aria-label="Delete text"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

        {textInput && (
          <div
            className="absolute flex items-center gap-1"
            style={{ left: textInput.left, top: textInput.top, transform: "translateY(-50%)" }}
          >
            <input
              autoFocus
              value={textInput.value}
              onChange={(e) => setTextInput({ ...textInput, value: e.target.value })}
              onBlur={commitTextInput}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitTextInput();
                if (e.key === "Escape") setTextInput(null);
              }}
              style={{ color, fontSize: TEXT_FONT_SIZE * 0.75 }}
              className="bg-background/90 border border-dashed border-primary rounded px-1 outline-none"
              placeholder="Type..."
            />
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={commitTextInput}
              className="w-6 h-6 flex items-center justify-center bg-primary text-primary-foreground rounded-full shrink-0"
              aria-label="Confirm text"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          </div>
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
          {saving ? "Saving..." : (saveLabel ?? "Save Annotated File")}
        </Button>
      </div>
    </div>
  );
}
