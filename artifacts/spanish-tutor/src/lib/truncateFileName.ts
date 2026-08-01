export function truncateFileName(name: string, keepChars = 5): string {
  const dotIndex = name.lastIndexOf(".");
  const hasExt = dotIndex > 0 && dotIndex < name.length - 1;
  const base = hasExt ? name.slice(0, dotIndex) : name;
  const ext = hasExt ? name.slice(dotIndex) : "";

  if (base.length <= keepChars + 3) return name;
  return `…${base.slice(-keepChars)}${ext}`;
}
