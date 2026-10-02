import { addDays, eachDay, isWerktag, diffDays } from './dates.js';
import { isFeiertag } from './feiertage.js';
import { spanDays } from './span.js';
import { buildUrlaubCheckTitle } from './titles.js';

/** Kindergartenjahr mit Startjahr `id`: z. B. 2026 = 2026-09-01 bis 2027-08-31. */
export function jahrFuerId(id, jahresstart = '09-01') {
  return {
    id,
    start: `${id}-${jahresstart}`,
    end: addDays(`${id + 1}-${jahresstart}`, -1),
  };
}

export function kindergartenjahr(date, jahresstart = '09-01') {
  const y = Number(date.slice(0, 4));
  return jahrFuerId(date >= `${y}-${jahresstart}` ? y : y - 1, jahresstart);
}

/** 'U' = Urlaubstag, 'N' = neutral (Feiertag/Schließtag, überbrückt eine Serie), 'X' = sonst. */
function klasse(date, ctx) {
  if (isFeiertag(date)) return 'N';
  if (ctx.schliessTage.has(date)) return ctx.schliessZaehlen ? 'U' : 'N';
  return ctx.urlaubTage.has(date) ? 'U' : 'X';
}

/** Länge einer Serie ohne neutrale Tage am Anfang und Ende. */
function getrimmteLaenge(serie) {
  let s = 0;
  let e = serie.length;
  while (s < e && serie[s] === 'N') s++;
  while (e > s && serie[e - 1] === 'N') e--;
  return e - s;
}

/**
 * Urlaubsstand eines Kindergartenjahres.
 * spans: inklusive Datumsspannen der Urlaub-Ereignisse; schliessTage: Liste von Daten.
 * jahrOffset: 0 = Jahr von `today`, -1 = Vorjahr, 1 = nächstes Jahr.
 */
export function urlaubStatus({ spans, schliessTage = [], settings, today, jahrOffset = 0 }) {
  const aktuell = kindergartenjahr(today, settings.jahresstart);
  const jahr = jahrFuerId(aktuell.id + jahrOffset, settings.jahresstart);
  const ctx = {
    urlaubTage: new Set(spans.flatMap(spanDays)),
    schliessTage: new Set(schliessTage),
    schliessZaehlen: settings.schliessZaehlenAlsUrlaub,
  };

  let genommen = 0;
  let geplant = 0;
  let serie = [];
  let laengste = 0;
  for (const tag of eachDay(jahr.start, jahr.end).filter(isWerktag)) {
    const k = klasse(tag, ctx);
    if (k === 'U') {
      if (tag < today) genommen++;
      else geplant++;
    }
    if (k === 'X') {
      laengste = Math.max(laengste, getrimmteLaenge(serie));
      serie = [];
    } else {
      serie.push(k);
    }
  }
  laengste = Math.max(laengste, getrimmteLaenge(serie));

  const ziel = settings.zielWochen * 5;
  const durchZiel = settings.durchgehendWochen * 5;
  return {
    jahr,
    ziel,
    genommen,
    geplant,
    offen: Math.max(0, ziel - genommen - geplant),
    durchgehend: {
      ziel: durchZiel,
      laengsteSerie: laengste,
      erfuellt: durchZiel === 0 || laengste >= durchZiel,
    },
  };
}

/** Nächster Urlaub nach heute; `schlafen` = Anzahl Nächte bis zum ersten Urlaubstag. */
export function naechsterUrlaub(spans, today) {
  const starts = spans.map((s) => s.start).filter((s) => s > today).sort();
  return starts.length > 0 ? { start: starts[0], schlafen: diffDays(today, starts[0]) } : null;
}

/** 1. März, 1. Mai und 1. Juli innerhalb des Kindergartenjahres. */
export function urlaubCheckDaten(jahr) {
  const kandidaten = [];
  for (const y of [jahr.id, jahr.id + 1]) {
    for (const md of ['03-01', '05-01', '07-01']) kandidaten.push(`${y}-${md}`);
  }
  return kandidaten.filter((d) => d >= jahr.start && d <= jahr.end);
}

/** Urlaub-Check-Ereignisse, die angelegt werden sollen: nur wenn noch Urlaub offen ist, nur zukünftige Daten. */
export function planUrlaubChecks({ status, today }) {
  if (status.offen <= 0) return [];
  return urlaubCheckDaten(status.jahr)
    .filter((d) => d > today)
    .map((date) => ({ date, title: buildUrlaubCheckTitle({ offen: status.offen, stand: today }) }));
}
