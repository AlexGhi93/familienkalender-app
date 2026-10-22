// Fixkosten: die festen Ausgaben der Familie (Miete, Versicherungen, Abos …) mit Intervall, Fälligkeit und – bei Verträgen – Kündigungsfrist.
// Rein, ohne DOM und ohne Netz. Beträge sind GANZE CENT. Kein „offen/bezahlt“: die Beträge gehen automatisch vom Konto ab.
//
// Posten (im Speicher, lesbare Namen):
//   { id, name, cents, ungefaehr, intervall, tag, start, kategorie, person, vertrag?: { bis, verlaengerung, frist }, notiz?, archiv? }
//   id         Kennung aus 0-9 und a-v (4–16 Zeichen, siehe neueFixId); bestimmt den Teil (shardFuer)
//   name       1–40 Zeichen; cents 1 … 9.999.999 (0,01 € … 99.999,99 €); ungefaehr = Betrag schwankt („~“)
//   intervall  Monate: 1, 2, 3, 6, 12, 24; tag '1' … '31' oder 'letzter' (zu großer Tag → Monatsende); start 'JJJJ-MM' = Monat der ersten Zahlung
//   kategorie  FIX_KATEGORIEN[].id; person 'papa' | 'mama' | 'gemeinsam' | 'kind'
//   vertrag    bis 'JJJJ-MM-TT' (läuft bis), verlaengerung (Monate aus FIX_VERLAENGERUNG, 0 = endet), frist (FIX_FRISTEN[].id) – vor Ende
//   notiz      ≤ 80 Zeichen; archiv 'JJJJ-MM-TT' = ab diesem Tag nicht mehr aktiv (Zahlungen davor zählen noch)
//
// Gespeichert wird in FIX_SHARDS (4) versteckten Kalenderereignissen; jeder Teil ist ein JSON ≤ MAX_FIX_ZEICHEN mit KURZEN Schlüsseln:
//   Teil:    { v: 1, p: [ … ] }                         (im Speicher: { v: 1, posten: [ … ] })
//   Posten:  i=id  n=name  c=cents  u=ungefaehr (nur 1, false fällt weg)  m=intervall  d=tag  s=start  k=kategorie  w=person (wer)
//            r=vertrag { b=bis, l=verlaengerung, f=frist }  t=notiz  a=archiv
// Ein Posten liegt immer im Teil shardFuer(id); jede Änderung betrifft genau einen Teil und ist eine reine Funktion Teil → Teil, die
// (nach HTTP 412) auf die NEUESTE Fassung angewendet wird: das Argument wird nie verändert, zweimal angewendet = einmal angewendet.

import { addDays, diffDays, isValidDate } from './dates.js';

export const MAX_FIX_POSTEN = 100; // insgesamt, archivierte mitgezählt
export const FIX_SHARDS = 4;
export const MAX_FIX_ZEICHEN = 6000; // wie beim Kontostand: Google kürzt Beschreibungen still bei 8192 Zeichen
export const MAX_FIX_NAME = 40;
export const MAX_FIX_NOTIZ = 80;
export const MAX_FIX_CENTS = 9_999_999; // 99.999,99 €

const einfrieren = (liste) => Object.freeze(liste.map((x) => Object.freeze(x)));

export const FIX_KATEGORIEN = einfrieren([
  { id: 'wohnen', emoji: '🏠', name: 'Wohnen & Energie' },
  { id: 'versicherung', emoji: '🛡️', name: 'Versicherungen' },
  { id: 'mobilitaet', emoji: '🚗', name: 'Mobilität' },
  { id: 'kommunikation', emoji: '📱', name: 'Kommunikation' },
  { id: 'kind', emoji: '👧', name: 'Kind' },
  { id: 'freizeit', emoji: '🎬', name: 'Freizeit & Abos' },
  { id: 'bank', emoji: '🏦', name: 'Bank & Gebühren' },
  { id: 'sonstiges', emoji: '📦', name: 'Sonstiges' },
]);

/** name/kuerzel von 'kind' sind nur Ersatz: die Oberfläche nimmt den Namen aus den Einstellungen. */
export const FIX_PERSONEN = einfrieren([
  { id: 'papa', emoji: '👨', name: 'Papa', kuerzel: 'PAPA' },
  { id: 'mama', emoji: '👩', name: 'Mama', kuerzel: 'MAMA' },
  { id: 'gemeinsam', emoji: '🏠', name: 'Gemeinsam', kuerzel: 'GEM' },
  { id: 'kind', emoji: '👧', name: 'Kind', kuerzel: 'KIND' },
]);

export const FIX_INTERVALLE = einfrieren([
  { monate: 1, text: 'monatlich' },
  { monate: 2, text: 'alle 2 Monate' },
  { monate: 3, text: 'alle 3 Monate' },
  { monate: 6, text: 'alle 6 Monate' },
  { monate: 12, text: 'jährlich' },
  { monate: 24, text: 'alle 2 Jahre' },
]);

/** Kündigungsfrist vor Vertragsende. */
export const FIX_FRISTEN = einfrieren([
  { id: '2w', text: '2 Wochen' },
  { id: '1m', text: '1 Monat' },
  { id: '2m', text: '2 Monate' },
  { id: '3m', text: '3 Monate' },
  { id: '6m', text: '6 Monate' },
]);

/** Um so viele Monate verlängert sich ein Vertrag, wenn er nicht gekündigt wird (0 = er endet). */
export const FIX_VERLAENGERUNG = Object.freeze([0, 1, 3, 6, 12, 24, 36]);

/**
 * Vorlagen fürs Formular: füllen Kategorie, Intervall, „ungefähr“ und – bei Verträgen – Verlängerung und Frist vor (alles änderbar).
 * Die Fristen sind nur übliche Werte in Österreich, daher der Hinweis „laut Vertrag/Polizze prüfen“. vertrag: null = kein Vertrag mit Frist.
 */
export const FIX_VORLAGEN = Object.freeze(
  [
    { id: 'miete', emoji: '🏠', name: 'Miete', kategorie: 'wohnen', intervall: 1, ungefaehr: false, vertrag: { verlaengerung: 0, frist: '3m' }, hint: 'Mietvertrag: Kündigung meist 3 Monate vor Ende – laut Vertrag prüfen.' },
    { id: 'strom', emoji: '⚡', name: 'Strom', kategorie: 'wohnen', intervall: 1, ungefaehr: true, vertrag: { verlaengerung: 12, frist: '2w' }, hint: 'Strom: für Haushalte meist 2 Wochen Kündigungsfrist – laut Vertrag prüfen.' },
    { id: 'fernwaerme', emoji: '🔥', name: 'Fernwärme', kategorie: 'wohnen', intervall: 2, ungefaehr: true, vertrag: null, hint: 'Teilbetrag laut Vorschreibung; meist kein Vertrag zum Kündigen.' },
    { id: 'orf', emoji: '📺', name: 'ORF-Beitrag', kategorie: 'wohnen', intervall: 12, ungefaehr: false, vertrag: null, hint: 'Gesetzlicher Beitrag – kein Vertrag zum Kündigen.' },
    { id: 'kfz', emoji: '🚗', name: 'Kfz-Versicherung', kategorie: 'versicherung', intervall: 1, ungefaehr: false, vertrag: { verlaengerung: 12, frist: '1m' }, hint: 'Kfz in Österreich: meist 1 Monat vor der Hauptfälligkeit kündbar – laut Polizze prüfen.' },
    { id: 'kranken', emoji: '🩺', name: 'Krankenversicherung', kategorie: 'versicherung', intervall: 1, ungefaehr: false, vertrag: { verlaengerung: 12, frist: '3m' }, hint: 'Private Zusatzversicherung: meist 3 Monate vor Ende des Versicherungsjahres – laut Polizze prüfen.' },
    { id: 'handy', emoji: '📱', name: 'Handy', kategorie: 'kommunikation', intervall: 1, ungefaehr: false, vertrag: { verlaengerung: 1, frist: '1m' }, hint: 'Handy: meist 1 Monat Kündigungsfrist – laut Vertrag prüfen.' },
    { id: 'internet', emoji: '🌐', name: 'Internet', kategorie: 'kommunikation', intervall: 1, ungefaehr: false, vertrag: { verlaengerung: 1, frist: '1m' }, hint: 'Internet: nach der Mindestlaufzeit meist 1 Monat – laut Vertrag prüfen.' },
    { id: 'fitness', emoji: '💪', name: 'Fitnessstudio', kategorie: 'freizeit', intervall: 1, ungefaehr: false, vertrag: { verlaengerung: 12, frist: '2m' }, hint: 'Fitnessstudio: oft 2 Monate vor Ende der Laufzeit – laut Vertrag prüfen.' },
    { id: 'streaming', emoji: '🎬', name: 'Streaming', kategorie: 'freizeit', intervall: 1, ungefaehr: false, vertrag: null, hint: 'Meist monatlich kündbar – kein Vertrag mit Frist.' },
    { id: 'friseur', emoji: '💇', name: 'Friseur', kategorie: 'sonstiges', intervall: 1, ungefaehr: true, vertrag: null, hint: 'Kein Vertrag – Betrag ungefähr.' },
    { id: 'lotto', emoji: '🎟️', name: 'Lotto', kategorie: 'freizeit', intervall: 1, ungefaehr: false, vertrag: null, hint: 'Kein Vertrag mit Frist.' },
    { id: 'konto', emoji: '🏦', name: 'Kontoführung', kategorie: 'bank', intervall: 3, ungefaehr: false, vertrag: null, hint: 'Wird oft vierteljährlich abgebucht – laut Kontoauszug.' },
  ].map((v) => Object.freeze({ ...v, vertrag: v.vertrag ? Object.freeze(v.vertrag) : null })),
);

// ---------------------------------------------------------------- Hilfen

const MONAT = /^\d{4}-(0[1-9]|1[0-2])$/;
const KENNUNG = /^[0-9a-v]{4,16}$/;
const ID_ZEICHEN = '0123456789abcdefghijklmnopqrstuv';
const ID_LAENGE = 8;
const INTERVALLE = FIX_INTERVALLE.map((i) => i.monate);
const KATEGORIEN = FIX_KATEGORIEN.map((k) => k.id);
const PERSONEN = FIX_PERSONEN.map((p) => p.id);
const FRIST_MONATE = { '1m': 1, '2m': 2, '3m': 3, '6m': 6 }; // '2w' = 14 Tage
const FRISTEN = FIX_FRISTEN.map((f) => f.id);

const ZU_VOLL = 'Dieser Teil der Fixkosten ist voll. Bitte Notizen kürzen oder archivierte Posten endgültig löschen.';
const ZU_VIELE = `Höchstens ${MAX_FIX_POSTEN} Fixkosten-Posten (mit Archiv). Bitte archivierte Posten endgültig löschen.`;

const pad2 = (n) => String(n).padStart(2, '0');
const sauber = (text) => String(text ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
const zeichen = (text) => [...text].length; // Zeichen, nicht UTF-16-Einheiten
const istObjekt = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const tageImMonat = (jahr, monat) => new Date(Date.UTC(jahr, monat, 0)).getUTCDate();
const monatsIndex = (jm) => Number(jm.slice(0, 4)) * 12 + Number(jm.slice(5, 7)) - 1;

/** 12 oder '12' → 12, sonst NaN (für Auswahlfelder, die Text liefern). */
const zahl = (x) => (typeof x === 'number' ? x : typeof x === 'string' && /^\d+$/.test(x) ? Number(x) : NaN);

/** '1' … '31' (auch als Zahl) oder 'letzter' → gespeicherte Form, sonst null. */
function tagWert(t) {
  if (t === 'letzter') return t;
  const n = zahl(t);
  return Number.isInteger(n) && n >= 1 && n <= 31 && (typeof t === 'number' || /^[1-9]\d?$/.test(t)) ? String(n) : null;
}

/**
 * Datum plus `n` Monate (negativ = zurück). Ein Tag, den es im Zielmonat nicht gibt, wird auf das Monatsende gekürzt (31.03. − 1 Monat = 28./29.02.).
 * Mit `monatsende` bleibt ein Monatsletzter ein Monatsletzter (30.09. + 1 Monat = 31.10.).
 */
function plusMonate(datum, n, monatsende = false) {
  const jahr = Number(datum.slice(0, 4));
  const monat = Number(datum.slice(5, 7));
  const tag = Number(datum.slice(8, 10));
  const index = jahr * 12 + monat - 1 + n;
  const zj = Math.floor(index / 12);
  const zm = (index % 12) + 1;
  const letzter = tageImMonat(zj, zm);
  const zt = monatsende && tag === tageImMonat(jahr, monat) ? letzter : Math.min(tag, letzter);
  return `${zj}-${pad2(zm)}-${pad2(zt)}`;
}

// ---------------------------------------------------------------- Prüfen und Normalisieren

function vertragFehler(v) {
  if (!istObjekt(v) || typeof v.bis !== 'string' || !isValidDate(v.bis)) return 'Bitte angeben, bis wann der Vertrag läuft.';
  if (!FIX_VERLAENGERUNG.includes(zahl(v.verlaengerung))) return 'Bitte wählen, um wie viel sich der Vertrag verlängert.';
  if (!FRISTEN.includes(v.frist)) return 'Bitte eine Kündigungsfrist wählen.';
  return null;
}

/**
 * Prüft einen Entwurf (aus dem Formular oder gelesen) und gibt die erste Fehlermeldung (deutsch, für die Oberfläche) oder null zurück.
 * Die Kennung darf fehlen (ein neuer Posten bekommt sie vom Speicher); ist sie da, muss sie gültig sein.
 */
export function postenPruefen(entwurf) {
  const e = istObjekt(entwurf) ? entwurf : {};
  const name = sauber(e.name);
  if (name === '') return 'Bitte einen Namen eingeben.';
  if (zeichen(name) > MAX_FIX_NAME) return `Der Name darf höchstens ${MAX_FIX_NAME} Zeichen haben.`;
  if (!Number.isInteger(e.cents) || e.cents < 1 || e.cents > MAX_FIX_CENTS) return 'Bitte einen Betrag zwischen 0,01 € und 99.999,99 € eingeben.';
  if (!INTERVALLE.includes(zahl(e.intervall))) return 'Bitte wählen, wie oft der Betrag fällig ist.';
  if (tagWert(e.tag) === null) return 'Bitte einen Tag von 1 bis 31 oder „Monatsletzter“ wählen.';
  if (typeof e.start !== 'string' || !MONAT.test(e.start)) return 'Bitte den Monat der ersten Zahlung angeben.';
  if (!KATEGORIEN.includes(e.kategorie)) return 'Bitte eine Kategorie wählen.';
  if (!PERSONEN.includes(e.person)) return 'Bitte wählen, zu wem der Posten gehört.';
  if (e.vertrag !== undefined && e.vertrag !== null) {
    const f = vertragFehler(e.vertrag);
    if (f) return f;
  }
  if (e.notiz !== undefined && e.notiz !== null && zeichen(sauber(e.notiz)) > MAX_FIX_NOTIZ) return `Die Notiz darf höchstens ${MAX_FIX_NOTIZ} Zeichen haben.`;
  if (e.id !== undefined && (typeof e.id !== 'string' || !KENNUNG.test(e.id))) return 'Ungültige Kennung.';
  if (e.archiv !== undefined && e.archiv !== null && (typeof e.archiv !== 'string' || !isValidDate(e.archiv))) return 'Ungültiges Archivdatum.';
  return null;
}

/** Ein gültiger Posten mit Kennung → bereinigt in fester Feldreihenfolge (leere Zusatzfelder fallen weg); sonst null. */
export function normalisierePosten(roh) {
  if (postenPruefen(roh) !== null || typeof roh.id !== 'string') return null;
  const p = {
    id: roh.id,
    name: sauber(roh.name),
    cents: roh.cents,
    ungefaehr: roh.ungefaehr === true,
    intervall: zahl(roh.intervall),
    tag: tagWert(roh.tag),
    start: roh.start,
    kategorie: roh.kategorie,
    person: roh.person,
  };
  if (istObjekt(roh.vertrag)) p.vertrag = { bis: roh.vertrag.bis, verlaengerung: zahl(roh.vertrag.verlaengerung), frist: roh.vertrag.frist };
  const notiz = sauber(roh.notiz);
  if (notiz !== '') p.notiz = notiz;
  if (typeof roh.archiv === 'string') p.archiv = roh.archiv;
  return p;
}

/** Neue Kennung aus 0-9 und a-v (8 Zeichen, 32^8 Möglichkeiten). `zufall` wie Math.random – für Tests einspeisbar. */
export function neueFixId(zufall = Math.random) {
  let id = '';
  for (let i = 0; i < ID_LAENGE; i += 1) id += ID_ZEICHEN[Math.floor(zufall() * ID_ZEICHEN.length) % ID_ZEICHEN.length];
  return id;
}

// ---------------------------------------------------------------- Teile (Shards)

/**
 * Der Teil (0 … 3), in dem ein Posten liegt: FNV-1a (32 Bit) mit Murmur3-Abschluss, mod 4. NIE ändern – sonst suchen die Geräte
 * gespeicherte Posten im falschen Teil.
 */
export function shardFuer(id) {
  let h = 0x811c9dc5;
  for (const z of String(id)) {
    h ^= z.codePointAt(0);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) % FIX_SHARDS;
}

export const leererShard = () => ({ v: 1, posten: [] });

/** Prüft einen Teil im Speicherformat nachsichtig: ungültige oder doppelte Posten fallen einzeln weg; Unbrauchbares → leerer Teil. */
export function normalisiereShard(roh) {
  if (!istObjekt(roh) || roh.v !== 1 || !Array.isArray(roh.posten)) return leererShard();
  const gesehen = new Set();
  const posten = [];
  for (const r of roh.posten) {
    const p = normalisierePosten(r);
    if (!p || gesehen.has(p.id)) continue;
    gesehen.add(p.id);
    posten.push(p);
    if (posten.length >= MAX_FIX_POSTEN) break;
  }
  return { v: 1, posten };
}

function kurz(p) {
  const k = { i: p.id, n: p.name, c: p.cents };
  if (p.ungefaehr) k.u = 1;
  Object.assign(k, { m: p.intervall, d: p.tag, s: p.start, k: p.kategorie, w: p.person });
  if (p.vertrag) k.r = { b: p.vertrag.bis, l: p.vertrag.verlaengerung, f: p.vertrag.frist };
  if (p.notiz) k.t = p.notiz;
  if (p.archiv) k.a = p.archiv;
  return k;
}

function lang(k) {
  if (!istObjekt(k)) return null;
  return {
    id: k.i,
    name: k.n,
    cents: k.c,
    ungefaehr: k.u === 1,
    intervall: k.m,
    tag: k.d,
    start: k.s,
    kategorie: k.k,
    person: k.w,
    vertrag: istObjekt(k.r) ? { bis: k.r.b, verlaengerung: k.r.l, frist: k.r.f } : k.r,
    notiz: k.t,
    archiv: k.a,
  };
}

/** Der Teil als Text für die Beschreibung des Kalenderereignisses (kurze Schlüssel); ein zu voller Teil wird vor dem Schreiben abgelehnt. */
export function shardText(shard) {
  const text = JSON.stringify({ v: 1, p: normalisiereShard(shard).posten.map(kurz) });
  if (text.length > MAX_FIX_ZEICHEN) throw new Error(ZU_VOLL);
  return text;
}

/** Text aus dem Kalender → Teil im Speicherformat (leer oder kaputt → leerer Teil; ungültige Posten fallen einzeln weg). */
export function shardAusText(text) {
  if (typeof text !== 'string' || text.trim() === '') return leererShard();
  let roh;
  try {
    roh = JSON.parse(text);
  } catch {
    return leererShard();
  }
  if (!istObjekt(roh) || roh.v !== 1 || !Array.isArray(roh.p)) return leererShard();
  return normalisiereShard({ v: 1, posten: roh.p.map(lang) });
}

/**
 * Darf ein Posten mit dieser Kennung gespeichert werden? Ein neuer nur, solange es insgesamt (alle Teile, archivierte mitgezählt)
 * weniger als MAX_FIX_POSTEN gibt; ein bestehender darf immer geändert werden. `shards`: die 4 Teile (null = nicht gelesen, zählt 0).
 */
export function postenAnzahlPruefen(shards, id) {
  const alle = (shards ?? []).flatMap((s) => s?.posten ?? []);
  if (alle.some((p) => p.id === id)) return null;
  return alle.length >= MAX_FIX_POSTEN ? ZU_VIELE : null;
}

// ---------------------------------------------------------------- Änderungen (rein, wiederholbar)

/** Neuer Teil mit dieser Liste; wirft, wenn er nicht mehr in den Kalender passt. */
function mitPosten(liste) {
  const neu = { v: 1, posten: liste };
  shardText(neu);
  return neu;
}

function ersetze(shard, id, aendern) {
  const liste = shard.posten ?? [];
  const i = liste.findIndex((p) => p.id === id);
  if (i < 0) return shard; // unbekannt (z. B. vom anderen Gerät gelöscht) → nichts zu tun
  const neu = aendern(liste[i]);
  if (JSON.stringify(neu) === JSON.stringify(liste[i])) return shard;
  return mitPosten(liste.map((p, j) => (j === i ? neu : p)));
}

/** Legt einen Posten an oder ersetzt den mit derselben Kennung (an derselben Stelle). Wirft mit der Meldung aus postenPruefen. */
export function postenSetzen(shard, posten) {
  if (!istObjekt(posten) || typeof posten.id !== 'string' || !KENNUNG.test(posten.id)) throw new Error('Ungültige Kennung.');
  const fehler = postenPruefen(posten);
  if (fehler) throw new Error(fehler);
  const neu = normalisierePosten(posten);
  const liste = shard.posten ?? [];
  if (!liste.some((p) => p.id === neu.id)) {
    if (liste.length >= MAX_FIX_POSTEN) throw new Error(ZU_VIELE);
    return mitPosten([...liste, neu]);
  }
  return ersetze(shard, neu.id, () => neu);
}

/** Archiviert einen Posten ab `datum` ('JJJJ-MM-TT'): ab diesem Tag zählt er nicht mehr (Zahlungen davor bleiben in früheren Monaten). */
export function postenArchivieren(shard, id, datum) {
  if (typeof datum !== 'string' || !isValidDate(datum)) throw new Error('Ungültiges Archivdatum.');
  return ersetze(shard, id, (p) => ({ ...p, archiv: datum }));
}

/** Holt einen archivierten Posten zurück. */
export function postenWiederherstellen(shard, id) {
  return ersetze(shard, id, ({ archiv: _weg, ...rest }) => rest);
}

/** Löscht einen Posten endgültig – nur aus dem Archiv; eine unbekannte Kennung ändert nichts. */
export function postenLoeschen(shard, id) {
  const liste = shard.posten ?? [];
  const p = liste.find((x) => x.id === id);
  if (!p) return shard;
  if (!p.archiv) throw new Error('Nur archivierte Posten lassen sich endgültig löschen.');
  return { v: 1, posten: liste.filter((x) => x.id !== id) };
}

// ---------------------------------------------------------------- Berechnungen

/** Aktiv = nicht archiviert, oder das Archivdatum liegt erst nach `heute`. */
export const istAktiv = (posten, heute) => !posten.archiv || posten.archiv > heute;

/** Monatlicher Durchschnitt in Cent: Betrag / Monate des Intervalls (gerundet). */
export const monatlich = (posten) => Math.round(posten.cents / posten.intervall);

const jaehrlichCents = (posten) => Math.round((posten.cents * 12) / posten.intervall);

/**
 * Ist der Posten im Monat `jm` ('JJJJ-MM') fällig? → { tag } (tatsächlicher Tag, „letzter“ oder 31 am Monatsende gekürzt) oder null.
 * Fällig ab dem Startmonat alle `intervall` Monate, solange der Zahltag vor dem Archivdatum liegt.
 */
export function faelligIn(posten, jm) {
  const abstand = monatsIndex(jm) - monatsIndex(posten.start);
  if (abstand < 0 || abstand % posten.intervall !== 0) return null;
  const letzter = tageImMonat(Number(jm.slice(0, 4)), Number(jm.slice(5, 7)));
  const tag = posten.tag === 'letzter' ? letzter : Math.min(Number(posten.tag), letzter);
  if (posten.archiv && `${jm}-${pad2(tag)}` >= posten.archiv) return null;
  return { tag };
}

/** Die im Monat fälligen Posten als [{ posten, tag }], nach Tag (dann Name) sortiert. */
export function faelligeImMonat(posten, jm) {
  return posten
    .map((p) => ({ posten: p, f: faelligIn(p, jm) }))
    .filter((x) => x.f)
    .map((x) => ({ posten: x.posten, tag: x.f.tag }))
    .sort((a, b) => a.tag - b.tag || a.posten.name.localeCompare(b.posten.name, 'de'));
}

function kuendbarVor(ende, frist) {
  return frist === '2w' ? addDays(ende, -14) : plusMonate(ende, -FRIST_MONATE[frist]);
}

/**
 * Stand eines Vertrags am Tag `heute` → { ende, kuendbarBis, erinnerung, beendet, tage } oder null (kein Vertrag).
 * Verlängert er sich (verlaengerung > 0), wird das Ende so lange um die Verlängerung weitergeschoben, bis „kündbar bis“ nicht mehr
 * vorbei ist (ist die Frist verpasst, verlängert er sich – es zählt die nächste). Ein Monatsletzter bleibt dabei Monatsletzter.
 * kuendbarBis = Ende minus Frist (2 Wochen = 14 Tage; Monate: fehlender Tag → Monatsende, also eher früher); erinnerung = 1 Monat
 * vor kuendbarBis; beendet = ohne Verlängerung und das Ende ist vorbei; tage = Tage von heute bis kuendbarBis (negativ = vorbei).
 */
export function vertragStatus(posten, heute) {
  const v = posten?.vertrag;
  if (!v) return null;
  let ende = v.bis;
  if (v.verlaengerung > 0) {
    for (let k = 1; kuendbarVor(ende, v.frist) < heute; k += 1) ende = plusMonate(v.bis, k * v.verlaengerung, true);
  }
  const kuendbarBis = kuendbarVor(ende, v.frist);
  return { ende, kuendbarBis, erinnerung: plusMonate(kuendbarBis, -1), beendet: ende < heute, tage: diffDays(heute, kuendbarBis) };
}

/** Die laufenden Verträge der aktiven Posten als [{ posten, status }], die nächste Kündigungsmöglichkeit zuerst. */
export function kuendigungsfristen(posten, heute) {
  return posten
    .filter((p) => p.vertrag && istAktiv(p, heute))
    .map((p) => ({ posten: p, status: vertragStatus(p, heute) }))
    .filter((x) => !x.status.beendet)
    .sort((a, b) => (a.status.kuendbarBis < b.status.kuendbarBis ? -1 : a.status.kuendbarBis > b.status.kuendbarBis ? 1 : a.posten.name.localeCompare(b.posten.name, 'de')));
}

/**
 * Summen für den Kopf und die Filter. `jm` = Monat für „fällig“, `heute` = Wiener Datum (aktiv?), `person` = Filter (fehlt/'alle' = alle).
 * → { monatlich, jaehrlich, anzahl, faellig, jePerson, jeKategorie } in Cent:
 *   monatlich/jaehrlich/anzahl: aktive Posten (gefiltert); faellig: tatsächlich im Monat `jm` fällige Beträge (gefiltert, Archiv beachtet);
 *   jePerson: Ø pro Monat der aktiven Posten je Person (immer ungefiltert, für die Filterknöpfe);
 *   jeKategorie: Ø pro Monat der aktiven Posten je Kategorie (gefiltert; nur Kategorien mit Posten).
 */
export function summen(posten, { jm, heute, person } = {}) {
  const gefiltert = person && person !== 'alle' ? posten.filter((p) => p.person === person) : posten;
  const aktiv = gefiltert.filter((p) => istAktiv(p, heute));
  const jePerson = Object.fromEntries(PERSONEN.map((id) => [id, 0]));
  for (const p of posten) if (istAktiv(p, heute)) jePerson[p.person] += monatlich(p);
  const jeKategorie = {};
  for (const p of aktiv) jeKategorie[p.kategorie] = (jeKategorie[p.kategorie] ?? 0) + monatlich(p);
  return {
    monatlich: aktiv.reduce((s, p) => s + monatlich(p), 0),
    jaehrlich: aktiv.reduce((s, p) => s + jaehrlichCents(p), 0),
    anzahl: aktiv.length,
    faellig: faelligeImMonat(gefiltert, jm).reduce((s, f) => s + f.posten.cents, 0),
    jePerson,
    jeKategorie,
  };
}
