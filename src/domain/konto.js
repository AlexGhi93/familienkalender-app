// Kontostand lunar: Papa und Mama tragen am LETZTEN Tag jedes Monats ihren Gesamtstand ein; daraus ergibt sich die Ersparnis je Monat.
// Rein, ohne DOM und ohne Netz. Beträge sind GANZE CENT (kein Fließkomma). Die Daten liegen als kleines JSON im geteilten Kalender
// (verstecktes Ereignis „fkkonto“); jede Änderung ist eine Funktion Konto → Konto, die auf die NEUESTE Fassung angewendet wird.
//
// Form: { v: 1, p: { papa: { 'JJJJ-MM': Cent }, mama: { 'JJJJ-MM': Cent } } }

export const PERSONEN = Object.freeze(['papa', 'mama']);
export const MAX_MONATE = 96; // je Person (ungünstigster Fall ≈ 4 KB)
export const MAX_CENTS = 999_999_999; // ±9.999.999,99 €
export const MAX_KONTO_ZEICHEN = 6000; // Google kürzt Beschreibungen still bei 8192 Zeichen (Vertragsprobe C11b)

const MONAT = /^\d{4}-(0[1-9]|1[0-2])$/;
const pad2 = (n) => String(n).padStart(2, '0');
const istBetrag = (c) => typeof c === 'number' && Number.isInteger(c) && Math.abs(c) <= MAX_CENTS;

export const leeresKonto = () => ({ v: 1, p: { papa: {}, mama: {} } });

/** 'JJJJ-MM' → letzter Kalendertag 'JJJJ-MM-TT' (auch Schaltjahre). */
export function letzterTag(monat) {
  if (!MONAT.test(String(monat))) throw new Error(`Ungültiger Monat: ${monat}`);
  const [jahr, m] = monat.split('-').map(Number);
  return `${monat}-${pad2(new Date(Date.UTC(jahr, m, 0)).getUTCDate())}`;
}

/** Der Monat, der HEUTE eingetragen werden darf: nur am letzten Tag des Monats, sonst null. */
export function eintragbarerMonat(heute) {
  const monat = String(heute).slice(0, 7);
  return MONAT.test(monat) && heute === letzterTag(monat) ? monat : null;
}

function bereinigeMonate(roh) {
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) return {};
  const monate = Object.keys(roh).filter((m) => MONAT.test(m) && istBetrag(roh[m])).sort();
  return Object.fromEntries(monate.slice(-MAX_MONATE).map((m) => [m, roh[m]])); // sollte nie nötig sein: die neuesten bleiben
}

/** Prüft ein gelesenes Konto streng; Ungültiges wird einzeln verworfen, Unbrauchbares ergibt das leere Konto. */
export function normalisiereKonto(roh) {
  if (!roh || typeof roh !== 'object' || Array.isArray(roh) || roh.v !== 1 || !roh.p || typeof roh.p !== 'object' || Array.isArray(roh.p)) return leeresKonto();
  return { v: 1, p: { papa: bereinigeMonate(roh.p.papa), mama: bereinigeMonate(roh.p.mama) } };
}

/** Das Konto als Text für die Beschreibung des Kalenderereignisses; zu lange Konten werden vor dem Schreiben abgelehnt. */
export function kontoText(konto) {
  const text = JSON.stringify(normalisiereKonto(konto));
  if (text.length > MAX_KONTO_ZEICHEN) throw new Error('Der Kontostand-Verlauf ist zu lang für den Kalender.');
  return text;
}

/** Text aus dem Kalender → Konto (kaputtes oder fehlendes JSON ergibt das leere Konto; nichts wird erraten). */
export function kontoAusText(text) {
  if (typeof text !== 'string' || text.trim() === '') return leeresKonto();
  try {
    return normalisiereKonto(JSON.parse(text));
  } catch {
    return leeresKonto();
  }
}

/**
 * Eingabe → ganze Cent oder null. Deutsch (`1.234,56`, `20.711`) und einfach (`1234.56`, `20711`), mit Minus (auch − und –), Plus, `€` und Leerzeichen.
 * Ein Punkt mit genau drei Ziffern danach gilt als Tausenderpunkt (`1.234` = 1234); mehr als zwei Nachkommastellen oder Unsinn ergeben null.
 */
export function centsAusText(text) {
  if (typeof text !== 'string') return null;
  const roh = text.replace(/[\s ]/g, '').replace(/€$/, '');
  const m = /^([+\-−–]?)(.*)$/.exec(roh);
  const vorzeichen = m[1] === '-' || m[1] === '−' || m[1] === '–' ? -1 : 1;
  const zahl = m[2];
  let euro;
  let cent = '00';
  if (/^\d+$/.test(zahl)) euro = zahl;
  else if (/^(\d{1,3}(\.\d{3})*|\d+),\d{1,2}$/.test(zahl)) [euro, cent] = zahl.replaceAll('.', '').split(',');
  else if (/^\d{1,3}(\.\d{3})+$/.test(zahl)) euro = zahl.replaceAll('.', '');
  else if (/^\d+\.\d{1,2}$/.test(zahl)) [euro, cent] = zahl.split('.');
  else return null;
  const betrag = Number(euro) * 100 + Number(cent.padEnd(2, '0'));
  if (!Number.isFinite(betrag) || betrag > MAX_CENTS) return null;
  return betrag === 0 ? 0 : vorzeichen * betrag;
}

/** 2071100 → „20.711 €“, 12345 → „123,45 €“, −35000 → „−350 €“ (Komma nur bei Cent ≠ 0). */
export function betragText(cents) {
  const abs = Math.abs(cents);
  const euro = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const rest = abs % 100;
  return `${cents < 0 ? '−' : ''}${euro}${rest === 0 ? '' : `,${pad2(rest)}`} €`;
}

/** Veränderung mit Vorzeichen: „+1.000 €“, „−250 €“, „±0 €“. */
export const deltaText = (cents) => (cents === 0 ? '±0 €' : cents > 0 ? `+${betragText(cents)}` : betragText(cents));

/**
 * Trägt einen Kontostand ein. `monat` ist ein ausdrücklicher Parameter (nicht „heute“): eine Eintragung, die wegen abgelaufener
 * Anmeldung erst später gespeichert wird, landet trotzdem im richtigen Monat.
 * Ein NEUER Eintrag ist nur am letzten Tag des Monats möglich (`heute` = Wiener Datum); ein bestehender darf (als Tippfehler) korrigiert
 * werden. In der Demo (`demo: true`) entfällt die Tagesregel, damit man die Funktion ausprobieren kann.
 */
export function setzeStand(konto, { person, monat, cents }, { heute, demo = false }) {
  if (!PERSONEN.includes(person)) throw new Error('Ungültige Person (Papa oder Mama).');
  if (!MONAT.test(String(monat))) throw new Error('Ungültiger Monat.');
  if (monat > String(heute).slice(0, 7)) throw new Error('Dieser Monat hat noch nicht begonnen.');
  if (!istBetrag(cents)) throw new Error('Der Betrag ist ungültig.');
  const vorhanden = konto.p[person][monat] !== undefined;
  if (!vorhanden) {
    if (!demo && heute !== letzterTag(monat)) throw new Error('Ein neuer Kontostand lässt sich nur am letzten Tag des Monats eintragen.');
    if (Object.keys(konto.p[person]).length >= MAX_MONATE) throw new Error(`Höchstens ${MAX_MONATE} Monate pro Person. Bitte vorher eine Sicherung speichern.`);
  }
  return { v: 1, p: { ...konto.p, [person]: { ...konto.p[person], [monat]: cents } } };
}

/** Wer in diesem Monat noch nichts eingetragen hat (in der Reihenfolge Papa, Mama). */
export const fehlendePersonen = (konto, monat) => PERSONEN.filter((p) => konto.p[p][monat] === undefined);

function vorherigerMonat(monat) {
  const [jahr, m] = monat.split('-').map(Number);
  return m === 1 ? `${jahr - 1}-12` : `${jahr}-${pad2(m - 1)}`;
}

/** Je Person: Monat → { stand, delta, seit, start } plus die Basis (voriger Eintrag) für „Zusammen“. */
function jePerson(eintraege) {
  const monate = Object.keys(eintraege).sort();
  const karte = new Map();
  monate.forEach((monat, i) => {
    const stand = eintraege[monat];
    if (i === 0) {
      karte.set(monat, { zeile: { stand, delta: null, seit: null, start: true }, basis: null });
      return;
    }
    const basis = monate[i - 1];
    karte.set(monat, { zeile: { stand, delta: stand - eintraege[basis], seit: vorherigerMonat(monat) === basis ? null : basis, start: false }, basis });
  });
  return karte;
}

/**
 * Zeilen für die Anzeige, neueste zuerst: { monat, papa, mama, zusammen } mit papa/mama = { stand, delta, seit, start } oder null.
 * delta = Stand minus voriger Eintrag derselben Person („seit“ nennt den Monat, wenn dazwischen einer fehlt; der erste Eintrag ist der Startwert).
 * zusammen = { stand, delta } nur wenn beide eingetragen haben; delta nur, wenn beide dieselbe Basis haben, sonst null.
 */
export function kontoVerlauf(konto) {
  const papa = jePerson(konto.p.papa);
  const mama = jePerson(konto.p.mama);
  const monate = [...new Set([...papa.keys(), ...mama.keys()])].sort().reverse();
  return monate.map((monat) => {
    const a = papa.get(monat);
    const b = mama.get(monat);
    let zusammen = null;
    if (a && b) {
      const gleicheBasis = a.zeile.delta !== null && b.zeile.delta !== null && a.basis === b.basis;
      zusammen = { stand: a.zeile.stand + b.zeile.stand, delta: gleicheBasis ? a.zeile.delta + b.zeile.delta : null };
    }
    return { monat, papa: a?.zeile ?? null, mama: b?.zeile ?? null, zusammen };
  });
}

/** „Seit Beginn“, Anzahl Monate, davon im Plus und Durchschnitt – nur aus Monaten mit Zusammen-Veränderung. */
export function kontoZusammenfassung(zeilen) {
  const deltas = zeilen.map((z) => z.zusammen?.delta).filter((d) => typeof d === 'number');
  const seitBeginn = deltas.reduce((a, b) => a + b, 0);
  return { seitBeginn, monate: deltas.length, imPlus: deltas.filter((d) => d > 0).length, durchschnitt: deltas.length > 0 ? Math.round(seitBeginn / deltas.length) : null };
}
