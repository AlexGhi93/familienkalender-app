/** Vorrang bei Überschneidung am selben Tag: Urlaub > Krank > Abwesend > Schließtag > Betreuung. */
const PRIORITAET = ['urlaub', 'krank', 'abwesend', 'schliess', 'kita_essen', 'kita_ohne'];

export function dominanterTyp(typen) {
  return PRIORITAET.find((t) => typen.includes(t)) ?? null;
}

/** Die verdrängten Typen eines Konflikt-Tages (ohne den Gewinner), nach Vorrang sortiert und ohne Doppelte. */
export function verdraengteTypen(typen) {
  const gewinner = dominanterTyp(typen);
  return PRIORITAET.filter((t) => t !== gewinner && typen.includes(t));
}

/** True, wenn am selben Tag zwei verschiedene Tagestypen vorkommen. */
export function hatKonflikt(typen) {
  return new Set(typen.filter((t) => PRIORITAET.includes(t))).size > 1;
}
