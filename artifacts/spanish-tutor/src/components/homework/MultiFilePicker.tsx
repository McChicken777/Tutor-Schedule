import { useRef } from "react";
import { Paperclip, Camera, X, FileText, Image as ImageIcon } from "lucide-react";

interface MultiFilePickerProps {
  files: File[];
  onFilesChange: (files: File[]) => void;
  accept?: string;
  allowCamera?: boolean;
}

export default function MultiFilePicker({ files, onFilesChange, accept = "application/pdf,image/*", allowCamera = false }: MultiFilePickerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length > 0) onFilesChange([...files, ...picked]);
    e.target.value = "";
  };

  const handleRemove = (index: number) => {
    onFilesChange(files.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-2 border border-dashed border-border rounded-md px-3 py-2 text-sm text-muted-foreground cursor-pointer hover:bg-accent/50 transition">
          <Paperclip className="size-4" />
          Attach files (PDF or image, up to 15MB each)
          <input ref={fileInputRef} type="file" accept={accept} multiple className="hidden" onChange={handlePick} />
        </label>

        {allowCamera && (
          <label className="flex items-center gap-2 border border-dashed border-border rounded-md px-3 py-2 text-sm text-muted-foreground cursor-pointer hover:bg-accent/50 transition">
            <Camera className="size-4" />
            Take a photo
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePick} />
          </label>
        )}
      </div>

      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((file, index) => (
            <div key={`${file.name}-${index}`} className="flex items-center gap-2 bg-accent/60 rounded-lg px-3 py-1.5 text-sm">
              {file.type === "application/pdf" ? <FileText className="size-3.5" /> : <ImageIcon className="size-3.5" />}
              <span className="max-w-[160px] truncate">{file.name}</span>
              <button type="button" onClick={() => handleRemove(index)} aria-label={`Remove ${file.name}`}>
                <X className="size-3.5 text-muted-foreground hover:text-destructive" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
