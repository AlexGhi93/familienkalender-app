// Alles, was die Seite „Kontostand“ braucht, als einfache Daten: Formular (nur am letzten Tag des Monats), Ersparnis je Monat (mit „ohne Extra“),
// Zusammenfassung, Balken und die Liste der Sonderbeträge.
import { MAX_EXTRAS, PERSONEN, betragText, deltaText, eintragbarerMonat, kontoVerlaufMitExtra, kontoZusammenfassungMitExtra, leeresKonto, letzterTag } from '../../domain/konto.js';
import { FUER } from '../../domain/types.js';
import { MONATE } from '../format-de.js';

const MAX_BALKEN = 12;
const FORMULAR_MONATE = 12; // so viele Monate (bis zurück) wählt das Formular für Sonderbeträge an
const nameText = (person) => FUER[person].label;

const monatText = (monat) => `${MONATE[Number(monat.slice(5)) - 1]} ${monat.slice(0, 4)}`;
const art = (delta) => (delta > 0 ? 'plus' : delta < 0 ? 'minus' : 'null');
const veraenderung = (delta) => (delta === null ? null : { text: deltaText(delta), art: art(delta) });
const seitText = (seit) => (seit ? `seit ${monatText(seit)}` : null);

/** „Davon Sonderbeträge +2.000 € (Weihnachtsgeld) · ohne Extra +1.000 €“ – nur wenn in dieser Veränderung Sonderbeträge stecken. */
function extraInfo(d) {
  if (!d || d.delta === null || !d.extras || d.extras.length === 0) return null;
  const summe = deltaText(d.extra);
  const namen = d.extras.map((e) => e.t).join(', ');
  const ohne = veraenderung(d.ohneExtra);
  return { summe, namen, ohne, text: `Davon Sonderbeträge ${summe} (${namen}) · ohne Extra ${ohne.text}` };
}

function personenZeile(person, daten) {
  const f = FUER[person];
  if (!daten) return { person, label: f.label, emoji: f.emoji, stand: '—', veraenderung: null, hinweis: null, extra: null };
  return { person, label: f.label, emoji: f.emoji, stand: betragText(daten.stand), veraenderung: veraenderung(daten.delta), hinweis: daten.start ? 'Startwert' : seitText(daten.seit), extra: extraInfo(daten) };
}

function zusammenZeile(z, papa, mama) {
  if (!z) return null;
  const beideStart = papa.start && mama.start;
  const gemeinsamSeit = z.delta !== null && papa.seit && papa.seit === mama.seit ? papa.seit : null;
  return { stand: betragText(z.stand), veraenderung: veraenderung(z.delta), hinweis: beideStart ? 'Startwert' : seitText(gemeinsamSeit), extra: extraInfo(z) };
}

/**
 * Karte auf „Heute“: nur am letzten Tag des Monats und nur solange jemand fehlt.
 * Ergebnis: { faellig, monatText, status: [{ person, label, fertig }], text } (text z. B. „Papa ✔ · Mama fehlt“).
 */
export function kontoKarteModel(state, heute) {
  const konto = state.konto ?? leeresKonto();
  const monat = eintragbarerMonat(heute);
  const status = PERSONEN.map((person) => ({ person, label: nameText(person), fertig: monat !== null && konto.p[person][monat] !== undefined }));
  const faellig = monat !== null && status.some((s) => !s.fertig);
  return { faellig, monatText: monat ? monatText(monat) : '', status, text: status.map((s) => (s.fertig ? `${s.label} ✔` : `${s.label} fehlt`)).join(' · ') };
}

/** Sonderbeträge nach Monaten, neueste zuerst; innerhalb eines Monats in der Reihenfolge des Eintragens. */
function sonderbetraegeListe(konto) {
  const monate = [...new Set((konto.x ?? []).map((e) => e.m))].sort().reverse();
  return monate.map((monat) => ({
    monat,
    monatText: monatText(monat),
    eintraege: konto.x
      .filter((e) => e.m === monat)
      .map((e) => ({ id: e.i, person: e.p, label: nameText(e.p), emoji: FUER[e.p].emoji, betrag: deltaText(e.c), art: art(e.c), text: e.t })),
  }));
}

/** Die Monate für das Formular der Sonderbeträge: der laufende und die elf davor. */
function formularMonate(heute) {
  let jahr = Number(heute.slice(0, 4));
  let monat = Number(heute.slice(5, 7));
  const liste = [];
  for (let i = 0; i < FORMULAR_MONATE; i += 1) {
    const wert = `${jahr}-${String(monat).padStart(2, '0')}`;
    liste.push({ wert, text: monatText(wert) });
    [jahr, monat] = monat === 1 ? [jahr - 1, 12] : [jahr, monat - 1];
  }
  return liste;
}

/**
 * `heute` = Wiener Datum. Das Formular gibt es nur am letzten Tag des Monats; in der Demo (`demo: true`) an jedem Tag für den laufenden Monat.
 * Ergebnis: { eintrag | null, naechster | null, zeilen, zusammenfassung | null, balken, sonderbetraege, extraFormular, leer }.
 */
export function kontoModel(state, heute, { demo = false } = {}) {
  const konto = state.konto ?? leeresKonto();
  const monat = demo ? (eintragbarerMonat(heute) ?? heute.slice(0, 7)) : eintragbarerMonat(heute);

  const eintrag = monat
    ? {
        monat,
        monatText: monatText(monat),
        demo,
        felder: PERSONEN.map((person) => {
          const cents = konto.p[person][monat];
          return { person, label: FUER[person].label, emoji: FUER[person].emoji, hatEintrag: cents !== undefined, wert: cents !== undefined ? betragText(cents) : '' };
        }),
      }
    : null;

  let naechster = null;
  if (!monat) {
    const tag = letzterTag(heute.slice(0, 7));
    naechster = `Eintragen ist nur am letzten Tag des Monats möglich – nächster Termin: ${Number(tag.slice(8))}. ${MONATE[Number(tag.slice(5, 7)) - 1]}`;
  }

  const verlauf = kontoVerlaufMitExtra(konto);
  const zeilen = verlauf.map((z) => ({
    monat: z.monat,
    monatText: monatText(z.monat),
    personen: [personenZeile('papa', z.papa), personenZeile('mama', z.mama)],
    zusammen: zusammenZeile(z.zusammen, z.papa, z.mama),
  }));

  const sum = kontoZusammenfassungMitExtra(verlauf);
  const mitExtras = verlauf.some((z) => z.zusammen?.extras?.length > 0);
  const zusammenfassung =
    sum.monate > 0
      ? {
          seitBeginn: deltaText(sum.seitBeginn),
          durchschnitt: deltaText(sum.durchschnitt),
          monate: sum.monate,
          imPlus: sum.imPlus,
          text: `${sum.imPlus} von ${sum.monate} Monaten im Plus`,
          ohneExtra: mitExtras ? { seitBeginn: deltaText(sum.seitBeginnOhne), durchschnitt: deltaText(sum.durchschnittOhne), text: `${sum.imPlusOhne} von ${sum.monate} Monaten im Plus ohne Extra` } : null,
        }
      : null;

  // Balken = gewöhnliche Ersparnis („ohne Extra“); die Sonderbeträge des Monats hängen als Segment daran
  const balken = verlauf
    .filter((z) => z.zusammen && z.zusammen.delta !== null)
    .slice(0, MAX_BALKEN)
    .reverse()
    .map((z) => {
      const { delta, ohneExtra, extra } = z.zusammen;
      const zusatz = extra !== 0 ? ` (ohne Extra ${deltaText(ohneExtra)})` : '';
      return { monat: z.monat, kurz: MONATE[Number(z.monat.slice(5)) - 1].slice(0, 3), wert: ohneExtra, extra, art: art(ohneExtra), text: `${monatText(z.monat)}: ${deltaText(delta)}${zusatz}` };
    });

  return {
    eintrag,
    naechster,
    zeilen,
    zusammenfassung,
    balken,
    sonderbetraege: sonderbetraegeListe(konto),
    extraFormular: { monate: formularMonate(heute), standard: heute.slice(0, 7), voll: (konto.x ?? []).length >= MAX_EXTRAS },
    leer: verlauf.length === 0,
  };
}
