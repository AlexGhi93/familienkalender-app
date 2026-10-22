// Alles, was die Seite „Fixkosten“ im Konto-Tab braucht, als einfache Daten (ohne DOM): Kopf mit Summen, Filter je Person, „Diesen Monat
// fällig“ (ohne offen/bezahlt – die Beträge gehen automatisch vom Konto ab), Kategorien, Abzeichen der Verträge, Kündigungsfristen,
// Fixkosten und Ersparnis der letzten Monate, Archiv, Warnungen; dazu der Entwurf des Formulars und die gemerkte Ansicht des Tabs.
// Gerechnet wird ausschließlich mit src/domain/fixkosten.js; die Ersparnis kommt aus dem Kontostand-Modell (konto-model.js).
import {
  FIX_INTERVALLE,
  FIX_KATEGORIEN,
  FIX_PERSONEN,
  FIX_VORLAGEN,
  TEXT_TEIL_GESPERRT,
  faelligeImMonat,
  istAktiv,
  kuendigungsfristen,
  monatlich,
  postenPruefen,
  summen,
  vertragStatus,
} from '../../domain/fixkosten.js';
import { betragText, centsAusText, deltaText, monatVor } from '../../domain/konto.js';
import { datumAnzeige } from '../../domain/eingabe.js';
import { MONATE } from '../format-de.js';
import { kontoModel } from './konto-model.js';

// ---------------------------------------------------------------- gemerkte Ansicht (Kontostand · Fixkosten)

export const KONTO_ANSICHT_SCHLUESSEL = 'fk.konto.ansicht.v1';
export const KONTO_ANSICHTEN = Object.freeze(['kontostand', 'fixkosten']);
const gueltigeAnsicht = (wert) => (KONTO_ANSICHTEN.includes(wert) ? wert : 'kontostand');

/** Die zuletzt gewählte Ansicht des Konto-Tabs auf diesem Telefon; ohne Eintrag (oder ohne Speicher) „Kontostand“. Wirft nie. */
export function kontoAnsichtLesen(speicher = globalThis.localStorage) {
  try {
    return gueltigeAnsicht(speicher?.getItem(KONTO_ANSICHT_SCHLUESSEL));
  } catch {
    return 'kontostand';
  }
}

/** Merkt die Ansicht (Fehler des Speichers, z. B. im privaten Modus, stören nicht) und gibt den gültigen Wert zurück. */
export function kontoAnsichtSpeichern(wert, speicher = globalThis.localStorage) {
  const gueltig = gueltigeAnsicht(wert);
  try {
    speicher?.setItem(KONTO_ANSICHT_SCHLUESSEL, gueltig);
  } catch {
    // dann eben nur bis zum Neuladen
  }
  return gueltig;
}

// ---------------------------------------------------------------- Hilfen

export const FIX_FILTER = Object.freeze(['alle', ...FIX_PERSONEN.map((x) => x.id)]);
const WARN_TAGE = 60; // ⚠ ab so vielen Tagen vor „Kündbar bis“
const MONATLICH_KUENDBAR_BIS = 3; // Verlängerung unter 3 Monaten (> 0): monatlich kündbar, keine Erinnerung (wie push/plan.js)
const DIAGRAMM_MONATE = 6;
const BETRAG_FEHLER = 'Bitte einen Betrag zwischen 0,01 € und 99.999,99 € eingeben.';

const monatText = (jm) => `${MONATE[Number(jm.slice(5, 7)) - 1]} ${jm.slice(0, 4)}`;
const monatsIndex = (jm) => Number(jm.slice(0, 4)) * 12 + Number(jm.slice(5, 7)) - 1;
const plusMonate = (jm, n) => monatVor(jm, -n);
const kurzDatum = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
const intervallText = (monate) => FIX_INTERVALLE.find((i) => i.monate === monate)?.text ?? `alle ${monate} Monate`;
const tagText = (tag) => (tag === 'letzter' ? 'am Monatsletzten' : `am ${tag}.`);
const ungefaehrText = (posten, cents) => `${posten.ungefaehr ? '~ ' : ''}${betragText(cents)}`;
const istMonatlichKuendbar = (v) => v.verlaengerung > 0 && v.verlaengerung < MONATLICH_KUENDBAR_BIS;

/** Person eines Postens für die Anzeige: Kind mit dem Namen aus den Einstellungen (sonst „Kind“); Kürzel als Text neben der Farbe. */
function personInfo(id, settings) {
  const p = FIX_PERSONEN.find((x) => x.id === id) ?? FIX_PERSONEN[2];
  if (p.id !== 'kind') return { id: p.id, emoji: p.emoji, name: p.name, kuerzel: p.kuerzel };
  const name = String(settings?.kindname ?? '').trim() || p.name;
  return { id: 'kind', emoji: p.emoji, name, kuerzel: name.toLocaleUpperCase('de-AT') };
}

const inTagen = (tage) => (tage === 0 ? 'heute' : tage === 1 ? 'morgen' : `in ${tage} Tagen`);

/**
 * Abzeichen eines Vertrags am Tag `heute` → { text, warn } oder null (kein Vertrag):
 * „📝 Kündbar bis TT.MM.JJJJ“; ab 60 Tagen davor „⚠ Kündbar bis TT.MM. – in N Tagen“; ohne Verlängerung und Frist vorbei „📝 Vertrag endet am …“,
 * Ende vorbei „📝 Vertrag beendet“. Verlängert er sich um weniger als 3 Monate (monatlich), gibt es keine Erinnerung und nie ⚠:
 * „📝 monatlich kündbar“ (in der ersten Laufzeit „📝 Kündbar bis …, danach monatlich kündbar“). Ein künftiges Archivdatum geht vor.
 */
export function vertragAbzeichen(posten, heute) {
  if (posten.archiv) return { text: `🗄️ archiviert ab ${datumAnzeige(posten.archiv)}`, warn: false };
  const st = vertragStatus(posten, heute);
  if (!st) return null;
  if (st.beendet) return { text: '📝 Vertrag beendet', warn: false };
  if (istMonatlichKuendbar(posten.vertrag)) {
    return st.ende === posten.vertrag.bis ? { text: `📝 Kündbar bis ${datumAnzeige(st.kuendbarBis)}, danach monatlich kündbar`, warn: false } : { text: '📝 monatlich kündbar', warn: false };
  }
  if (st.tage < 0) return { text: `📝 Vertrag endet am ${datumAnzeige(st.ende)}`, warn: false };
  if (st.tage <= WARN_TAGE) return { text: `⚠ Kündbar bis ${kurzDatum(st.kuendbarBis)} – ${inTagen(st.tage)}`, warn: true };
  return { text: `📝 Kündbar bis ${datumAnzeige(st.kuendbarBis)}`, warn: false };
}

/** Zeile eines Postens in einer Kategorie. */
function zeile(posten, gesperrt, settings, heute) {
  const teile = [posten.intervall === 1 ? 'monatlich' : `${intervallText(posten.intervall)} ${betragText(posten.cents)}`, tagText(posten.tag)];
  if (posten.ungefaehr) teile.push('~ ungefähr');
  return {
    id: posten.id,
    name: posten.name,
    person: personInfo(posten.person, settings),
    unter: teile.join(' · '),
    betrag: ungefaehrText(posten, monatlich(posten)),
    proMonat: posten.intervall > 1,
    abzeichen: vertragAbzeichen(posten, heute),
    archiviert: Boolean(posten.archiv),
    gesperrt,
  };
}

/** Die Warnungen des Lesens ohne die, die schon als eigener Hinweis erscheinen (unlesbarer Teil, ausgeblendete Posten); ohne Doppelte. */
function warnungenFuerAnzeige(warnungen, { unlesbar, fremd }) {
  return [...new Set(warnungen ?? [])].filter((w) => !(unlesbar && /^Ein Teil der Fixkosten ist unlesbar/.test(w)) && !(fremd && /Fixkosten-Posten konnten? nicht gelesen werden/.test(w)));
}

/** Fixkosten und Ersparnis der letzten Monate (neueste zuerst), frühestens ab dem ersten Startmonat; Ersparnis aus dem Kontostand-Modell. */
function diagrammModel(alle, jm, ersparnisJeMonat) {
  if (alle.length === 0) return null;
  const erster = alle.map((p) => p.start).sort()[0];
  const monate = Array.from({ length: DIAGRAMM_MONATE }, (_, i) => monatVor(jm, i)).filter((m) => m >= erster);
  const daten = monate.map((m) => ({ monat: m, fix: faelligeImMonat(alle, m).reduce((s, f) => s + f.posten.cents, 0), spar: ersparnisJeMonat.get(m) ?? null }));
  const groesster = Math.max(1, ...daten.map((d) => d.fix + Math.max(0, d.spar ?? 0)));
  const breite = (cents) => Math.round((cents / groesster) * 1000) / 10;
  return {
    monate: daten.map((d) => ({
      monat: d.monat,
      text: monatText(d.monat),
      faellig: `Fixkosten fällig ${betragText(d.fix)}`,
      ersparnis: d.spar !== null ? `Ersparnis ${deltaText(d.spar)}` : d.monat === jm ? 'Ersparnis: Kontostand am Monatsende' : 'Ersparnis: keine Angabe',
      fixBreite: breite(d.fix),
      sparBreite: d.spar !== null && d.spar > 0 ? breite(d.spar) : 0,
      minus: d.spar !== null && d.spar < 0,
    })),
  };
}

// ---------------------------------------------------------------- Seite

/**
 * `heute` = Wiener Datum, `filter` = 'alle' | 'papa' | 'mama' | 'gemeinsam' | 'kind' (Kopf, fällig, Kategorien, Fristen und Archiv;
 * die Filterknöpfe zeigen immer alle Teilsummen, das Diagramm und die Ersparnis gelten für die ganze Familie).
 * Ergebnis: { zustand: 'ok' | 'laedt' | 'fehler' | 'nichtGeladen', veraltet, leer, kopf, filter, faellig, kategorien, fristen, diagramm,
 * archiv, warnungen, unlesbar: [{ nr, titel, text }], fremdHinweis, gesperrtText }.
 */
export function fixkostenModel(state, heute, { filter: filterWunsch = 'alle' } = {}) {
  const fk = state.fixkosten ?? { shards: null, status: null, warnungen: [], unlesbar: [] };
  const filter = FIX_FILTER.includes(filterWunsch) ? filterWunsch : 'alle';
  const settings = state.settings ?? {};
  const jm = heute.slice(0, 7);
  const shards = Array.isArray(fk.shards) ? fk.shards : null;
  const unlesbar = Array.isArray(fk.unlesbar) ? fk.unlesbar : [];
  const zustand = shards ? 'ok' : fk.status === 'laedt' ? 'laedt' : fk.status === 'fehler' ? 'fehler' : 'nichtGeladen';

  const eintraege = (shards ?? []).flatMap((s, nr) => (s?.posten ?? []).map((posten) => ({ posten, gesperrt: unlesbar.includes(nr) })));
  const gesperrt = new Map(eintraege.map((e) => [e.posten.id, e.gesperrt]));
  const alle = eintraege.map((e) => e.posten);
  const gefiltert = filter === 'alle' ? alle : alle.filter((p) => p.person === filter);
  const aktiv = gefiltert.filter((p) => istAktiv(p, heute));
  const s = summen(alle, { jm, heute, person: filter });
  const fremd = (shards ?? []).reduce((n, t) => n + (Array.isArray(t?.fremd) ? t.fremd.length : 0), 0);

  // Ersparnis aus dem Kontostand (dasselbe Modell wie die Seite „Kontostand“, Zeitraum 6 Monate)
  const konto = kontoModel(state, heute, { bereich: 6 });
  const ersparnisJeMonat = new Map(konto.balken.map((b) => [b.monat, b.wert + b.extra]));

  const personWahl = filter === 'alle' ? null : personInfo(filter, settings);
  const alleSumme = Object.values(s.jePerson).reduce((a, b) => a + b, 0);
  const kopf = {
    titel: personWahl ? `Fixkosten pro Monat (Ø) · ${personWahl.emoji} ${personWahl.name}` : 'Fixkosten pro Monat (Ø)',
    monatlich: betragText(s.monatlich),
    jahrText: `= ${betragText(s.jaehrlich)} im Jahr · ${s.anzahl} Posten`,
    faellig: betragText(s.faellig),
    ersparnis: konto.zusammenfassung?.durchschnitt ?? null,
  };

  const filterKnoepfe = FIX_FILTER.map((id) => {
    if (id === 'alle') return { id, text: 'Alle', betrag: betragText(alleSumme), aktiv: filter === 'alle' };
    const p = personInfo(id, settings);
    return { id, text: `${p.emoji} ${p.name}`, betrag: betragText(s.jePerson[id] ?? 0), aktiv: filter === id };
  });

  const faellig = faelligeImMonat(gefiltert, jm);
  const faelligKarte = {
    titel: '📅 Diesen Monat fällig',
    monatText: monatText(jm),
    summe: betragText(s.faellig),
    eintraege: faellig.map(({ posten, tag }) => {
      const p = personInfo(posten.person, settings);
      return { id: posten.id, tag: `${tag}.`, name: posten.name, unter: `${p.emoji} ${p.name}${posten.intervall > 1 ? ` · ${intervallText(posten.intervall)}` : ''}`, betrag: ungefaehrText(posten, posten.cents) };
    }),
  };

  const kategorien = FIX_KATEGORIEN.map((k) => {
    const liste = aktiv.filter((p) => p.kategorie === k.id).sort((a, b) => monatlich(b) - monatlich(a) || a.name.localeCompare(b.name, 'de'));
    return { id: k.id, titel: `${k.emoji} ${k.name}`, summe: betragText(s.jeKategorie[k.id] ?? 0), posten: liste.map((p) => zeile(p, gesperrt.get(p.id), settings, heute)) };
  }).filter((k) => k.posten.length > 0);

  const fristenListe = kuendigungsfristen(gefiltert, heute);
  const fristen = [...fristenListe.filter((x) => !istMonatlichKuendbar(x.posten.vertrag)), ...fristenListe.filter((x) => istMonatlichKuendbar(x.posten.vertrag))].map(({ posten, status }) => ({
    id: posten.id,
    name: posten.name,
    unter: istMonatlichKuendbar(posten.vertrag) && status.ende !== posten.vertrag.bis ? 'verlängert sich monatlich' : `Vertrag bis ${datumAnzeige(status.ende)}`,
    abzeichen: vertragAbzeichen(posten, heute),
    gesperrt: gesperrt.get(posten.id),
  }));

  const archiv = gefiltert
    .filter((p) => p.archiv)
    .sort((a, b) => (a.archiv < b.archiv ? 1 : a.archiv > b.archiv ? -1 : a.name.localeCompare(b.name, 'de')))
    .map((p) => ({ id: p.id, name: p.name, unter: `archiviert ab ${datumAnzeige(p.archiv)} · ${betragText(p.cents)} ${intervallText(p.intervall)}`, aktiv: istAktiv(p, heute), gesperrt: gesperrt.get(p.id) }));

  return {
    zustand,
    veraltet: zustand === 'ok' && fk.status === 'fehler',
    leer: alle.length === 0,
    kopf,
    filter: filterKnoepfe,
    faellig: faelligKarte,
    kategorien,
    fristen,
    diagramm: diagrammModel(alle, jm, ersparnisJeMonat),
    archiv,
    warnungen: warnungenFuerAnzeige(fk.warnungen, { unlesbar: unlesbar.length > 0, fremd: fremd > 0 }),
    unlesbar: unlesbar.map((nr) => ({ nr, titel: `Teil ${nr + 1} von 4 der Fixkosten ist unlesbar`, text: TEXT_TEIL_GESPERRT })),
    fremdHinweis: fremd > 0 ? `${fremd} Posten von einer neueren App-Version ausgeblendet – bitte App aktualisieren` : null,
    gesperrtText: TEXT_TEIL_GESPERRT,
  };
}

// ---------------------------------------------------------------- Formular

/** Die Monate, die als „nächste Zahlung“ wählbar sind: ab dem laufenden ein Intervall lang (bei monatlich nur der laufende). */
export function startMonate(intervall, heute) {
  const jm = heute.slice(0, 7);
  return Array.from({ length: Math.max(1, intervall) }, (_, i) => {
    const wert = plusMonate(jm, i);
    return { wert, text: monatText(wert) };
  });
}

/** Nächster Monat ab dem laufenden, in dem der Posten nach seinem Rhythmus fällig ist (Archiv egal). */
function naechsteZahlung(posten, heute) {
  const jm = heute.slice(0, 7);
  const abstand = monatsIndex(jm) - monatsIndex(posten.start);
  if (abstand <= 0) return posten.start;
  return plusMonate(jm, (posten.intervall - (abstand % posten.intervall)) % posten.intervall);
}

/** Betrag als Text fürs Feld („1.050“, „59,90“). */
const betragFeldText = (cents) => betragText(cents).replace(' €', '');

/**
 * Entwurf fürs Formular (alles, was die Felder zeigen): neu (`posten` = null) oder aus einem vorhandenen Posten.
 * { id, name, betrag (Text), intervall, tag, naechste ('JJJJ-MM'), kategorie, person, ungefaehr, mitVertrag, bis, verlaengerung, frist, notiz, vorlage, hinweis }
 */
export function fixEntwurf(posten, heute) {
  if (!posten) {
    return { id: null, name: '', betrag: '', intervall: 1, tag: '1', naechste: heute.slice(0, 7), kategorie: 'sonstiges', person: 'gemeinsam', ungefaehr: false, mitVertrag: false, bis: '', verlaengerung: 12, frist: '1m', notiz: '', vorlage: null, hinweis: null };
  }
  return {
    id: posten.id,
    name: posten.name,
    betrag: betragFeldText(posten.cents),
    intervall: posten.intervall,
    tag: posten.tag,
    naechste: naechsteZahlung(posten, heute),
    kategorie: posten.kategorie,
    person: posten.person,
    ungefaehr: posten.ungefaehr,
    mitVertrag: Boolean(posten.vertrag),
    bis: posten.vertrag?.bis ?? '',
    verlaengerung: posten.vertrag?.verlaengerung ?? 12,
    frist: posten.vertrag?.frist ?? '1m',
    notiz: posten.notiz ?? '',
    vorlage: null,
    hinweis: null,
  };
}

/**
 * Vorlage anwenden: füllt Kategorie, Intervall, „ungefähr“ und – bei Verträgen – Verlängerung und Frist (alles änderbar), dazu den Hinweis.
 * Der Name wird nur gesetzt, wenn er leer ist oder noch der Name der vorigen Vorlage; das Vertragsende bleibt, wie es eingegeben ist.
 */
export function vorlageAnwenden(entwurf, id, heute) {
  const v = FIX_VORLAGEN.find((x) => x.id === id);
  if (!v) return entwurf;
  const vorige = FIX_VORLAGEN.find((x) => x.id === entwurf.vorlage);
  const name = entwurf.name.trim() === '' || (vorige && entwurf.name === vorige.name) ? v.name : entwurf.name;
  const naechste = startMonate(v.intervall, heute).some((m) => m.wert === entwurf.naechste) ? entwurf.naechste : heute.slice(0, 7);
  return {
    ...entwurf,
    vorlage: v.id,
    name,
    kategorie: v.kategorie,
    intervall: v.intervall,
    naechste,
    ungefaehr: v.ungefaehr,
    mitVertrag: Boolean(v.vertrag),
    verlaengerung: v.vertrag?.verlaengerung ?? entwurf.verlaengerung,
    frist: v.vertrag?.frist ?? entwurf.frist,
    hinweis: v.hint,
  };
}

/**
 * Entwurf → Posten für store.fixPostenSpeichern ({ posten }) oder { fehler } (deutsche Meldung, wie postenPruefen).
 * Startmonat: monatlich der laufende (beim Ändern bleibt der alte); sonst die gewählte nächste Zahlung – beim Ändern bleibt der alte
 * Startmonat, solange Intervall und Rhythmus gleich sind (so bleiben frühere Zahlungen in den früheren Monaten). `original` = der
 * gespeicherte Posten beim Ändern (sonst null).
 */
export function entwurfZuPosten(entwurf, original, heute) {
  const cents = centsAusText(String(entwurf.betrag ?? '').trim());
  if (cents === null || cents < 1) return { fehler: BETRAG_FEHLER };
  const intervall = Number(entwurf.intervall);
  let start;
  if (intervall === 1) start = original?.start ?? heute.slice(0, 7);
  else if (original && original.intervall === intervall && (monatsIndex(entwurf.naechste) - monatsIndex(original.start)) % intervall === 0) start = original.start;
  else start = entwurf.naechste;
  const posten = {
    ...(original ? { id: original.id } : {}),
    name: entwurf.name,
    cents,
    ungefaehr: Boolean(entwurf.ungefaehr),
    intervall,
    tag: entwurf.tag,
    start,
    kategorie: entwurf.kategorie,
    person: entwurf.person,
    notiz: entwurf.notiz ?? '',
  };
  if (entwurf.mitVertrag) posten.vertrag = { bis: entwurf.bis, verlaengerung: Number(entwurf.verlaengerung), frist: entwurf.frist };
  const fehler = postenPruefen(posten);
  return fehler ? { fehler } : { posten };
}

/**
 * Vorschau unter dem Vertrag im Formular → { kuendbarBis, erinnerung, monatlich, beendet } (Datum als TT.MM.JJJJ) oder null (kein
 * Vertrag oder kein gültiges Ende). `erinnerung` = Tag der Push-Erinnerung an beide (1 Monat vor „Kündbar bis“), nur wenn sie noch kommt
 * – bei monatlich kündbaren und beendeten Verträgen nie (wie push/plan.js).
 */
export function vertragVorschau(entwurf, heute) {
  if (!entwurf.mitVertrag || typeof entwurf.bis !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(entwurf.bis) || datumAnzeige(entwurf.bis) === '') return null;
  const vertrag = { bis: entwurf.bis, verlaengerung: Number(entwurf.verlaengerung), frist: entwurf.frist };
  const st = vertragStatus({ vertrag }, heute);
  const monatlichK = istMonatlichKuendbar(vertrag);
  return {
    kuendbarBis: datumAnzeige(st.kuendbarBis),
    erinnerung: !monatlichK && !st.beendet && st.erinnerung >= heute ? datumAnzeige(st.erinnerung) : null,
    monatlich: monatlichK,
    beendet: st.beendet,
  };
}
