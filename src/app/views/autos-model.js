// View-Modell der Autos (Seite „Autos“, Seite eines Autos, Blätter zum Eintragen) – rein, ohne DOM: alles kommt aus state.autos und
// wird mit domain/autos-rechnung.js gerechnet. Texte sind fertig für die Anzeige (deutsch), Zahlen als Zahl dazu (Bewegung, Balken).
// Persönliche Daten (Kennzeichen, FIN) kommen nur aus den Daten des Nutzers.
import { diffDays, isValidDate } from '../../domain/dates.js';
import { betragText, centsAusText } from '../../domain/konto.js';
import { MONATE } from '../format-de.js';
import {
  ARBEIT_TYPEN,
  AUTO_FARBEN,
  AUTO_FELDER,
  AUTO_VORLAGEN,
  BALD_KM,
  MAX_AUTOS,
  ROTATION_KM,
  TEXT_AUTOS_GESPERRT,
  arbeitPruefen,
  autoAusVorlage,
  datumText,
  kmPruefen,
  kmText,
  monatPlus,
  regelVorlage,
} from '../../domain/autos.js';
import { VIGNETTE_INFO, arbeitenVon, autoUebersicht, autosHistorien, kmPunkte, reifenStand, vignettenFrist } from '../../domain/autos-rechnung.js';

/** Farbe je Kennung des Autos (nur Schmuck: Punkt, Kante, Kachel – Schrift bleibt immer --ink). */
export const AUTO_FARBE_HEX = Object.freeze({ blau: '#2a78d6', rot: '#d94848', gruen: '#2f9e5b', grau: '#8a8799', schwarz: '#3a3648', weiss: '#d8d3c8', gelb: '#e9b520', lila: '#8b6cd6' });

/** Zeichen und Wort je Stand (nie nur Farbe). */
export const STATUS = Object.freeze({
  ok: { symbol: '✓', wort: 'ok' },
  bald: { symbol: '⏳', wort: 'bald' },
  ueberfaellig: { symbol: '⚠', wort: 'überfällig' },
  unbekannt: { symbol: '?', wort: 'unbekannt' },
});

export const VORLAGEN_WAHL = Object.freeze([
  { id: 'tesla3', name: 'Tesla Model 3', text: 'Elektro · Reifen rotieren, Bremssättel, Filter, Pickerl' },
  { id: 'fiat500', name: 'Fiat 500 TwinAir', text: 'Benzin · Ölwechsel, Zündkerzen, Filter, Dualogic, Pickerl' },
  { id: 'leer', name: 'Leer', text: 'Ohne Regeln – alles selbst eintragen' },
]);

export const TEXT_DATENSCHUTZ = 'Kennzeichen, FIN und alle Fahrzeugdaten stehen nur in eurem eigenen Google-Kalender (versteckt) – nirgends sonst.';
export const TEXT_VIGNETTE_ONLINE = 'Online gekauft gilt die Vignette erst ab dem 18. Tag – im Geschäft (ÖAMTC, Tankstelle, Trafik) sofort.';

const TYPEN = new Map(ARBEIT_TYPEN.map((t) => [t.id, t]));
const istDatum = (x) => typeof x === 'string' && isValidDate(x);
const monatName = (jm) => `${MONATE[Number(jm.slice(5, 7)) - 1]} ${jm.slice(0, 4)}`;
const kurzDatum = (d) => `${d.slice(8, 10)}.${d.slice(5, 7)}.`;

/** Kilometer zur Anzeige; geschätzte mit „ca.“ davor. */
export const kmAnzeige = (km, geschaetzt) => `${geschaetzt ? 'ca. ' : ''}${kmText(km)}`;

/** „in 6 Tagen“, „morgen“, „heute“, „in ca. 4 Monaten“. */
export function abstandText(tage) {
  if (tage === 0) return 'heute';
  if (tage === 1) return 'morgen';
  if (tage <= 60) return `in ${tage} Tagen`;
  const monate = Math.round(tage / 30.44);
  if (monate < 24) return `in ca. ${monate} Monaten`;
  return `in ca. ${Math.round(tage / 365.25)} Jahren`;
}

const vorsatz = (f) => (f.regel.typ === 'reifenwechsel' && f.saison ? `${f.saison === 'winter' ? 'Winter' : 'Sommer'}reifen montieren – ` : '');

/**
 * Abstand zum Termin für den Text – nie im Widerspruch zur Pille (Ruling I1 nach dem Review T4): ein kurzer Countdown („in 18 Tagen“,
 * „morgen“) nur bei ⏳ bald; bei ✓ ok nur ein grober („in ca. 7 Monaten“, ab 61 Tagen), sonst keiner. Ohne Abstand → ''.
 */
function abstand(f, heute) {
  if (!istDatum(f.datum)) return '';
  const tage = diffDays(heute, f.datum);
  if (f.status === 'bald' || (f.status === 'ok' && tage > 60)) return ` (${abstandText(tage)})`;
  return '';
}

/** ⏳ bald nur wegen der km (das Datum kommt aus der Zeit): die km dazu sagen. */
const kmRest = (f) => (f.status === 'bald' && f.quelle !== 'km' && Number.isFinite(f.restKm) && f.restKm >= 0 && f.restKm <= BALD_KM ? ` · noch ca. ${kmText(f.restKm)}` : '');

/**
 * Text einer Zeile „Fällig“ (und „Als Nächstes“): passt immer zur Pille daneben (Ruling I1) – „überfällig“ nur bei ⚠, ein kurzer
 * Countdown nur bei ⏳, ein saisonaler Termin vor seiner Erinnerung als „ab 15.10., spätestens 01.11.2026“, ein km-Termin als
 * „bei ca. 21.800 km“ (das geschätzte Datum nur bei ⏳).
 */
export function faelligText(f, heute) {
  if (f.status === 'unbekannt') return `unbekannt – ${f.hinweis ?? 'Letzte Erledigung eintragen'}`;
  if (f.regel.typ === 'vignette') {
    if (f.status === 'ueberfaellig') return `Vignette ${f.vignetteJahr}: online zu spät – im Geschäft noch bis ${datumText(f.kaufenBis)}`;
    return `Vignette ${f.vignetteJahr} kaufen: online bis ${kurzDatum(f.datum)}, im Geschäft bis ${kurzDatum(f.kaufenBis)}${abstand(f, heute)}`;
  }
  const km = f.quelle === 'km' && Number.isInteger(f.km);
  if (f.status === 'ueberfaellig') {
    if (istDatum(f.datum) && f.datum < heute) return `${vorsatz(f)}überfällig seit ${km ? 'etwa ' : ''}${datumText(f.datum)}`;
    return `${vorsatz(f)}überfällig${Number.isFinite(f.restKm) && f.restKm < 0 ? ` – ca. ${kmText(-f.restKm)} darüber` : ''}`;
  }
  if (!istDatum(f.datum)) return `${vorsatz(f)}noch ca. ${kmText(Math.max(0, f.restKm ?? 0))}`;
  if (km) return `${vorsatz(f)}bei ca. ${kmText(f.km)}${f.status === 'bald' ? ` (etwa ${datumText(f.datum)})` : ''}`;
  if (f.status === 'ok' && istDatum(f.erinnerungAb) && heute < f.erinnerungAb) return `${vorsatz(f)}ab ${kurzDatum(f.erinnerungAb)}, spätestens ${datumText(f.datum)}`;
  return `${vorsatz(f)}fällig am ${datumText(f.datum)}${abstand(f, heute)}${kmRest(f)}`;
}

/** „alle 12 Monate oder 15.000 km“, „fester Monat: Juli 2028, danach alle 24 Monate“ … */
export function intervallText(regel) {
  if (regel.typ === 'vignette') return 'jedes Jahr (Jahresvignette)';
  if (regel.typ === 'reifenwechsel') return 'saisonal: Winterreifen 1.11.–15.4.';
  if (regel.autoDatum === 'leasingEnde') return 'Termin laut Leasingvertrag (Fahrzeugdaten)';
  const teile = [];
  if (regel.intervallMonate) teile.push(`${regel.intervallMonate} Monate`);
  if (regel.intervallKm) teile.push(kmText(regel.intervallKm));
  const alle = teile.length > 0 ? `alle ${teile.join(' oder ')}` : '';
  if (regel.fixMonat) return `fester Monat: ${monatName(regel.fixMonat)}${alle ? `, danach ${alle}` : ''}`;
  return alle || 'ohne festen Termin';
}

/** Gemeinsame Sperre für alle Änderungen an den Autos (unlesbar) → Text oder null. */
export const autosSperre = (autos) => (autos?.unlesbar?.main ? TEXT_AUTOS_GESPERRT : null);

function meldungen(autos) {
  const warnungen = (autos?.warnungen ?? []).filter((w) => w !== TEXT_AUTOS_GESPERRT);
  return {
    unlesbar: autos?.unlesbar?.main ? TEXT_AUTOS_GESPERRT : null,
    nichtAktuell: autos?.status === 'fehler' && (autos?.daten?.autos ?? []).length > 0 ? 'Die Autos konnten gerade nicht neu gelesen werden – angezeigt wird der letzte Stand.' : null,
    warnungen: autos?.status === 'fehler' ? [] : warnungen,
  };
}

/** Übersichten aller Autos (wirft nie). */
function uebersichten(autos, heute) {
  try {
    if (!autos?.daten || !Array.isArray(autos.daten.autos) || autos.daten.autos.length === 0) return [];
    return autoUebersicht(autos.daten, autosHistorien(autos), heute);
  } catch {
    return [];
  }
}

/** Für die Zeile in „Mehr“: wie viele Termine sind bald oder überfällig (alle Autos)? */
export function autosFaelligAnzahl(state, heute) {
  return uebersichten(state?.autos, heute).reduce((n, u) => n + u.anzahlFaellig, 0);
}

const farbeVon = (auto) => AUTO_FARBE_HEX[auto.farbeKennung] ?? AUTO_FARBE_HEX.grau;
/** „Elektro · EZ 06/2025“ (das Modell nur, wenn es nicht schon im Namen steht). */
function untertitel(auto) {
  const modell = [auto.marke, auto.handelsbezeichnung].filter(Boolean).join(' ');
  const ez = auto.ezDatum ? `EZ ${auto.ezDatum.slice(5, 7)}/${auto.ezDatum.slice(0, 4)}` : null;
  return [modell && !auto.name.includes(modell) ? modell : null, auto.antrieb, ez].filter(Boolean).join(' · ');
}

function kmModel(u) {
  const k = u.kmInfo;
  if (!k) return { zahl: null, text: 'unbekannt', geschaetzt: false, proTag: null, stand: 'Noch kein Kilometerstand eingetragen.', warnung: u.warnung, vorschlag: null };
  return {
    zahl: k.km,
    text: kmAnzeige(k.km, k.geschaetzt),
    geschaetzt: k.geschaetzt,
    proTag: k.proTag ? `≈ ${Math.round(k.proTag).toLocaleString('de-AT')} km pro Tag` : null,
    stand: k.datum ? `Zuletzt bekannt: ${kmText(k.letzterKm)} am ${datumText(k.datum)}` : null,
    warnung: u.warnung,
    vorschlag: k.km,
  };
}

const naechsteModel = (f, heute) => (f ? { status: f.status, ...STATUS[f.status], titel: f.regel.name, text: faelligText(f, heute) } : null);

/**
 * Seite „Autos“ → { zustand: 'laedt' | 'nichtGeladen' | 'leer' | 'liste', karten, meldungen, gesperrt, kannAnlegen, vorlagen }.
 * karten = je Auto { id, ziel, name, farbe, kennzeichen, untertitel, km, naechste, anzahlFaellig, faelligText, beschriftung }.
 */
export function autosListeModel(state, heute) {
  const autos = state?.autos;
  const liste = autos?.daten?.autos ?? [];
  const gesperrt = autosSperre(autos);
  const basis = { meldungen: meldungen(autos), gesperrt, kannAnlegen: !gesperrt && liste.length < MAX_AUTOS, vorlagen: VORLAGEN_WAHL, karten: [] };
  if (liste.length === 0 && !gesperrt) {
    if (autos?.status === null || autos?.status === undefined || (autos.status === 'laedt' && !autos.frisch)) return { ...basis, zustand: 'laedt' };
    if (autos.status === 'fehler') return { ...basis, zustand: 'nichtGeladen' };
    return { ...basis, zustand: 'leer' };
  }
  const karten = uebersichten(autos, heute).map((u) => {
    const a = u.auto;
    const km = kmModel(u);
    const naechste = naechsteModel(u.naechste, heute);
    const faellig = u.anzahlFaellig > 0 ? `${u.anzahlFaellig} fällig` : null;
    return {
      id: a.id,
      ziel: `#/autos/${a.id}`,
      name: a.name,
      farbe: farbeVon(a),
      kennzeichen: a.kennzeichen ?? null,
      untertitel: untertitel(a),
      km,
      naechste,
      anzahlFaellig: u.anzahlFaellig,
      faelligText: faellig,
      beschriftung: [a.name, a.kennzeichen, km.zahl === null ? null : km.text, faellig, naechste ? `Als Nächstes: ${naechste.titel}, ${naechste.text}` : null].filter(Boolean).join(', '),
    };
  });
  return { ...basis, zustand: liste.length === 0 ? 'leer' : 'liste', karten };
}

// ---------------------------------------------------------------- Seite eines Autos

function regelZeile(f, auto, heute) {
  const v = regelVorlage(auto, f.regel);
  const typ = TYPEN.get(f.regel.typ);
  return {
    regelId: f.regel.id,
    typ: f.regel.typ,
    emoji: typ?.emoji ?? '🔧',
    name: f.regel.name,
    status: f.status,
    ...STATUS[f.status],
    text: faelligText(f, heute),
    intervall: intervallText(f.regel),
    info: v?.info ?? null,
    quelle: v?.quelle ?? null,
    // Leasing-Ende: der Termin steht im Auto – „erledigen“ geht nicht, nur das Datum ändern
    ausAuto: Boolean(f.regel.autoDatum),
    aktion: f.regel.autoDatum ? 'Datum ändern' : f.regel.typ === 'reifenwechsel' ? 'Reifenwechsel eintragen' : f.status === 'unbekannt' ? 'Letzte Erledigung eintragen' : 'Erledigt eintragen',
  };
}

const ART_EMOJI = { sommer: '☀️', winter: '❄️', ganzjahr: '🌤️' };

function reifenModel(u, regeln) {
  const rotation = regeln.find((r) => r.typ === 'rotation' && r.aktiv !== false && r.intervallKm);
  const rotationKm = rotation?.intervallKm ?? ROTATION_KM;
  return {
    mitRotation: Boolean(rotation),
    rotationKm,
    saetze: u.reifen.map((r) => ({
      id: r.satz.id,
      name: r.satz.name,
      emoji: ART_EMOJI[r.satz.art] ?? '🛞',
      montiert: r.montiert,
      montiertText: r.montiert ? (r.montiertAm ? `montiert seit ${datumText(r.montiertAm)}` : 'montiert') : 'eingelagert',
      kmGesamt: r.kmGesamt,
      kmGesamtText: kmAnzeige(r.kmGesamt, r.geschaetzt),
      kmSeitRotation: r.kmSeitRotation,
      seitRotationText: `${r.geschaetzt ? 'ca. ' : ''}${kmText(r.kmSeitRotation).replace(' km', '')} / ${kmText(rotationKm)}`,
      anteil: Math.min(1, Math.max(0, r.kmSeitRotation / rotationKm)),
      rotationFaellig: Boolean(rotation) && r.kmSeitRotation >= rotationKm,
    })),
    saison: u.saison ? { text: u.saison.text, hinweis: u.saison.hinweis, quelle: u.saison.quelle } : null,
  };
}

function vignetteModel(u, auto, heute) {
  const f = u.faellig.find((x) => x.regel.typ === 'vignette');
  if (!f) return null;
  const v = regelVorlage(auto, f.regel);
  return { regelId: f.regel.id, status: f.status, ...STATUS[f.status], titel: `Vignette ${f.vignetteJahr}`, text: faelligText(f, heute), info: [...(f.info ?? VIGNETTE_INFO)], quelle: v?.quelle ?? 'https://shop.asfinag.at/en/products/digital-vignette/annual-vignette/', jahr: f.vignetteJahr };
}

/** Kurztext der Angaben einer Arbeit („SAE 0W-30 · 3,2 l · mit Filter“). */
export function detailsText(a, saetze = []) {
  const d = a.details ?? {};
  const satz = (id) => saetze.find((s) => s.id === id)?.name ?? 'Reifensatz';
  switch (a.typ) {
    case 'oelwechsel':
      return [d.oelSorte, d.menge !== undefined ? `${String(d.menge).replace('.', ',')} l` : null, d.filter ? 'mit Filter' : 'ohne Filter'].filter(Boolean).join(' · ');
    case 'reifenwechsel':
      return `${satz(d.montiert)} montiert${d.rotiert ? ' · vorne/hinten getauscht' : ''}`;
    case 'rotation':
      return d.satzId ? `${satz(d.satzId)} rotiert` : 'vorne/hinten getauscht';
    case 'vignette':
      return [d.jahr ? `Jahr ${d.jahr}` : null, d.art, d.gekauftAm && d.gekauftAm !== a.datum ? `gekauft am ${datumText(d.gekauftAm)}` : null].filter(Boolean).join(' · ');
    case 'pickerl':
      return d.naechsterMonat ? `nächstes Pickerl: ${monatName(d.naechsterMonat)}` : '';
    default:
      return '';
  }
}

function verlaufModel(arbeiten, regeln, saetze) {
  return [...arbeiten].reverse().map((a) => {
    const typ = TYPEN.get(a.typ);
    const titel = (a.regel && regeln.find((r) => r.id === a.regel)?.name) || typ?.name || 'Arbeit';
    const km = Number.isInteger(a.km) ? kmAnzeige(a.km, a.kmGeschaetzt) : null;
    const kosten = Number.isInteger(a.kosten) ? betragText(a.kosten) : null;
    const zeile = [datumText(a.datum), km].filter(Boolean).join(' · ');
    return { id: a.id, jahr: Number(a.datum.slice(0, 4)), typ: a.typ, emoji: typ?.emoji ?? '🔧', titel, zeile, details: detailsText(a, saetze), notiz: a.notiz ?? null, kosten, beschriftung: [titel, zeile, kosten].filter(Boolean).join(', ') };
  });
}

/** Wert eines Feldes der Fahrzeugdaten zur Anzeige. */
function feldAnzeige(def, w) {
  if (def.art === 'janein') return w ? 'Ja' : 'Nein';
  if (w === undefined || w === null || w === '') return '—';
  if (def.art === 'datum') return datumText(w);
  if (def.feld === 'leistungKw') return `${w} kW (${Math.round(w * 1.35962)} PS)`;
  if (def.feld === 'hubraum') return `${w.toLocaleString('de-AT')} cm³`;
  return String(w);
}

/** Felder, die „Fahrzeugdaten“ zeigt (Name und Farbe stehen oben, die Vorlage ist intern). */
export const FAHRZEUG_FELDER = AUTO_FELDER.filter((f) => !['name', 'farbeKennung', 'vorlage'].includes(f.feld));

/**
 * Seite eines Autos → null (gibt es nicht) oder { id, name, farbe, kennzeichen, untertitel, km, faellig, aus, reifen, vignette,
 * verlauf, fahrzeugdaten, radmuttern, gesperrt, meldungen, anzahlFaellig }.
 */
export function autoSeiteModel(state, heute, autoId) {
  const autos = state?.autos;
  const u = uebersichten(autos, heute).find((x) => x.auto.id === autoId);
  if (!u) return null;
  const auto = u.auto;
  const regeln = (autos.daten.regeln ?? []).filter((r) => r.auto === autoId);
  const saetze = (autos.daten.saetze ?? []).filter((s) => s.auto === autoId);
  const arbeiten = arbeitenVon(autosHistorien(autos), autoId);
  return {
    id: auto.id,
    name: auto.name,
    farbe: farbeVon(auto),
    kennzeichen: auto.kennzeichen ?? null,
    untertitel: untertitel(auto),
    km: kmModel(u),
    anzahlFaellig: u.anzahlFaellig,
    faellig: u.faellig.map((f) => regelZeile(f, auto, heute)),
    aus: regeln.filter((r) => r.aktiv === false).map((r) => ({ regelId: r.id, name: r.name, emoji: TYPEN.get(r.typ)?.emoji ?? '🔧' })),
    reifen: reifenModel(u, regeln),
    vignette: vignetteModel(u, auto, heute),
    verlauf: verlaufModel(arbeiten, regeln, saetze),
    fahrzeugdaten: FAHRZEUG_FELDER.map((def) => ({ feld: def.feld, name: def.name, wert: feldAnzeige(def, auto[def.feld]) })),
    radmuttern: u.radmuttern?.text ?? null,
    gesperrt: autosSperre(autos),
    meldungen: meldungen(autos),
  };
}

// ---------------------------------------------------------------- Formular „Arbeit eintragen“

const autoVon = (state, id) => (state?.autos?.daten?.autos ?? []).find((a) => a.id === id) ?? null;
const historien = (state) => autosHistorien(state?.autos);

/** Reifenstand des Autos am Tag `heute` (für Vorschläge im Formular). */
function reifenJetzt(state, heute, autoId) {
  const u = uebersichten(state?.autos, heute).find((x) => x.auto.id === autoId);
  if (!u) return { reifen: [], rotation: null, kmInfo: null };
  const rotation = (state.autos.daten.regeln ?? []).find((r) => r.auto === autoId && r.typ === 'rotation' && r.aktiv !== false && r.intervallKm) ?? null;
  const saetze = (state.autos.daten.saetze ?? []).filter((s) => s.auto === autoId);
  const reifen = reifenStand(saetze, arbeitenVon(historien(state), autoId), u.kmInfo, { rotationKm: rotation?.intervallKm ?? ROTATION_KM });
  return { reifen, rotation, kmInfo: u.kmInfo };
}

/**
 * Vorschlag „vorne/hinten getauscht“ beim Reifenwechsel: der Satz, der montiert wird, hat seit dem letzten Rotieren das Intervall
 * erreicht (nur bei Autos mit Regel „Reifen rotieren“) → { rotiert: true, text } ; sonst { rotiert: false, text: null }.
 */
export function rotationVorschlag(state, heute, autoId, satzId) {
  const { reifen, rotation } = reifenJetzt(state, heute, autoId);
  const r = reifen.find((x) => x.satz.id === satzId);
  if (!rotation || !r || r.kmSeitRotation < rotation.intervallKm) return { rotiert: false, text: null };
  return { rotiert: true, text: `„${r.satz.name}“ ist seit dem letzten Rotieren ${kmAnzeige(r.kmSeitRotation, r.geschaetzt)} gefahren – beim Montieren vorne/hinten tauschen (alle ${kmText(rotation.intervallKm)}).` };
}

/** Platzhalter fürs Öl aus der Vorlage („z. B. SAE 0W-30, ACEA C2“, „z. B. 3,2“) und der ganze Hinweis. */
function oelHinweis(auto, regel) {
  const info = regelVorlage(auto, regel ?? { vorlage: 'oel' })?.info ?? AUTO_VORLAGEN.find((v) => v.id === auto?.vorlage)?.regeln.find((r) => r.typ === 'oelwechsel')?.info ?? null;
  if (!info) return { sorte: 'z. B. SAE 0W-30', menge: 'z. B. 3,5', info: null };
  const menge = /(\d+,\d+)\s*l/.exec(info)?.[1];
  return { sorte: `z. B. ${info.split(',').slice(0, 2).join(',').trim()}`, menge: menge ? `z. B. ${menge}` : 'z. B. 3,5', info: `Laut Handbuch: ${info}` };
}

/**
 * Entwurf fürs Formular (Felder als Text) für eine neue Arbeit (`typ`, optional `regelId`) oder eine vorhandene (`arbeitId`).
 * km = Vorschlag aus der Schätzung (kmGeschaetzt = er ist geschätzt; unverändert gespeichert bleibt er als geschätzt markiert).
 */
export function arbeitEntwurf(state, heute, autoId, { typ = null, regelId = null, arbeitId = null } = {}) {
  const auto = autoVon(state, autoId);
  if (!auto) return null;
  const regeln = (state.autos.daten.regeln ?? []).filter((r) => r.auto === autoId);
  const saetze = (state.autos.daten.saetze ?? []).filter((s) => s.auto === autoId);
  const { reifen, kmInfo } = reifenJetzt(state, heute, autoId);
  if (arbeitId) {
    const a = arbeitenVon(historien(state), autoId).find((x) => x.id === arbeitId);
    if (!a) return null;
    const d = a.details ?? {};
    return {
      id: a.id,
      jahr: Number(a.datum.slice(0, 4)),
      auto: autoId,
      typ: a.typ,
      regel: a.regel ?? null,
      festerTyp: true,
      datum: a.datum,
      km: Number.isInteger(a.km) ? kmFeld(a.km) : '',
      kmVorschlag: a.kmGeschaetzt ? a.km : null,
      kmGeschaetzt: a.kmGeschaetzt === true,
      notiz: a.notiz ?? '',
      kosten: Number.isInteger(a.kosten) ? betragText(a.kosten).replace(/\s?€$/, '') : '',
      details: Object.fromEntries(Object.entries(d).map(([k, w]) => [k, typeof w === 'number' ? String(w).replace('.', ',') : w])),
      rotiertGewaehlt: true,
      saetze,
      oel: oelHinweis(auto, regeln.find((r) => r.typ === 'oelwechsel')),
    };
  }
  const regel = regelId ? regeln.find((r) => r.id === regelId) ?? null : null;
  const art = regel?.typ ?? typ ?? 'sonstiges';
  const e = {
    auto: autoId,
    typ: art,
    regel: regel?.id ?? null,
    festerTyp: Boolean(regel || typ),
    datum: heute,
    km: kmInfo ? kmFeld(kmInfo.km) : '',
    kmVorschlag: kmInfo?.geschaetzt ? kmInfo.km : null,
    kmGeschaetzt: Boolean(kmInfo?.geschaetzt),
    notiz: '',
    kosten: '',
    details: {},
    rotiertGewaehlt: false,
    saetze,
    oel: oelHinweis(auto, regeln.find((r) => r.typ === 'oelwechsel')),
  };
  return detailsVorbelegen(state, heute, e, { regel, reifen });
}

/** Details je Art vorbelegen (auch nach einem Wechsel der Art im Formular). */
export function detailsVorbelegen(state, heute, e, { regel = null, reifen = null } = {}) {
  const r = reifen ?? reifenJetzt(state, heute, e.auto).reifen;
  const montiert = r.find((x) => x.montiert)?.satz.id ?? null;
  const regeln = (state.autos.daten.regeln ?? []).filter((x) => x.auto === e.auto);
  const passend = regel ?? regeln.find((x) => x.typ === e.typ) ?? null;
  switch (e.typ) {
    case 'oelwechsel':
      e.details = { oelSorte: '', menge: '', filter: true };
      break;
    case 'reifenwechsel': {
      // montiert ist etwas: der andere Satz. Nichts bekannt (M8, Review T4): der Satz der Saison (Winter vom 01.10. bis 14.03.), sonst keiner
      const saison = heute.slice(5) >= '10-01' || heute.slice(5) < '03-15' ? 'winter' : 'sommer';
      const ziel = montiert ? ((e.saetze.find((s) => s.id !== montiert) ?? e.saetze[0])?.id ?? null) : (e.saetze.find((s) => s.art === saison)?.id ?? null);
      e.details = { montiert: ziel, rotiert: ziel ? rotationVorschlag(state, heute, e.auto, ziel).rotiert : false };
      break;
    }
    case 'rotation':
      e.details = { satzId: montiert ?? e.saetze[0]?.id ?? null };
      break;
    case 'vignette': {
      const u = uebersichten(state.autos, heute).find((x) => x.auto.id === e.auto);
      const f = u?.faellig.find((x) => x.regel.typ === 'vignette');
      e.details = { jahr: String(f?.vignetteJahr ?? Number(heute.slice(0, 4)) + (heute.slice(5) > '01-31' ? 1 : 0)), art: 'digital', gekauftAm: e.datum };
      break;
    }
    case 'pickerl':
      e.details = { naechsterMonat: monatPlus(heute.slice(0, 7), passend?.intervallMonate ?? 12) };
      break;
    default:
      e.details = {};
  }
  return e;
}

/** km fürs Eingabefeld: „18.872“. */
const kmFeld = (km) => kmText(km).replace(' km', '');

const TEXT_KM_EINGABE = 'Bitte den Kilometerstand als ganze Zahl eingeben, z. B. 18.900.';

/** „18.900“, „18900 km“, „18 900“ → 18900; leer → undefined; sonst NaN. */
export function kmAusText(text) {
  const t = String(text ?? '').replace(/km$/i, '').replace(/[\s .’']/g, '');
  if (t === '') return undefined;
  return /^\d{1,7}$/.test(t) ? Number(t) : NaN;
}

/** Formular → { arbeit } (für store.arbeitSpeichern) oder { fehler }. */
export function entwurfZuArbeit(e) {
  const km = kmAusText(e.km);
  if (Number.isNaN(km)) return { fehler: TEXT_KM_EINGABE };
  let kosten;
  if (String(e.kosten ?? '').trim() !== '') {
    kosten = centsAusText(String(e.kosten));
    if (kosten === null || kosten < 0) return { fehler: 'Bitte die Kosten als Betrag eingeben, z. B. 149,90 (oder leer lassen).' };
  }
  const details = {};
  for (const [k, w] of Object.entries(e.details ?? {})) {
    if (w === '' || w === null || w === undefined) continue;
    details[k] = w;
  }
  let datum = e.datum;
  if (e.typ === 'vignette') {
    if (details.gekauftAm) datum = details.gekauftAm;
    else details.gekauftAm = datum;
    const jahr = Number(details.jahr);
    if (Number.isInteger(jahr)) details.gueltigBis = vignettenFrist(jahr).gueltigBis;
  }
  const arbeit = { auto: e.auto, typ: e.typ, datum, details };
  if (e.id) arbeit.id = e.id;
  if (km !== undefined) arbeit.km = km;
  if (km !== undefined && e.kmGeschaetzt && km === e.kmVorschlag) arbeit.kmGeschaetzt = true;
  if (String(e.notiz ?? '').trim() !== '') arbeit.notiz = e.notiz;
  if (kosten !== undefined) arbeit.kosten = kosten;
  if (e.regel) arbeit.regel = e.regel;
  return { arbeit };
}

/**
 * Hinweis zum eingetippten Kilometerstand (live im Formular): Warnung („… bitte prüfen“) oder Fehler-Text oder null. Für eine Arbeit
 * zählt ihre eigene alte Fassung nicht; für „Kilometerstand aktualisieren“ nicht der eingegebene Stand desselben Tages.
 */
export function kmHinweis(state, heute, autoId, { datum, km, arbeitId = null, nurStand = false }) {
  const zahl = kmAusText(km);
  if (zahl === undefined) return null;
  if (Number.isNaN(zahl)) return { art: 'fehler', text: TEXT_KM_EINGABE };
  if (!istDatum(datum)) return null;
  const auto = autoVon(state, autoId);
  const punkte = kmPunkte(historien(state), auto ?? autoId);
  const r = nurStand ? kmPruefen({ datum, km: zahl }, { heute, punkte }) : arbeitPruefen({ id: arbeitId ?? undefined, auto: autoId, typ: 'sonstiges', datum, km: zahl, details: {} }, { heute, punkte });
  if (r.fehler) return { art: 'fehler', text: r.fehler };
  return r.warnung ? { art: 'warnung', text: r.warnung } : null;
}

/** Jahre fürs Feld „Jahr“ der Vignette (rund um den Vorschlag). */
export const vignetteJahre = (heute) => {
  const j = Number(heute.slice(0, 4));
  return [j - 1, j, j + 1, j + 2].map(String);
};

/** Jahre für Monat-Felder (Pickerl): dieses bis in 6 Jahren. */
export const monatJahre = (heute, wert) => {
  const j = Number(heute.slice(0, 4));
  const liste = Array.from({ length: 7 }, (_, i) => String(j + i));
  const w = wert?.slice(0, 4);
  return w && !liste.includes(w) ? [w, ...liste] : liste;
};

// ---------------------------------------------------------------- Regel, Kilometerstand, Auto

/** Entwurf „Regel bearbeiten“ (Felder als Text) mit Info und Quelle aus der Vorlage. */
export function regelEntwurf(state, regelId) {
  const regel = (state?.autos?.daten?.regeln ?? []).find((r) => r.id === regelId);
  if (!regel) return null;
  const auto = autoVon(state, regel.auto);
  const v = regelVorlage(auto, regel);
  return {
    original: regel,
    name: regel.name,
    monate: regel.intervallMonate ? String(regel.intervallMonate) : '',
    km: regel.intervallKm ? kmFeld(regel.intervallKm) : '',
    fixMonat: regel.fixMonat ?? '',
    aktiv: regel.aktiv !== false,
    info: v?.info ?? null,
    quelle: v?.quelle ?? null,
    intervall: intervallText(regel),
    mitIntervall: !['vignette', 'reifenwechsel'].includes(regel.typ) && !regel.autoDatum,
  };
}

/** Entwurf → Regel für store.regelSpeichern (Prüfung im Store/der Domäne) oder { fehler }. */
export function entwurfZuRegel(e) {
  const km = kmAusText(e.km);
  if (Number.isNaN(km)) return { fehler: 'Bitte das Intervall in ganzen Kilometern eingeben, z. B. 15.000.' };
  const monate = String(e.monate ?? '').trim();
  if (monate !== '' && !/^\d{1,3}$/.test(monate)) return { fehler: 'Bitte das Intervall in ganzen Monaten eingeben, z. B. 12.' };
  const { intervallMonate: _m, intervallKm: _k, fixMonat: _f, ...rest } = e.original;
  const regel = { ...rest, name: e.name, aktiv: e.aktiv };
  if (monate !== '') regel.intervallMonate = Number(monate);
  if (km !== undefined) regel.intervallKm = km;
  if (e.fixMonat) regel.fixMonat = e.fixMonat;
  return { regel };
}

/** Entwurf „Auto anlegen“ (`auto` null, mit Vorlage) bzw. „Fahrzeugdaten bearbeiten“: alle Felder als Text. */
export function autoEntwurf(auto, vorlageId = 'tesla3') {
  const v = AUTO_VORLAGEN.find((x) => x.id === vorlageId);
  const basis = auto ?? (v ? { ...v.auto } : { name: '', farbeKennung: 'blau', neuGekauft: false });
  const e = { id: auto?.id ?? null, vorlage: auto ? auto.vorlage ?? null : vorlageId };
  for (const def of AUTO_FELDER) {
    if (def.feld === 'vorlage') continue;
    const w = basis[def.feld];
    e[def.feld] = def.art === 'janein' ? w === true : w === undefined || w === null ? '' : String(w);
  }
  return e;
}

/** Entwurf → was store.autoSpeichern bekommt: { paket } (Vorlage, mit Regeln und Reifensätzen) oder { auto } oder { fehler }. */
export function entwurfZuAuto(e, { zufall } = {}) {
  const felder = {};
  for (const def of AUTO_FELDER) {
    if (def.feld === 'vorlage') continue;
    const w = e[def.feld];
    if (def.art === 'janein') felder[def.feld] = w === true;
    else if (typeof w === 'string' && w.trim() !== '') felder[def.feld] = w.trim();
  }
  if (e.id) return { auto: { ...felder, id: e.id, ...(e.vorlage ? { vorlage: e.vorlage } : {}) } };
  if (e.vorlage && e.vorlage !== 'leer') {
    try {
      return { paket: autoAusVorlage(e.vorlage, felder, zufall ? { zufall } : {}) };
    } catch (fehler) {
      return { fehler: fehler.message };
    }
  }
  return { auto: felder };
}

/** Farben fürs Formular: [{ id, name, hex }]. */
export const FARBEN_WAHL = AUTO_FARBEN.map((f) => ({ ...f, hex: AUTO_FARBE_HEX[f.id] }));

/** Datum vor `heute` als Vorschlag für „km aktualisieren“ ist immer heute; Monatsfeld 'JJJJ-MM' ↔ Teile. */
export const monatTeile = (jm) => (/^\d{4}-\d{2}$/.test(jm ?? '') ? { jahr: jm.slice(0, 4), monat: jm.slice(5, 7) } : { jahr: '', monat: '' });

