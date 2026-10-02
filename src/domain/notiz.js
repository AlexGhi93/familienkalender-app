// Notiz zu einem Termin (der „Grund“): reiner Text, höchstens MAX_NOTIZ Zeichen, liegt in der Beschreibung des Kalenderereignisses.
export const MAX_NOTIZ = 300;

/** Vereinheitlicht Zeilenumbrüche und Leerraum; leer bleibt ''. Prüft die Länge nicht. */
export function bereinigeNotiz(text) {
  return String(text)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((zeile) => zeile.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Beschreibung aus Google (kann HTML enthalten, wenn jemand sie in Google Kalender bearbeitet hat) als Text, gekürzt auf MAX_NOTIZ; null, wenn leer. */
export function notizAusBeschreibung(beschreibung) {
  if (typeof beschreibung !== 'string') return null;
  const text = beschreibung
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
  const sauber = bereinigeNotiz(text);
  if (sauber === '') return null;
  return sauber.length > MAX_NOTIZ ? sauber.slice(0, MAX_NOTIZ).trimEnd() : sauber;
}
