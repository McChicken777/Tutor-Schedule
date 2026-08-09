import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetStudentDashboard,
  useCompleteTour,
  getGetStudentDashboardQueryKey,
} from "@workspace/api-client-react";

export type TourStep = {
  /** The nav item this step points at. Matched by href, not by position. */
  href: string;
  title: string;
  description: string;
};

export const TOUR_STEPS: TourStep[] = [
  {
    href: "/dashboard",
    title: "Your dashboard",
    description: "See your next class and how many lessons you have left.",
  },
  {
    href: "/bookings",
    title: "Bookings",
    description: "All your upcoming and past lessons live here.",
  },
  {
    href: "/book",
    title: "Book a lesson",
    description: "Book your free first lesson or a new lesson in a few clicks.",
  },
  {
    href: "/messages",
    title: "Messages",
    description: "Message your teacher directly, anytime.",
  },
];

export function useStudentTour() {
  const { data: dashboard } = useGetStudentDashboard();
  const qc = useQueryClient();
  const completeTour = useCompleteTour();

  const [index, setIndex] = useState(0);
  // Dismissal is tracked locally as well as on the server. The PATCH round-trip
  // plus the dashboard refetch is long enough to see, and on a TEST_STUDENT_EMAIL
  // account the server always replies hasSeenTour:false — without this the tour
  // could never be closed on that account at all.
  const [dismissed, setDismissed] = useState(false);
  const firedRef = useRef(false);

  const active = !!dashboard && !dashboard.hasSeenTour && !dismissed;
  const step = TOUR_STEPS[index] ?? TOUR_STEPS[0]!;
  const isLast = index === TOUR_STEPS.length - 1;

  const finish = useCallback(() => {
    setDismissed(true);
    // A ref, not the mutation's isPending: isPending is state and is still false
    // on the second tap of a fast double-tap, which would fire a duplicate PATCH.
    if (firedRef.current) return;
    firedRef.current = true;
    completeTour.mutate(undefined, {
      onSuccess: () =>
        qc.invalidateQueries({ queryKey: getGetStudentDashboardQueryKey() }),
    });
  }, [completeTour, qc]);

  const next = useCallback(() => {
    if (isLast) finish();
    else setIndex((i) => i + 1);
  }, [isLast, finish]);

  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, finish]);

  return {
    active,
    index,
    step,
    isLast,
    total: TOUR_STEPS.length,
    isHighlighted: (href: string) => active && step.href === href,
    next,
    back,
    finish,
  };
}
