// Diensttausch: Papa oder Mama tauscht einen Dienst (gibt am Tag A die Schicht `ka` ab und übernimmt am Tag B die Schicht `kb`).
// Die Verknüpfung steht im versteckten Ereignis „fkschtausch“; die Monate tragen nur den echten Zustand (A frei, B die übernommene Schicht).
// Hier: die Hülle (Lesen und Schreiben) und die reinen Regeln (Zustand, Prüfen, Anwenden, Zurücknehmen, Aufräumen). Ohne DOM und ohne Netz.
//   Text:      { v: 1, l: [{ i, p, a, b, ka, kb, vb, za?, zb?, m?, t }], ...fremd }  (Kurzform, damit viele Tausche in 6000 Zeichen passen)
//   Speicher:  { v: 1, eintraege: Eintrag[], fremd? }
//   Eintrag  = { id, person: 'papa'|'mama', a: 'JJJJ-MM-TT', b: 'JJJJ-MM-TT', ka: Schlüssel (in A abgegeben), kb: Schlüssel (in B übernommen),
//                vb: Schlüssel|null (was vorher in B stand), za?: [von, bis], zb?: [von, bis], mitWem?: Text, am: 'JJJJ-MM-TT' (eingetragen am) }
// Unbekannte Felder der ersten Ebene (von einer neueren Version) stehen in `fremd` und werden unverändert mitgeschrieben; die Namen v, l
// und fremd sind dafür reserviert. Ein Eintrag mit unbekannten Schlüsseln oder ein ungültiger Eintrag wird nicht gezeigt, sondern roh in
// `fremd.l` behalten und hinter den eigenen Einträgen unverändert zurückgeschrieben – so geht ein Tausch einer neueren App nie verloren.
import { addDays, plusMonate } from './dates.js';
import { istObjekt, sauber, zeichen } from './gemeinsam.js';
import { SCHICHT_PERSONEN, SCHLUESSEL_ZEICHEN, artFuer, fremdeFelder, schichtAm, setzeSchicht, setzeTagZeiten, tagZeitenAm } from './schicht.js';
import { huelleLesen } from './unlesbar.js';

export const MAX_TAUSCH_ZEICHEN = 6000; // wie die Schichtmonate: Google kürzt Beschreibungen still bei 8192 Zeichen
export const MAX_MIT_WEM = 24; // Zeichen, eine Zeile
export const TAUSCH_BEHALTEN_MONATE = 12; // liegt der spätere Tag eines Tauschs länger zurück, fällt er beim nächsten Schreiben weg
export const TAUSCH_OFFEN_TAGE = 1; // ein „offener“ Tausch (in keinem Monat angekommen), der älter ist, fällt beim nächsten Schreiben weg
export const TEXT_TAUSCH_VOLL = 'Im Kalender ist kein Platz mehr für weitere Diensttausche – bitte alte rückgängig machen.';

const TAUSCH_EIGENE = new Set(['v', 'l', 'fremd']);
const EINTRAG_SCHLUESSEL = new Set(['i', 'p', 'a', 'b', 'ka', 'kb', 'vb', 'za', 'zb', 'm', 't']);
const DATUM = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const UHRZEIT = /^([01]\d|2[0-3]):[0-5]\d$/;
const WARNUNG_UNLESBAR = 'Die Diensttausche waren unlesbar; sie werden nicht gezeigt.';
const WARNUNG_EINTRAG = 'Ein Diensttausch war unlesbar; er wird nicht gezeigt, bleibt aber erhalten.';

/** Noch keine Diensttausche. */
export const leererTausch = () => ({ v: 1, eintraege: [] });

const istSchluessel = (k) => typeof k === 'string' && k.length === 1 && SCHLUESSEL_ZEICHEN.includes(k);
const istZeit = (z) => Array.isArray(z) && z.length === 2 && z.every((x) => typeof x === 'string' && UHRZEIT.test(x));
const istId = (i) => typeof i === 'string' && /^[0-9a-z]{1,32}$/.test(i);

/** Ist ein Eintrag in Kurzform vollständig und gültig, nur mit bekannten Schlüsseln? */
function kurzGueltig(w) {
  if (!istObjekt(w) || Object.keys(w).some((k) => !EINTRAG_SCHLUESSEL.has(k))) return false;
  return (
    istId(w.i) && SCHICHT_PERSONEN.includes(w.p) && DATUM.test(w.a ?? '') && DATUM.test(w.b ?? '') && DATUM.test(w.t ?? '') &&
    istSchluessel(w.ka) && istSchluessel(w.kb) && (w.vb === null || istSchluessel(w.vb)) &&
    (w.za === undefined || istZeit(w.za)) && (w.zb === undefined || istZeit(w.zb)) && (w.m === undefined || typeof w.m === 'string')
  );
}

/** Kurzform → Eintrag im Speicher (feste Feldreihenfolge, freiwillige Felder nur, wenn vorhanden). */
function langForm(w) {
  const e = { id: w.i, person: w.p, a: w.a, b: w.b, ka: w.ka, kb: w.kb, vb: w.vb };
  if (w.za) e.za = [...w.za];
  if (w.zb) e.zb = [...w.zb];
  if (w.m !== undefined) e.mitWem = w.m;
  e.am = w.t;
  return e;
}

/** Eintrag im Speicher → Kurzform; wirft bei einem ungültigen Eintrag (der würde sonst als „fremd“ zurückgelesen). */
function kurzForm(e) {
  const w = { i: e?.id, p: e?.person, a: e?.a, b: e?.b, ka: e?.ka, kb: e?.kb, vb: e?.vb ?? null };
  if (e?.za !== undefined) w.za = e.za;
  if (e?.zb !== undefined) w.zb = e.zb;
  if (e?.mitWem !== undefined) w.m = e.mitWem;
  w.t = e?.am;
  if (!kurzGueltig(w)) throw new Error('Ungültiger Diensttausch.');
  return w;
}

/**
 * Die Diensttausche als Text für die Beschreibung des Kalenderereignisses: { v: 1, ...fremde Felder, l: [...eigene, ...fremd.l] }.
 * Zu große Texte werden abgelehnt (TEXT_TAUSCH_VOLL) – `fremd` zählt mit und wird nie gekürzt.
 */
export function tauschText(daten) {
  const fremdOhneL = fremdeFelder({ fremd: daten?.fremd }, TAUSCH_EIGENE) ?? {};
  const fremdL = Array.isArray(daten?.fremd?.l) ? daten.fremd.l : [];
  const eigene = (Array.isArray(daten?.eintraege) ? daten.eintraege : []).map(kurzForm);
  const text = JSON.stringify({ v: 1, ...fremdOhneL, l: [...eigene, ...fremdL] });
  if (text.length > MAX_TAUSCH_ZEICHEN) throw new Error(TEXT_TAUSCH_VOLL);
  return text;
}

/**
 * Text aus dem Kalender → { daten, unlesbar, warnungen } (leer → leererTausch). `unlesbar` = diese Version kann den Text nicht lesen
 * (kaputtes JSON, kein Objekt, andere Version `v`, `l` keine Liste): leer gezeigt, der Text wird aber nie überschrieben (siehe unlesbar.js).
 * Ein Feld namens „fremd“ im Text ist reserviert und wird nicht gelesen.
 */
export function tauschAusText(text) {
  const huelle = huelleLesen(text);
  if (huelle.art === 'leer') return { daten: leererTausch(), unlesbar: false, warnungen: [] };
  if (huelle.art === 'unlesbar' || !Array.isArray(huelle.roh.l)) return { daten: leererTausch(), unlesbar: true, warnungen: [WARNUNG_UNLESBAR] };
  const { fremd: _reserviert, ...roh } = huelle.roh;
  const warnungen = [];
  const eintraege = [];
  const fremdL = [];
  for (const w of roh.l) {
    if (kurzGueltig(w)) eintraege.push(langForm(w));
    else {
      fremdL.push(w);
      // unbekannte Schlüssel: von einer neueren Version, still behalten; sonst kaputt → Warnung
      if (!istObjekt(w) || !Object.keys(w).some((k) => !EINTRAG_SCHLUESSEL.has(k))) warnungen.push(WARNUNG_EINTRAG);
    }
  }
  const daten = { v: 1, eintraege };
  const fremd = { ...fremdeFelder(roh, TAUSCH_EIGENE), ...(fremdL.length > 0 ? { l: fremdL } : {}) };
  if (Object.keys(fremd).length > 0) daten.fremd = fremd;
  return { daten, unlesbar: false, warnungen };
}

// ---------- Regeln ----------

const jmVon = (datum) => datum.slice(0, 7);
const tagVon = (datum) => Number(datum.slice(8, 10));
const kurzDatum = (datum) => `${datum.slice(8, 10)}.${datum.slice(5, 7)}.`;
const alsZeiten = (z) => (z ? [z.von, z.bis] : undefined);
const gleicheZeiten = (x, y) => (x && y ? x[0] === y[0] && x[1] === y[1] : !x && !y);

/**
 * Zustand eines Tauschs nach den Monaten der Tage A und B (null = nicht geladen → 'unbekannt'). A angewendet = frei, A ursprünglich = `ka`;
 * B angewendet = `kb`, B ursprünglich = `vb`. 'ganz' = beide angewendet; 'halb' = einer angewendet, der andere ursprünglich; 'offen' = beide
 * ursprünglich (noch nicht geschrieben oder Schreiben gescheitert); 'gebrochen' = sonst (von Hand übermalt). Regel „Tausch gebrochen“: nur
 * 'ganz' zeigt ⇄, 'halb' zeigt „⚠ Tausch unvollständig“ an beiden Tagen, 'offen' und 'gebrochen' zeigen nichts – nie eine Hälfte als Ganzes.
 * Stand in B vorher schon `kb` (vb === kb), gilt B als angewendet.
 */
export function tauschZustand(e, monatA, monatB) {
  if (!monatA || !monatB) return 'unbekannt';
  const a = schichtAm(monatA, e.person, tagVon(e.a));
  const b = schichtAm(monatB, e.person, tagVon(e.b));
  const aFertig = a === null;
  const bFertig = b === e.kb;
  if (aFertig && bFertig) return 'ganz';
  const aVorher = a === e.ka;
  const bVorher = b === e.vb;
  if ((aFertig && bVorher) || (aVorher && bFertig)) return 'halb';
  if (aVorher && bVorher) return 'offen';
  return 'gebrochen';
}

/** Zustand eines Eintrags über den Monats-Nachschlag `monate(jm) → Monat | null`. */
const zustandUeber = (e, monate) => tauschZustand(e, monate(jmVon(e.a)), monate(jmVon(e.b)));

/**
 * Der sichtbare Tausch einer Person an einem Tag (nur 'ganz' oder 'halb'): { eintrag, zustand, rolle: 'a' | 'b' } oder null.
 * `monate(jm)` liefert einen geladenen Monat oder null. Bei mehreren gilt der zuletzt eingetragene.
 */
export function tauschAm(daten, monate, person, datum) {
  const liste = daten?.eintraege ?? [];
  for (let i = liste.length - 1; i >= 0; i--) {
    const e = liste[i];
    if (e.person !== person || (e.a !== datum && e.b !== datum)) continue;
    const zustand = zustandUeber(e, monate);
    if (zustand === 'ganz' || zustand === 'halb') return { eintrag: e, zustand, rolle: e.a === datum ? 'a' : 'b' };
  }
  return null;
}

/**
 * Hält ein Tausch seine Tage noch fest? 'ganz', 'halb' und 'unbekannt' (ein Monat nicht geladen – vorsichtshalber) ja; 'offen' nur, solange
 * er höchstens TAUSCH_OFFEN_TAGE alt ist (ohne `heute` immer); 'gebrochen' nein.
 */
function istAktiv(e, monate, heute) {
  const zustand = zustandUeber(e, monate);
  if (zustand === 'offen') return !heute || e.am >= addDays(heute, -TAUSCH_OFFEN_TAGE);
  return zustand !== 'gebrochen';
}

/**
 * Prüft einen Entwurf { person, a, b, kb, mitWem? } → Meldung oder null. `monate(jm)` liefert einen geladenen Monat oder null;
 * `heute` (JJJJ-MM-TT) braucht es nur für das Alter offener Tausche.
 */
export function tauschPruefen(entwurf, { daten, monate, katalog, heute }) {
  const { person, a, b, kb } = entwurf;
  if (a === b) return 'Bitte zwei verschiedene Tage wählen.';
  const ka = schichtAm(monate(jmVon(a)), person, tagVon(a));
  if (ka === null || artFuer(katalog, person, ka)?.muster === 'urlaub') return 'Am abgegebenen Tag ist kein Dienst eingetragen.';
  const art = artFuer(katalog, person, kb);
  if (!art || art.archiv || art.gruppe !== 'dienst' || art.muster === 'urlaub') return 'Bitte einen Dienst für den übernommenen Tag wählen.';
  const tage = new Set([a, b]);
  const belegt = (daten?.eintraege ?? []).some((e) => e.person === person && (tage.has(e.a) || tage.has(e.b)) && istAktiv(e, monate, heute));
  if (belegt) return 'Dieser Tag ist schon getauscht – bitte zuerst den Tausch rückgängig machen.';
  // stünde dieselbe Schicht schon in B, wäre B sofort „angewendet“: der Tausch hieße „halb“ statt „offen“ und hielte beide Tage fest
  if (schichtAm(monate(jmVon(b)), person, tagVon(b)) === kb) return 'Am übernommenen Tag steht schon dieser Dienst.';
  if (zeichen(sauber(entwurf.mitWem ?? '')) > MAX_MIT_WEM) return `„Mit wem“ darf höchstens ${MAX_MIT_WEM} Zeichen haben.`;
  return null;
}

/** Was am übernommenen Tag B ersetzt wird: „Ersetzt am TT.MM.: <Name>“, oder null, wenn B leer ist. */
export function tauschErsetzt(entwurf, monatB, katalog) {
  const k = schichtAm(monatB, entwurf.person, tagVon(entwurf.b));
  if (k === null) return null;
  return `Ersetzt am ${kurzDatum(entwurf.b)}: ${artFuer(katalog, entwurf.person, k)?.name ?? k}`;
}

/**
 * Der Eintrag zu einem geprüften Entwurf; merkt sich, was vorher in A (`ka`, `za`) und B (`vb`, `zb`) stand. Wirft „Falscher Monat für den
 * Diensttausch.“, wenn Monat A oder B fehlt oder nicht der Monat seines Tages ist (ein fehlender Monat B ergäbe sonst still `vb: null`).
 */
export function tauschEintrag(entwurf, { id, monatA, monatB, heute }) {
  const { person, a, b, kb } = entwurf;
  if (monatA?.jm !== jmVon(a) || monatB?.jm !== jmVon(b)) throw new Error('Falscher Monat für den Diensttausch.');
  const ka = schichtAm(monatA, person, tagVon(a));
  if (ka === null) throw new Error('Am abgegebenen Tag ist kein Dienst eingetragen.');
  const e = { id, person, a, b, ka, kb, vb: schichtAm(monatB, person, tagVon(b)) };
  const za = alsZeiten(tagZeitenAm(monatA, person, tagVon(a)));
  const zb = alsZeiten(tagZeitenAm(monatB, person, tagVon(b)));
  if (za) e.za = za;
  if (zb) e.zb = zb;
  const mitWem = sauber(entwurf.mitWem ?? '');
  if (mitWem !== '') e.mitWem = mitWem;
  e.am = heute;
  return e;
}

/**
 * Aufräumen: weg sind Einträge, deren späterer Tag mehr als TAUSCH_BEHALTEN_MONATE vor `heute` liegt, und Einträge im Zustand 'offen'
 * (`zustand(e)` vom Aufrufer; ohne ihn fällt kein offener weg), die älter als TAUSCH_OFFEN_TAGE sind. 'unbekannt' bleibt; `behalten` immer.
 */
function aufraeumen(eintraege, { heute, zustand } = {}, behalten = null) {
  if (!heute) return eintraege;
  const grenze = plusMonate(heute, -TAUSCH_BEHALTEN_MONATE);
  const offenGrenze = addDays(heute, -TAUSCH_OFFEN_TAGE);
  return eintraege.filter((e) => {
    if (e.id === behalten) return true;
    if ((e.a > e.b ? e.a : e.b) < grenze) return false;
    return !(e.am < offenGrenze && zustand?.(e) === 'offen');
  });
}

/** Daten mit diesen Einträgen; unverändert → dieselben Daten. Wirft TEXT_TAUSCH_VOLL, wenn sie nicht mehr in den Kalender passen. */
function mitEintraegen(daten, eintraege) {
  const alt = daten.eintraege ?? [];
  if (eintraege.length === alt.length && eintraege.every((e, i) => e === alt[i])) return daten;
  const neu = { ...daten, eintraege };
  tauschText(neu);
  return neu;
}

/** Fügt einen Tausch hinzu (dieselbe `id` schon da → nicht doppelt) und räumt auf ({ heute, zustand }). Wiederholbar. */
export function tauschHinzufuegen(daten, eintrag, optionen) {
  const alt = daten.eintraege ?? [];
  const liste = alt.some((e) => e.id === eintrag.id) ? alt : [...alt, eintrag];
  return mitEintraegen(daten, aufraeumen(liste, optionen, eintrag.id));
}

/** Entfernt einen Tausch nach `id` (nicht da → nichts) und räumt auf ({ heute, zustand }). Wiederholbar. */
export function tauschEntfernen(daten, id, optionen) {
  return mitEintraegen(daten, aufraeumen((daten.eintraege ?? []).filter((e) => e.id !== id), optionen));
}

/** Zustand eines Tages vor und nach dem Tausch ({ k, zeiten }); B übernimmt die eigenen Zeiten von A nur bei gleicher Art. */
function seitenZustaende(e, seite) {
  if (seite === 'a') return { vorher: { k: e.ka, zeiten: e.za }, nachher: { k: null, zeiten: undefined } };
  if (seite === 'b') return { vorher: { k: e.vb, zeiten: e.zb }, nachher: { k: e.kb, zeiten: e.kb === e.ka ? e.za : undefined } };
  throw new Error('Ungültige Seite.');
}

/**
 * Bringt den Tag einer Seite von `start` nach `ziel` ({ k, zeiten }): schon am Ziel → derselbe Monat; im Start → umgesetzt (Schicht und
 * genau die Zeiten des Ziels, ohne Vergleich mit der Art); sonst wirft „Der Dienst am TT.MM. wurde inzwischen geändert.“ Haben Start und
 * Ziel dieselbe Schicht, gilt der Tag erst mit den Zeiten des Ziels als angekommen. Notiz und Zusätze bleiben.
 */
function tagUmsetzen(monat, e, seite, start, ziel) {
  const datum = seite === 'a' ? e.a : e.b;
  if (monat?.jm !== jmVon(datum)) throw new Error('Falscher Monat für den Diensttausch.');
  const { person } = e;
  const tag = tagVon(datum);
  const k = schichtAm(monat, person, tag);
  if (k !== start.k && k !== ziel.k) throw new Error(`Der Dienst am ${kurzDatum(datum)} wurde inzwischen geändert.`);
  if (k === ziel.k && (start.k !== ziel.k || gleicheZeiten(alsZeiten(tagZeitenAm(monat, person, tag)), ziel.zeiten))) return monat;
  const m = setzeSchicht(monat, { person, tag, k: ziel.k });
  if (ziel.k === null) return m;
  const ohne = setzeTagZeiten(m, { person, tag, von: '', bis: '' }, null);
  return ziel.zeiten ? setzeTagZeiten(ohne, { person, tag, von: ziel.zeiten[0], bis: ziel.zeiten[1] }, null) : ohne;
}

/** Wendet eine Seite an: 'a' = Tag A frei, 'b' = Tag B mit der übernommenen Schicht. Wiederholbar; `monatZaehlung` folgt von selbst. */
export function tauschAnwenden(monat, e, seite) {
  const { vorher, nachher } = seitenZustaende(e, seite);
  return tagUmsetzen(monat, e, seite, vorher, nachher);
}

/** Nimmt eine Seite zurück: der Tag steht danach genau wie vorher (Schicht und eigene Zeiten). Wiederholbar. */
export function tauschZuruecknehmen(monat, e, seite) {
  const { vorher, nachher } = seitenZustaende(e, seite);
  return tagUmsetzen(monat, e, seite, nachher, vorher);
}
