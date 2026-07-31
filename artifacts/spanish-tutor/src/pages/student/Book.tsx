import { useState } from "react";
import { Link, useLocation } from "wouter";
import { format, startOfDay, endOfDay, isBefore } from "date-fns";
import {
  useListLessonTypes,
  useGetAvailableSlots,
  useCreateBooking,
  useGetStudentDashboard,
  getGetAvailableSlotsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, ArrowLeft, ArrowRight, Clock, Lock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import PurchaseCreditsDialog from "@/components/PurchaseCreditsDialog";

export default function BookLesson() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const [selectedLessonType, setSelectedLessonType] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [purchaseTypeId, setPurchaseTypeId] = useState<number | null>(null);

  const { data: dashboard } = useGetStudentDashboard();
  const { data: lessonTypes, isLoading: loadingTypes } = useListLessonTypes();

  const startDate = selectedDate ? startOfDay(selectedDate).toISOString() : startOfDay(new Date()).toISOString();
  const endDate = selectedDate ? endOfDay(selectedDate).toISOString() : endOfDay(new Date()).toISOString();

  const slotsParams = { lessonTypeId: selectedLessonType || 0, startDate, endDate };
  const { data: slots, isLoading: loadingSlots } = useGetAvailableSlots(
    slotsParams,
    { query: { enabled: !!selectedLessonType && !!selectedDate, queryKey: getGetAvailableSlotsQueryKey(slotsParams) } }
  );

  const createMutation = useCreateBooking();

  const activeLessonTypes = lessonTypes?.filter(lt => lt.isActive) || [];
  const selectedTypeDetails = activeLessonTypes.find(lt => lt.id === selectedLessonType);
  const remainingForSelected = dashboard?.packages?.find(p => p.lessonTypeId === selectedLessonType)?.remainingCredits ?? 0;
  const trialLessonTypeExists = activeLessonTypes.some(lt => lt.isTrial);

  // A lesson type is bookable if it's the trial (and not yet used) or the
  // student already has credits for it — locked cards can't be selected at
  // all, so there's nothing to reject at confirm time.
  function isBookable(lt: (typeof activeLessonTypes)[number]): boolean {
    if (lt.isTrial) return !!dashboard?.trialAvailable;
    const remaining = dashboard?.packages?.find(p => p.lessonTypeId === lt.id)?.remainingCredits ?? 0;
    return remaining > 0;
  }

  function lockReason(lt: (typeof activeLessonTypes)[number]): string {
    if (lt.isTrial) return "Trial already used";
    if (trialLessonTypeExists && dashboard?.trialAvailable) return "Complete your free trial first";
    return "Out of credits";
  }

  function canBuyCredits(lt: (typeof activeLessonTypes)[number]): boolean {
    if (lt.isTrial) return false;
    if (trialLessonTypeExists && dashboard?.trialAvailable) return false;
    return true;
  }

  const handleBook = () => {
    if (!selectedLessonType || !selectedSlot) return;
    createMutation.mutate({ data: { lessonTypeId: selectedLessonType, startTime: selectedSlot } }, {
      onSuccess: (data) => {
        toast({ title: "Lesson booked successfully!" });
        setLocation(`/bookings/${data.id}`);
      },
    });
  };

  return (
    <div className="p-6 md:p-10 bg-background min-h-full max-w-5xl mx-auto w-full">
      <h1 className="text-3xl font-serif font-bold text-foreground mb-8">Book a Lesson</h1>

      {/* Progress Steps */}
      <div className="flex items-center gap-4 mb-10">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-4">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
              step >= s ? "bg-primary text-primary-foreground" : "bg-accent text-muted-foreground"
            }`}>
              {step > s ? <CheckCircle2 className="w-5 h-5" /> : s}
            </div>
            {s < 3 && <div className={`h-1 w-12 sm:w-24 rounded ${step > s ? "bg-primary" : "bg-accent"}`} />}
          </div>
        ))}
      </div>

      {step === 1 && (
        <div>
          <h2 className="text-2xl font-bold mb-6">Select a Lesson Type</h2>
          {loadingTypes ? (
            <div className="grid md:grid-cols-2 gap-6">
              <Skeleton className="h-40 rounded-3xl" />
              <Skeleton className="h-40 rounded-3xl" />
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-6">
              {activeLessonTypes.map(lt => {
                const bookable = isBookable(lt);
                return (
                  <div
                    key={lt.id}
                    role="button"
                    tabIndex={bookable ? 0 : -1}
                    onClick={() => bookable && setSelectedLessonType(lt.id)}
                    className={`text-left p-6 rounded-3xl border-2 transition-all ${
                      !bookable
                        ? "border-border bg-accent/30 opacity-90"
                        : selectedLessonType === lt.id
                          ? "border-primary bg-primary/5 shadow-md cursor-pointer"
                          : "border-border bg-card hover:border-primary/50 cursor-pointer"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-xl font-bold text-foreground">{lt.name}</h3>
                      {lt.isTrial && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-primary/10 text-primary">Free</span>
                      )}
                    </div>
                    <p className="text-primary font-medium mb-4">
                      {lt.durationMinutes} minutes • {lt.isTrial ? "Free" : `€${(lt.priceCents / 100).toFixed(2)}`}
                    </p>
                    <p className="text-muted-foreground text-sm mb-4">{lt.description}</p>
                    {!bookable && (
                      <div className="flex items-center justify-between gap-2">
                        <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                          <Lock className="w-3.5 h-3.5" />
                          {lockReason(lt)}
                        </p>
                        {canBuyCredits(lt) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => { e.stopPropagation(); setPurchaseTypeId(lt.id); }}
                          >
                            Buy credits
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {activeLessonTypes.length > 0 && activeLessonTypes.every(lt => !isBookable(lt)) && (
            <div className="mt-6 p-4 bg-accent rounded-xl text-sm text-muted-foreground">
              Nothing to book right now.{" "}
              <Link href="/messages" className="text-primary font-medium hover:underline">
                Message your teacher
              </Link>{" "}
              if you have questions.
            </div>
          )}

          <div className="mt-8 flex justify-end">
            <Button onClick={() => setStep(2)} disabled={!selectedLessonType} size="lg" className="px-8">
              Next Step <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <h2 className="text-2xl font-bold mb-6">Choose Date & Time</h2>
          <div className="grid md:grid-cols-2 gap-10">
            <div className="bg-card p-4 rounded-3xl border border-border inline-block self-start">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => { setSelectedDate(date); setSelectedSlot(null); }}
                disabled={(date) => isBefore(date, startOfDay(new Date()))}
                className="bg-transparent"
              />
            </div>
            
            <div>
              <h3 className="font-bold mb-1">
                Available times for {selectedDate ? format(selectedDate, "MMM d, yyyy") : "selected date"}
              </h3>
              <p className="text-xs text-muted-foreground mb-4">
                Shown in your timezone (
                {(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC").replace(/_/g, " ")})
              </p>
              {loadingSlots ? (
                <div className="space-y-2">
                  {[...Array(6)].map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-xl" />
                  ))}
                </div>
              ) : slots && slots.length > 0 ? (
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {slots.map(slot => {
                    const isSelected = selectedSlot === slot.startTime;
                    return (
                      <button
                        key={slot.startTime}
                        onClick={() => slot.available ? setSelectedSlot(slot.startTime) : undefined}
                        disabled={!slot.available}
                        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition ${
                          !slot.available
                            ? "bg-muted text-muted-foreground cursor-not-allowed opacity-60"
                            : isSelected
                              ? "bg-primary text-primary-foreground shadow-md"
                              : "bg-accent text-foreground hover:bg-primary/10"
                        }`}
                      >
                        <span className="font-semibold">{format(new Date(slot.startTime), "h:mm a")}</span>
                        {!slot.available ? (
                          <span className="text-xs">Taken</span>
                        ) : (
                          <span className={`text-xs ${isSelected ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                            until {format(new Date(slot.endTime), "h:mm a")}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="p-8 bg-accent rounded-2xl text-center text-muted-foreground">
                  No slots available on this date.
                </div>
              )}
            </div>
          </div>
          
          <div className="mt-8 flex justify-between">
            <Button onClick={() => setStep(1)} variant="outline" size="lg">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
            <Button onClick={() => setStep(3)} disabled={!selectedSlot} size="lg" className="px-8">
              Review <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      )}

      {step === 3 && selectedTypeDetails && selectedSlot && (
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold mb-6 text-center">Confirm Booking</h2>
          
          <div className="bg-card border border-border rounded-3xl p-8 mb-8">
            <div className="flex items-start justify-between border-b border-border pb-6 mb-6">
              <div>
                <h3 className="text-xl font-bold mb-2">{selectedTypeDetails.name}</h3>
                <p className="text-muted-foreground">{selectedTypeDetails.durationMinutes} minutes</p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-serif font-bold">
                  {selectedTypeDetails.isTrial ? "Free" : `€${(selectedTypeDetails.priceCents / 100).toFixed(2)}`}
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-4 text-lg">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <p className="font-bold">{format(new Date(selectedSlot), "EEEE, MMMM d, yyyy")}</p>
                <p className="text-muted-foreground">{format(new Date(selectedSlot), "h:mm a")}</p>
              </div>
            </div>
            
            <div className="mt-8 pt-6 border-t border-border flex justify-between items-center">
              <span className="text-muted-foreground">Your Balance</span>
              <span className="font-bold">
                {selectedTypeDetails?.isTrial
                  ? "Free — your one-time trial"
                  : `${remainingForSelected} credit${remainingForSelected === 1 ? "" : "s"} for this lesson`}
              </span>
            </div>
          </div>
          
          <div className="flex justify-between">
            <Button onClick={() => setStep(2)} variant="outline" size="lg">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
            <Button onClick={handleBook} disabled={createMutation.isPending} size="lg" className="px-8">
              {createMutation.isPending ? "Confirming..." : "Confirm Booking"}
            </Button>
          </div>
        </div>
      )}

      <PurchaseCreditsDialog
        open={purchaseTypeId != null}
        onOpenChange={(open) => { if (!open) setPurchaseTypeId(null); }}
        initialLessonTypeId={purchaseTypeId ?? undefined}
      />
    </div>
  );
}
