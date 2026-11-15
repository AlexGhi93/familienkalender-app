const DAY_MS = 86_400_000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 7 → '07' (Monat, Tag, Stunde zweistellig). */
export const pad2 = (n) => String(n).padStart(2, '0');
/** Anzahl der Tage im Monat (`monat` 1–12), auch Schaltjahre. */
export const tageImMonat = (jahr, monat) => new Date(Date.UTC(jahr, monat, 0)).getUTCDate();

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

const TEXT_HEUTE = 'Ungültiges Datum (heute): erwartet wird das Wiener Datum als Text „JJJJ-MM-TT“.';

/** Wirft sofort, wenn `heute` kein Datum 'JJJJ-MM-TT' ist (z. B. undefined oder ein Date-Objekt); sonst der Monat 'JJJJ-MM'. */
export function heutePruefen(heute) {
  if (typeof heute !== 'string' || !isValidDate(heute)) throw new Error(TEXT_HEUTE);
  return heute.slice(0, 7);
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

/**
 * Datum plus `n` Monate (negativ = zurück). Ein Tag, den es im Zielmonat nicht gibt, wird auf das Monatsende gekürzt (31.03. − 1 Monat = 28./29.02.).
 * Mit `monatsende` bleibt ein Monatsletzter ein Monatsletzter (30.09. + 1 Monat = 31.10.).
 */
export function plusMonate(datum, n, monatsende = false) {
  const jahr = Number(datum.slice(0, 4));
  const monat = Number(datum.slice(5, 7));
  const tag = Number(datum.slice(8, 10));
  const index = jahr * 12 + monat - 1 + n;
  const zj = Math.floor(index / 12);
  const zm = (index % 12) + 1;
  const letzter = tageImMonat(zj, zm);
  const zt = monatsende && tag === tageImMonat(jahr, monat) ? letzter : Math.min(tag, letzter);
  return `${zj}-${pad2(zm)}-${pad2(zt)}`;
}

export function addDays(s, n) {
  return fromMs(parseDate(s).ms + n * DAY_MS);
}

export function diffDays(a, b) {
  return Math.round((parseDate(b).ms - parseDate(a).ms) / DAY_MS);
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

/** Letzter Sonntag eines Monats (Tag im Monat), z. B. für die Zeitumstellung. */
export function letzterSonntag(jahr, monat) {
  const letzter = new Date(Date.UTC(jahr, monat, 0)).getUTCDate();
  for (let tag = letzter; tag > letzter - 7; tag -= 1) {
    if (weekday(`${jahr}-${String(monat).padStart(2, '0')}-${String(tag).padStart(2, '0')}`) === 6) return tag;
  }
  throw new Error('unreachable');
}

/**
 * True, wenn `time` ('HH:MM') am Tag `date` in Wien nicht existiert: am letzten Märzsonntag springt die Uhr von 02:00 auf 03:00.
 * Google lehnt solche Uhrzeiten mit 400 ab (Vertragsprobe C14).
 */
export function istZeitumstellungsLuecke(date, time) {
  const { y, m, d } = parseDate(date);
  return m === 3 && d === letzterSonntag(y, 3) && time.slice(0, 2) === '02';
}
