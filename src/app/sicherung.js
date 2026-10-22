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
 * sich ohnehin aus seiner Kennung). `fixkosten` = { shards } wie im Zustand; ohne → leere Liste.
 */
function fixSicherung(fixkosten) {
  const posten = (fixkosten?.shards ?? []).flatMap((s) => (s ? normalisiereShard(s).posten : []));
  return { posten: posten.sort((a, b) => a.name.localeCompare(b.name, 'de') || a.id.localeCompare(b.id)) };
}

const nachDatum = (a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '');

/** Sicherung aus dem Zustand (`tage`, `urlaub`, `termine`, `settings`, `einkauf`, `konto`, `schicht`, `fixkosten`); flüchtige Felder (Fehler, Fortschritt …) fehlen bewusst. */
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
  };
}

export const sicherungDateiname = (heute) => `familienkalender-sicherung-${heute}.json`;

export const sicherungText = (sicherung) => JSON.stringify(sicherung, null, 2);

const zahl = (n, einzahl, mehrzahl) => `${n} ${n === 1 ? einzahl : mehrzahl}`;

/** „12 Tage · 3 Urlaube · 5 Termine · 4 Artikel auf der Einkaufsliste · 6 Kontostände · 4 Monate Schichtplan · 9 Fixkosten-Posten“ (Schichtplan und Fixkosten nur, wenn es welche gibt) */
export function sicherungAnzahlText(s) {
  const kontoEintraege = Object.values(s.konto.p).reduce((summe, monate) => summe + Object.keys(monate).length, 0);
  const schichtMonate = Object.keys(s.schicht?.monate ?? {}).length;
  const teile = [zahl(Object.keys(s.tage).length, 'Tag', 'Tage'), zahl(s.urlaub.length, 'Urlaub', 'Urlaube'), zahl(s.termine.length, 'Termin', 'Termine'), `${s.einkauf.e.length} Artikel auf der Einkaufsliste`, zahl(kontoEintraege, 'Kontostand', 'Kontostände')];
  if (schichtMonate > 0) teile.push(zahl(schichtMonate, 'Monat Schichtplan', 'Monate Schichtplan'));
  const fixPosten = s.fixkosten?.posten?.length ?? 0;
  if (fixPosten > 0) teile.push(`${fixPosten} Fixkosten-Posten`);
  return teile.join(' · ');
}
