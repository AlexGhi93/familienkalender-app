// Diensttausch: Papa oder Mama tauscht einen Dienst (gibt am Tag A die Schicht `ka` ab und übernimmt am Tag B die Schicht `kb`).
// Die Verknüpfung steht im versteckten Ereignis „fkschtausch“; die Monate tragen nur den echten Zustand (A frei, B die übernommene Schicht).
// Hier: die Hülle (Lesen und Schreiben) und die reinen Regeln (Zustand, Prüfen, Anwenden, Zurücknehmen, Aufräumen). Ohne DOM und ohne Netz.
//   Text:      { v: 1, l: [Kurzeintrag], ...fremd }  (Kurzform, damit viele Tausche in 6000 Zeichen passen)
//              geschlossen: { i, p, a, b, ka, kb, vb, za?, zb?, m?, t }  (Form von 1.5.0, ohne r und f)
//              offen:       { i, p, r: 'abgegeben', f, a, ka, za?, m?, t }  oder  { i, p, r: 'uebernommen', f, b, kb, vb, zb?, m?, t }
//   Speicher:  { v: 1, eintraege: Eintrag[], fremd? }
//   Eintrag  = { id, person: 'papa'|'mama', a: 'JJJJ-MM-TT', b: 'JJJJ-MM-TT', ka: Schlüssel (in A abgegeben), kb: Schlüssel (in B übernommen),
//                vb: Schlüssel|null (was vorher in B stand), za?: [von, bis], zb?: [von, bis], mitWem?: Text, am: 'JJJJ-MM-TT' (eingetragen am) }
//   offen    = nur eine Seite, die Rückgabe steht noch aus (bis `frist` = Tag + TAUSCH_FRIST_MONATE):
//              { id, person, richtung: 'abgegeben', frist, a, ka, za?, mitWem?, am }  (der Tag wird frei) oder
//              { id, person, richtung: 'uebernommen', frist, b, kb, vb, zb?, mitWem?, am }  (der Tag bekommt die Schicht `kb`).
//              Mit der Rückgabe wird er ein geschlossener Eintrag in 1.5.0-Form (ohne `richtung` und `frist`, `am` bleibt).
// Unbekannte Felder der ersten Ebene (von einer neueren Version) stehen in `fremd` und werden unverändert mitgeschrieben; die Namen v, l
// und fremd sind dafür reserviert. Ein Eintrag mit unbekannten Schlüsseln oder ein ungültiger Eintrag wird nicht gezeigt, sondern roh in
// `fremd.l` behalten und hinter den eigenen Einträgen unverändert zurückgeschrieben – so geht ein Tausch einer neueren App nie verloren.
// 1.5.0-Verträglichkeit: jeder offene Eintrag trägt `r` und `f`, die 1.5.0 nicht kennt – eine 1.5.0-App behält ihn darum roh in `fremd.l`.
import { addDays, plusMonate } from './dates.js';
import { istObjekt, sauber, zeichen } from './gemeinsam.js';
import { SCHICHT_PERSONEN, SCHLUESSEL_ZEICHEN, artFuer, fremdeFelder, schichtAm, setzeSchicht, setzeTagZeiten, tagZeitenAm } from './schicht.js';
import { datumAnzeige } from './eingabe.js';
import { huelleLesen } from './unlesbar.js';

export const MAX_TAUSCH_ZEICHEN = 6000; // wie die Schichtmonate: Google kürzt Beschreibungen still bei 8192 Zeichen
export const MAX_MIT_WEM = 24; // Zeichen, eine Zeile
export const TAUSCH_BEHALTEN_MONATE = 12; // liegt der spätere Tag eines geschlossenen Tauschs länger zurück, fällt er beim nächsten Schreiben weg
export const TAUSCH_OFFEN_TAGE = 1; // ein geschlossener Tausch im Zustand 'offen' (in keinem Monat angekommen), der älter ist, fällt weg
export const TAUSCH_RICHTUNGEN = ['uebernommen', 'abgegeben']; // offener Tausch: Dienst eines Kollegen übernommen / eigenen Dienst abgegeben
export const TAUSCH_FRIST_MONATE = 12; // Rückgabe eines offenen Tauschs bis zum selben Tag ein Jahr später
export const TEXT_TAUSCH_VOLL = 'Im Kalender ist kein Platz mehr für weitere Diensttausche – bitte alte rückgängig machen.';
export const TEXT_TAUSCH_WEG = 'Diesen Diensttausch gibt es nicht mehr.';

const TAUSCH_EIGENE = new Set(['v', 'l', 'fremd']);
// Kurzform ↔ Speicher in fester Reihenfolge (die geschlossene Form von 1.5.0 ist darin dieselbe Teilfolge)
const FELDER = [['i', 'id'], ['p', 'person'], ['r', 'richtung'], ['f', 'frist'], ['a', 'a'], ['b', 'b'], ['ka', 'ka'], ['kb', 'kb'], ['vb', 'vb'], ['za', 'za'], ['zb', 'zb'], ['m', 'mitWem'], ['t', 'am']];
const EINTRAG_SCHLUESSEL = new Set(FELDER.map(([kurz]) => kurz));
const SEITE_A = ['a', 'ka', 'za'];
const SEITE_B = ['b', 'kb', 'vb', 'zb'];
const DATUM = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const UHRZEIT = /^([01]\d|2[0-3]):[0-5]\d$/;
const WARNUNG_UNLESBAR = 'Die Diensttausche waren unlesbar; sie werden nicht gezeigt.';
const WARNUNG_EINTRAG = 'Ein Diensttausch war unlesbar; er wird nicht gezeigt, bleibt aber erhalten.';
const TEXT_KEIN_DIENST_A = 'Am abgegebenen Tag ist kein Dienst eingetragen.';
const TEXT_DIENST_WAEHLEN = 'Bitte einen Dienst für den übernommenen Tag wählen.';
const TEXT_SCHON_DIENST = 'Am übernommenen Tag steht schon dieser Dienst.';
const TEXT_GETAUSCHT = 'Dieser Tag ist schon getauscht – bitte zuerst den Tausch rückgängig machen.';
const TEXT_ZWEI_TAGE = 'Bitte zwei verschiedene Tage wählen.';
const TEXT_FALSCHER_MONAT = 'Falscher Monat für den Diensttausch.';
const TEXT_RICHTUNG = 'Bitte „Dienst übernehmen“ oder „Dienst abgeben“ wählen.';
const TEXT_ABGESCHLOSSEN = 'Dieser Diensttausch ist schon abgeschlossen.';
const TEXT_KEIN_DIENST_RUECKGABE = 'Am Rückgabetag ist kein Dienst eingetragen.';
const TEXT_RUECKGABE_SCHON = 'Die Rückgabe wurde inzwischen schon eingetragen.';
const TEXT_MIT_WEM = `„Mit wem“ darf höchstens ${MAX_MIT_WEM} Zeichen haben.`;

/** Noch keine Diensttausche. */
export const leererTausch = () => ({ v: 1, eintraege: [] });

const istSchluessel = (k) => typeof k === 'string' && k.length === 1 && SCHLUESSEL_ZEICHEN.includes(k);
const istZeit = (z) => Array.isArray(z) && z.length === 2 && z.every((x) => typeof x === 'string' && UHRZEIT.test(x));
const istId = (i) => typeof i === 'string' && /^[0-9a-z]{1,32}$/.test(i);
const seiteFehlt = (w, schluessel) => schluessel.every((k) => w[k] === undefined);
const seiteAGueltig = (w) => DATUM.test(w.a ?? '') && istSchluessel(w.ka) && (w.za === undefined || istZeit(w.za));
const seiteBGueltig = (w) => DATUM.test(w.b ?? '') && istSchluessel(w.kb) && (w.vb === null || istSchluessel(w.vb)) && (w.zb === undefined || istZeit(w.zb));

/**
 * Ist ein Eintrag in Kurzform vollständig und gültig, nur mit bekannten Schlüsseln? Ohne `r`: die Regel von 1.5.0 (beide Seiten, kein `f`).
 * Mit `r`: eine bekannte Richtung, `f` ein Datum und genau die Seite der Richtung (abgegeben → A, übernommen → B), von der anderen nichts.
 */
function kurzGueltig(w) {
  if (!istObjekt(w) || Object.keys(w).some((k) => !EINTRAG_SCHLUESSEL.has(k))) return false;
  if (!istId(w.i) || !SCHICHT_PERSONEN.includes(w.p) || !DATUM.test(w.t ?? '') || (w.m !== undefined && typeof w.m !== 'string')) return false;
  if (w.r === undefined) return w.f === undefined && seiteAGueltig(w) && seiteBGueltig(w);
  if (!DATUM.test(w.f ?? '')) return false;
  if (w.r === 'abgegeben') return seiteAGueltig(w) && seiteFehlt(w, SEITE_B);
  if (w.r === 'uebernommen') return seiteBGueltig(w) && seiteFehlt(w, SEITE_A);
  return false;
}

/** Kurzform → Eintrag im Speicher (feste Feldreihenfolge, freiwillige Felder nur, wenn vorhanden). */
function langForm(w) {
  const e = {};
  for (const [kurz, lang] of FELDER) if (w[kurz] !== undefined) e[lang] = Array.isArray(w[kurz]) ? [...w[kurz]] : w[kurz];
  return e;
}

/** Eintrag im Speicher → Kurzform; wirft bei einem ungültigen Eintrag (der würde sonst als „fremd“ zurückgelesen). */
function kurzForm(e) {
  const w = {};
  for (const [kurz, lang] of FELDER) {
    if (lang === 'vb' && e?.b !== undefined) w.vb = e.vb ?? null;
    else if (e?.[lang] !== undefined) w[kurz] = e[lang];
  }
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
const monatVon = (monate, datum) => (datum === undefined ? null : monate(jmVon(datum)));
const schichtAmTag = (monate, person, datum) => schichtAm(monate(jmVon(datum)), person, tagVon(datum));

/** Ist der Tausch offen (nur eine Seite, Rückgabe steht aus)? */
export const tauschIstOffen = (e) => e?.richtung !== undefined;

/** Die Seiten eines Tauschs: geschlossen beide, offen nur die seiner Richtung (abgegeben → 'a', übernommen → 'b'). */
export function tauschSeiten(e) {
  if (!tauschIstOffen(e)) return ['a', 'b'];
  return e.richtung === 'abgegeben' ? ['a'] : ['b'];
}

/** Der eine Tag eines offenen Tauschs. */
export const tauschOffenTag = (e) => (e.richtung === 'abgegeben' ? e.a : e.b);

/** Bis wann die Rückgabe eines offenen Tauschs ansteht: derselbe Tag TAUSCH_FRIST_MONATE später (29.02. → 28.02.). */
export const tauschFrist = (tag) => plusMonate(tag, TAUSCH_FRIST_MONATE);

/** Bilanz der offenen Tausche je Person: `plus` = offen übernommen (Rückgabe steht aus), `minus` = offen abgegeben. Überfällige und gestörte zählen mit. */
export function tauschBilanz(daten) {
  const bilanz = Object.fromEntries(SCHICHT_PERSONEN.map((p) => [p, { plus: 0, minus: 0 }]));
  for (const e of daten?.eintraege ?? []) {
    if (!tauschIstOffen(e) || !bilanz[e.person]) continue;
    bilanz[e.person][e.richtung === 'uebernommen' ? 'plus' : 'minus'] += 1;
  }
  return bilanz;
}

/** Push-Erinnerungen an offene Tausche: eine je Eintrag, einen Monat vor der Frist (31.03. → 28.02.); Text ohne Namen und Dienst. */
export const tauschErinnerungen = (daten) =>
  (daten?.eintraege ?? []).filter(tauschIstOffen).map((e) => ({ schluessel: `tausch-${e.id}`, tag: plusMonate(e.frist, -1), text: `Offener Diensttausch – Rückgabe bis ${datumAnzeige(e.frist)}.` }));

/**
 * Zustand eines Tauschs nach den Monaten der Tage A und B (null = nicht geladen → 'unbekannt'). A angewendet = frei, A ursprünglich = `ka`;
 * B angewendet = `kb`, B ursprünglich = `vb`. 'ganz' = beide angewendet; 'halb' = einer angewendet, der andere ursprünglich; 'offen' = beide
 * ursprünglich (noch nicht geschrieben oder Schreiben gescheitert); 'gebrochen' = sonst (von Hand übermalt). Regel „Tausch gebrochen“: nur
 * 'ganz' zeigt ⇄, 'halb' zeigt „⚠ Tausch unvollständig“ an beiden Tagen, 'offen' und 'gebrochen' zeigen nichts – nie eine Hälfte als Ganzes.
 * Stand in B vorher schon `kb` (vb === kb), gilt B als angewendet.
 * Ein offener Tausch hat nur seine eine Seite: es zählt nur deren Monat (der andere darf null sein); 'ganz', 'offen', 'gebrochen' oder
 * 'unbekannt', nie 'halb'.
 */
export function tauschZustand(e, monatA, monatB) {
  if (tauschIstOffen(e)) return offenZustand(e, e.richtung === 'abgegeben' ? monatA : monatB);
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

/** Zustand der einen Seite eines offenen Tauschs: abgegeben angewendet = frei, ursprünglich = `ka`; übernommen angewendet = `kb`, sonst `vb`. */
function offenZustand(e, monat) {
  if (!monat) return 'unbekannt';
  const tag = tauschOffenTag(e);
  const k = schichtAm(monat, e.person, tagVon(tag));
  const [fertig, vorher] = e.richtung === 'abgegeben' ? [null, e.ka] : [e.kb, e.vb];
  if (k === fertig) return 'ganz';
  return k === vorher ? 'offen' : 'gebrochen';
}

/**
 * Die Partnermonate zu den Monaten `jms`: Monate ('JJJJ-MM') der Tage A oder B aller Tausche, deren anderer Tag in `jms` liegt, die selbst
 * aber nicht in `jms` stehen (ohne Doppelte, sortiert). Ohne beide Monate ist ein Tausch 'unbekannt' und zeigt weder ⇄ noch „Rückgängig“.
 * Offene Tausche haben keinen anderen Tag und zählen nicht.
 */
export function tauschPartnerMonate(daten, jms) {
  const da = new Set(jms);
  const partner = new Set();
  for (const e of daten?.eintraege ?? []) {
    if (tauschIstOffen(e)) continue;
    const [ma, mb] = [jmVon(e.a), jmVon(e.b)];
    if (da.has(ma) && !da.has(mb)) partner.add(mb);
    if (da.has(mb) && !da.has(ma)) partner.add(ma);
  }
  return [...partner].sort();
}

/** Zustand eines Eintrags über den Monats-Nachschlag `monate(jm) → Monat | null`. */
const zustandUeber = (e, monate) => tauschZustand(e, monatVon(monate, e.a), monatVon(monate, e.b));

/**
 * Der sichtbare Tausch einer Person an einem Tag (nur 'ganz' oder 'halb'): { eintrag, zustand, rolle: 'a' | 'b' } oder null; ein offener
 * Tausch (nur 'ganz', an seinem einen Tag) zusätzlich mit `offen: true`. `monate(jm)` liefert einen geladenen Monat oder null.
 * Bei mehreren gilt der zuletzt eingetragene.
 */
export function tauschAm(daten, monate, person, datum) {
  const liste = daten?.eintraege ?? [];
  for (let i = liste.length - 1; i >= 0; i--) {
    const e = liste[i];
    if (e.person !== person || (e.a !== datum && e.b !== datum)) continue;
    const zustand = zustandUeber(e, monate);
    if (zustand !== 'ganz' && zustand !== 'halb') continue;
    const sichtbar = { eintrag: e, zustand, rolle: e.a === datum ? 'a' : 'b' };
    return tauschIstOffen(e) ? { ...sichtbar, offen: true } : sichtbar;
  }
  return null;
}

/**
 * Hält ein Tausch seine Tage noch fest? 'ganz', 'halb' und 'unbekannt' (ein Monat nicht geladen – vorsichtshalber) ja; 'offen' nur, solange
 * er höchstens TAUSCH_OFFEN_TAGE alt ist (ohne `heute` immer); 'gebrochen' nein. Ein offener Tausch (mit Richtung) hält seinen Tag in jedem
 * Zustand außer 'gebrochen' – auch 'offen', egal wie alt, denn er fällt nie von selbst weg.
 */
function istAktiv(e, monate, heute) {
  const zustand = zustandUeber(e, monate);
  if (zustand === 'offen' && !tauschIstOffen(e)) return !heute || e.am >= addDays(heute, -TAUSCH_OFFEN_TAGE);
  return zustand !== 'gebrochen';
}

/** Liegt einer der Tage in einem aktiven Tausch der Person (ohne den Eintrag mit der id `ohne`)? */
function tagBelegt(daten, { person, tage, monate, heute, ohne }) {
  const da = new Set(tage);
  return (daten?.eintraege ?? []).some((e) => e.id !== ohne && e.person === person && (da.has(e.a) || da.has(e.b)) && istAktiv(e, monate, heute));
}

/** Kein Dienst zum Abgeben: der Tag ist frei oder Urlaub. */
const ohneDienst = (k, katalog, person) => k === null || artFuer(katalog, person, k)?.muster === 'urlaub';

/** Taugt `kb` als übernommener Dienst (aktiver Dienst, kein Urlaub)? */
function istUebernehmbar(katalog, person, kb) {
  const art = artFuer(katalog, person, kb);
  return Boolean(art) && !art.archiv && art.gruppe === 'dienst' && art.muster !== 'urlaub';
}

const mitWemZuLang = (mitWem) => zeichen(sauber(mitWem ?? '')) > MAX_MIT_WEM;

/**
 * Prüft einen Entwurf { person, a, b, kb, mitWem? } → Meldung oder null. `monate(jm)` liefert einen geladenen Monat oder null;
 * `heute` (JJJJ-MM-TT) braucht es nur für das Alter offener Tausche.
 */
export function tauschPruefen(entwurf, { daten, monate, katalog, heute }) {
  const { person, a, b, kb } = entwurf;
  if (a === b) return TEXT_ZWEI_TAGE;
  if (ohneDienst(schichtAmTag(monate, person, a), katalog, person)) return TEXT_KEIN_DIENST_A;
  if (!istUebernehmbar(katalog, person, kb)) return TEXT_DIENST_WAEHLEN;
  if (tagBelegt(daten, { person, tage: [a, b], monate, heute })) return TEXT_GETAUSCHT;
  // stünde dieselbe Schicht schon in B, wäre B sofort „angewendet“: der Tausch hieße „halb“ statt „offen“ und hielte beide Tage fest
  if (schichtAmTag(monate, person, b) === kb) return TEXT_SCHON_DIENST;
  if (mitWemZuLang(entwurf.mitWem)) return TEXT_MIT_WEM;
  return null;
}

/**
 * Prüft einen offenen Entwurf { person, richtung, tag, kb?, mitWem? } → Meldung oder null (wie tauschPruefen, nur mit dem einen Tag):
 * abgegeben braucht am Tag einen Dienst (kein Urlaub), übernommen einen wählbaren Dienst `kb`, der dort noch nicht steht.
 */
export function tauschOffenPruefen(entwurf, { daten, monate, katalog, heute }) {
  const { person, richtung, tag, kb } = entwurf;
  if (!TAUSCH_RICHTUNGEN.includes(richtung)) return TEXT_RICHTUNG;
  const abgegeben = richtung === 'abgegeben';
  if (abgegeben && ohneDienst(schichtAmTag(monate, person, tag), katalog, person)) return TEXT_KEIN_DIENST_A;
  if (!abgegeben && !istUebernehmbar(katalog, person, kb)) return TEXT_DIENST_WAEHLEN;
  if (tagBelegt(daten, { person, tage: [tag], monate, heute })) return TEXT_GETAUSCHT;
  if (!abgegeben && schichtAmTag(monate, person, tag) === kb) return TEXT_SCHON_DIENST;
  if (mitWemZuLang(entwurf.mitWem)) return TEXT_MIT_WEM;
  return null;
}

/**
 * Prüft die Rückgabe { tag, kb? } zu einem offenen Tausch → Meldung oder null. Abgegeben: die Person übernimmt am Rückgabetag den Dienst `kb`
 * (wie Tag B); übernommen: der Kollege übernimmt den Dienst der Person am Rückgabetag (wie Tag A, er wird frei). Jeder Tag außer dem ersten
 * geht, auch nach der Frist; ein anderer aktiver Tausch an diesem Tag blockiert.
 */
export function tauschRueckgabePruefen(e, { tag, kb }, { daten, monate, katalog, heute }) {
  if (!tauschIstOffen(e)) return TEXT_ABGESCHLOSSEN;
  if (tag === tauschOffenTag(e)) return TEXT_ZWEI_TAGE;
  const { person } = e;
  const abgegeben = e.richtung === 'abgegeben';
  const k = schichtAmTag(monate, person, tag);
  if (abgegeben && !istUebernehmbar(katalog, person, kb)) return TEXT_DIENST_WAEHLEN;
  if (!abgegeben && ohneDienst(k, katalog, person)) return TEXT_KEIN_DIENST_RUECKGABE;
  if (tagBelegt(daten, { person, tage: [tag], monate, heute, ohne: e.id })) return TEXT_GETAUSCHT;
  if (abgegeben && k === kb) return TEXT_SCHON_DIENST;
  return null;
}

/** Was am übernommenen Tag B ersetzt wird: „Ersetzt am TT.MM.: <Name>“, oder null, wenn B leer ist. */
export function tauschErsetzt(entwurf, monatB, katalog) {
  const k = schichtAm(monatB, entwurf.person, tagVon(entwurf.b));
  if (k === null) return null;
  return `Ersetzt am ${kurzDatum(entwurf.b)}: ${artFuer(katalog, entwurf.person, k)?.name ?? k}`;
}

/** Wirft „Falscher Monat für den Diensttausch.“, wenn `monat` fehlt oder nicht der Monat von `datum` ist. */
function pruefeMonat(monat, datum) {
  if (monat?.jm !== jmVon(datum)) throw new Error(TEXT_FALSCHER_MONAT);
}

/** Seite A aus dem Monat ihres Tages: { a, ka, za? }; wirft `meldung`, wenn dort kein Dienst steht. */
function seiteAAus(monat, person, a, meldung) {
  const ka = schichtAm(monat, person, tagVon(a));
  if (ka === null) throw new Error(meldung);
  const za = alsZeiten(tagZeitenAm(monat, person, tagVon(a)));
  return za ? { a, ka, za } : { a, ka };
}

/** Seite B aus dem Monat ihres Tages: { b, kb, vb, zb? } (`vb`, `zb` = was vorher dort stand). */
function seiteBAus(monat, person, b, kb) {
  const seite = { b, kb, vb: schichtAm(monat, person, tagVon(b)) };
  const zb = alsZeiten(tagZeitenAm(monat, person, tagVon(b)));
  return zb ? { ...seite, zb } : seite;
}

/** Geschlossener Eintrag in der Feldreihenfolge von 1.5.0 aus den beiden Seiten, dahinter `mitWem` (falls nicht leer) und `am`. */
function geschlossen({ id, person, mitWem, am }, seiteA, seiteB) {
  const e = { id, person, a: seiteA.a, b: seiteB.b, ka: seiteA.ka, kb: seiteB.kb, vb: seiteB.vb };
  if (seiteA.za) e.za = seiteA.za;
  if (seiteB.zb) e.zb = seiteB.zb;
  return mitWemUndAm(e, mitWem, am);
}

/** Hängt `mitWem` (bereinigt; leer → weg) und `am` an. */
function mitWemUndAm(e, mitWem, am) {
  const text = sauber(mitWem ?? '');
  return text === '' ? { ...e, am } : { ...e, mitWem: text, am };
}

/**
 * Der Eintrag zu einem geprüften Entwurf; merkt sich, was vorher in A (`ka`, `za`) und B (`vb`, `zb`) stand. Wirft „Falscher Monat für den
 * Diensttausch.“, wenn Monat A oder B fehlt oder nicht der Monat seines Tages ist (ein fehlender Monat B ergäbe sonst still `vb: null`).
 */
export function tauschEintrag(entwurf, { id, monatA, monatB, heute }) {
  const { person, a, b, kb } = entwurf;
  pruefeMonat(monatA, a);
  pruefeMonat(monatB, b);
  const seiteA = seiteAAus(monatA, person, a, TEXT_KEIN_DIENST_A);
  return geschlossen({ id, person, mitWem: entwurf.mitWem, am: heute }, seiteA, seiteBAus(monatB, person, b, kb));
}

/**
 * Der offene Eintrag zu einem geprüften Entwurf { person, richtung, tag, kb?, mitWem? }: merkt sich `ka`/`za` (abgegeben) bzw. `vb`/`zb`
 * (übernommen) aus `monat`, `frist` = tauschFrist(tag), `am` = heute. Wirft „Falscher Monat …“, wenn `monat` nicht der Monat des Tages ist.
 */
export function tauschOffenEintrag(entwurf, { id, monat, heute }) {
  const { person, richtung, tag } = entwurf;
  pruefeMonat(monat, tag);
  if (!TAUSCH_RICHTUNGEN.includes(richtung)) throw new Error(TEXT_RICHTUNG);
  const seite = richtung === 'abgegeben' ? seiteAAus(monat, person, tag, TEXT_KEIN_DIENST_A) : seiteBAus(monat, person, tag, entwurf.kb);
  return mitWemUndAm({ id, person, richtung, frist: tauschFrist(tag), ...seite }, entwurf.mitWem, heute);
}

/**
 * Schließt einen offenen Tausch mit der Rückgabe { tag, kb? } (`monat` = Monat des Rückgabetags): ein geschlossener Eintrag in 1.5.0-Form,
 * ohne `richtung` und `frist`; `id`, `mitWem` und `am` bleiben. Abgegeben bekommt B (Rückgabetag mit `kb`, `vb`/`zb` von dort), übernommen
 * bekommt A (Rückgabetag wird frei, `ka`/`za` von dort).
 */
export function tauschRueckgabeEintrag(e, { tag, kb }, { monat }) {
  if (!tauschIstOffen(e)) throw new Error(TEXT_ABGESCHLOSSEN);
  pruefeMonat(monat, tag);
  if (e.richtung === 'abgegeben') return geschlossen(e, e, seiteBAus(monat, e.person, tag, kb));
  return geschlossen(e, seiteAAus(monat, e.person, tag, TEXT_KEIN_DIENST_RUECKGABE), e);
}

/**
 * Aufräumen: weg sind geschlossene Einträge, deren späterer Tag mehr als TAUSCH_BEHALTEN_MONATE vor `heute` liegt, und geschlossene im
 * Zustand 'offen' (`zustand(e)` vom Aufrufer; ohne ihn fällt keiner weg), die älter als TAUSCH_OFFEN_TAGE sind. 'unbekannt' bleibt;
 * `behalten` immer. Offene Tausche (mit Richtung) fallen nie von selbst weg, auch nach der Frist nicht; `zustand` wird für sie nicht gefragt.
 */
function aufraeumen(eintraege, { heute, zustand } = {}, behalten = null) {
  if (!heute) return eintraege;
  const grenze = plusMonate(heute, -TAUSCH_BEHALTEN_MONATE);
  const offenGrenze = addDays(heute, -TAUSCH_OFFEN_TAGE);
  return eintraege.filter((e) => {
    if (e.id === behalten || tauschIstOffen(e)) return true;
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

const gleicherEintrag = (x, y) => JSON.stringify(kurzForm(x)) === JSON.stringify(kurzForm(y));

/**
 * Ersetzt den Tausch mit derselben `id` an seinem Platz (z. B. bei der Rückgabe eines offenen) und räumt auf wie tauschHinzufuegen.
 * Schon gleich → nichts zu ersetzen (wiederholbar); nicht mehr da → wirft TEXT_TAUSCH_WEG; inzwischen anders geschlossen → wirft
 * „Die Rückgabe wurde inzwischen schon eingetragen.“
 */
export function tauschErsetzen(daten, eintrag, optionen) {
  const alt = daten.eintraege ?? [];
  const i = alt.findIndex((e) => e.id === eintrag.id);
  if (i < 0) throw new Error(TEXT_TAUSCH_WEG);
  const gleich = gleicherEintrag(alt[i], eintrag);
  if (!gleich && !tauschIstOffen(alt[i])) throw new Error(TEXT_RUECKGABE_SCHON);
  const liste = gleich ? alt : alt.map((e, j) => (j === i ? eintrag : e));
  return mitEintraegen(daten, aufraeumen(liste, optionen, eintrag.id));
}

/** Zustand eines Tages vor und nach dem Tausch ({ k, zeiten }); B übernimmt die eigenen Zeiten von A nur bei gleicher Art. */
function seitenZustaende(e, seite) {
  if (!tauschSeiten(e).includes(seite)) throw new Error('Ungültige Seite.');
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
  pruefeMonat(monat, datum);
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
