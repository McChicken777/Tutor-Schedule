import { useState, useEffect, useMemo, type CSSProperties } from "react";
import { format, startOfDay, isBefore } from "date-fns";
import {
  useListAvailabilityOverrides,
  useSetDayAvailabilityOverrides,
  useDeleteAvailabilityOverride,
  useGetAdminSiteSettings,
  useUpdateSiteSettings,
  useGetCalendarBusy,
  getListAvailabilityOverridesQueryKey,
  getGetCalendarBusyQueryKey,
  getGetAdminSiteSettingsQueryKey,
  getGetSiteSettingsQueryKey,
} from "@workspace/api-client-react";
import type { WeeklyHours, DayHours } from "@workspace/api-client-react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Trash2, CalendarOff, Clock } from "lucide-react";

const DAY_LABELS: Array<{ key: keyof WeeklyHours; label: string }> = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

// Fallback so the chip editor still works if a settings row has no weeklyHours
// saved yet (mirrors the default used on the Settings page).
const DEFAULT_DAY_HOURS = { enabled: true, start: "09:00", end: "20:00" };
const DEFAULT_WEEKLY_HOURS: WeeklyHours = {
  mon: { ...DEFAULT_DAY_HOURS },
  tue: { ...DEFAULT_DAY_HOURS },
  wed: { ...DEFAULT_DAY_HOURS },
  thu: { ...DEFAULT_DAY_HOURS },
  fri: { ...DEFAULT_DAY_HOURS },
  sat: { ...DEFAULT_DAY_HOURS },
  sun: { ...DEFAULT_DAY_HOURS },
};

function parseHhMm(v: string) {
  const parts = v.split(":").map(Number);
  return { hour: parts[0] || 0, minute: parts[1] || 0 };
}

// How far ahead of UTC `timeZone` is (ms) at the given instant — DST aware.
function tzOffsetMs(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const m: Record<string, string> = {};
  for (const p of dtf.formatToParts(instant)) if (p.type !== "literal") m[p.type] = p.value;
  const asUTC = Date.UTC(+m.year, +m.month - 1, +m.day, +m.hour, +m.minute, +m.second);
  return asUTC - instant.getTime();
}

// Wall-clock time in `timeZone` → absolute UTC instant. Mirrors the server so
// chips map to exactly the same instants the booking engine generates.
function zonedWallTimeToUtc(y: number, mo: number, d: number, h: number, mi: number, timeZone: string): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi, 0);
  const off = tzOffsetMs(new Date(guess), timeZone);
  let result = guess - off;
  const off2 = tzOffsetMs(new Date(result), timeZone);
  if (off2 !== off) result = guess - off2;
  return new Date(result);
}

// "h:mm a" label for an instant, rendered in the tutor's configured timezone.
function formatInTz(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(instant);
}

function generateChips(dateStr: string, start: string, end: string, timeZone: string) {
  const { hour: sh, minute: sm } = parseHhMm(start);
  const { hour: eh, minute: em } = parseHhMm(end);
  const [y, mo, d] = dateStr.split("-").map(Number);
  // Build chip instants at the tutor's configured wall-clock timezone so they
  // line up with the server's slot engine AND with the absolute instants Google
  // Calendar events sit at.
  const chips: { startTime: Date; endTime: Date }[] = [];
  let cur = zonedWallTimeToUtc(y, mo, d, sh, sm, timeZone).getTime();
  const endMs = zonedWallTimeToUtc(y, mo, d, eh, em, timeZone).getTime();
  while (cur + 30 * 60000 <= endMs) {
    chips.push({ startTime: new Date(cur), endTime: new Date(cur + 30 * 60000) });
    cur += 30 * 60000;
  }
  return chips;
}

function mergeBlockedChips(chips: { startTime: Date; endTime: Date }[], blocked: Set<number>) {
  const sorted = [...blocked].sort((a, b) => a - b);
  const ranges: { startTime: string; endTime: string }[] = [];
  let rangeStart: Date | null = null;
  let prev: number | null = null;
  for (const idx of sorted) {
    if (prev === null || idx !== prev + 1) {
      if (rangeStart !== null && prev !== null) {
        ranges.push({ startTime: rangeStart.toISOString(), endTime: chips[prev].endTime.toISOString() });
      }
      rangeStart = chips[idx].startTime;
    }
    prev = idx;
  }
  if (rangeStart !== null && prev !== null) {
    ranges.push({ startTime: rangeStart.toISOString(), endTime: chips[prev].endTime.toISOString() });
  }
  return ranges;
}

export default function AdminAvailability() {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [blockedChips, setBlockedChips] = useState<Set<number>>(new Set());
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: overrides } = useListAvailabilityOverrides();
  const { data: settings, isLoading: settingsLoading } = useGetAdminSiteSettings();
  const setDayMutation = useSetDayAvailabilityOverrides();
  const deleteMutation = useDeleteAvailabilityOverride();
  const updateSettings = useUpdateSiteSettings();

  const weeklyHours: WeeklyHours = settings?.weeklyHours ?? DEFAULT_WEEKLY_HOURS;

  // ─── Working-hours + timezone editor (draft state) ─────────────────────────
  const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const [whDraft, setWhDraft] = useState<WeeklyHours>(DEFAULT_WEEKLY_HOURS);
  const [tzDraft, setTzDraft] = useState<string>(detectedTz);

  useEffect(() => {
    if (settings?.weeklyHours) setWhDraft(settings.weeklyHours);
    setTzDraft(
      settings?.timezone && settings.timezone !== "UTC" ? settings.timezone : detectedTz,
    );
  }, [settings]);

  const tzOptions = useMemo(() => {
    let zones: string[] = [];
    try {
      const sv = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
      if (sv) zones = sv("timeZone");
    } catch {
      zones = [];
    }
    if (zones.length === 0) {
      zones = [
        "UTC", "Europe/Madrid", "Europe/London", "Europe/Paris", "Europe/Berlin",
        "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
        "America/Mexico_City", "America/Bogota", "America/Argentina/Buenos_Aires",
      ];
    }
    if (!zones.includes(detectedTz)) zones = [detectedTz, ...zones];
    return zones;
  }, [detectedTz]);

  const updateDayHours = (day: keyof WeeklyHours, patch: Partial<DayHours>) => {
    setWhDraft((prev) => ({ ...prev, [day]: { ...prev[day], ...patch } }));
  };

  const handleSaveHours = () => {
    updateSettings.mutate(
      { data: { weeklyHours: whDraft, timezone: tzDraft } },
      {
        onSuccess: () => {
          toast({ title: "Working hours saved" });
          qc.invalidateQueries({ queryKey: getGetAdminSiteSettingsQueryKey() });
          qc.invalidateQueries({ queryKey: getGetSiteSettingsQueryKey() });
        },
        onError: () => toast({ title: "Failed to save", variant: "destructive" }),
      },
    );
  };
  // Treat the default "UTC" as "not configured yet" and fall back to the
  // teacher's actual device timezone, so times aren't silently shifted.
  const tz =
    settings?.timezone && settings.timezone !== "UTC"
      ? settings.timezone
      : Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  const dateStr = selectedDate ? format(selectedDate, "yyyy-MM-dd") : null;

  const gcalBusyParams = { date: dateStr ?? "" };
  const {
    data: gcalBusy,
    isLoading: gcalLoading,
    isError: gcalError,
  } = useGetCalendarBusy(gcalBusyParams, {
    query: { enabled: !!dateStr, queryKey: getGetCalendarBusyQueryKey(gcalBusyParams) },
  });
  const dayKey = selectedDate ? DAY_KEYS[selectedDate.getDay()] : null;
  const dayHours = dayKey && weeklyHours ? weeklyHours[dayKey] : null;

  const chips = useMemo(() => {
    if (!dateStr || !dayHours?.enabled) return [];
    const all = generateChips(dateStr, dayHours.start, dayHours.end, tz);
    // For today, hide time slots that have already passed — nothing to
    // manage there since students can't book them either.
    const isToday = dateStr === format(new Date(), "yyyy-MM-dd");
    if (!isToday) return all;
    const now = Date.now();
    return all.filter((c) => c.startTime.getTime() > now);
  }, [dateStr, dayHours, tz]);

  // Chip indices that are already occupied by a Google Calendar event — grey + non-interactive
  const gcalBusySet = useMemo(() => {
    const busy = new Set<number>();
    if (!gcalBusy || chips.length === 0) return busy;
    chips.forEach((chip, i) => {
      const cs = chip.startTime.getTime();
      const ce = chip.endTime.getTime();
      if (gcalBusy.some((b) => cs < new Date(b.end).getTime() && ce > new Date(b.start).getTime())) {
        busy.add(i);
      }
    });
    return busy;
  }, [chips, gcalBusy]);

  // Re-derive which chips are blocked whenever date or saved overrides change
  useEffect(() => {
    if (chips.length === 0 || !overrides) {
      setBlockedChips(new Set());
      return;
    }
    const blocked = new Set<number>();
    chips.forEach((chip, i) => {
      const cs = chip.startTime.getTime();
      const ce = chip.endTime.getTime();
      if (
        overrides.some((o) => {
          const os = new Date(o.startTime).getTime();
          const oe = new Date(o.endTime).getTime();
          return cs < oe && ce > os;
        })
      ) {
        blocked.add(i);
      }
    });
    setBlockedChips(blocked);
  }, [chips, overrides]);

  const toggleChip = (i: number) => {
    if (gcalBusySet.has(i)) return;
    setBlockedChips((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const toggleableIndices = chips.map((_, i) => i).filter((i) => !gcalBusySet.has(i));
  const allBlocked = toggleableIndices.length > 0 && toggleableIndices.every((i) => blockedChips.has(i));

  const toggleAll = () => {
    setBlockedChips(allBlocked ? new Set() : new Set(toggleableIndices));
  };

  const handleSave = () => {
    if (!dateStr) return;
    const blocks = mergeBlockedChips(chips, blockedChips);
    setDayMutation.mutate(
      { data: { date: dateStr, blocks } },
      {
        onSuccess: () => {
          toast({ title: "Availability saved" });
          qc.invalidateQueries({ queryKey: getListAvailabilityOverridesQueryKey() });
        },
        onError: () => toast({ title: "Failed to save", variant: "destructive" }),
      },
    );
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListAvailabilityOverridesQueryKey() });
        },
        onError: () => toast({ title: "Delete failed", variant: "destructive" }),
      },
    );
  };

  // Group upcoming overrides by date for the summary list
  const groupedOverrides = useMemo(() => {
    if (!overrides) return [];
    const map = new Map<string, typeof overrides>();
    for (const o of overrides) {
      const d = o.startTime.slice(0, 10);
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(o);
    }
    return [...map.entries()].map(([d, rows]) => ({ dateLabel: d, rows }));
  }, [overrides]);

  return (
    <div className="p-6 md:p-10 bg-background min-h-full max-w-5xl mx-auto w-full">
      <h1 className="text-3xl font-serif font-bold text-foreground mb-2">Availability</h1>
      <p className="text-muted-foreground mb-8">
        Set your weekly working hours, then block specific times or full days on top of them.
        Times are shown in your timezone ({tz.replace(/_/g, " ")}).
      </p>

      {/* Working hours + timezone editor */}
      <div className="bg-card border border-border rounded-3xl p-6 md:p-8 mb-8">
        <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary" /> Weekly working hours
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          Students can only book within these hours. For a one-off day off, block the day below or
          add an event to your Google Calendar — both are respected automatically.
        </p>

        <div className="mb-6 pb-6 border-b border-border">
          <label className="text-sm font-medium mb-2 block">Your timezone</label>
          <select
            value={tzDraft}
            onChange={(e) => setTzDraft(e.target.value)}
            className="w-full max-w-sm h-10 rounded-md border border-border bg-background px-3 text-sm"
          >
            {tzOptions.map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground mt-1.5">
            Working hours below are in this timezone; each student sees times in their own.
            Detected from your device: {detectedTz.replace(/_/g, " ")}.
          </p>
        </div>

        <div className="space-y-2">
          {DAY_LABELS.map(({ key, label }) => {
            const day = whDraft[key];
            return (
              <div
                key={key}
                className="flex items-center gap-4 py-2.5 border-b border-border last:border-b-0"
              >
                <Switch
                  checked={day.enabled}
                  onCheckedChange={(v) => updateDayHours(key, { enabled: v })}
                />
                <span className={`w-28 text-sm font-medium ${day.enabled ? "text-foreground" : "text-muted-foreground"}`}>
                  {label}
                </span>
                {day.enabled ? (
                  <div className="flex items-center gap-2">
                    <Input
                      type="time"
                      value={day.start}
                      onChange={(e) => updateDayHours(key, { start: e.target.value })}
                      className="w-32"
                    />
                    <span className="text-muted-foreground text-sm">to</span>
                    <Input
                      type="time"
                      value={day.end}
                      onChange={(e) => updateDayHours(key, { end: e.target.value })}
                      className="w-32"
                    />
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">Closed</span>
                )}
              </div>
            );
          })}
        </div>
        <div className="pt-6 flex justify-end">
          <Button onClick={handleSaveHours} disabled={updateSettings.isPending}>
            {updateSettings.isPending ? "Saving…" : "Save working hours"}
          </Button>
        </div>
      </div>

      <div className="grid md:grid-cols-[minmax(0,420px)_1fr] gap-8">
        {/* Calendar picker */}
        <div>
          <div className="bg-card p-6 rounded-3xl border border-border">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(d) => setSelectedDate(d)}
              disabled={(d) => isBefore(d, startOfDay(new Date()))}
              className="bg-transparent"
              classNames={{ root: "w-full", month: "flex w-full flex-col gap-4" }}
              style={{ "--cell-size": "3.25rem" } as CSSProperties}
            />
          </div>
        </div>

        {/* Time chip editor */}
        <div>
          {!selectedDate ? (
            <div className="flex items-center justify-center h-48 rounded-2xl bg-accent text-muted-foreground text-sm">
              Select a date to manage its availability
            </div>
          ) : settingsLoading ? (
            <div className="space-y-2">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-xl" />
              ))}
            </div>
          ) : dayHours && !dayHours.enabled ? (
            <div className="flex flex-col items-center justify-center h-48 rounded-2xl bg-accent text-center p-6 gap-3">
              <CalendarOff className="w-8 h-8 text-muted-foreground" />
              <div>
                <p className="font-medium text-foreground">Day off</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {format(selectedDate, "EEEE")}s are already disabled in your weekly schedule.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-foreground">{format(selectedDate, "EEEE, MMMM d")}</h3>
                <button
                  onClick={toggleAll}
                  className="text-sm text-primary hover:underline font-medium"
                >
                  {allBlocked ? "Unblock all" : "Block whole day"}
                </button>
              </div>

              {/* Google Calendar sync status — tells us exactly what the
                  backend returned for this day so calendar issues are visible. */}
              <div className="mb-3 text-xs rounded-lg px-3 py-2 bg-accent/60 text-muted-foreground">
                {gcalLoading
                  ? "Checking Google Calendar…"
                  : gcalError
                    ? "⚠️ Couldn't reach Google Calendar (check that it's connected)."
                    : (gcalBusy?.length ?? 0) === 0
                      ? "Google Calendar: no events on this day."
                      : `Google Calendar: ${gcalBusy!.length} event${gcalBusy!.length === 1 ? "" : "s"} on this day — ${gcalBusy!
                          .map((b) => `${formatInTz(new Date(b.start), tz)}–${formatInTz(new Date(b.end), tz)}`)
                          .join(", ")}`}
              </div>

              <div className="grid grid-cols-3 gap-2 mb-3">
                {chips.map((chip, i) => {
                  const isGcalBusy = gcalBusySet.has(i);
                  const isBlocked = blockedChips.has(i);
                  return (
                    <button
                      key={i}
                      onClick={() => toggleChip(i)}
                      disabled={isGcalBusy}
                      title={isGcalBusy ? "Already in Google Calendar" : undefined}
                      className={`py-2.5 px-3 rounded-xl text-sm font-medium transition border ${
                        isGcalBusy
                          ? "bg-muted text-muted-foreground border-transparent cursor-not-allowed opacity-60"
                          : isBlocked
                            ? "bg-destructive/10 text-destructive border-destructive/25 hover:bg-destructive/20"
                            : "bg-accent text-foreground border-transparent hover:border-primary/30 hover:bg-primary/5"
                      }`}
                    >
                      {formatInTz(chip.startTime, tz)}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-4 mb-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-accent border border-border inline-block" />
                  Free
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-destructive/20 border border-destructive/25 inline-block" />
                  Blocked by you
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-muted opacity-60 inline-block" />
                  Google Calendar
                </span>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {blockedChips.size === 0
                    ? "All slots open"
                    : `${blockedChips.size} slot${blockedChips.size === 1 ? "" : "s"} blocked`}
                </p>
                <Button onClick={handleSave} disabled={setDayMutation.isPending} size="sm">
                  {setDayMutation.isPending ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Upcoming blocked times summary */}
      {groupedOverrides.length > 0 && (
        <div className="mt-12">
          <h2 className="text-xl font-bold mb-4">Upcoming blocks</h2>
          <div className="space-y-4">
            {groupedOverrides.map(({ dateLabel, rows }) => (
              <div key={dateLabel} className="bg-card border border-border rounded-2xl p-4">
                <p className="font-semibold text-foreground mb-3">
                  {format(new Date(dateLabel + "T12:00:00"), "EEEE, MMMM d, yyyy")}
                </p>
                <div className="space-y-2">
                  {rows.map((row) => (
                    <div key={row.id} className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        {formatInTz(new Date(row.startTime), tz)} –{" "}
                        {formatInTz(new Date(row.endTime), tz)}
                      </span>
                      <button
                        onClick={() => handleDelete(row.id)}
                        disabled={deleteMutation.isPending}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
                        title="Delete this block"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
