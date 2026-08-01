import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

export function useFilePages(fileUrl: string, mimeType: string) {
  const isPdf = mimeType === "application/pdf";
  const [pages, setPages] = useState<HTMLCanvasElement[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const originalsRef = useRef<HTMLCanvasElement[]>([]);

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
            img.onerror = () => reject(new Error("Could not load this image."));
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
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load file.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [fileUrl, isPdf]);

  return { isPdf, pages, pageIndex, setPageIndex, loading, error, originalsRef };
}
