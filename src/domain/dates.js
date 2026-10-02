const DAY_MS = 86_400_000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad2 = (n) => String(n).padStart(2, '0');

export function parseDate(s) {
  const m = DATE_RE.exec(s);
  if (!m) throw new Error(`Ungültiges Datum: ${s}`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const ms = Date.UTC(y, mo - 1, d);
  const dt = new Date(ms);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    throw new Error(`Ungültiges Datum: ${s}`);
  }
  return { y, m: mo, d, ms };
}

export function isValidDate(s) {
  try {
    parseDate(s);
    return true;
  } catch {
    return false;
  }
}

function fromMs(ms) {
  const dt = new Date(ms);
  return `${String(dt.getUTCFullYear()).padStart(4, '0')}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

export function addDays(s, n) {
  return fromMs(parseDate(s).ms + n * DAY_MS);
}

export function diffDays(a, b) {
  return Math.round((parseDate(b).ms - parseDate(a).ms) / DAY_MS);
}

export function compareDates(a, b) {
  parseDate(a);
  parseDate(b);
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Montag = 0 … Sonntag = 6 */
export function weekday(s) {
  return (new Date(parseDate(s).ms).getUTCDay() + 6) % 7;
}

export function isWerktag(s) {
  return weekday(s) < 5;
}

export function eachDay(from, to) {
  parseDate(from);
  parseDate(to);
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

const VIENNA = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Vienna',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function todayVienna(now = new Date()) {
  const parts = Object.fromEntries(VIENNA.formatToParts(now).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
