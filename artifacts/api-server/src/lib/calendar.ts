import { google } from "googleapis";
import { db } from "@workspace/db";
import { calendarTokensTable } from "@workspace/db";

function createOAuth2Client() {
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
        .where(undefined as any);
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

export async function getFreeBusySlots(
  startDate: Date,
  endDate: Date,
): Promise<Array<{ start: Date; end: Date }>> {
  const calendar = await getAuthenticatedCalendar();
  if (!calendar) return [];

  try {
    const res = await calendar.freebusy.query({
      requestBody: {
        timeMin: startDate.toISOString(),
        timeMax: endDate.toISOString(),
        items: [{ id: "primary" }],
      },
    });
    const busy = res.data.calendars?.["primary"]?.busy ?? [];
    return busy.map((b) => ({
      start: new Date(b.start!),
      end: new Date(b.end!),
    }));
  } catch {
    return [];
  }
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
  workingHours = { start: 9, end: 20 }, // 9am - 8pm
  slotIntervalMinutes = 60,
): Array<{ startTime: Date; endTime: Date }> {
  const slots: Array<{ startTime: Date; endTime: Date }> = [];
  const current = new Date(startDate);
  current.setHours(workingHours.start, 0, 0, 0);

  while (current < endDate) {
    const dayEnd = new Date(current);
    dayEnd.setHours(workingHours.end, 0, 0, 0);

    let slotStart = new Date(current);
    while (slotStart < dayEnd) {
      const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60 * 1000);
      if (slotEnd > dayEnd) break;

      const isBusy = busySlots.some(
        (busy) => slotStart < busy.end && slotEnd > busy.start,
      );

      if (!isBusy && slotStart > new Date()) {
        slots.push({ startTime: new Date(slotStart), endTime: new Date(slotEnd) });
      }

      slotStart = new Date(slotStart.getTime() + slotIntervalMinutes * 60 * 1000);
    }

    current.setDate(current.getDate() + 1);
    current.setHours(workingHours.start, 0, 0, 0);
  }

  return slots;
}
