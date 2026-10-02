/** Vorrang bei Überschneidung am selben Tag: Urlaub > Krank > Abwesend > Schließtag > Betreuung. */
const PRIORITAET = ['urlaub', 'krank', 'abwesend', 'schliess', 'kita_essen', 'kita_ohne'];

export function dominanterTyp(typen) {
  return PRIORITAET.find((t) => typen.includes(t)) ?? null;
}

/** True, wenn am selben Tag zwei verschiedene Tagestypen vorkommen. */
export function hatKonflikt(typen) {
  return new Set(typen.filter((t) => PRIORITAET.includes(t))).size > 1;
}
