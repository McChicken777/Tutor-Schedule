import { useState, useEffect } from "react";
import { useGetAdminSiteSettings, useUpdateSiteSettings, useGetCalendarStatus, useDisconnectCalendar } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import ErrorState from "@/components/ErrorState";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getGetAdminSiteSettingsQueryKey, getGetSiteSettingsQueryKey, getGetCalendarStatusQueryKey } from "@workspace/api-client-react";
import { Calendar as CalendarIcon, CheckCircle2, AlertCircle, Unlink } from "lucide-react";

export default function AdminSettings() {
  const { data: settings, isLoading, error, refetch } = useGetAdminSiteSettings();
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
    }
  }, [settings]);

  const handleDisconnect = () => {
    disconnectMutation.mutate(undefined, {
      onSuccess: () => {
        toast({ title: "Google Calendar disconnected" });
        qc.invalidateQueries({ queryKey: getGetCalendarStatusQueryKey() });
      },
    });
  };

  const handleSave = () => {
    updateMutation.mutate({ data: { ...formData } }, {
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

        {/* Site Content */}
        {isLoading ? (
          <Skeleton className="h-96 w-full rounded-3xl" />
        ) : error ? (
          <ErrorState error={error} onRetry={refetch} />
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
