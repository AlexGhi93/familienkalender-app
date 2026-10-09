// Alles, was die Seite „Kontostand“ braucht, als einfache Daten: Formular (nur am letzten Tag des Monats), Ersparnis je Monat (mit „ohne Extra“),
// Zusammenfassung, Balken und die Liste der Sonderbeträge.
import { MAX_EXTRAS, PERSONEN, nachtragMonate, betragText, deltaText, eintragbarerMonat, kontoVerlaufMitExtra, kontoZusammenfassungMitExtra, leeresKonto, letzterTag } from '../../domain/konto.js';
import { FUER } from '../../domain/types.js';
import { MONATE } from '../format-de.js';
import { verlaufReihen } from './konto-diagramm.js';

const MAX_BALKEN = 36; // bei „Alles“ höchstens so viele Monate im Balkendiagramm
const BEREICHE = [6, 12, 0]; // Monate im Diagramm (0 = alles)
const BEREICH_TEXT = { 6: '6 Monate', 12: '12 Monate', 0: 'Alles' };
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
 * `heute` = Wiener Datum. Das Formular gibt es nur am letzten Tag des Monats; in der Demo (`demo: true`) an jedem Tag, mit wählbarem Monat
 * (`monat`: der laufende oder einer der elf davor; sonst der laufende) – so lassen sich eigene Zahlen ausprobieren.
 * `bereich`: Monate im Diagramm (6, 12 oder 0 = alles); sonst 12.
 * Ergebnis: { bereich, bereiche, zeitraumText, diagramm | null, balkenDurchschnitt | null, eintrag | null, nachtragen | null, naechster | null, zeilen, zusammenfassung | null, balken, sonderbetraege, extraFormular, leer }.
 */
export function kontoModel(state, heute, { demo = false, monat: gewuenscht = null, nachtragMonat = null, bereich: bereichWunsch = 12 } = {}) {
  const konto = state.konto ?? leeresKonto();
  const monateAuswahl = formularMonate(heute);
  const monat = demo ? (monateAuswahl.some((x) => x.wert === gewuenscht) ? gewuenscht : (eintragbarerMonat(heute) ?? heute.slice(0, 7))) : eintragbarerMonat(heute);

  const eintrag = monat
    ? {
        monat,
        monatText: monatText(monat),
        demo,
        monate: demo ? monateAuswahl : null,
        felder: PERSONEN.map((person) => {
          const cents = konto.p[person][monat];
          return { person, label: FUER[person].label, emoji: FUER[person].emoji, hatEintrag: cents !== undefined, wert: cents !== undefined ? betragText(cents) : '' };
        }),
      }
    : null;

  // „Nachtragen“ (nicht in der Demo, dort ist der Monat ohnehin frei wählbar): frühere Monate laut Kontoauszug
  let nachtragen = null;
  if (!demo) {
    const monate = nachtragMonate(heute).map((wert) => ({ wert, text: monatText(wert) }));
    const gewaehlt = monate.some((x) => x.wert === nachtragMonat) ? nachtragMonat : monate[0].wert;
    nachtragen = {
      monate,
      monat: gewaehlt,
      monatText: monatText(gewaehlt),
      felder: PERSONEN.map((person) => {
        const cents = konto.p[person][gewaehlt];
        return { person, label: FUER[person].label, emoji: FUER[person].emoji, hatEintrag: cents !== undefined, wert: cents !== undefined ? betragText(cents) : '' };
      }),
    };
  }

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

  // Zeitraum (6 · 12 · Alles): begrenzt Diagramm, Balken und Zusammenfassung; die Liste bleibt vollständig
  const bereich = BEREICHE.includes(bereichWunsch) ? bereichWunsch : 12;
  const reihenDaten = verlaufReihen(konto, bereich);
  const ab = reihenDaten?.monate[0] ?? null;
  const imBereich = ab ? verlauf.filter((z) => z.monat >= ab) : verlauf;

  const sum = kontoZusammenfassungMitExtra(imBereich);
  const mitExtras = imBereich.some((z) => z.zusammen?.extras?.length > 0);
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
  const balken = imBereich
    .filter((z) => z.zusammen && z.zusammen.delta !== null)
    .slice(0, MAX_BALKEN)
    .reverse()
    .map((z) => {
      const { delta, ohneExtra, extra } = z.zusammen;
      const zusatz = extra !== 0 ? ` (ohne Extra ${deltaText(ohneExtra)})` : '';
      return { monat: z.monat, kurz: MONATE[Number(z.monat.slice(5)) - 1].slice(0, 3), wert: ohneExtra, extra, art: art(ohneExtra), text: `${monatText(z.monat)}: ${deltaText(delta)}${zusatz}` };
    });

  const mitDaten = reihenDaten ? reihenDaten.monate.filter((_, i) => reihenDaten.reihen.papa[i] !== null || reihenDaten.reihen.mama[i] !== null).length : 0;
  let diagramm = null;
  if (reihenDaten && mitDaten >= 2) {
    const zeileFuer = new Map(verlauf.map((z) => [z.monat, z]));
    const letzter = (werte) => werte.findLast((w) => w !== null);
    const reihen = [['papa', 'Papa'], ['mama', 'Mama'], ['zusammen', 'Zusammen']].map(([id, label]) => ({ id, label, werte: reihenDaten.reihen[id] }));
    diagramm = {
      monate: reihenDaten.monate.map((mon) => ({ monat: mon, kurz: MONATE[Number(mon.slice(5)) - 1].slice(0, 3), text: monatText(mon) })),
      reihen,
      legende: ['zusammen', 'papa', 'mama'].map((id) => {
        const r = reihen.find((x) => x.id === id);
        const stand = letzter(r.werte);
        return { id, label: r.label, letzter: stand === undefined ? '—' : betragText(stand) };
      }),
      tooltips: reihenDaten.monate.map((mon) => {
        const z = zeileFuer.get(mon);
        const zeile = (id, label, daten) => ({ id, label, stand: daten ? betragText(daten.stand) : '—', veraenderung: daten ? veraenderung(daten.delta) : null });
        return { monat: mon, monatText: monatText(mon), zeilen: [zeile('zusammen', 'Zusammen', z?.zusammen), zeile('papa', 'Papa', z?.papa), zeile('mama', 'Mama', z?.mama)] };
      }),
    };
  }

  let balkenDurchschnitt = null;
  if (balken.length > 0) {
    const wert = Math.round(balken.reduce((a, b) => a + b.wert, 0) / balken.length);
    balkenDurchschnitt = { wert, text: `Ø ${deltaText(wert)}${balken.some((b) => b.extra !== 0) ? ' ohne Extra' : ''}` };
  }

  return {
    bereich,
    bereiche: BEREICHE.map((wert) => ({ wert, text: BEREICH_TEXT[wert] })),
    zeitraumText: bereich === 0 ? 'Seit Beginn' : `In den letzten ${bereich} Monaten`,
    diagramm,
    balkenDurchschnitt,
    eintrag,
    nachtragen,
    naechster,
    zeilen,
    zusammenfassung,
    balken,
    sonderbetraege: sonderbetraegeListe(konto),
    extraFormular: { monate: formularMonate(heute), standard: heute.slice(0, 7), voll: (konto.x ?? []).length >= MAX_EXTRAS },
    leer: verlauf.length === 0,
  };
}
