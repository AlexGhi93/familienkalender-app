// Zeitspannen im Schichtplan („18:00–19:30“) als eigene Teile: Glas/Bento hüllen sie in .sp-zeiten (white-space: nowrap, themes/schicht.css),
// damit die Zeile nie zwischen „18:00–“ und „19:30“ bricht. Reine Funktion; die Teile ergeben zusammen wieder genau den Text.
const SPANNE = /\d{1,2}:\d{2}[–-]\d{1,2}:\d{2}/g;

/** 'Dienstbesprechung 18:00–19:30' → [{ text: 'Dienstbesprechung ', zeit: false }, { text: '18:00–19:30', zeit: true }]. */
export function zeitTeile(text) {
  const s = String(text ?? '');
  const teile = [];
  let rest = 0;
  for (const m of s.matchAll(SPANNE)) {
    if (m.index > rest) teile.push({ text: s.slice(rest, m.index), zeit: false });
    teile.push({ text: m[0], zeit: true });
    rest = m.index + m[0].length;
  }
  if (rest < s.length) teile.push({ text: s.slice(rest), zeit: false });
  return teile;
}
