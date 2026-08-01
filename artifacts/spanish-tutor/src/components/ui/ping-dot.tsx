export default function PingDot() {
  return (
    <span className="relative flex w-2.5 h-2.5">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
      <span className="relative inline-flex rounded-full w-2.5 h-2.5 bg-destructive" />
    </span>
  );
}
