// Diensttausch: Papa oder Mama tauscht einen Dienst (gibt am Tag A die Schicht `ka` ab und übernimmt am Tag B die Schicht `kb`).
// Hier nur die Hülle: Lesen und Schreiben des versteckten Ereignisses „fkschtausch“ (die Änderungen selbst kommen später dazu).
// Rein, ohne DOM und ohne Netz.
//   Text:      { v: 1, l: [{ i, p, a, b, ka, kb, vb, za?, zb?, m?, t }], ...fremd }  (Kurzform, damit viele Tausche in 6000 Zeichen passen)
//   Speicher:  { v: 1, eintraege: Eintrag[], fremd? }
//   Eintrag  = { id, person: 'papa'|'mama', a: 'JJJJ-MM-TT', b: 'JJJJ-MM-TT', ka: Schlüssel (in A abgegeben), kb: Schlüssel (in B übernommen),
//                vb: Schlüssel|null (was vorher in B stand), za?: [von, bis], zb?: [von, bis], mitWem?: Text, am: 'JJJJ-MM-TT' (eingetragen am) }
// Unbekannte Felder der ersten Ebene (von einer neueren Version) stehen in `fremd` und werden unverändert mitgeschrieben; die Namen v, l
// und fremd sind dafür reserviert. Ein Eintrag mit unbekannten Schlüsseln oder ein ungültiger Eintrag wird nicht gezeigt, sondern roh in
// `fremd.l` behalten und hinter den eigenen Einträgen unverändert zurückgeschrieben – so geht ein Tausch einer neueren App nie verloren.
import { istObjekt } from './gemeinsam.js';
import { SCHICHT_PERSONEN, SCHLUESSEL_ZEICHEN, fremdeFelder } from './schicht.js';
import { huelleLesen } from './unlesbar.js';

export const MAX_TAUSCH_ZEICHEN = 6000; // wie die Schichtmonate: Google kürzt Beschreibungen still bei 8192 Zeichen
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
