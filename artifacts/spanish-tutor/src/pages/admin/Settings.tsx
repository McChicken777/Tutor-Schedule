import { useState, useEffect, useMemo } from "react";
import { useGetAdminSiteSettings, useUpdateSiteSettings, useGetCalendarStatus, useDisconnectCalendar } from "@workspace/api-client-react";
import type { WeeklyHours, DayHours } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getGetAdminSiteSettingsQueryKey, getGetSiteSettingsQueryKey, getGetCalendarStatusQueryKey } from "@workspace/api-client-react";
import { Calendar as CalendarIcon, CheckCircle2, AlertCircle, Unlink, Clock } from "lucide-react";

const DAY_LABELS: Array<{ key: keyof WeeklyHours; label: string }> = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

const DEFAULT_DAY_HOURS: DayHours = { enabled: true, start: "09:00", end: "20:00" };
const DEFAULT_WEEKLY_HOURS: WeeklyHours = {
  mon: { ...DEFAULT_DAY_HOURS },
  tue: { ...DEFAULT_DAY_HOURS },
  wed: { ...DEFAULT_DAY_HOURS },
  thu: { ...DEFAULT_DAY_HOURS },
  fri: { ...DEFAULT_DAY_HOURS },
  sat: { ...DEFAULT_DAY_HOURS },
  sun: { ...DEFAULT_DAY_HOURS },
};

export default function AdminSettings() {
  const { data: settings, isLoading } = useGetAdminSiteSettings();
  const { data: calendarStatus, refetch: refetchCalendarStatus } = useGetCalendarStatus();
  const updateMutation = useUpdateSiteSettings();
  const disconnectMutation = useDisconnectCalendar();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    tutorName: "",
    tutorBio: "",
    contactEmail: "",
    tutorPhotoUrl: "",
    freeTrialEnabled: false,
  });
  const [weeklyHours, setWeeklyHours] = useState<WeeklyHours>(DEFAULT_WEEKLY_HOURS);

  // Timezone the working hours are expressed in. Defaults to whatever the
  // teacher's device reports; can be overridden here.
  const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const [timezone, setTimezone] = useState<string>(detectedTz);
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
    setWeeklyHours((prev) => ({ ...prev, [day]: { ...prev[day], ...patch } }));
  };

  // Handle OAuth callback params in the hash
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.split("?")[1] ?? "");
    if (params.get("calendarConnected") === "1") {
      toast({ title: "Google Calendar connected!" });
      refetchCalendarStatus();
      // Clean up URL
      window.history.replaceState(null, "", window.location.pathname + window.location.search + "#/settings");
    } else if (params.get("calendarError")) {
      const reason = params.get("calendarError");
      toast({
        title: "Failed to connect Google Calendar",
        description: reason === "missing_refresh_token" ? "No refresh token returned. Try revoking access in Google and reconnecting." : "An error occurred during authorization.",
        variant: "destructive",
      });
      window.history.replaceState(null, "", window.location.pathname + window.location.search + "#/settings");
    }
  }, []);

  useEffect(() => {
    if (settings) {
      setFormData({
        tutorName: settings.tutorName,
        tutorBio: settings.tutorBio,
        contactEmail: settings.contactEmail,
        tutorPhotoUrl: settings.tutorPhotoUrl || "",
        freeTrialEnabled: settings.freeTrialEnabled,
      });
      if (settings.weeklyHours) {
        setWeeklyHours(settings.weeklyHours);
      }
      // Prefill with the saved zone, or the device's zone if it was never set.
      setTimezone(settings.timezone && settings.timezone !== "UTC" ? settings.timezone : detectedTz);
    }
  }, [settings]);

  const handleDisconnect = () => {
    disconnectMutation.mutate(undefined, {
      onSuccess: () => {
        toast({ title: "Google Calendar disconnected" });
        qc.invalidateQueries({ queryKey: getGetCalendarStatusQueryKey() });
      },
      onError: () => {
        toast({ title: "Failed to disconnect", variant: "destructive" });
      },
    });
  };

  const handleSave = () => {
    updateMutation.mutate({ data: { ...formData, weeklyHours, timezone } }, {
      onSuccess: () => {
        toast({ title: "Settings saved" });
        qc.invalidateQueries({ queryKey: getGetAdminSiteSettingsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetSiteSettingsQueryKey() });
      }
    });
  };

  return (
    <div className="p-6 md:p-10 bg-background min-h-full max-w-4xl">
      <h1 className="text-3xl font-serif font-bold text-foreground mb-8">Settings</h1>

      <div className="grid gap-8">
        {/* Calendar Integration */}
        <div className="bg-card border border-border rounded-3xl p-8">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-primary" /> Google Calendar Integration
          </h2>
          {calendarStatus?.connected ? (
            <div className="flex items-center justify-between p-4 bg-secondary/10 rounded-xl border border-secondary/20">
              <div className="flex items-center gap-3 text-secondary">
                <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                <div>
                  <p className="font-bold">Connected</p>
                  <p className="text-sm opacity-90">{calendarStatus.calendarEmail}</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDisconnect}
                disabled={disconnectMutation.isPending}
                className="flex items-center gap-2 text-destructive border-destructive/40 hover:bg-destructive/10"
              >
                <Unlink className="w-4 h-4" />
                Disconnect
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between p-4 bg-accent rounded-xl border border-border">
              <div className="flex items-center gap-3 text-muted-foreground">
                <AlertCircle className="w-5 h-5 text-[#f59e0b]" />
                <p className="font-medium">Not connected</p>
              </div>
              <Button asChild>
                <a href="/api/calendar/auth">Connect Google Calendar</a>
              </Button>
            </div>
          )}
          <p className="text-sm text-muted-foreground mt-4">
            Connect your Google Calendar to automatically block busy times and add new lessons to your schedule.
          </p>
        </div>

        {/* Working Hours */}
        <div className="bg-card border border-border rounded-3xl p-8">
          <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" /> Working Hours
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            Students can only book within these hours. For a one-off day off or vacation, just add an event
            to your Google Calendar for that time — it's automatically blocked too.
          </p>

          <div className="mb-6 pb-6 border-b border-border">
            <label className="text-sm font-medium mb-2 block">Your timezone</label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full max-w-sm h-10 rounded-md border border-border bg-background px-3 text-sm"
            >
              {tzOptions.map((z) => (
                <option key={z} value={z}>
                  {z.replace(/_/g, " ")}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground mt-1.5">
              The working hours below are in this timezone. Each student sees times converted to their own.
              Detected from your device: {detectedTz.replace(/_/g, " ")}.
            </p>
          </div>

          <div className="space-y-2">
            {DAY_LABELS.map(({ key, label }) => {
              const day = weeklyHours[key];
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
            <Button onClick={handleSave} disabled={updateMutation.isPending} size="lg">
              Save Changes
            </Button>
          </div>
        </div>

        {/* Site Content */}
        {isLoading ? (
          <Skeleton className="h-96 w-full rounded-3xl" />
        ) : (
          <div className="bg-card border border-border rounded-3xl p-8 space-y-6">
            <h2 className="text-xl font-bold mb-6">Site Content</h2>
            
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="text-sm font-medium mb-2 block">Tutor Name</label>
                <Input value={formData.tutorName} onChange={e => setFormData({...formData, tutorName: e.target.value})} />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Contact Email</label>
                <Input value={formData.contactEmail} onChange={e => setFormData({...formData, contactEmail: e.target.value})} />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Tutor Photo URL</label>
              <Input value={formData.tutorPhotoUrl} onChange={e => setFormData({...formData, tutorPhotoUrl: e.target.value})} placeholder="https://..." />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Bio</label>
              <Textarea value={formData.tutorBio} onChange={e => setFormData({...formData, tutorBio: e.target.value})} className="h-40" />
            </div>

            <div className="flex items-center justify-between p-4 bg-accent/50 rounded-xl border border-border">
              <div>
                <h3 className="font-bold text-foreground">Free Trial Lesson</h3>
                <p className="text-sm text-muted-foreground">Allow new students to book a free 30-min trial.</p>
              </div>
              <Switch checked={formData.freeTrialEnabled} onCheckedChange={(v) => setFormData({...formData, freeTrialEnabled: v})} />
            </div>

            <div className="pt-4 flex justify-end">
              <Button onClick={handleSave} disabled={updateMutation.isPending} size="lg">
                Save Changes
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
