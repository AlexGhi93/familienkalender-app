// Text in die Zwischenablage kopieren. Jeder Aufrufer zeigt selbst, ob es geklappt hat (Meldung und Wortlaut unterscheiden sich).

/** true = kopiert; false = der Browser hat es abgelehnt (ältere Browser, keine Erlaubnis). */
export async function kopieren(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
