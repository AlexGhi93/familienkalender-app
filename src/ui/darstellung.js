// Darstellung, Aussehen und Bewegung zur Laufzeit wechseln (Konto & App → Darstellung). Beim Start übernimmt src/theme-init.js
// dasselbe vor dem Zeichnen. Die theme-color hängt von Aussehen UND Darstellung ab: wer eins ändert, liest das andere vom <html>
// (dort steht, was gerade gilt – auch wenn der Speicher gesperrt ist).
import { DARSTELLUNG_SCHLUESSEL, gueltigeDarstellung, themeAttribut } from '../domain/darstellung.js';
import { AUSSEHEN_SCHLUESSEL, BEWEGUNG_SCHLUESSEL, aussehenAttribut, aussehenThemeFarben, bewegungAttribut, gueltigeBewegung, gueltigesAussehen } from '../domain/aussehen.js';

function lese(speicher, schluessel, gueltig) {
  try {
    return gueltig(speicher?.getItem(schluessel));
  } catch {
    return gueltig(null);
  }
}

/** Merkt sich die Wahl; der Standard (`ohne`) löscht den Eintrag. Gesperrter Speicher: die Wahl gilt dann nur bis zum Neuladen. */
function merke(speicher, schluessel, wert, ohne) {
  try {
    if (wert === ohne) speicher?.removeItem(schluessel);
    else speicher?.setItem(schluessel, wert);
  } catch {
    // Speicher gesperrt
  }
}

function setzeAttribut(dokument, name, wert) {
  if (wert) dokument.documentElement.setAttribute(name, wert);
  else dokument.documentElement.removeAttribute(name);
}

const geltendeDarstellung = (dokument) => {
  const t = dokument.documentElement.getAttribute('data-theme');
  return t === 'light' ? 'hell' : t === 'dark' ? 'dunkel' : 'auto';
};

const geltendesAussehen = (dokument) => gueltigesAussehen(dokument.documentElement.getAttribute('data-aussehen'));

function setzeThemeFarben(dokument, aussehen, darstellung) {
  for (const alt of [...dokument.querySelectorAll('meta[name="theme-color"]')]) alt.remove();
  for (const { farbe, media } of aussehenThemeFarben(aussehen, darstellung)) {
    const meta = dokument.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    meta.setAttribute('content', farbe);
    if (media) meta.setAttribute('media', media);
    dokument.head.append(meta);
  }
}

/** Gespeicherte Wahl dieses Telefons ('auto' | 'hell' | 'dunkel'); ohne Speicher oder bei Fehlern 'auto'. */
export function leseDarstellung(speicher = globalThis.localStorage) {
  return lese(speicher, DARSTELLUNG_SCHLUESSEL, gueltigeDarstellung);
}

/** Wendet die Wahl sofort an (data-theme, theme-color) und merkt sie sich; Automatisch löscht die Wahl. Gibt die gültige Wahl zurück. */
export function wendeDarstellungAn(wahl, { dokument = document, speicher = globalThis.localStorage } = {}) {
  const w = gueltigeDarstellung(wahl);
  setzeAttribut(dokument, 'data-theme', themeAttribut(w));
  setzeThemeFarben(dokument, geltendesAussehen(dokument), w);
  merke(speicher, DARSTELLUNG_SCHLUESSEL, w, 'auto');
  return w;
}

/** Gespeichertes Aussehen dieses Telefons ('klassisch' | 'glas' | 'bento'); ohne Speicher, bei Fehlern oder unbekanntem Wert 'klassisch'. */
export function leseAussehen(speicher = globalThis.localStorage) {
  return lese(speicher, AUSSEHEN_SCHLUESSEL, gueltigesAussehen);
}

/** Wendet das Aussehen sofort an (data-aussehen, theme-color) und merkt es sich; Klassisch entfernt Attribut und Eintrag. */
export function wendeAussehenAn(wahl, { dokument = document, speicher = globalThis.localStorage } = {}) {
  const a = gueltigesAussehen(wahl);
  setzeAttribut(dokument, 'data-aussehen', aussehenAttribut(a));
  setzeThemeFarben(dokument, a, geltendeDarstellung(dokument));
  merke(speicher, AUSSEHEN_SCHLUESSEL, a, 'klassisch');
  return a;
}

/** Gespeicherte Bewegung dieses Telefons ('an' | 'reduziert'); ohne Speicher, bei Fehlern oder unbekanntem Wert 'an'. */
export function leseBewegung(speicher = globalThis.localStorage) {
  return lese(speicher, BEWEGUNG_SCHLUESSEL, gueltigeBewegung);
}

/** Wendet die Bewegung sofort an (data-bewegung="reduziert" oder kein Attribut) und merkt sie sich; „an“ löscht den Eintrag. */
export function wendeBewegungAn(wahl, { dokument = document, speicher = globalThis.localStorage } = {}) {
  const b = gueltigeBewegung(wahl);
  setzeAttribut(dokument, 'data-bewegung', bewegungAttribut(b));
  merke(speicher, BEWEGUNG_SCHLUESSEL, b, 'an');
  return b;
}
