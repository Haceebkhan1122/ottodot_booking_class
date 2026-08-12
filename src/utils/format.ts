import { CURRENCY } from '@/constants';

/**
 * All timestamps are stored and transported as UTC ISO strings. Formatting
 * happens once, here, at the presentation edge.
 *
 * A fixed locale and timeZone are used on purpose: if the server and the
 * browser format differently, React hydration throws a mismatch warning and
 * the date visibly flickers. Real timezone handling is out of scope for this
 * exercise and is noted as a deliberate cut in the README.
 */
const DISPLAY_TIME_ZONE = 'UTC';
const DISPLAY_LOCALE = 'en-GB';

export function formatClassDateTime(iso: string): string {
  return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: DISPLAY_TIME_ZONE,
  }).format(new Date(iso));
}

/** Machine-readable form for `<time dateTime="...">`. */
export function toDateTimeAttr(iso: string): string {
  return new Date(iso).toISOString();
}

/**
 * Spoken form for screen readers. Abbreviations like "Mon 3 Sep, 17:00" are
 * read inconsistently across screen readers, so labels get the long version.
 */
export function formatClassDateTimeLong(iso: string): string {
  return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: DISPLAY_TIME_ZONE,
  }).format(new Date(iso));
}

export function formatMoney(cents: number): string {
  return new Intl.NumberFormat(DISPLAY_LOCALE, {
    style: 'currency',
    currency: CURRENCY,
  }).format(cents / 100);
}

/** Short id for display in logs and debug panels. Never used as a key. */
export function shortId(id: string): string {
  return id.slice(0, 8);
}
