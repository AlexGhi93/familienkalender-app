// Sparziele: Ziele (z. B. „Auto“ 23.000 € bis Juli 2028, „Sommerurlaub“ 3.000 € bis ca. Juli 2027), gespeist aus der echten
// Ersparnis jedes Monats (Kontostand Papa + Mama). Rein, ohne DOM und ohne Netz; Beträge sind GANZE CENT.
// Gespeichert werden NUR die Ziele und die Verschiebungen aus „Frei verfügbar“; was jedem Ziel gehört, rechnet sparziele-rechnung.js
// jedes Mal neu aus dem Kontostand-Verlauf.
//
// Im Speicher (lesbare Namen):
//   { v: 1, z: [Ziel], m: [Verschiebung], fremd?: { z: [roh], m: [roh] } }
//   Ziel          { id, name, emoji, zielCents, datum, vorlaeufig, erstellt, beendet?: { monat, art } }
//     id          Kennung aus 0-9 und a-v (4–16 Zeichen, siehe neueZielId)
//     name        1–30 Zeichen; emoji aus ZIEL_EMOJIS; zielCents MIN_ZIEL_CENTS … MAX_ZIEL_CENTS (1 € … 999.999 €)
//     datum       'JJJJ-MM-TT' (fest) oder 'JJJJ-MM' (nur Monat); vorlaeufig = Datum noch nicht fix („bis ca.“)
//     erstellt    'JJJJ-MM' = erster Monat, dessen Ersparnis zählt (startMonat; beim Anlegen festgelegt, danach nie geändert)
//     beendet     von Hand beendet ab Monat `monat`: art 'ausgegeben' (das Gesparte ist weg) oder 'frei' (es geht zu „Frei“)
//   Verschiebung  { id, monat, ziel, cents } = `cents` aus „Frei“ zum Ziel `ziel`, nach der Aufteilung des Monats `monat`
//   fremd         Einträge, die diese Version nicht versteht (neuere Version, beschädigt): roh, nicht gezeigt, unverändert mitgeschrieben
//
// Im Kalender (verstecktes Ereignis „fkziele“, Task 2): JSON ≤ MAX_ZIELE_ZEICHEN mit KURZEN Schlüsseln:
//   { v: 1, z: [ … ], m: [ … ] }
//   Ziel:          i=id  n=name  e=emoji  c=zielCents  d=datum  p=vorlaeufig (nur 1)  s=erstellt  b=beendet { m=monat, a=art }
//   Verschiebung:  i=id  m=monat  z=ziel  c=cents
// Jede Änderung ist eine reine Funktion Daten → Daten, die (nach HTTP 412) auf die NEUESTE Fassung angewendet wird: das Argument wird
// nie verändert, zweimal angewendet = einmal angewendet. Unlesbare Daten (kaputtes JSON, andere Version) werden nie überschrieben.

import { isValidDate } from './dates.js';
import { zielSchluss } from './sparziele-rechnung.js';

export { sparMonate, sparVerlauf, startMonat, zielSchluss, zielMonat } from './sparziele-rechnung.js';

export const MAX_ZIELE_AKTIV = 20; // laufende Ziele; abgeschlossene zählen nicht
export const MAX_ZIEL_NAME = 30;
export const MIN_ZIEL_CENTS = 100; // 1 €
export const MAX_ZIEL_CENTS = 99_999_900; // 999.999 €
export const MAX_MUTARI = 200; // Verschiebungen aus „Frei“ insgesamt
export const MAX_ZIELE_ZEICHEN = 6000; // wie Kontostand und Fixkosten: Google kürzt Beschreibungen still bei 8192 Zeichen

/** Die Symbole zur Auswahl (fest; 🏖️ 🛋️ ✈️ mit Variantenzeichen U+FE0F). */
export const ZIEL_EMOJIS = Object.freeze(['🚗', '🏖️', '🏠', '🎁', '👧', '💍', '🛋️', '🎯', '🇷🇴', '✈️', '💻', '🎄']);

/** Arten, ein Ziel von Hand zu beenden. */
export const ZIEL_ENDE_ARTEN = Object.freeze(['ausgegeben', 'frei']);

export const TEXT_ZIELE_VOLL = 'Die Sparziele sind voll. Bitte abgeschlossene Ziele im Verlauf endgültig löschen.';

/** Meldung, wenn die gespeicherten Sparziele unlesbar sind (beschädigt oder von einer neueren App-Version): sie werden dann nie überschrieben. */
export const TEXT_ZIELE_GESPERRT = 'Die Sparziele sind unlesbar (beschädigt oder von einer neueren App-Version). Damit nichts verloren geht, lassen sie sich hier nicht ändern – bitte die App auf beiden Telefonen aktualisieren.';

/** Fehler „Sparziele gesperrt“ (Name 'ZieleGesperrt'): ein Adapter wirft ihn, statt unlesbare Sparziele zu überschreiben. */
export const zieleGesperrtFehler = () => Object.assign(new Error(TEXT_ZIELE_GESPERRT), { name: 'ZieleGesperrt' });

// ---------------------------------------------------------------- Hilfen

const MONAT = /^\d{4}-(0[1-9]|1[0-2])$/;
const KENNUNG = /^[0-9a-v]{4,16}$/;
const ID_ZEICHEN = '0123456789abcdefghijklmnopqrstuv';
const ID_LAENGE = 8;
const ZIEL_SCHLUESSEL = new Set(['i', 'n', 'e', 'c', 'd', 'p', 's', 'b']);
const ENDE_SCHLUESSEL = new Set(['m', 'a']);
const VERSCHIEBUNG_SCHLUESSEL = new Set(['i', 'm', 'z', 'c']);

const FEHLER_BETRAG = 'Bitte einen Zielbetrag zwischen 1 € und 999.999 € eingeben.';
const FEHLER_DATUM = 'Bitte angeben, bis wann gespart wird.';

/** Bereinigter Text; was kein Text ist, ergibt '' – nie ein Fehler. */
const sauber = (text) => (typeof text === 'string' ? text.normalize('NFC').replace(/\s+/g, ' ').trim() : '');
const zeichen = (text) => [...text].length; // Zeichen, nicht UTF-16-Einheiten
const istObjekt = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const istMonat = (x) => typeof x === 'string' && MONAT.test(x);
const istKennung = (x) => typeof x === 'string' && KENNUNG.test(x);
const istDatum = (x) => istMonat(x) || (typeof x === 'string' && isValidDate(x));
const istBetrag = (c) => Number.isInteger(c) && c >= MIN_ZIEL_CENTS && c <= MAX_ZIEL_CENTS;
const istBetrag1 = (c) => Number.isInteger(c) && c >= 1 && c <= MAX_ZIEL_CENTS; // Verschiebung: ab 1 Cent
const istEnde = (b) => istObjekt(b) && istMonat(b.monat) && ZIEL_ENDE_ARTEN.includes(b.art);

export const leereZiele = () => ({ v: 1, z: [], m: [] });

/** Neue Kennung aus 0-9 und a-v (8 Zeichen) – für Ziele und Verschiebungen. `zufall` wie Math.random, für Tests einspeisbar. */
export function neueZielId(zufall = Math.random) {
  let id = '';
  for (let i = 0; i < ID_LAENGE; i += 1) id += ID_ZEICHEN[Math.floor(zufall() * ID_ZEICHEN.length) % ID_ZEICHEN.length];
  return id;
}

/** Ist das Ziel am Tag `heute` abgeschlossen (automatisch nach dem Zielmonat oder von Hand)? */
const abgeschlossenAm = (ziel, heute) => zielSchluss(ziel).monat <= String(heute).slice(0, 7);

// ---------------------------------------------------------------- Prüfen und Normalisieren

/** Prüft den Aufbau (ohne „heute“): erste Fehlermeldung oder null. Kennung, Startmonat und Abschluss nur, wenn vorhanden. */
function aufbauFehler(e) {
  const name = sauber(e.name);
  if (name === '') return 'Bitte einen Namen eingeben.';
  if (zeichen(name) > MAX_ZIEL_NAME) return `Der Name darf höchstens ${MAX_ZIEL_NAME} Zeichen haben.`;
  if (!ZIEL_EMOJIS.includes(e.emoji)) return 'Bitte ein Symbol wählen.';
  if (!istBetrag(e.zielCents)) return FEHLER_BETRAG;
  if (!istDatum(e.datum)) return FEHLER_DATUM;
  if (e.id !== undefined && !istKennung(e.id)) return 'Ungültige Kennung.';
  if (e.erstellt !== undefined && !istMonat(e.erstellt)) return 'Ungültiger Startmonat.';
  if (e.beendet !== undefined && e.beendet !== null && !istEnde(e.beendet)) return 'Ungültiger Abschluss.';
  return null;
}

/**
 * Prüft einen Entwurf aus dem Formular → erste Fehlermeldung (deutsch, für die Oberfläche) oder null: Name 1–30 Zeichen, Symbol aus
 * der Liste, Betrag 1 € … 999.999 €, Datum gültig und nicht vor dem laufenden Monat (`heute`), und – mit `daten` – höchstens
 * MAX_ZIELE_AKTIV laufende Ziele (ein bestehendes darf immer geändert werden; fremde Einträge zählen vorsichtshalber mit).
 */
export function zielPruefen(entwurf, { heute, daten } = {}) {
  const e = istObjekt(entwurf) ? entwurf : {};
  const fehler = aufbauFehler(e);
  if (fehler) return fehler;
  if (heute !== undefined && e.datum.slice(0, 7) < String(heute).slice(0, 7)) return 'Das Datum liegt in der Vergangenheit – bitte einen Monat ab jetzt wählen.';
  if (daten && heute !== undefined && !(daten.z ?? []).some((z) => z.id === e.id)) {
    const laufend = (daten.z ?? []).filter((z) => !abgeschlossenAm(z, heute)).length + (daten.fremd?.z?.length ?? 0);
    if (laufend >= MAX_ZIELE_AKTIV) return `Höchstens ${MAX_ZIELE_AKTIV} laufende Sparziele.`;
  }
  return null;
}

/** Ein gültiges Ziel mit Kennung und Startmonat → bereinigt in fester Feldreihenfolge; sonst null. */
function normalisiereZiel(roh) {
  if (!istObjekt(roh) || aufbauFehler(roh) !== null || !istKennung(roh.id) || !istMonat(roh.erstellt)) return null;
  const z = { id: roh.id, name: sauber(roh.name), emoji: roh.emoji, zielCents: roh.zielCents, datum: roh.datum, vorlaeufig: roh.vorlaeufig === true, erstellt: roh.erstellt };
  if (istEnde(roh.beendet)) z.beendet = { monat: roh.beendet.monat, art: roh.beendet.art };
  return z;
}

/** Eine gültige Verschiebung → bereinigt; sonst null. */
function normalisiereVerschiebung(roh) {
  if (!istObjekt(roh) || !istKennung(roh.id) || !istMonat(roh.monat) || !istKennung(roh.ziel) || !istBetrag1(roh.cents)) return null;
  return { id: roh.id, monat: roh.monat, ziel: roh.ziel, cents: roh.cents };
}


/** Gültige Einträge einer Liste ohne doppelte Kennungen (der erste gilt). */
function eindeutig(liste, normalisiere) {
  const gesehen = new Set();
  const gut = [];
  for (const r of liste) {
    const x = normalisiere(r);
    if (x && !gesehen.has(x.id)) {
      gesehen.add(x.id);
      gut.push(x);
    }
  }
  return gut;
}

/** Daten mit diesen Listen und den fremden Einträgen von `alt` (nur, wenn es welche gibt). */
function mitFremd(z, m, alt) {
  const fremd = alt?.fremd;
  return fremd && (fremd.z?.length > 0 || fremd.m?.length > 0) ? { v: 1, z, m, fremd } : { v: 1, z, m };
}

function kurzZiel(z) {
  const k = { i: z.id, n: z.name, e: z.emoji, c: z.zielCents, d: z.datum };
  if (z.vorlaeufig) k.p = 1;
  k.s = z.erstellt;
  if (z.beendet) k.b = { m: z.beendet.monat, a: z.beendet.art };
  return k;
}

const kurzVerschiebung = (v) => ({ i: v.id, m: v.monat, z: v.ziel, c: v.cents });

/** Versteht diese Version einen Eintrag im Speicherformat? (Objekt nur mit bekannten Schlüsseln.) */
const bekannt = (k, schluessel) => istObjekt(k) && Object.keys(k).every((s) => schluessel.has(s));

function langZiel(k) {
  if (!bekannt(k, ZIEL_SCHLUESSEL) || ('b' in k && !bekannt(k.b, ENDE_SCHLUESSEL)) || ('p' in k && k.p !== 1)) return null;
  const z = { id: k.i, name: k.n, emoji: k.e, zielCents: k.c, datum: k.d, vorlaeufig: k.p === 1, erstellt: k.s };
  if ('b' in k) z.beendet = { monat: k.b.m, art: k.b.a };
  return normalisiereZiel(z);
}

const langVerschiebung = (k) => (bekannt(k, VERSCHIEBUNG_SCHLUESSEL) ? normalisiereVerschiebung({ id: k.i, monat: k.m, ziel: k.z, cents: k.c }) : null);

/**
 * Gelesene Daten im Speicherformat (kurze Schlüssel) → { daten, fremd }. Einträge, die diese Version nicht versteht (unbekanntes Feld,
 * unbekanntes Symbol, zu langer Name – vielleicht von einer neueren Version – oder beschädigt), landen roh in `fremd` = { z, m } und
 * bleiben auch in `daten.fremd` (nur wenn es welche gibt), damit sie beim Schreiben unverändert erhalten bleiben; nichts wird gekürzt.
 * Doppelte Kennungen fallen weg (der erste Eintrag gilt). Unbrauchbares ergibt leere Daten.
 */
export function normalisiereZiele(roh) {
  const fremd = { z: [], m: [] };
  if (!istObjekt(roh) || roh.v !== 1 || !Array.isArray(roh.z)) return { daten: leereZiele(), fremd };
  const z = [];
  const zIds = new Set();
  for (const k of roh.z) {
    const ziel = langZiel(k);
    if (!ziel) fremd.z.push(k);
    else if (!zIds.has(ziel.id)) {
      zIds.add(ziel.id);
      z.push(ziel);
    }
  }
  const m = [];
  const mIds = new Set();
  for (const k of Array.isArray(roh.m) ? roh.m : []) {
    const v = langVerschiebung(k);
    if (!v) fremd.m.push(k);
    else if (!mIds.has(v.id)) {
      mIds.add(v.id);
      m.push(v);
    }
  }
  return { daten: mitFremd(z, m, { fremd: JSON.parse(JSON.stringify(fremd)) }), fremd };
}

/** Die Daten als Text für die Beschreibung des Kalenderereignisses (kurze Schlüssel, fremde Einträge am Ende); zu voll → Fehler. */
export function zieleText(daten) {
  const z = eindeutig(daten?.z ?? [], normalisiereZiel);
  const m = eindeutig(daten?.m ?? [], normalisiereVerschiebung);
  const text = JSON.stringify({ v: 1, z: [...z.map(kurzZiel), ...(daten?.fremd?.z ?? [])], m: [...m.map(kurzVerschiebung), ...(daten?.fremd?.m ?? [])] });
  if (text.length > MAX_ZIELE_ZEICHEN) throw new Error(TEXT_ZIELE_VOLL);
  return text;
}

/**
 * Text aus dem Kalender → { daten, unlesbar }. Wirft nie. Fehlender Text → leere Daten. Unlesbarer Text (kein JSON, andere Version `v`,
 * `z` keine Liste, `m` vorhanden aber keine Liste) → leere Daten mit `unlesbar: true`: solche Daten dürfen NIE überschrieben werden
 * (die Adapter lehnen das Schreiben ab, siehe zieleGesperrtFehler). Fremde Einträge siehe normalisiereZiele.
 */
export function zieleLesen(text) {
  if (typeof text !== 'string' || text.trim() === '') return { daten: leereZiele(), unlesbar: false };
  let roh;
  try {
    roh = JSON.parse(text);
  } catch {
    roh = null;
  }
  if (!istObjekt(roh) || roh.v !== 1 || !Array.isArray(roh.z) || (roh.m !== undefined && !Array.isArray(roh.m))) return { daten: leereZiele(), unlesbar: true };
  return { daten: normalisiereZiele(roh).daten, unlesbar: false };
}

// ---------------------------------------------------------------- Änderungen (rein, wiederholbar)

/** So viele Zeichen kostet ein Abschluss im Text: ,"b":{"m":"JJJJ-MM","a":"ausgegeben"}. */
const ENDE_ZEICHEN = JSON.stringify({ b: { m: '2000-01', a: 'ausgegeben' } }).length - 1;

/**
 * Neue Daten mit diesen Listen; wirft, wenn sie nicht mehr in den Kalender passen. Mit `reserve` (Anlegen, Ändern, Verschieben) muss
 * zusätzlich Platz bleiben, um JEDES noch nicht beendete Ziel später zu beenden – so gelingt Beenden immer, und weil nur
 * abgeschlossene Ziele gelöscht werden, lassen sich volle Daten stets leeren (beenden, dann im Verlauf löschen).
 */
function mit(alt, z, m, reserve) {
  const neu = mitFremd(z, m, alt);
  const laenge = zieleText(neu).length;
  if (reserve && laenge + ENDE_ZEICHEN * z.filter((x) => !x.beendet).length > MAX_ZIELE_ZEICHEN) throw new Error(TEXT_ZIELE_VOLL);
  return neu;
}

/**
 * Legt ein Ziel an oder ändert das mit derselben Kennung (an derselben Stelle). Wirft mit der Meldung aus zielPruefen.
 * Neu: braucht `erstellt` (startMonat) und ist nie schon beendet. Ändern: Name, Symbol, Betrag, Datum, vorläufig – Startmonat und
 * Abschluss bleiben; ein abgeschlossenes Ziel lässt sich nicht mehr ändern. Gleiche Werte → dieselben Daten zurück.
 */
export function zielSetzen(daten, ziel, { heute }) {
  if (!isValidDate(String(heute))) throw new Error('Ungültiges Datum (heute).');
  if (!istObjekt(ziel) || !istKennung(ziel.id)) throw new Error('Ungültige Kennung.');
  const liste = daten.z ?? [];
  const alt = liste.find((z) => z.id === ziel.id);
  if (alt && abgeschlossenAm(alt, heute)) throw new Error('Ein abgeschlossenes Ziel lässt sich nicht mehr ändern.');
  const entwurf = alt ? { ...ziel, erstellt: alt.erstellt, beendet: alt.beendet } : { ...ziel, beendet: undefined };
  const fehler = zielPruefen(entwurf, { heute, daten });
  if (fehler) throw new Error(fehler);
  if (!istMonat(entwurf.erstellt)) throw new Error('Ungültiger Startmonat.');
  const neu = normalisiereZiel(entwurf);
  if (!alt) return mit(daten, [...liste, neu], daten.m ?? [], true);
  if (JSON.stringify(neu) === JSON.stringify(alt)) return daten;
  return mit(daten, liste.map((z) => (z.id === neu.id ? neu : z)), daten.m ?? [], true);
}

/**
 * Beendet ein Ziel von Hand ab `monat` ('JJJJ-MM'): art 'ausgegeben' (das Gesparte ist weg) oder 'frei' (es geht zu „Frei“). Der erste
 * Abschluss gilt (wiederholbar); eine unbekannte Kennung ändert nichts.
 */
export function zielBeenden(daten, id, { monat, art } = {}) {
  if (!istEnde({ monat, art })) throw new Error('Ungültiger Abschluss.');
  const liste = daten.z ?? [];
  const alt = liste.find((z) => z.id === id);
  if (!alt || alt.beendet) return daten;
  return mit(daten, liste.map((z) => (z.id === id ? { ...z, beendet: { monat, art } } : z)), daten.m ?? [], false);
}

/** Löscht ein Ziel endgültig – nur ein am Tag `heute` abgeschlossenes – samt seinen Verschiebungen; eine unbekannte Kennung ändert nichts. */
export function zielLoeschen(daten, id, { heute }) {
  if (!isValidDate(String(heute))) throw new Error('Ungültiges Datum (heute).');
  const liste = daten.z ?? [];
  const alt = liste.find((z) => z.id === id);
  if (!alt) return daten;
  if (!abgeschlossenAm(alt, heute)) throw new Error('Nur abgeschlossene Ziele lassen sich endgültig löschen.');
  return mitFremd(liste.filter((z) => z.id !== id), (daten.m ?? []).filter((v) => v.ziel !== id), daten);
}

/**
 * Verschiebt `cents` aus „Frei“ zum Ziel `ziel`, wirksam nach der Aufteilung des Monats `monat`. Gedeckelt wird erst in der Rechnung
 * (auf das dann verfügbare „Frei“). `id` macht es wiederholbar. Das Ziel muss es (noch) geben.
 */
export function freiVerschieben(daten, { id, monat, ziel, cents } = {}) {
  if (!istKennung(id)) throw new Error('Ungültige Kennung.');
  if (!istMonat(monat)) throw new Error('Ungültiger Monat.');
  if (!istBetrag1(cents)) throw new Error('Bitte einen Betrag zwischen 0,01 € und 999.999 € eingeben.');
  const m = daten.m ?? [];
  if (m.some((v) => v.id === id)) return daten;
  if (!(daten.z ?? []).some((z) => z.id === ziel)) throw new Error('Dieses Sparziel gibt es nicht mehr.');
  if (m.length + (daten.fremd?.m?.length ?? 0) >= MAX_MUTARI) throw new Error(`Höchstens ${MAX_MUTARI} Verschiebungen. Bitte abgeschlossene Ziele im Verlauf endgültig löschen.`);
  return mit(daten, daten.z, [...m, { id, monat, ziel, cents }], true);
}
