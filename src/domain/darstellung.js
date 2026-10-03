// Darstellung der App: Automatisch (folgt dem Telefon), Hell oder Dunkel. Die Wahl gilt pro Telefon (localStorage), nicht für beide Eltern.
export const DARSTELLUNGEN = Object.freeze(['auto', 'hell', 'dunkel']);
export const DARSTELLUNG_SCHLUESSEL = 'fk.darstellung.v1';

const HELL = '#FFF7EC';
const DUNKEL = '#1F1B2E';

export const gueltigeDarstellung = (wert) => (DARSTELLUNGEN.includes(wert) ? wert : 'auto');

/** Wert für `data-theme` am <html>-Element; null = kein Attribut (dem Telefon folgen). */
export const themeAttribut = (wahl) => (wahl === 'hell' ? 'light' : wahl === 'dunkel' ? 'dark' : null);

export const istDunkel = (wahl, systemDunkel) => (wahl === 'auto' ? Boolean(systemDunkel) : wahl === 'dunkel');

/** Die <meta name="theme-color">-Einträge: erzwungen eine Farbe, automatisch zwei mit `media`, wie im Ausgangs-HTML. */
export function themeFarben(wahl) {
  if (wahl === 'hell') return [{ farbe: HELL, media: null }];
  if (wahl === 'dunkel') return [{ farbe: DUNKEL, media: null }];
  return [
    { farbe: HELL, media: '(prefers-color-scheme: light)' },
    { farbe: DUNKEL, media: '(prefers-color-scheme: dark)' },
  ];
}
