// Aussehen der App (Klassisch, Glas & Licht, Bento bunt) und Bewegung (An, Reduziert). Beides gilt pro Telefon (localStorage) wie die
// Darstellung; ohne Wahl bleibt alles wie bisher: kein data-aussehen, kein data-bewegung, die theme-color von Klassisch.
// src/theme-init.js wiederholt diese Regeln ohne Import (ein Test prüft beide gegeneinander).
import { gueltigeDarstellung, themeFarben } from './darstellung.js';

export const AUSSEHEN = Object.freeze(['klassisch', 'glas', 'bento']);
export const AUSSEHEN_SCHLUESSEL = 'fk.aussehen.v1';
export const BEWEGUNG_SCHLUESSEL = 'fk.bewegung.v1';

/** Hintergrund des jeweiligen Aussehens für die Leiste des Telefons (hell, dunkel). Klassisch steht in domain/darstellung.js. */
const FARBEN = Object.freeze({
  glas: Object.freeze({ hell: '#F1EEFA', dunkel: '#0D0B19' }),
  bento: Object.freeze({ hell: '#F1EFFA', dunkel: '#14111D' }),
});

export const gueltigesAussehen = (wert) => (AUSSEHEN.includes(wert) ? wert : 'klassisch');

export const gueltigeBewegung = (wert) => (wert === 'reduziert' ? 'reduziert' : 'an');

/** Wert für `data-aussehen` am <html>-Element; null = kein Attribut (Klassisch). */
export const aussehenAttribut = (wahl) => {
  const a = gueltigesAussehen(wahl);
  return a === 'klassisch' ? null : a;
};

/** Wert für `data-bewegung` am <html>-Element; null = kein Attribut (Bewegung an). */
export const bewegungAttribut = (wahl) => (gueltigeBewegung(wahl) === 'reduziert' ? 'reduziert' : null);

/** Die <meta name="theme-color">-Einträge für Aussehen × Darstellung; Klassisch genau wie `themeFarben`. */
export function aussehenThemeFarben(aussehen, darstellung) {
  const a = gueltigesAussehen(aussehen);
  const d = gueltigeDarstellung(darstellung);
  if (a === 'klassisch') return themeFarben(d);
  const { hell, dunkel } = FARBEN[a];
  if (d === 'hell') return [{ farbe: hell, media: null }];
  if (d === 'dunkel') return [{ farbe: dunkel, media: null }];
  return [
    { farbe: hell, media: '(prefers-color-scheme: light)' },
    { farbe: dunkel, media: '(prefers-color-scheme: dark)' },
  ];
}
