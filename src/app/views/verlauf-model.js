// Verlauf: alle Termine, Urlaube und Krank-/Abwesend-/Schließtage in einer Liste, mit Filtern und Suche: rein, ohne DOM.
// Anwesenheitstage (Krabbelstube/Kindergarten) und Sachen für die Einrichtung gehören nicht hinein.
import { addDays, isWerktag } from '../../domain/dates.js';
import { isFeiertag } from '../../domain/feiertage.js';
import { TYPES } from '../../domain/types.js';
import { MONATE, datumKurz } from '../format-de.js';
import { terminAnzeige, typText } from './gemeinsam.js';
import { urlaubstageImZeitraum } from './neu-model.js';

export const VERLAUF_MAX_JAHRE = 5; // so weit zurück lässt sich nachladen
export const VERLAUF_SCHRITT_MONATE = 3; // so viel lädt „Ältere laden“ auf einmal

const TAGE_ARTEN = ['krank', 'abwesend', 'schliess'];

/** Filter-Chips: Schlüssel, Beschriftung. */
export const VERLAUF_ARTEN = Object.freeze([
  ['alle', 'Alle'],
  ['arzt', '🩺 Arzt'],
  ['termin', '📌 Termine'],
  ['urlaub', '✈️ Urlaub'],
  ['krank', '🤒 Krank'],
  ['abwesend', '🧸 Abwesend'],
  ['schliess', '🔒 Schließtage'],
]);

/** Neue frühere Grenze zum Nachladen: der Erste des Monats, `monate` Monate vor dem Monat von `von`. */
export function fruehereGrenze(von, monate = VERLAUF_SCHRITT_MONATE) {
  const m = Number(von.slice(5, 7)) - 1 - monate;
  const jahr = Number(von.slice(0, 4)) + Math.floor(m / 12);
  const monat = ((m % 12) + 12) % 12 + 1;
  return `${jahr}-${String(monat).padStart(2, '0')}-01`;
}

/** „Geladen ab Juni 2025“ für den Anfang des geladenen Bereichs. */
export const geladenAbText = (von) => `Geladen ab ${MONATE[Number(von.slice(5, 7)) - 1]} ${von.slice(0, 4)}`;

const plural = (n, einzahl, mehrzahl) => `${n} ${n === 1 ? einzahl : mehrzahl}`;

function naechsterArbeitstag(datum) {
  let d = addDays(datum, 1);
  while (!isWerktag(d) || isFeiertag(d)) d = addDays(d, 1);
  return d;
}

/** Tage derselben Art, die ohne Werktag dazwischen aufeinander folgen (Wochenenden und Feiertage überbrücken), bilden eine Phase. */
function phasen(daten) {
  const gruppen = [];
  for (const d of [...daten].sort()) {
    const letzte = gruppen.at(-1);
    const ende = letzte?.tage.at(-1);
    if (letzte && (d === addDays(ende, 1) || d === naechsterArbeitstag(ende))) letzte.tage.push(d);
    else gruppen.push({ tage: [d] });
  }
  return gruppen;
}

const zeitraumText = (start, end) => (start === end ? datumKurz(start) : `${datumKurz(start)} – ${datumKurz(end)}`);

/** Alle Einträge, ungefiltert und unsortiert; jeder hat id, art, filter, start, end, titel, datumText, details, farbe, emoji, suchtext. */
export function verlaufEintraege(state) {
  const eintraege = [];

  for (const t of state.termine) {
    if (t.typ === 'kita_sache') continue;
    const a = terminAnzeige(t, state.settings);
    const details = [];
    if (a.mitnehmen.length > 0) details.push(`🎒 ${a.mitnehmen.join(', ')}`);
    if (a.kosten) details.push(`💶 ${a.kosten}`);
    if (a.notiz) details.push(`📝 ${a.notiz}`);
    eintraege.push({
      id: t.id,
      art: 'termin',
      filter: t.typ === 'arzt' ? 'arzt' : 'termin',
      start: t.date,
      end: t.date,
      zeit: t.time ?? '',
      anzahl: 1,
      emoji: a.emoji,
      titel: a.fuerText ? `${a.label} (${a.fuerText})` : a.label,
      datumText: `${datumKurz(t.date)}${t.time ? ` · ${t.time}` : ''}`,
      details,
      farbe: a.farbe,
    });
  }

  for (const u of state.urlaub) {
    const tage = urlaubstageImZeitraum(u);
    eintraege.push({
      id: u.id,
      art: 'urlaub',
      filter: 'urlaub',
      start: u.start,
      end: u.end,
      zeit: '',
      anzahl: tage,
      emoji: TYPES.urlaub.emoji,
      titel: 'Urlaub',
      datumText: `${zeitraumText(u.start, u.end)} · ${plural(tage, 'Urlaubstag', 'Urlaubstage')}`,
      details: [],
      farbe: TYPES.urlaub.farbe,
    });
  }

  for (const typ of TAGE_ARTEN) {
    const daten = Object.keys(state.tage).filter((d) => state.tage[d].typ === typ);
    for (const { tage } of phasen(daten)) {
      const start = tage[0];
      const end = tage.at(-1);
      const { emoji, text } = typText(typ, start, state.settings);
      eintraege.push({
        id: `tag:${typ}:${start}`,
        art: 'tag',
        filter: typ,
        start,
        end,
        zeit: '',
        anzahl: tage.length,
        emoji,
        titel: text,
        datumText: tage.length > 1 ? `${zeitraumText(start, end)} · ${tage.length} Tage` : datumKurz(start),
        details: [],
        farbe: TYPES[typ].farbe,
      });
    }
  }

  for (const e of eintraege) e.suchtext = [e.titel, e.datumText, ...e.details].join(' ').toLocaleLowerCase('de');
  return eintraege;
}

const jahrVon = (datum) => Number(datum.slice(0, 4));
const aufsteigend = (a, b) => a.start.localeCompare(b.start) || a.zeit.localeCompare(b.zeit);

/**
 * Verlauf für die Anzeige. `filter` = { typ ('alle' …), jahr (Zahl oder null), text }.
 * bevorstehend: ab morgen, aufsteigend. vergangen: bis heute, absteigend, nach Monaten gruppiert.
 * jahre, gesamt: unabhängig vom Filter (für die Chips). aeltereMoeglich: Google-Fenster bekannt und noch keine fünf Jahre zurück.
 */
export function verlaufModel(state, heute, { typ = 'alle', jahr = null, text = '' } = {}) {
  const alle = verlaufEintraege(state);
  const suche = String(text).trim().toLocaleLowerCase('de');
  const treffer = alle.filter(
    (e) => (typ === 'alle' || e.filter === typ) && (jahr === null || (jahrVon(e.start) <= jahr && jahr <= jahrVon(e.end))) && (suche === '' || e.suchtext.includes(suche)),
  );

  const bevorstehend = treffer.filter((e) => e.start > heute).sort(aufsteigend);
  const vergangen = [];
  for (const e of treffer.filter((x) => x.start <= heute).sort((a, b) => aufsteigend(b, a))) {
    const titel = `${MONATE[Number(e.start.slice(5, 7)) - 1]} ${jahrVon(e.start)}`;
    const gruppe = vergangen.at(-1);
    if (gruppe?.titel === titel) gruppe.eintraege.push(e);
    else vergangen.push({ titel, eintraege: [e] });
  }

  const jahre = [...new Set(alle.flatMap((e) => Array.from({ length: jahrVon(e.end) - jahrVon(e.start) + 1 }, (_, i) => jahrVon(e.start) + i)))].sort((a, b) => b - a);
  const frueheste = addDays(heute, -VERLAUF_MAX_JAHRE * 366);
  return {
    bevorstehend,
    vergangen,
    anzahl: treffer.length,
    gesamt: alle.length,
    jahre,
    aeltereMoeglich: Boolean(state.fenster) && state.fenster.von > frueheste,
  };
}
