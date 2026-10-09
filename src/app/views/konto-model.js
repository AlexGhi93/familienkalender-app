// Alles, was die Seite „Kontostand“ braucht, als einfache Daten: Formular (nur am letzten Tag des Monats), Ersparnis je Monat, Zusammenfassung, Balken.
import { PERSONEN, betragText, deltaText, eintragbarerMonat, kontoVerlauf, kontoZusammenfassung, leeresKonto, letzterTag } from '../../domain/konto.js';
import { FUER } from '../../domain/types.js';
import { MONATE } from '../format-de.js';

const MAX_BALKEN = 12;
const nameText = (person) => FUER[person].label;

const monatText = (monat) => `${MONATE[Number(monat.slice(5)) - 1]} ${monat.slice(0, 4)}`;
const veraenderung = (delta) => (delta === null ? null : { text: deltaText(delta), art: delta > 0 ? 'plus' : delta < 0 ? 'minus' : 'null' });
const seitText = (seit) => (seit ? `seit ${monatText(seit)}` : null);

function personenZeile(person, daten) {
  const f = FUER[person];
  if (!daten) return { person, label: f.label, emoji: f.emoji, stand: '—', veraenderung: null, hinweis: null };
  return { person, label: f.label, emoji: f.emoji, stand: betragText(daten.stand), veraenderung: veraenderung(daten.delta), hinweis: daten.start ? 'Startwert' : seitText(daten.seit) };
}

function zusammenZeile(z, papa, mama) {
  if (!z) return null;
  const beideStart = papa.start && mama.start;
  const gemeinsamSeit = z.delta !== null && papa.seit && papa.seit === mama.seit ? papa.seit : null;
  return { stand: betragText(z.stand), veraenderung: veraenderung(z.delta), hinweis: beideStart ? 'Startwert' : seitText(gemeinsamSeit) };
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

/**
 * `heute` = Wiener Datum. Das Formular gibt es nur am letzten Tag des Monats; in der Demo (`demo: true`) an jedem Tag für den laufenden Monat.
 * Ergebnis: { eintrag | null, naechster | null, zeilen, zusammenfassung | null, balken, leer }.
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

  const verlauf = kontoVerlauf(konto);
  const zeilen = verlauf.map((z) => ({
    monat: z.monat,
    monatText: monatText(z.monat),
    personen: [personenZeile('papa', z.papa), personenZeile('mama', z.mama)],
    zusammen: zusammenZeile(z.zusammen, z.papa, z.mama),
  }));

  const sum = kontoZusammenfassung(verlauf);
  const zusammenfassung = sum.monate > 0 ? { seitBeginn: deltaText(sum.seitBeginn), durchschnitt: deltaText(sum.durchschnitt), monate: sum.monate, imPlus: sum.imPlus, text: `${sum.imPlus} von ${sum.monate} Monaten im Plus` } : null;

  const balken = verlauf
    .filter((z) => z.zusammen && z.zusammen.delta !== null)
    .slice(0, MAX_BALKEN)
    .reverse()
    .map((z) => {
      const delta = z.zusammen.delta;
      return { monat: z.monat, kurz: MONATE[Number(z.monat.slice(5)) - 1].slice(0, 3), wert: delta, art: delta > 0 ? 'plus' : delta < 0 ? 'minus' : 'null', text: `${monatText(z.monat)}: ${deltaText(delta)}` };
    });

  return { eintrag, naechster, zeilen, zusammenfassung, balken, leer: verlauf.length === 0 };
}
