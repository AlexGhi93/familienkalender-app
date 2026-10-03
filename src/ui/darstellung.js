// Darstellung zur Laufzeit wechseln (Mehr → Darstellung). Beim Start übernimmt src/theme-init.js dasselbe vor dem Zeichnen.
import { DARSTELLUNG_SCHLUESSEL, gueltigeDarstellung, themeAttribut, themeFarben } from '../domain/darstellung.js';

/** Gespeicherte Wahl dieses Telefons ('auto' | 'hell' | 'dunkel'); ohne Speicher oder bei Fehlern 'auto'. */
export function leseDarstellung(speicher = globalThis.localStorage) {
  try {
    return gueltigeDarstellung(speicher?.getItem(DARSTELLUNG_SCHLUESSEL));
  } catch {
    return 'auto';
  }
}

/** Wendet die Wahl sofort an (data-theme, theme-color) und merkt sie sich; Automatisch löscht die Wahl. Gibt die gültige Wahl zurück. */
export function wendeDarstellungAn(wahl, { dokument = document, speicher = globalThis.localStorage } = {}) {
  const w = gueltigeDarstellung(wahl);
  const attribut = themeAttribut(w);
  if (attribut) dokument.documentElement.setAttribute('data-theme', attribut);
  else dokument.documentElement.removeAttribute('data-theme');
  for (const alt of [...dokument.querySelectorAll('meta[name="theme-color"]')]) alt.remove();
  for (const { farbe, media } of themeFarben(w)) {
    const meta = dokument.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    meta.setAttribute('content', farbe);
    if (media) meta.setAttribute('media', media);
    dokument.head.append(meta);
  }
  try {
    if (w === 'auto') speicher?.removeItem(DARSTELLUNG_SCHLUESSEL);
    else speicher?.setItem(DARSTELLUNG_SCHLUESSEL, w);
  } catch {
    // Speicher gesperrt: die Wahl gilt dann nur bis zum Neuladen
  }
  return w;
}
