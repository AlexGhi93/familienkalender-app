// Sparziele: Ziele (z. B. „Auto“ 23.000 € bis Juli 2028, „Sommerurlaub“ 3.000 € bis ca. Juli 2027), gespeist aus der echten
// Ersparnis jedes Monats (Kontostand Papa + Mama). Rein, ohne DOM und ohne Netz; Beträge sind GANZE CENT.
// Gespeichert werden NUR die Ziele und die Verschiebungen aus „Frei verfügbar“; was jedem Ziel gehört, rechnet sparziele-rechnung.js
// jedes Mal neu aus dem Kontostand-Verlauf.
//
// Im Speicher (lesbare Namen):
//   { v: 1, beginn?, z: [Ziel], m: [Verschiebung], fremd?: { z: [roh], m: [roh] } }
//   beginn        'JJJJ-MM' = ab hier wird gerechnet: der Startmonat des ersten Ziels; rückt nie nach hinten (auch nicht, wenn ein
//                 Ziel gelöscht wird), damit sich die Vergangenheit nie ändert. Fehlt es (alte Daten) → frühester `erstellt`.
//   Ziel          { id, name, emoji, zielCents, datum, vorlaeufig, erstellt, beendet?: { monat, art }, aus?: true, geloescht?: true }
//     id          Kennung aus 0-9 und a-v (4–16 Zeichen, siehe neueZielId)
//     name        1–30 Zeichen; emoji aus ZIEL_EMOJIS; zielCents MIN_ZIEL_CENTS … MAX_ZIEL_CENTS (1 € … 999.999 €)
//     datum       'JJJJ-MM-TT' (fest) oder 'JJJJ-MM' (nur Monat); vorlaeufig = Datum noch nicht fix („bis ca.“)
//     erstellt    'JJJJ-MM' = erster Monat, dessen Ersparnis zählt (startMonat; beim Anlegen festgelegt, danach nie geändert)
//     beendet     von Hand beendet ab Monat `monat`: art 'ausgegeben' (das Gesparte ist weg) oder 'frei' (es geht zu „Frei“)
//     aus         im Verlauf ausgeblendet (nur Anzeige; die Rechnung bleibt gleich)
//     geloescht   gelöscht, solange es Spuren in der Rechnung hat (nur zusammen mit `beendet`, art 'frei'): sein Gespartes ging im Monat
//                 des Löschens zu „Frei“; es erscheint nur noch als Zeile „… gelöscht“ in diesem Monat (siehe zielLoeschen)
//   Verschiebung  { id, monat, ziel, cents } = `cents` aus „Frei“ zum Ziel `ziel`, nach der Aufteilung des Monats `monat`
//   fremd         Einträge, die diese Version nicht versteht (neuere Version, beschädigt): roh, nicht gezeigt, unverändert mitgeschrieben
//
// Im Kalender (verstecktes Ereignis „fksparen“ – „fkziele“ ginge nicht, z liegt außerhalb von 0-9 und a-v): JSON ≤ MAX_ZIELE_ZEICHEN mit KURZEN Schlüsseln:
//   { v: 1, a: beginn, z: [ … ], m: [ … ] }
//   Ziel:          i=id  n=name  e=emoji  c=zielCents  d=datum  p=vorlaeufig (nur 1)  s=erstellt  b=beendet { m=monat, a=art }  h=aus (nur 1)
//                  g=geloescht (nur 1 und nur mit b; ältere Versionen lesen ein solches Ziel als „fremd“ und lassen es unverändert)
//   Verschiebung:  i=id  m=monat  z=ziel  c=cents
// Neue Felder: auf oberster Ebene (neben v, a, z, m) versteht diese Version nichts Weiteres und schreibt es nicht mit – eine spätere
// Version, die dort etwas ergänzt, muss deshalb `v` erhöhen (dann ist alles hier „unlesbar“ und wird nie überschrieben). Neue Felder
// in einzelnen Zielen oder Verschiebungen sind dagegen sicher: solche Einträge bleiben als `fremd` unverändert erhalten.
// Jede Änderung ist eine reine Funktion Daten → Daten, die (nach HTTP 412) auf die NEUESTE Fassung angewendet wird: das Argument wird
// nie verändert, zweimal angewendet = einmal angewendet. Unlesbare Daten (kaputtes JSON, andere Version) werden nie überschrieben.
// Löschen (zielLoeschArt) – die Vergangenheit ändert sich nie: ein Ziel ohne jede Spur in der Rechnung wird wirklich entfernt; ein
// LAUFENDES Ziel mit Spur (es hat Geld bekommen) wird im laufenden Monat „gelöscht“ abgeschlossen (beendet 'frei' + geloescht): sein
// Gespartes geht zu „Frei“, frühere Monate und abgeschlossene Ziele bleiben genau gleich. Ein ABGESCHLOSSENES Ziel mit Geld lässt sich
// nur ausblenden (seine Zahlung steckt im Kontostand). Verschiebungen aus „Frei“ des LAUFENDEN Monats zu einem laufenden Ziel lassen
// sich rückgängig machen (verschiebungLoeschen); ältere bleiben fest. Für „Rückgängig“ nach dem Löschen: zielSpur → zielWiederherstellen.
// Alles, was ein Datum „heute“ braucht, wirft sofort bei einem ungültigen (kein Text 'JJJJ-MM-TT'), siehe heutePruefen.

import { isValidDate } from './dates.js';
import { heutePruefen, sparVerlauf, zieleBeginn, zielSchluss } from './sparziele-rechnung.js';

export { heutePruefen, sparMonate, sparVerlauf, startMonat, zieleBeginn, zielSchluss, zielMonat } from './sparziele-rechnung.js';

export const MAX_ZIELE_AKTIV = 20; // laufende Ziele; abgeschlossene zählen nicht
export const MAX_ZIEL_NAME = 30;
export const MIN_ZIEL_CENTS = 100; // 1 €
export const MAX_ZIEL_CENTS = 99_999_900; // 999.999 €
export const MAX_VERSCHIEBUNGEN = 200; // Verschiebungen aus „Frei“ insgesamt (der Platz im Kalender reicht meist schon früher nicht)
export const MAX_ZIELE_ZEICHEN = 6000; // wie Kontostand und Fixkosten: Google kürzt Beschreibungen still bei 8192 Zeichen

/** Die Symbole zur Auswahl (fest; 🏖️ 🛋️ ✈️ mit Variantenzeichen U+FE0F). */
export const ZIEL_EMOJIS = Object.freeze(['🚗', '🏖️', '🏠', '🎁', '👧', '💍', '🛋️', '🎯', '🇷🇴', '✈️', '💻', '🎄']);

/** Arten, ein Ziel von Hand zu beenden. */
export const ZIEL_ENDE_ARTEN = Object.freeze(['ausgegeben', 'frei']);

export const TEXT_ZIELE_VOLL = 'Die Sparziele sind voll: im Kalender ist kein Platz für ein weiteres Ziel. Laufende Ziele und Ziele, die nie Geld bekommen haben, lassen sich löschen.';
export const TEXT_VERSCHIEBUNGEN_VOLL = 'Kein Platz mehr für weitere Verschiebungen aus „Frei“ – der Speicher der Sparziele im Kalender ist voll.';
export const TEXT_NICHT_LOESCHBAR = 'Dieses Ziel ist abgeschlossen und hat Geld bekommen – es kann nur ausgeblendet werden.';
export const TEXT_VERSCHIEBUNG_ALT = 'Nur Verschiebungen aus diesem Monat lassen sich rückgängig machen – frühere Monate bleiben, wie sie sind.';
export const TEXT_VERSCHIEBUNG_ABGESCHLOSSEN = 'Dieses Sparziel ist schon abgeschlossen – die Verschiebung gehört zu seinem Abschluss und lässt sich nicht mehr rückgängig machen.';
const TEXT_ZIEL_WEG = 'Dieses Sparziel gibt es nicht mehr.';
const TEXT_KENNUNG_NEUER = 'Das lässt sich nicht zurückholen: das andere Telefon hat inzwischen mit einer neueren App-Version etwas unter derselben Kennung gespeichert.';
const TEXT_ZIEL_NEUERE_VERSION = 'Dieses Sparziel hat das andere Telefon mit einer neueren App-Version geändert. Bitte die App aktualisieren.';
export const TEXT_NUR_MIT_NEUEM_DATUM = 'Ein nach dem Zieldatum abgeschlossenes Ziel lässt sich nur mit einem neuen Datum ab dem laufenden Monat wieder öffnen.';
export const TEXT_NUR_ABGESCHLOSSENE = 'Nur abgeschlossene Sparziele lassen sich ausblenden.';

/** Meldung, wenn die gespeicherten Sparziele unlesbar sind (beschädigt oder von einer neueren App-Version): sie werden dann nie überschrieben. */
export const TEXT_ZIELE_GESPERRT = 'Die Sparziele sind unlesbar (beschädigt oder von einer neueren App-Version). Damit nichts verloren geht, lassen sie sich hier nicht ändern – bitte die App auf beiden Telefonen aktualisieren.';

/** Meldung, wenn die Sparziele beim Laden nicht gelesen werden konnten (Netz): sie bleiben, wie zuletzt gelesen, aber gesperrt. */
export const TEXT_ZIELE_NICHT_GELADEN = 'Die Sparziele konnten nicht geladen werden. Bis sie wieder gelesen sind, lassen sie sich nicht ändern – bitte später noch einmal versuchen.';

/** Fehler „Sparziele gesperrt“ (Name 'ZieleGesperrt'): ein Adapter wirft ihn, statt unlesbare Sparziele zu überschreiben. */
export const zieleGesperrtFehler = () => Object.assign(new Error(TEXT_ZIELE_GESPERRT), { name: 'ZieleGesperrt' });

// ---------------------------------------------------------------- Hilfen

const MONAT = /^\d{4}-(0[1-9]|1[0-2])$/;
const KENNUNG = /^[0-9a-v]{4,16}$/;
const ID_ZEICHEN = '0123456789abcdefghijklmnopqrstuv';
const ID_LAENGE = 8;
const ZIEL_SCHLUESSEL = new Set(['i', 'n', 'e', 'c', 'd', 'p', 's', 'b', 'h', 'g']);
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

/** Ist das Ziel am Tag `heute` (geprüft) abgeschlossen (automatisch nach dem Zielmonat oder von Hand)? */
const abgeschlossenAm = (ziel, heute) => zielSchluss(ziel).monat <= heute.slice(0, 7);

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
 * der Liste, Betrag 1 € … 999.999 €, Datum gültig, nicht vor dem laufenden Monat (`heute`, Pflicht) und – wenn `erstellt` da ist –
 * nicht vor dem ersten Sparmonat, und – mit `daten` – höchstens MAX_ZIELE_AKTIV laufende Ziele (ein bestehendes darf immer
 * geändert werden; fremde Einträge zählen vorsichtshalber mit).
 */
export function zielPruefen(entwurf, { heute, daten } = {}) {
  heutePruefen(heute);
  const e = istObjekt(entwurf) ? entwurf : {};
  const fehler = aufbauFehler(e);
  if (fehler) return fehler;
  if (e.datum.slice(0, 7) < heute.slice(0, 7)) return 'Das Datum liegt in der Vergangenheit – bitte einen Monat ab jetzt wählen.';
  if (e.erstellt !== undefined && e.datum.slice(0, 7) < e.erstellt) return 'Das Zieldatum liegt vor dem ersten Sparmonat – bitte einen späteren Monat wählen.';
  if (daten && !(daten.z ?? []).some((z) => z.id === e.id)) {
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
  if (roh.aus === true) z.aus = true;
  if (roh.geloescht === true && z.beendet) z.geloescht = true;
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

/**
 * Daten mit diesen Listen, dem Beginn (frühester aus `alt` und den Startmonaten von `z`: rückt nie nach hinten) und den fremden
 * Einträgen von `alt` (nur, wenn es welche gibt).
 */
function baue(alt, z, m) {
  const beginn = zieleBeginn({ beginn: zieleBeginn(alt), z });
  const d = beginn === null ? { v: 1, z, m } : { v: 1, beginn, z, m };
  const fremd = alt?.fremd;
  if (fremd && (fremd.z?.length > 0 || fremd.m?.length > 0)) d.fremd = fremd;
  return d;
}

function kurzZiel(z) {
  const k = { i: z.id, n: z.name, e: z.emoji, c: z.zielCents, d: z.datum };
  if (z.vorlaeufig) k.p = 1;
  k.s = z.erstellt;
  if (z.beendet) k.b = { m: z.beendet.monat, a: z.beendet.art };
  if (z.aus) k.h = 1;
  if (z.geloescht) k.g = 1;
  return k;
}

const kurzVerschiebung = (v) => ({ i: v.id, m: v.monat, z: v.ziel, c: v.cents });

/** Versteht diese Version einen Eintrag im Speicherformat? (Objekt nur mit bekannten Schlüsseln.) */
const bekannt = (k, schluessel) => istObjekt(k) && Object.keys(k).every((s) => schluessel.has(s));

function langZiel(k) {
  if (!bekannt(k, ZIEL_SCHLUESSEL) || ('b' in k && !bekannt(k.b, ENDE_SCHLUESSEL)) || ('p' in k && k.p !== 1) || ('h' in k && k.h !== 1)) return null;
  if ('g' in k && (k.g !== 1 || !('b' in k))) return null; // „gelöscht“ nur mit Abschluss – sonst unverändert als fremd erhalten
  const z = { id: k.i, name: k.n, emoji: k.e, zielCents: k.c, datum: k.d, vorlaeufig: k.p === 1, erstellt: k.s };
  if ('b' in k) z.beendet = { monat: k.b.m, art: k.b.a };
  if (k.h === 1) z.aus = true;
  if (k.g === 1) z.geloescht = true;
  return normalisiereZiel(z);
}

const langVerschiebung = (k) => (bekannt(k, VERSCHIEBUNG_SCHLUESSEL) ? normalisiereVerschiebung({ id: k.i, monat: k.m, ziel: k.z, cents: k.c }) : null);

/**
 * Gelesene Daten im Speicherformat (kurze Schlüssel) → { daten, fremd }. Einträge, die diese Version nicht versteht (unbekanntes Feld,
 * unbekanntes Symbol, zu langer Name – vielleicht von einer neueren Version – oder beschädigt), landen roh in `fremd` = { z, m } und
 * bleiben auch in `daten.fremd` (nur wenn es welche gibt), damit sie beim Schreiben unverändert erhalten bleiben; nichts wird gekürzt.
 * Doppelte Kennungen fallen weg (der erste Eintrag gilt). Unbrauchbares ergibt leere Daten. `a` = beginn (ungültig oder fehlend →
 * frühester `erstellt`).
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
  const beginn = typeof roh.a === 'string' && MONAT.test(roh.a) ? roh.a : null;
  return { daten: baue({ beginn, fremd: JSON.parse(JSON.stringify(fremd)) }, z, m), fremd };
}

/** Die Daten als Text für die Beschreibung des Kalenderereignisses (kurze Schlüssel, fremde Einträge am Ende); zu voll → Fehler. */
export function zieleText(daten) {
  const z = eindeutig(daten?.z ?? [], normalisiereZiel);
  const m = eindeutig(daten?.m ?? [], normalisiereVerschiebung);
  const beginn = zieleBeginn({ beginn: daten?.beginn, z });
  const kopf = beginn === null ? { v: 1 } : { v: 1, a: beginn };
  const text = JSON.stringify({ ...kopf, z: [...z.map(kurzZiel), ...(daten?.fremd?.z ?? [])], m: [...m.map(kurzVerschiebung), ...(daten?.fremd?.m ?? [])] });
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

const anzahl = (n, eins, mehr) => `${n} ${n === 1 ? eins : mehr}`;

/**
 * Hinweise zum Gelesenen ({ daten, unlesbar } wie aus zieleLesen) für die Anzeige: unlesbar → eine klare Warnung (leer gezeigt, gesperrt);
 * sonst je eine Zeile, wenn Ziele bzw. Verschiebungen nicht verstanden wurden (sie bleiben gespeichert). Nichts davon → [].
 */
export function zieleWarnungen({ daten, unlesbar } = {}) {
  if (unlesbar) return ['Die Sparziele sind unlesbar (beschädigt oder von einer neueren App-Version); sie werden leer gezeigt und lassen sich nicht ändern.'];
  const warnungen = [];
  const z = daten?.fremd?.z?.length ?? 0;
  const m = daten?.fremd?.m?.length ?? 0;
  if (z > 0) warnungen.push(`${anzahl(z, 'Sparziel konnte', 'Sparziele konnten')} nicht gelesen werden (beschädigt oder von einer neueren App-Version); ${z === 1 ? 'es bleibt' : 'sie bleiben'} gespeichert, ${z === 1 ? 'wird' : 'werden'} hier aber nicht gezeigt.`);
  if (m > 0) warnungen.push(`${anzahl(m, 'Verschiebung konnte', 'Verschiebungen konnten')} nicht gelesen werden (beschädigt oder von einer neueren App-Version); ${m === 1 ? 'sie bleibt' : 'sie bleiben'} gespeichert.`);
  return warnungen;
}

// ---------------------------------------------------------------- Änderungen (rein, wiederholbar)

/** So viele Zeichen kosten ein Abschluss ,"b":{"m":"JJJJ-MM","a":"ausgegeben"} und das Ausblenden ,"h":1 im Text. */
const ENDE_ZEICHEN = JSON.stringify({ b: { m: '2000-01', a: 'ausgegeben' } }).length - 1;
const AUS_ZEICHEN = JSON.stringify({ h: 1 }).length - 1;

/**
 * Neue Daten mit diesen Listen; wirft `meldung`, wenn sie nicht mehr in den Kalender passen. Mit `reserve` (Anlegen, Ändern,
 * Verschieben) muss zusätzlich Platz bleiben, um JEDES Ziel später zu beenden und auszublenden – so gelingen Beenden und Ausblenden
 * immer, auch wenn der Speicher voll ist.
 */
function mit(alt, z, m, reserve, meldung = TEXT_ZIELE_VOLL) {
  const neu = baue(alt, z, m);
  let laenge;
  try {
    laenge = zieleText(neu).length;
  } catch {
    throw new Error(meldung);
  }
  // ,"g":1 (gelöscht) ist so lang wie ,"h":1: ein „gelöscht“ abgeschlossenes Ziel braucht kein Ausblenden mehr und nutzt diese Reserve
  const vorrat = z.reduce((n, x) => n + (x.beendet ? 0 : ENDE_ZEICHEN) + (x.aus || x.geloescht ? 0 : AUS_ZEICHEN), 0);
  if (reserve && laenge + vorrat > MAX_ZIELE_ZEICHEN) throw new Error(meldung);
  return neu;
}

/**
 * Legt ein Ziel an oder ändert das mit derselben Kennung (an derselben Stelle). Wirft mit der Meldung aus zielPruefen.
 * Neu: braucht `erstellt` (startMonat) und ist nie schon beendet. Ändern: Name, Symbol, Betrag, Datum, vorläufig – Startmonat und
 * Abschluss bleiben. Ein von Hand beendetes Ziel lässt sich nicht mehr ändern; ein nur AUTOMATISCH abgeschlossenes (Zielmonat vorbei,
 * kein `beendet`) wird mit einem neuen Datum ab dem laufenden Monat wieder geöffnet (z. B. vorläufiges Urlaubsdatum verschoben) – es
 * war nie wirklich abgeschlossen, die Rechnung läuft weiter, als hätte es immer dieses Datum gehabt; „ausgeblendet“ fällt dabei weg.
 * Gleiche Werte → dieselben Daten zurück.
 */
export function zielSetzen(daten, ziel, { heute } = {}) {
  heutePruefen(heute);
  if (!istObjekt(ziel) || !istKennung(ziel.id)) throw new Error('Ungültige Kennung.');
  const liste = daten.z ?? [];
  const alt = liste.find((z) => z.id === ziel.id);
  const wiederOeffnen = Boolean(alt) && abgeschlossenAm(alt, heute);
  if (wiederOeffnen && alt.beendet) throw new Error('Ein abgeschlossenes Ziel lässt sich nicht mehr ändern.');
  if (wiederOeffnen && !(istDatum(ziel.datum) && ziel.datum.slice(0, 7) >= heute.slice(0, 7))) throw new Error(TEXT_NUR_MIT_NEUEM_DATUM);
  const entwurf = alt ? { ...ziel, erstellt: alt.erstellt, beendet: alt.beendet, aus: wiederOeffnen ? undefined : alt.aus } : { ...ziel, beendet: undefined, aus: undefined };
  const fehler = zielPruefen(entwurf, { heute, daten });
  if (fehler) throw new Error(fehler);
  if (wiederOeffnen) {
    const laufend = liste.filter((z) => z.id !== alt.id && !abgeschlossenAm(z, heute)).length + (daten.fremd?.z?.length ?? 0);
    if (laufend >= MAX_ZIELE_AKTIV) throw new Error(`Höchstens ${MAX_ZIELE_AKTIV} laufende Sparziele.`);
  }
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

/** Der Verlauf ohne jede Spur des Ziels `id` (für den Vergleich in zielLoeschbar). */
function spurenlos(verlauf, id) {
  const monate = verlauf.monate
    .map((m) => ({ ...m, zuteilung: m.zuteilung.filter((t) => t.ziel !== id), abschluss: m.abschluss.filter((a) => a.ziel !== id), verschoben: m.verschoben.filter((v) => v.ziel !== id) }))
    .filter((m) => m.gespart !== null || m.abschluss.length > 0 || m.verschoben.length > 0);
  return JSON.stringify({ monate, ziele: verlauf.ziele.filter((z) => z.id !== id), frei: verlauf.frei });
}

const ohneZiel = (daten, id) => baue(daten, (daten.z ?? []).filter((z) => z.id !== id), (daten.m ?? []).filter((v) => v.ziel !== id));

/**
 * Wie lässt sich das Ziel `id` am Tag `heute` löschen, ohne dass sich die Vergangenheit ändert? → 'weg' | 'beenden' | null.
 * 'weg': es hat in der ganzen Geschichte nie Geld bekommen (jede Zuteilung und jede Verschiebung zu ihm ist 0 – z. B. versehentlich
 * angelegt) UND die Rechnung bleibt ohne es in jedem Monat genau gleich (auch keine Rundung verschiebt sich) – es wird wirklich entfernt.
 * 'beenden': es läuft noch (weder von Hand noch automatisch abgeschlossen), hat aber Spuren – es wird im laufenden Monat „gelöscht“
 * abgeschlossen (sein Gespartes geht zu „Frei“). null: abgeschlossen mit Geld (die Zahlung steckt im Kontostand) oder unbekannt.
 * Rein; `heute` wie bei sparVerlauf.
 */
export function zielLoeschArt(daten, konto, heute, id) {
  heutePruefen(heute);
  const ziel = (daten?.z ?? []).find((z) => z.id === id);
  if (!ziel) return null;
  const mitZiel = sparVerlauf(daten, konto, heute);
  const bekommen = mitZiel.monate.some((m) => m.zuteilung.some((t) => t.ziel === id && t.cents !== 0) || m.verschoben.some((v) => v.ziel === id && v.cents !== 0));
  if (!bekommen && spurenlos(mitZiel, id) === spurenlos(sparVerlauf(ohneZiel(daten, id), konto, heute), id)) return 'weg';
  return abgeschlossenAm(ziel, heute) ? null : 'beenden';
}

/** Darf das Ziel `id` gelöscht werden? Laufend immer, abgeschlossen nur ohne Geld (siehe zielLoeschArt). */
export const zielLoeschbar = (daten, konto, heute, id) => zielLoeschArt(daten, konto, heute, id) !== null;

/**
 * Löscht ein Ziel (siehe zielLoeschArt; mit `konto` und `heute`): ohne Spuren wirklich, samt seinen Verschiebungen; ein laufendes mit
 * Spuren „gelöscht“ abgeschlossen ab dem laufenden Monat (beendet 'frei' + geloescht; ein späterer Abschluss von Hand und „aus“
 * fallen weg, die Verschiebungen bleiben – die Vergangenheit ändert sich nie). Sonst TEXT_NICHT_LOESCHBAR. `beginn` bleibt. Eine
 * unbekannte Kennung ändert nichts. Passt immer in den Kalender (es nutzt die Reserve für Beenden und Ausblenden, siehe mit).
 */
export function zielLoeschen(daten, id, { heute, konto } = {}) {
  heutePruefen(heute);
  const liste = daten.z ?? [];
  if (!liste.some((z) => z.id === id)) return daten;
  const art = zielLoeschArt(daten, konto, heute, id);
  if (art === 'weg') return ohneZiel(daten, id);
  if (art !== 'beenden') throw new Error(TEXT_NICHT_LOESCHBAR);
  const geloescht = (z) => {
    const { aus: _aus, ...rest } = z;
    return normalisiereZiel({ ...rest, beendet: { monat: heute.slice(0, 7), art: 'frei' }, geloescht: true });
  };
  return mit(daten, liste.map((z) => (z.id === id ? geloescht(z) : z)), daten.m ?? [], false);
}

/**
 * Was zielLoeschen von Ziel `id` entfernen würde – für „Rückgängig“: { ziel, stelle, verschiebungen: [{ verschiebung, stelle }] }
 * (`stelle` = Platz in der Liste); unbekannte Kennung → null.
 */
export function zielSpur(daten, id) {
  const stelle = (daten?.z ?? []).findIndex((z) => z.id === id);
  if (stelle < 0) return null;
  const verschiebungen = [];
  (daten.m ?? []).forEach((v, i) => {
    if (v.ziel === id) verschiebungen.push({ verschiebung: v, stelle: i });
  });
  return { ziel: daten.z[stelle], stelle, verschiebungen };
}

/** Gehört die Kennung `id` einem Eintrag, den nur eine neuere Version versteht (`art` 'z' = Ziele, 'm' = Verschiebungen)? */
const fremdeKennung = (daten, id, art) => (daten?.fremd?.[art] ?? []).some((k) => k?.i === id);

/** `liste` mit `eintrag` an der Stelle `stelle` (begrenzt auf 0 … Länge). */
const eingefuegt = (liste, eintrag, stelle) => {
  const i = Math.min(Math.max(0, Number.isInteger(stelle) ? stelle : liste.length), liste.length);
  return [...liste.slice(0, i), eintrag, ...liste.slice(i)];
};

/**
 * „Rückgängig“ nach zielLoeschen: holt das Ziel aus `spur` (siehe zielSpur) an seine Stelle zurück, dazu seine Verschiebungen an ihren
 * Stellen – unverändert (Startmonat, Abschluss, Beträge). Ein „gelöscht“ abgeschlossenes Ziel bekommt seine Fassung aus `spur` zurück
 * (Abschluss und Kennzeichen fallen weg). Gibt es das Ziel schon wieder → dieselben Daten (wiederholbar). Wirft mit
 * klarer Meldung, wenn die Kennung inzwischen einem Eintrag einer neueren Version gehört, wenn schon MAX_ZIELE_AKTIV Ziele laufen oder
 * wenn der Platz im Kalender nicht reicht. `beginn` bleibt, wie es war (es ist beim Löschen nie nach hinten gerückt).
 */
export function zielWiederherstellen(daten, spur, { heute } = {}) {
  heutePruefen(heute);
  const ziel = normalisiereZiel(spur?.ziel);
  if (!ziel) throw new Error('Ungültiges Sparziel.');
  const liste = daten.z ?? [];
  const vorhanden = liste.find((z) => z.id === ziel.id);
  if (vorhanden && !(vorhanden.geloescht && !ziel.geloescht)) return daten;
  if (fremdeKennung(daten, ziel.id, 'z')) throw new Error(TEXT_KENNUNG_NEUER);
  if (!abgeschlossenAm(ziel, heute)) {
    const laufend = liste.filter((z) => z.id !== ziel.id && !abgeschlossenAm(z, heute)).length + (daten.fremd?.z?.length ?? 0);
    if (laufend >= MAX_ZIELE_AKTIV) throw new Error(`Höchstens ${MAX_ZIELE_AKTIV} laufende Sparziele.`);
  }
  let m = daten.m ?? [];
  for (const { verschiebung, stelle } of spur.verschiebungen ?? []) {
    const v = normalisiereVerschiebung(verschiebung);
    if (!v || v.ziel !== ziel.id || m.some((x) => x.id === v.id)) continue;
    if (fremdeKennung(daten, v.id, 'm')) throw new Error(TEXT_KENNUNG_NEUER);
    m = eingefuegt(m, v, stelle);
  }
  if (m.length + (daten.fremd?.m?.length ?? 0) > MAX_VERSCHIEBUNGEN) throw new Error(TEXT_VERSCHIEBUNGEN_VOLL);
  return mit(daten, vorhanden ? liste.map((z) => (z.id === ziel.id ? ziel : z)) : eingefuegt(liste, ziel, spur.stelle), m, true);
}

/**
 * Das Ziel einer Verschiebung für Rückgängig/Zurückholen: es muss am Tag `heute` noch laufen (sonst TEXT_VERSCHIEBUNG_ABGESCHLOSSEN);
 * ein Ziel einer neueren Version → klare Meldung. Gibt es das Ziel gar nicht: mit `fehltWirft` eine Meldung, sonst null.
 */
function laufendesZielFuer(daten, zielId, heute, { fehltWirft }) {
  const z = (daten.z ?? []).find((x) => x.id === zielId);
  if (!z) {
    if (fremdeKennung(daten, zielId, 'z')) throw new Error(TEXT_ZIEL_NEUERE_VERSION);
    if (fehltWirft) throw new Error(TEXT_ZIEL_WEG);
    return null;
  }
  if (abgeschlossenAm(z, heute)) throw new Error(TEXT_VERSCHIEBUNG_ABGESCHLOSSEN);
  return z;
}

/**
 * Macht die Verschiebung `id` aus „Frei“ rückgängig – nur eine aus dem laufenden Monat (sonst TEXT_VERSCHIEBUNG_ALT: frühere Monate und
 * abgeschlossene Ziele ändern sich nie): sie fällt weg, die Rechnung gibt ihr Geld zurück an „Frei“ (zurückgelegt + Frei
 * bleibt gleich). Nur für ein Ziel, das am Tag `heute` noch läuft (sonst TEXT_VERSCHIEBUNG_ABGESCHLOSSEN – das Geld gehört dann zu seinem
 * Abschluss), nicht für ein Ziel einer neueren Version. Unbekannte Kennung → dieselben Daten (wiederholbar). Rein.
 */
export function verschiebungLoeschen(daten, id, { heute } = {}) {
  heutePruefen(heute);
  const m = daten.m ?? [];
  const v = m.find((x) => x.id === id);
  if (!v) return daten;
  if (v.monat < heute.slice(0, 7)) throw new Error(TEXT_VERSCHIEBUNG_ALT); // die Vergangenheit bleibt fest
  laufendesZielFuer(daten, v.ziel, heute, { fehltWirft: false });
  return mit(daten, daten.z ?? [], m.filter((x) => x.id !== id), false);
}

/**
 * „Rückgängig“ nach verschiebungLoeschen: `verschiebung` kommt unverändert an ihre Stelle `stelle` zurück (die Rechnung deckelt sie wie
 * immer auf das verfügbare „Frei“). Schon da → dieselben Daten. Das Ziel muss es noch geben und es muss laufen; Platz wie beim Verschieben.
 */
export function verschiebungWiederherstellen(daten, { verschiebung, stelle } = {}, { heute } = {}) {
  heutePruefen(heute);
  const v = normalisiereVerschiebung(verschiebung);
  if (!v) throw new Error('Ungültige Verschiebung.');
  const m = daten.m ?? [];
  if (m.some((x) => x.id === v.id)) return daten;
  if (fremdeKennung(daten, v.id, 'm')) throw new Error(TEXT_KENNUNG_NEUER);
  if (v.monat < heute.slice(0, 7)) throw new Error(TEXT_VERSCHIEBUNG_ALT);
  laufendesZielFuer(daten, v.ziel, heute, { fehltWirft: true });
  if (m.length + (daten.fremd?.m?.length ?? 0) >= MAX_VERSCHIEBUNGEN) throw new Error(`Höchstens ${MAX_VERSCHIEBUNGEN} Verschiebungen.`);
  return mit(daten, daten.z ?? [], eingefuegt(m, v, stelle), true, TEXT_VERSCHIEBUNGEN_VOLL);
}

/**
 * Blendet ein Ziel im Verlauf aus (`an` = true) oder wieder ein (false). Nur Anzeige – die Rechnung bleibt gleich. Ausblenden geht nur
 * für ein Ziel, das am Tag `heute` (Pflicht beim Ausblenden) abgeschlossen ist – automatisch oder von Hand –, sonst wirft es mit klarer
 * Meldung; Einblenden geht immer. Gleicher Zustand oder unbekannte Kennung → dieselben Daten. Passt immer (Platzreserve, siehe mit).
 */
export function zielAusblenden(daten, id, an, { heute } = {}) {
  if (an) heutePruefen(heute);
  const liste = daten.z ?? [];
  const alt = liste.find((z) => z.id === id);
  if (!alt || Boolean(alt.aus) === Boolean(an)) return daten;
  if (an && !abgeschlossenAm(alt, heute)) throw new Error(TEXT_NUR_ABGESCHLOSSENE);
  const neu = (z) => {
    if (an) return { ...z, aus: true };
    const { aus: _weg, ...rest } = z;
    return rest;
  };
  return mit(daten, liste.map((z) => (z.id === id ? neu(z) : z)), daten.m ?? [], false);
}

/**
 * Verschiebt `cents` aus „Frei“ zum Ziel `ziel`, wirksam nach der Aufteilung des Monats `monat`. `id` macht es wiederholbar.
 * Beim Anlegen wird gedeckelt auf das jetzt verfügbare „Frei“ und den noch offenen Betrag des Ziels (Rechnung mit `konto` und
 * `heute`, Stand am Ende); bleibt nichts übrig, wirft es. Die Rechnung deckelt später noch einmal (eine Korrektur im Kontostand
 * kann „Frei“ verkleinern). Das Ziel muss es geben, es darf weder heute noch in `monat` abgeschlossen sein und muss in `monat`
 * schon laufen.
 */
export function freiVerschieben(daten, { id, monat, ziel, cents } = {}, { konto, heute } = {}) {
  heutePruefen(heute);
  if (!istKennung(id)) throw new Error('Ungültige Kennung.');
  if (!istMonat(monat)) throw new Error('Ungültiger Monat.');
  if (!istBetrag1(cents)) throw new Error('Bitte einen Betrag zwischen 0,01 € und 999.999 € eingeben.');
  const m = daten.m ?? [];
  if (m.some((v) => v.id === id)) return daten;
  const z = (daten.z ?? []).find((x) => x.id === ziel);
  if (!z) throw new Error('Dieses Sparziel gibt es nicht mehr.');
  if (abgeschlossenAm(z, heute)) throw new Error('Dieses Sparziel ist schon abgeschlossen.');
  if (zielSchluss(z).monat <= monat) throw new Error('Dieses Sparziel ist in diesem Monat schon abgeschlossen.');
  if (z.erstellt > monat) throw new Error('Dieses Sparziel beginnt erst später – dann lässt sich Geld dorthin verschieben.');
  if (m.length + (daten.fremd?.m?.length ?? 0) >= MAX_VERSCHIEBUNGEN) throw new Error(`Höchstens ${MAX_VERSCHIEBUNGEN} Verschiebungen.`);
  const verlauf = sparVerlauf(daten, konto, heute);
  const offen = verlauf.ziele.find((x) => x.id === ziel)?.offen ?? 0;
  const betrag = Math.min(cents, verlauf.frei, offen);
  if (betrag <= 0) throw new Error(verlauf.frei <= 0 ? 'In „Frei verfügbar“ ist nichts zum Verschieben.' : 'Dieses Sparziel ist schon erreicht.');
  return mit(daten, daten.z, [...m, { id, monat, ziel, cents: betrag }], true, TEXT_VERSCHIEBUNGEN_VOLL);
}
