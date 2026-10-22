// Was im Hintergrund vorgeladen wird (Schichtplan, Fixkosten), zeichnet nur die Ansicht neu, die es zeigt. Sonst ginge z. B. beim
// Eintippen des Kontostands die Tastatur zu, sobald das Vorladen der Fixkosten fertig ist (Neuzeichnen nimmt den Fokus).

/** Teile des Zustands, die im Hintergrund vorgeladen werden, und wann sie sichtbar sind (`seite`, `kontoAnsicht` wie in der Shell). */
const SICHTBAR = {
  schicht: ({ seite }) => seite === 'schicht',
  fixkosten: ({ seite, kontoAnsicht }) => seite === 'konto' && kontoAnsicht === 'fixkosten',
};

/** Unterscheiden sich zwei Zustände nur in vorgeladenen Teilen, die gerade nicht zu sehen sind? (Dann nicht neu zeichnen.) */
export function nurHintergrundGeaendert(a, b, ansicht) {
  const geaendert = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k]);
  return geaendert.length > 0 && geaendert.every((k) => SICHTBAR[k] && !SICHTBAR[k](ansicht));
}
