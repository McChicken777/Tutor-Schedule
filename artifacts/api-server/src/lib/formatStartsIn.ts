const ONE_MINUTE_MS = 60 * 1000;

/**
 * Phrases how soon a lesson starts, relative to now.
 *
 * Deliberately relative rather than an absolute clock time: these strings are
 * rendered on the server, which runs in UTC, while students and teachers are
 * not. An absolute time would be silently wrong by the size of their offset —
 * an hour or two for Europe — whereas "in 45 minutes" is correct everywhere.
 * There is no per-user timezone stored to format against.
 */
export function formatStartsIn(startTime: Date, now: Date): string {
  const minutes = Math.round((startTime.getTime() - now.getTime()) / ONE_MINUTE_MS);

  if (minutes <= 1) return "in a minute";
  if (minutes >= 55) return "in about an hour";
  return `in ${minutes} minutes`;
}
