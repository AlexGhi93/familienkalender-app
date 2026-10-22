// Sicherung als Datei: alle Daten der Familie in einem lesbaren JSON (zum Aufbewahren oder Weitergeben): rein, ohne DOM.
// Enthält Arzttermine und Kontostände, also Gesundheits- und Finanzdaten; die Datei bleibt dort, wo die Familie sie speichert.
import { leereListe, normalisiereListe } from '../domain/einkauf.js';
import { leeresKonto, normalisiereKonto } from '../domain/konto.js';
import { normalisiereShard } from '../domain/fixkosten.js';
import { terminAnzeige } from './views/gemeinsam.js';

export const SICHERUNG_VERSION = 1;

/** Schichtplan: Katalog (null = noch keiner gespeichert) und Monate nach 'JJJJ-MM' sortiert. */
function schichtSicherung(schicht) {
  const monate = schicht?.monate ?? {};
  return {
    katalog: schicht?.katalog ?? null,
    monate: Object.fromEntries(
      Object.keys(monate)
        .sort()
        .map((jm) => [jm, monate[jm]]),
    ),
  };
}

/**
 * Fixkosten: alle Posten aller vier Teile (auch archivierte) in einer Liste, nach Name sortiert (lesbar; der Teil eines Postens ergibt
 * sich ohnehin aus seiner Kennung). `fixkosten` = { shards, unlesbar? } wie aus store.sicherungsDaten; ohne → leere Liste.
 * Was diese Version nicht versteht, fehlt nicht unbemerkt: `fremd` = solche Posten roh (Speicherformat), `unlesbar` = [{ teil, text }]
 * mit dem Rohtext unlesbarer Teile (beide nur, wenn es welche gibt; die Sicherung wird nie zurückgeschrieben).
 */
function fixSicherung(fixkosten) {
  const teile = (fixkosten?.shards ?? []).filter(Boolean).map((s) => normalisiereShard(s));
  const posten = teile.flatMap((s) => s.posten).sort((a, b) => a.name.localeCompare(b.name, 'de') || a.id.localeCompare(b.id));
  const fremd = teile.flatMap((s) => s.fremd ?? []);
  const unlesbar = (Array.isArray(fixkosten?.unlesbar) ? fixkosten.unlesbar : []).map((u) => (typeof u === 'number' ? { teil: u, text: null } : { teil: u.nr, text: u.text ?? null }));
  return { posten, ...(fremd.length > 0 ? { fremd } : {}), ...(unlesbar.length > 0 ? { unlesbar } : {}) };
}

/**
 * Sparziele: Ziele und Verschiebungen aus „Frei“ in lesbarer Form (wie im Zustand, in ihrer Reihenfolge), dazu `beginn` (ab wann
 * gerechnet wird; null = noch nie ein Ziel). `ziele` = { daten, unlesbar?, text? } wie aus store.sicherungsDaten; ohne → leer. Was diese
 * Version nicht versteht, fehlt nicht unbemerkt: `fremd` = solche Einträge roh, `unlesbar` = der Rohtext unlesbarer Sparziele (beide nur,
 * wenn es welche gibt; die Sicherung wird nie zurückgeschrieben).
 */
function zieleSicherung(ziele) {
  const d = ziele?.daten ?? {};
  const fremd = d.fremd && (d.fremd.z?.length > 0 || d.fremd.m?.length > 0) ? { fremd: d.fremd } : {};
  const unlesbar = ziele?.unlesbar ? { unlesbar: ziele.text ?? null } : {};
  return { beginn: d.beginn ?? null, ziele: d.z ?? [], verschiebungen: d.m ?? [], ...fremd, ...unlesbar };
}

const nachDatum = (a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '');

/** Sicherung aus dem Zustand (`tage`, `urlaub`, `termine`, `settings`, `einkauf`, `konto`, `schicht`, `fixkosten`, `ziele`); flüchtige Felder (Fehler, Fortschritt …) fehlen bewusst. */
export function sicherungErstellen({ state, appVersion, jetzt = new Date() }) {
  return {
    app: 'familienkalender',
    sicherungVersion: SICHERUNG_VERSION,
    appVersion,
    erstelltAm: jetzt.toISOString(),
    settings: state.settings,
    tage: Object.fromEntries(
      Object.keys(state.tage)
        .sort()
        .map((d) => [d, { typ: state.tage[d].typ }]),
    ),
    urlaub: [...state.urlaub].sort((a, b) => a.start.localeCompare(b.start)),
    termine: [...state.termine].sort(nachDatum).map((t) => ({ ...t, titel: terminAnzeige(t, state.settings).titel })),
    einkauf: state.einkauf ? normalisiereListe(state.einkauf) : leereListe(),
    konto: state.konto ? normalisiereKonto(state.konto) : leeresKonto(),
    schicht: schichtSicherung(state.schicht),
    fixkosten: fixSicherung(state.fixkosten),
    ziele: zieleSicherung(state.ziele),
  };
}

export const sicherungDateiname = (heute) => `familienkalender-sicherung-${heute}.json`;

export const sicherungText = (sicherung) => JSON.stringify(sicherung, null, 2);

const zahl = (n, einzahl, mehrzahl) => `${n} ${n === 1 ? einzahl : mehrzahl}`;

/**
 * „12 Tage · 3 Urlaube · 5 Termine · 4 Artikel auf der Einkaufsliste · 6 Kontostände · 4 Monate Schichtplan · 9 Fixkosten-Posten · 3 Sparziele“
 * (Schichtplan, Fixkosten und Sparziele nur, wenn es welche gibt)
 */
export function sicherungAnzahlText(s) {
  const kontoEintraege = Object.values(s.konto.p).reduce((summe, monate) => summe + Object.keys(monate).length, 0);
  const schichtMonate = Object.keys(s.schicht?.monate ?? {}).length;
  const teile = [zahl(Object.keys(s.tage).length, 'Tag', 'Tage'), zahl(s.urlaub.length, 'Urlaub', 'Urlaube'), zahl(s.termine.length, 'Termin', 'Termine'), `${s.einkauf.e.length} Artikel auf der Einkaufsliste`, zahl(kontoEintraege, 'Kontostand', 'Kontostände')];
  if (schichtMonate > 0) teile.push(zahl(schichtMonate, 'Monat Schichtplan', 'Monate Schichtplan'));
  const fixPosten = (s.fixkosten?.posten?.length ?? 0) + (s.fixkosten?.fremd?.length ?? 0);
  if (fixPosten > 0) teile.push(`${fixPosten} Fixkosten-Posten`);
  const unlesbar = s.fixkosten?.unlesbar?.length ?? 0;
  if (unlesbar > 0) teile.push(`${zahl(unlesbar, 'unlesbarer Teil', 'unlesbare Teile')} der Fixkosten (als Text gesichert)`);
  const ziele = (s.ziele?.ziele?.length ?? 0) + (s.ziele?.fremd?.z?.length ?? 0);
  if (ziele > 0) teile.push(zahl(ziele, 'Sparziel', 'Sparziele'));
  if (s.ziele?.unlesbar !== undefined) teile.push('Sparziele unlesbar (als Text gesichert)');
  return teile.join(' · ');
}
