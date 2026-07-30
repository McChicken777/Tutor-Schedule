import { google } from "googleapis";
import { eq, and, lt, gt } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  calendarTokensTable,
  availabilityOverridesTable,
  bookingsTable,
  DEFAULT_WEEKLY_HOURS,
  type WeeklyHours,
  type DayHours,
} from "@workspace/db";
import { logger } from "./logger";

const DAY_KEYS: Array<keyof WeeklyHours> = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function parseHhMm(value: string): { hour: number; minute: number } {
  const [hour, minute] = value.split(":").map((n) => parseInt(n, 10));
  return { hour: hour || 0, minute: minute || 0 };
}

// ─── Timezone helpers ───────────────────────────────────────────────────────
// The server may run in any timezone (Replit is UTC), but the tutor's weekly
// hours are wall-clock times in HER timezone. These helpers convert between a
// wall-clock time in a given IANA zone and an absolute UTC instant, without any
// external dependency (Node ships full ICU on v18+).

// How far ahead of UTC the given zone is, in ms, at the given instant (DST-aware).
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
  for (const p of dtf.formatToParts(instant)) {
    if (p.type !== "literal") m[p.type] = p.value;
  }
  const asUTC = Date.UTC(+m.year, +m.month - 1, +m.day, +m.hour, +m.minute, +m.second);
  return asUTC - instant.getTime();
}

// Wall-clock time in `timeZone` → absolute UTC instant.
function zonedWallTimeToUtc(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  timeZone: string,
): Date {
  const guessUtc = Date.UTC(y, mo - 1, d, h, mi, 0);
  const off = tzOffsetMs(new Date(guessUtc), timeZone);
  let result = guessUtc - off;
  // Re-check once in case the guess landed on the other side of a DST change.
  const off2 = tzOffsetMs(new Date(result), timeZone);
  if (off2 !== off) result = guessUtc - off2;
  return new Date(result);
}

// "YYYY-MM-DD" calendar date of `instant` as seen in `timeZone`.
function tzDateString(instant: Date, timeZone: string): string {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return dtf.format(instant);
}

function addOneDay(dateStr: string): string {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const next = new Date(Date.UTC(y, mo - 1, d + 1));
  return next.toISOString().slice(0, 10);
}

// Day-of-week (0=Sun..6=Sat) for a calendar date. Timezone-independent.
function dowForDate(dateStr: string): number {
  const [y, mo, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
}

// The absolute UTC start/end instants of a calendar date ("YYYY-MM-DD") as it is
// lived in `timeZone`. e.g. 2026-07-30 in Europe/Madrid → [22:00Z prev day, 22:00Z].
export function zonedDayRange(dateStr: string, timeZone: string): { start: Date; end: Date } {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const start = zonedWallTimeToUtc(y, mo, d, 0, 0, timeZone);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

export function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
}

export async function getAuthenticatedCalendar() {
  const [token] = await db.select().from(calendarTokensTable).limit(1);
  if (!token) return null;

  const auth = createOAuth2Client();
  auth.setCredentials({
    access_token: token.accessToken,
    refresh_token: token.refreshToken,
    expiry_date: token.tokenExpiry?.getTime(),
  });

  // Auto-refresh if needed
  auth.on("tokens", async (tokens) => {
    if (tokens.access_token) {
      await db
        .update(calendarTokensTable)
        .set({
          accessToken: tokens.access_token,
          tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
        })
        .where(eq(calendarTokensTable.id, token.id));
    }
  });

  return google.calendar({ version: "v3", auth });
}

export async function isCalendarConnected(): Promise<boolean> {
  const [token] = await db.select().from(calendarTokensTable).limit(1);
  return !!token?.refreshToken;
}

export async function getCalendarEmail(): Promise<string | null> {
  const [token] = await db.select().from(calendarTokensTable).limit(1);
  return token?.calendarEmail ?? null;
}

// The IANA timezone Google has configured for the tutor's account. Used as the
// authoritative default for her working hours when the calendar is connected.
export async function getCalendarTimezone(): Promise<string | null> {
  const calendar = await getAuthenticatedCalendar();
  if (!calendar) return null;
  try {
    const res = await calendar.settings.get({ setting: "timezone" });
    return res.data.value ?? null;
  } catch (err) {
    logger.warn({ err }, "getCalendarTimezone failed");
    return null;
  }
}

export async function getFreeBusySlots(
  startDate: Date,
  endDate: Date,
): Promise<Array<{ start: Date; end: Date }>> {
  const calendar = await getAuthenticatedCalendar();
  if (!calendar) {
    // No token connected yet — nothing to report. (Not an error; just not set up.)
    return [];
  }

  // Which calendars to scan. Default to "primary"; expand to every calendar
  // visible in the account — including read-only/subscribed ones, since
  // third-party syncs (e.g. AmazingTalker) add their events to a *secondary*
  // calendar the tutor only has reader access to. We don't restrict to
  // owner/writer any more: the all-day-event skip below already protects
  // against holiday/birthday calendars wrongly blocking whole days, so
  // there's no real downside to scanning every calendar.
  let calendarIds: string[] = ["primary"];
  try {
    const calendarList = await calendar.calendarList.list({ maxResults: 250 });
    const all = (calendarList.data.items ?? [])
      .filter((c) => !!c.id && c.hidden !== true)
      .map((c) => c.id as string);
    if (all.length > 0) calendarIds = Array.from(new Set(all));
  } catch (listErr) {
    logger.warn({ err: listErr }, "calendarList.list failed — falling back to primary calendar only");
  }

  // We use events.list rather than freebusy.query on purpose: freebusy only
  // reports events whose visibility is "Busy" and silently omits any event the
  // tutor marked as "Free" — which would let students book over real events.
  // events.list returns every event, so nothing is missed.
  const busy: Array<{ start: Date; end: Date }> = [];
  const seen = new Set<string>(); // dedupe the same event shared across calendars
  let scanned = 0;

  for (const calId of calendarIds) {
    try {
      const evRes = await calendar.events.list({
        calendarId: calId,
        timeMin: startDate.toISOString(),
        timeMax: endDate.toISOString(),
        singleEvents: true, // expand recurring events into individual instances
        orderBy: "startTime",
        maxResults: 2500,
        showDeleted: false,
      });
      scanned++;
      for (const ev of evRes.data.items ?? []) {
        if (ev.status === "cancelled") continue;
        // Ignore events the tutor has declined — she's free then.
        const self = ev.attendees?.find((a) => a.self);
        if (self?.responseStatus === "declined") continue;
        // Only timed events block. All-day events (birthdays, reminders, "OOO"
        // banners) have a `date` but no `dateTime`; blocking a whole day for
        // those would be wrong.
        const start = ev.start?.dateTime;
        const end = ev.end?.dateTime;
        if (!start || !end) continue;
        const key = `${start}|${end}|${ev.summary ?? ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        busy.push({ start: new Date(start), end: new Date(end) });
      }
    } catch (calErr) {
      logger.warn({ err: calErr, calId }, "events.list failed for a calendar — skipping it");
    }
  }

  logger.info(
    {
      calendarsScanned: scanned,
      busyBlocks: busy.length,
      window: [startDate.toISOString(), endDate.toISOString()],
    },
    "getFreeBusySlots (events.list) result",
  );
  return busy;
}

// The single source of truth for "when is the tutor unavailable" over a window:
// Google Calendar busy (all calendars) + in-app date overrides + existing
// upcoming bookings. Everything that reads availability should use this so the
// three sources stay in sync.
export async function getBusyBlocks(
  startDate: Date,
  endDate: Date,
): Promise<Array<{ start: Date; end: Date }>> {
  const googleBusy = await getFreeBusySlots(startDate, endDate);

  const overrides = await db
    .select({ start: availabilityOverridesTable.startTime, end: availabilityOverridesTable.endTime })
    .from(availabilityOverridesTable)
    .where(
      and(
        lt(availabilityOverridesTable.startTime, endDate),
        gt(availabilityOverridesTable.endTime, startDate),
      ),
    );

  const bookings = await db
    .select({ start: bookingsTable.startTime, end: bookingsTable.endTime })
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.status, "upcoming"),
        lt(bookingsTable.startTime, endDate),
        gt(bookingsTable.endTime, startDate),
      ),
    );

  return [...googleBusy, ...overrides, ...bookings];
}

export async function createCalendarEventWithMeet(
  title: string,
  startTime: Date,
  endTime: Date,
  attendeeEmail: string,
  description?: string,
): Promise<{ eventId: string; meetLink: string } | null> {
  const calendar = await getAuthenticatedCalendar();
  if (!calendar) return null;

  try {
    const res = await calendar.events.insert({
      calendarId: "primary",
      conferenceDataVersion: 1,
      sendUpdates: "all",
      requestBody: {
        summary: title,
        description: description ?? "",
        start: { dateTime: startTime.toISOString() },
        end: { dateTime: endTime.toISOString() },
        attendees: [{ email: attendeeEmail }],
        conferenceData: {
          createRequest: {
            requestId: `meet-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      },
    });

    const eventId = res.data.id!;
    const meetLink =
      res.data.conferenceData?.entryPoints?.find((ep) => ep.entryPointType === "video")?.uri ??
      res.data.hangoutLink ??
      "";

    return { eventId, meetLink };
  } catch {
    return null;
  }
}

export async function deleteCalendarEvent(eventId: string): Promise<void> {
  const calendar = await getAuthenticatedCalendar();
  if (!calendar) return;
  try {
    await calendar.events.delete({ calendarId: "primary", eventId });
  } catch {
    // Ignore — event may already be deleted
  }
}

export function generateAvailableSlots(
  busySlots: Array<{ start: Date; end: Date }>,
  startDate: Date,
  endDate: Date,
  durationMinutes: number,
  weeklyHours: WeeklyHours = DEFAULT_WEEKLY_HOURS,
  slotIntervalMinutes = 30,
  timeZone = "UTC",
): Array<{ startTime: Date; endTime: Date; available: boolean }> {
  // Returns EVERY candidate slot within working hours, flagged available/busy,
  // so the UI can grey out taken times rather than hiding them. Past slots are
  // still excluded entirely.
  //
  // Working hours are wall-clock times in the tutor's `timeZone`, converted to
  // absolute UTC instants here. This makes slot times correct regardless of the
  // server's own timezone (Replit runs in UTC).
  const slots: Array<{ startTime: Date; endTime: Date; available: boolean }> = [];
  const now = new Date();

  // Walk calendar days in the tutor's timezone from the start to the end date.
  let dateStr = tzDateString(startDate, timeZone);
  const lastDateStr = tzDateString(endDate, timeZone);

  while (dateStr <= lastDateStr) {
    const [y, mo, d] = dateStr.split("-").map(Number);
    const dayHours: DayHours = weeklyHours[DAY_KEYS[dowForDate(dateStr)]];

    if (dayHours.enabled) {
      const { hour: startHour, minute: startMinute } = parseHhMm(dayHours.start);
      const { hour: endHour, minute: endMinute } = parseHhMm(dayHours.end);

      const dayEnd = zonedWallTimeToUtc(y, mo, d, endHour, endMinute, timeZone);
      let slotStart = zonedWallTimeToUtc(y, mo, d, startHour, startMinute, timeZone);

      while (slotStart < dayEnd) {
        const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60 * 1000);
        if (slotEnd > dayEnd) break;

        // Keep only slots inside the requested window and in the future.
        if (slotStart > now && slotStart >= startDate && slotStart <= endDate) {
          const isBusy = busySlots.some(
            (busy) => slotStart < busy.end && slotEnd > busy.start,
          );
          slots.push({ startTime: new Date(slotStart), endTime: new Date(slotEnd), available: !isBusy });
        }

        slotStart = new Date(slotStart.getTime() + slotIntervalMinutes * 60 * 1000);
      }
    }

    dateStr = addOneDay(dateStr);
  }

  return slots;
}
