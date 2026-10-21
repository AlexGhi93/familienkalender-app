// Ansicht des Schichtplans (ohne DOM): ein Monat als Raster Montag bis Sonntag mit zwei Streifen je Tag (oben Papa, unten Mama),
// Marken für Zusatz (z. B. DB) und Notiz, die Zählung je Person und die Legende. Dazu der Filter „Beide · Papa · Mama“,
// den sich jedes Telefon selbst merkt (localStorage).
import { addDays, eachDay, weekday } from '../../domain/dates.js';
import { feiertagName } from '../../domain/feiertage.js';
import { monatVor } from '../../domain/konto.js';
import { SCHICHT_PERSONEN, aktiveArten, artFuer, istNacht, monatZaehlung, schichtAm, standardKatalog, tageImMonat } from '../../domain/schicht.js';
import { WOCHENTAGE_KURZ, monatTitel } from '../format-de.js';

export const SCHICHT_FILTER = Object.freeze(['beide', 'papa', 'mama']);
export const SCHICHT_FILTER_SCHLUESSEL = 'fk.schicht.filter.v1';

const gueltigerFilter = (filter) => (SCHICHT_FILTER.includes(filter) ? filter : 'beide');
const pad2 = (n) => String(n).padStart(2, '0');

/** Gemerkter Filter dieses Telefons; ohne Speicher, bei Unsinn oder Fehlern „beide“. */
export function schichtFilterLesen(speicher = globalThis.localStorage) {
  try {
    return gueltigerFilter(speicher?.getItem(SCHICHT_FILTER_SCHLUESSEL));
  } catch {
    return 'beide';
  }
}

/** Merkt den Filter (Fehler des Speichers, z. B. im privaten Modus, stören nicht) und gibt den gültigen Wert zurück. */
export function schichtFilterSpeichern(filter, speicher = globalThis.localStorage) {
  const wert = gueltigerFilter(filter);
  try {
    speicher?.setItem(SCHICHT_FILTER_SCHLUESSEL, wert);
  } catch {
    // dann eben nur bis zum Neuladen
  }
  return wert;
}

/** Die angezeigten Personen zum Filter, in fester Reihenfolge (oben Papa, unten Mama). */
export const personenFuer = (filter) => (gueltigerFilter(filter) === 'beide' ? [...SCHICHT_PERSONEN] : [gueltigerFilter(filter)]);

const zeitenText = (art) => (art.von && art.bis ? `${art.von}–${art.bis}` : null);

/** Ein Streifen für den Schlüssel `k`; eine Art, die der Katalog (noch) nicht kennt, wird grau mit „?“ gezeigt – verloren geht nichts. */
function streifen(katalog, person, k) {
  if (k === null) return null;
  const art = artFuer(katalog, person, k);
  if (!art) return { k, kuerzel: '?', name: 'Unbekannte Art', farbe: 'grau', nacht: false, urlaub: false, unbekannt: true };
  return { k, kuerzel: art.kuerzel, name: art.name, farbe: art.farbe, nacht: istNacht(art), urlaub: art.muster === 'urlaub', unbekannt: false };
}

/** Marke oben rechts: der erste Zusatz der angezeigten Personen (Papa vor Mama); `weitere` = Anzahl der übrigen (Anzeige „+1“), `mehr` = es gibt welche. */
function zusatzMarke(monat, katalog, personen, tag) {
  const alle = personen.flatMap((person) => (monat.z?.[person]?.[tag] ?? []).map((z) => ({ person, ...z })));
  if (alle.length === 0) return null;
  const erste = alle[0];
  const art = artFuer(katalog, erste.person, erste.k);
  return { kuerzel: art?.kuerzel ?? '?', farbe: art?.farbe ?? 'grau', mehr: alle.length > 1, weitere: alle.length - 1 };
}

/** „20 Dienste · 4× F · 4× N · 5× U“ (Katalog-Reihenfolge; Urlaub ist kein Dienst) oder „Noch nichts eingetragen“. */
function zaehlungText(monat, katalog, person) {
  const { dienste, jeArt } = monatZaehlung(monat, katalog, person);
  if (jeArt.length === 0) return 'Noch nichts eingetragen';
  return [`${dienste} ${dienste === 1 ? 'Dienst' : 'Dienste'}`, ...jeArt.map((e) => `${e.anzahl}× ${e.kuerzel}`)].join(' · ');
}

/** Legende einer Person: alle aktiven Arten (mit Zeiten, wo es welche gibt), archivierte nur, wenn sie in diesem Monat vorkommen. */
function legende(monat, katalog, person) {
  const benutzt = new Set([...(monat?.t?.[person] ?? '')]);
  for (const liste of Object.values(monat?.z?.[person] ?? {})) for (const z of liste) benutzt.add(z.k);
  const aktiv = new Set(aktiveArten(katalog, person).map((a) => a.k));
  return (katalog.arten[person] ?? [])
    .filter((a) => aktiv.has(a.k) || benutzt.has(a.k))
    .map((a) => {
      const zeiten = zeitenText(a);
      return { k: a.k, kuerzel: a.kuerzel, name: a.name, farbe: a.farbe, text: zeiten ? `${a.name} ${zeiten}` : a.name, nacht: istNacht(a), urlaub: a.muster === 'urlaub' };
    });
}

/**
 * Monat `jm` ('JJJJ-MM') des Schichtplans. `geladen` = die Daten des Monats sind da (auch aus der Offline-Kopie, selbst wenn das
 * Neuladen gerade scheiterte); sonst gibt es keine Tage, nur `laedt` bzw. `fehler`. Ohne gelesene Schichtarten gelten die Standardarten.
 */
export function schichtMonatModel(state, jm, { heute, filter = 'beide' } = {}) {
  const tage = tageImMonat(jm);
  const [jahr, monatNr] = jm.split('-').map(Number);
  const f = gueltigerFilter(filter);
  const personen = personenFuer(f);
  const schicht = state.schicht ?? {};
  const katalog = schicht.katalog ?? standardKatalog();
  const monat = schicht.monate?.[jm] ?? null;
  const status = schicht.status?.[jm] ?? null;
  const geladen = monat !== null;

  const erster = `${jm}-01`;
  const letzter = `${jm}-${pad2(tage)}`;
  const zellen = eachDay(addDays(erster, -weekday(erster)), addDays(letzter, 6 - weekday(letzter))).map((datum) => {
    const imMonat = datum >= erster && datum <= letzter;
    const tag = Number(datum.slice(8));
    const daten = imMonat && geladen;
    return {
      datum,
      tag,
      imMonat,
      istHeute: datum === heute,
      wochenende: weekday(datum) >= 5,
      feiertag: feiertagName(datum),
      streifen: daten ? Object.fromEntries(personen.map((p) => [p, streifen(katalog, p, schichtAm(monat, p, tag))])) : {},
      zusatz: daten ? zusatzMarke(monat, katalog, personen, tag) : null,
      notiz: daten ? personen.some((p) => Boolean(monat.n?.[p]?.[tag])) : false,
    };
  });

  return {
    titel: monatTitel(jahr, monatNr),
    jm,
    vorher: monatVor(jm, 1),
    nachher: monatVor(jm, -1),
    filter: f,
    personen,
    geladen,
    laedt: !geladen && status === 'laedt',
    fehler: status === 'fehler',
    wochentage: [...WOCHENTAGE_KURZ],
    zellen,
    zaehlung: geladen ? Object.fromEntries(personen.map((p) => [p, zaehlungText(monat, katalog, p)])) : {},
    legende: Object.fromEntries(personen.map((p) => [p, legende(monat, katalog, p)])),
  };
}

// ---------- Pinsel (Leiste zum schnellen Eintragen) ----------

const katalogVon = (state) => state.schicht?.katalog ?? standardKatalog();

/** Pinsel beim Öffnen: zeigt der Filter nur Mama, malt er Mama, sonst Papa; gewählt ist die erste aktive Art (keine → „Frei“). */
export function pinselStart(state, filter) {
  const person = gueltigerFilter(filter) === 'mama' ? 'mama' : 'papa';
  return { person, k: aktiveArten(katalogVon(state), person)[0]?.k ?? null };
}

/**
 * Die Leiste: aktive Arten der Person (beide Gruppen, Katalog-Reihenfolge), die gewählte markiert, und ein Hinweis zur Wahl.
 * `k` ist die tatsächlich gewählte Art: wurde die gewählte inzwischen archiviert, gilt die erste aktive – nie still „Frei“.
 */
export function pinselModel(state, { person, k }) {
  const aktiv = aktiveArten(katalogVon(state), person);
  const gewaehlt = k === null ? null : (aktiv.find((a) => a.k === k) ?? aktiv[0] ?? null);
  const arten = aktiv.map((a) => ({ k: a.k, kuerzel: a.kuerzel, name: a.name, farbe: a.farbe, urlaub: a.muster === 'urlaub', gewaehlt: a === gewaehlt }));
  let hinweis = 'Tage antippen: der Dienst wird gelöscht, Notiz und Zusätze bleiben.';
  if (gewaehlt?.gruppe === 'zusatz') hinweis = `${gewaehlt.kuerzel} ${gewaehlt.name} ${zeitenText(gewaehlt)}: Tage antippen zum Dazunehmen, nochmal tippen nimmt sie weg.`;
  else if (gewaehlt) hinweis = `${gewaehlt.kuerzel} ${gewaehlt.name}: Tage antippen. Nochmal tippen macht den Tag wieder frei.`;
  return { person, k: gewaehlt?.k ?? null, frei: gewaehlt === null, arten, hinweis };
}

/**
 * Was ein Tipp auf Tag `tag` des Monats `jm` tut: „Frei“ → Dienst löschen (`setzen`, k null); ein Dienst → `pinsel` (der Store ersetzt
 * oder löscht bei gleicher Art); ein Zusatz → `zusatzWeg`, wenn die Person ihn an dem Tag schon hat (bevorzugt den mit den Zeiten der
 * Art), sonst `zusatzDazu` mit den Zeiten der Art. Eine archivierte oder unbekannte Art tut nichts (null).
 */
export function pinselAktion(state, jm, tag, { person, k }) {
  if (k === null) return { aktion: 'setzen', k: null };
  const art = aktiveArten(katalogVon(state), person).find((a) => a.k === k);
  if (!art) return null;
  if (art.gruppe !== 'zusatz') return { aktion: 'pinsel', k };
  const liste = state.schicht?.monate?.[jm]?.z?.[person]?.[tag] ?? [];
  const da = liste.find((z) => z.k === k && z.von === art.von) ?? liste.find((z) => z.k === k);
  return da ? { aktion: 'zusatzWeg', k, von: da.von } : { aktion: 'zusatzDazu', k, von: art.von, bis: art.bis };
}
