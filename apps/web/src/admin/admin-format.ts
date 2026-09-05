/* Fixed time formats for the Admin page (#117).
 *
 * NOT `Intl`. The access log's time column wrapped on a phone the moment a
 * locale's 12-hour clock and comma landed in it, and the whole point of that
 * column is that it reads straight down. So the shape is fixed — day, short
 * month, 24-hour clock — and only the year varies: it is dropped for the current
 * year because on a log read for "did I revoke that" it is noise, and kept for
 * any other because there it is the fact. Local time throughout: the leader
 * reads the clock in the room they are in.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatClock(instant: Date): string {
  return `${pad(instant.getHours())}:${pad(instant.getMinutes())}`;
}

/* `4 Sep`, or `4 Sep 2025` when the year is not the current one. */
export function formatDay(instant: Date, now: Date): string {
  const year = instant.getFullYear() === now.getFullYear() ? "" : ` ${instant.getFullYear()}`;
  return `${instant.getDate()} ${MONTHS[instant.getMonth()]}${year}`;
}

/* The log column: `4 Sep 21:10`. */
export function formatLogTime(iso: string, now: Date): string {
  const instant = new Date(iso);
  return `${formatDay(instant, now)} ${formatClock(instant)}`;
}

/* An instant in running text: `4 Sep, 14:02`. */
export function formatInstant(iso: string, now: Date): string {
  const instant = new Date(iso);
  return `${formatDay(instant, now)}, ${formatClock(instant)}`;
}

/* The run window: `5 Sep, 14:01 – 14:02`, or `5 Sep, 14:01, still running`
 * while unfinished. One date, two clocks — the date is what every attempt in the
 * run shares, and it is stated once so the rows beneath need not repeat it. */
export function formatRunWindow(startedAt: string, finishedAt: string | null, now: Date): string {
  const start = new Date(startedAt);
  if (!finishedAt) return `${formatDay(start, now)}, ${formatClock(start)}, still running`;
  const end = new Date(finishedAt);
  const sameDay = start.toDateString() === end.toDateString();
  return sameDay
    ? `${formatDay(start, now)}, ${formatClock(start)} – ${formatClock(end)}`
    : `${formatDay(start, now)}, ${formatClock(start)} – ${formatDay(end, now)}, ${formatClock(end)}`;
}

/* `today, 15:00` / `tomorrow, 14:02` / `7 Sep, 14:02`. Relative only for the
 * two days a reader can place without a calendar. */
export function formatRelativeInstant(iso: string, now: Date): string {
  const instant = new Date(iso);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayOffset = Math.floor((new Date(instant.getFullYear(), instant.getMonth(), instant.getDate()).getTime() - startOfToday.getTime()) / 86_400_000);
  const day = dayOffset === 0 ? "today" : dayOffset === 1 ? "tomorrow" : formatDay(instant, now);
  return `${day}, ${formatClock(instant)}`;
}
