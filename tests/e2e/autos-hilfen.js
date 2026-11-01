// Helfer für die Autos in den Tests (e2e und tests/visuell): Beispieldaten eines Tages, auf Wunsch angepasst, als Demo-Speicher
// („fk.demo.v1“ wie ihn src/app/demo-adapter.js schreibt: Sparziele und Autos als Kalendertext). Kein Test selbst.
import { seedDemo } from '../../src/app/seed.js';
import { zieleText } from '../../src/domain/sparziele.js';
import { autosText, historieText, leereAutos } from '../../src/domain/autos.js';
import { historieId } from '../../src/calendar/mapping.js';

/** Beispiel-Autos vom Tag `datum` ({ daten, historie }, Kennungen wie in der Demo). */
export const demoAutos = (datum) => seedDemo(datum).autos;

/** Kennung des Beispiel-Autos `name` („Tesla Model 3“, „Fiat 500“) am Tag `datum`. */
export const autoId = (datum, name) => demoAutos(datum).daten.autos.find((a) => a.name === name).id;

/**
 * Demo-Speicher vom Tag `datum`; `aendern({ daten, historie })` → { daten, historie } passt die Autos an (z. B. ein Reifensatz mit km
 * „vorher“). `leer: true` = ohne Autos.
 */
export function demoMitAutos(datum, aendern = (a) => a, { leer = false } = {}) {
  const seed = seedDemo(datum);
  const { daten, historie } = leer ? { daten: leereAutos(), historie: {} } : aendern(structuredClone(seed.autos));
  const teile = {};
  for (const jahre of Object.values(historie ?? {})) for (const h of Object.values(jahre)) teile[historieId(h.auto, h.jahr)] = historieText(h);
  return { ...seed, ziele: zieleText(seed.ziele), autos: { text: leer ? null : autosText(daten), teile } };
}

/** Der Winter-Satz des Tesla mit 4.000 km „vorher“: seit dem Rotieren 10.600 km → beim Montieren wird „vorne/hinten getauscht“ vorgeschlagen. */
export const winterRotationFaellig = (a) => {
  const tesla = a.daten.autos.find((x) => x.name === 'Tesla Model 3').id;
  a.daten.saetze = a.daten.saetze.map((s) => (s.auto === tesla && s.art === 'winter' ? { ...s, startKm: 4000 } : s));
  return a;
};

/** Vier fällige Dinge am 20.10.2026 (Heute: drei Zeilen + „+ 1 weitere“): dazu Wischerblätter (alle 3 Monate, überfällig) und Pickerl (Oktober). */
export const vierFaellig = (a) => {
  const tesla = a.daten.autos.find((x) => x.name === 'Tesla Model 3').id;
  a.daten.regeln = a.daten.regeln.map((r) => {
    if (r.auto !== tesla) return r;
    if (r.typ === 'wischer') return { ...r, intervallMonate: 3 };
    if (r.typ === 'pickerl') return { ...r, fixMonat: '2026-10' };
    return r;
  });
  return a;
};
