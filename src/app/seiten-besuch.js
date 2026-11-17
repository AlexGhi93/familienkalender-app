// Welche Seiten beim Zeichnen neu betreten werden (ihre Daten einmal je Besuch frisch lesen) und welche vergessen werden, weil sie
// nicht mehr offen sind (beim nächsten Öffnen wieder frisch lesen). Pur: die Shell (src/shell.js) führt den Plan aus, die Seiten
// stehen in src/ui/seiten.js.

/**
 * `seiten` = [{ name }], `aktiv` = Map name → Schlüssel des offenen Besuchs (z. B. der angezeigte Monat; null oder fehlt = nicht
 * offen), `angefragt` = Map name → Schlüssel, für den zuletzt gelesen wurde. → { betreten: offene Seiten, deren Schlüssel sich
 * gegenüber dem zuletzt gelesenen geändert hat (oder nie gelesen), vergessen: gelesene Seiten, die nicht mehr offen sind }.
 */
export function besuchsPlan(seiten, aktiv, angefragt) {
  const betreten = [];
  const vergessen = [];
  for (const { name } of seiten) {
    const schluessel = aktiv.get(name) ?? null;
    if (schluessel === null) {
      if (angefragt.has(name)) vergessen.push(name);
    } else if (!angefragt.has(name) || angefragt.get(name) !== schluessel) {
      betreten.push(name);
    }
  }
  return { betreten, vergessen };
}
