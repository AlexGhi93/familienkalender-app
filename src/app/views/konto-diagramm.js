// Geometrie der Kontostand-Diagramme (rein, ohne DOM): runde Achsen, lückenlose Monate, Linien mit überbrückten Lücken, Balken-Layout.
// Beträge in ganzen Cent. Das Zeichnen selbst (SVG, Tooltip) steht in ui/konto-diagramm.js.
import { betragText, monatVor } from '../../domain/konto.js';

const runde = (v) => Math.round(v * 10) / 10;

/**
 * Runde Achse um die Werte: Schritte 1/2/5 × 10ⁿ Euro, höchstens `maxTicks` Abschnitte, gleichmäßig.
 * `mitNull`: die Null liegt immer auf der Achse (Balken). Ergebnis in Cent: { min, max, ticks }.
 */
export function schoeneSkala(minCents, maxCents, { maxTicks = 5, mitNull = false } = {}) {
  let lo = Math.min(minCents, maxCents);
  let hi = Math.max(minCents, maxCents);
  if (mitNull) {
    lo = Math.min(lo, 0);
    hi = Math.max(hi, 0);
  }
  if (hi - lo < 100) hi = lo + 100; // eine Linie ohne Spanne bekommt trotzdem eine Achse (mindestens 1 €)
  for (let potenz = 0; potenz < 12; potenz += 1) {
    for (const faktor of [1, 2, 5]) {
      const schritt = faktor * 10 ** potenz * 100;
      const min = Math.floor(lo / schritt) * schritt;
      const max = Math.ceil(hi / schritt) * schritt;
      if ((max - min) / schritt <= maxTicks) {
        const ticks = [];
        for (let t = min; t <= max; t += schritt) ticks.push(t);
        return { min, max, ticks };
      }
    }
  }
  return { min: lo, max: hi, ticks: [lo, hi] };
}

/** Achsenwert: ganze Euro mit Tausenderpunkt, z. B. „20.000 €“ oder „−500 €“. */
export const achsenText = (cents) => betragText(Math.round(cents / 100) * 100);

/** Lückenlose Monatsliste von `von` bis `bis` (beide 'JJJJ-MM', einschließlich). */
export function monateVon(von, bis) {
  const liste = [];
  for (let m = von; m <= bis; m = monatVor(m, -1)) liste.push(m);
  return liste;
}

/**
 * Datenreihen für das Soll-Diagramm: Monate lückenlos vom ersten bis zum letzten Eintrag (bei `bereich` > 0 nur die letzten `bereich` Monate bis zum
 * letzten Eintrag), je Reihe der Stand oder null. Zusammen nur, wenn beide Personen in dem Monat eingetragen haben. Ohne Daten: null.
 */
export function verlaufReihen(konto, bereich = 0) {
  const vorhanden = [...new Set([...Object.keys(konto.p.papa), ...Object.keys(konto.p.mama)])].sort();
  if (vorhanden.length === 0) return null;
  const ende = vorhanden.at(-1);
  const erster = vorhanden[0];
  const start = bereich > 0 ? [erster, monatVor(ende, bereich - 1)].sort().at(-1) : erster;
  const monate = monateVon(start, ende);
  const papa = monate.map((m) => konto.p.papa[m] ?? null);
  const mama = monate.map((m) => konto.p.mama[m] ?? null);
  return { monate, reihen: { papa, mama, zusammen: papa.map((p, i) => (p !== null && mama[i] !== null ? p + mama[i] : null)) } };
}

/**
 * Pfade einer Linie: `linien` = durchgehende Abschnitte (mindestens zwei Punkte), `luecken` = gestrichelte Brücken über fehlende Monate,
 * `punkte` = alle vorhandenen Punkte { i, x, y }. `xFuer(i)` und `yFuer(wert)` rechnen in Zeichenkoordinaten.
 */
export function pfadTeile(werte, xFuer, yFuer) {
  const punkte = [];
  werte.forEach((w, i) => {
    if (w !== null && w !== undefined) punkte.push({ i, x: runde(xFuer(i)), y: runde(yFuer(w)) });
  });
  const abschnitte = [];
  const luecken = [];
  let aktuell = [];
  let letzter = null;
  for (const p of punkte) {
    if (letzter && p.i !== letzter.i + 1) {
      luecken.push(`M${letzter.x} ${letzter.y} L${p.x} ${p.y}`);
      abschnitte.push(aktuell);
      aktuell = [];
    }
    aktuell.push(p);
    letzter = p;
  }
  if (aktuell.length > 0) abschnitte.push(aktuell);
  return { linien: abschnitte.filter((a) => a.length >= 2).map((a) => a.map((p, j) => `${j === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ')), luecken, punkte };
}

/**
 * Balken-Layout: Balken (höchstens 24 breit) wachsen von der Null-Linie, negative nach unten; ein Sonderbetrag-Segment (`extra`) schließt an das Ende des Balkens an.
 * `balken` = [{ monat, wert, extra }], `rand` = { links, rechts, oben, unten }, `skala` aus `schoeneSkala(…, { mitNull: true })`.
 */
export function balkenLayout({ balken, breite, hoehe, rand, skala }) {
  const plotBreite = breite - rand.links - rand.rechts;
  const plotHoehe = hoehe - rand.oben - rand.unten;
  const yFuer = (wert) => rand.oben + ((skala.max - wert) / (skala.max - skala.min)) * plotHoehe;
  const nullLinieY = yFuer(0);
  const schritt = balken.length > 0 ? plotBreite / balken.length : plotBreite;
  const balkenBreite = Math.max(2, Math.min(24, schritt - 6));
  const sichtbar = (h, wert) => (wert === 0 ? Math.max(h, 1.5) : Math.max(h, 2));
  return {
    nullLinieY: runde(nullLinieY),
    balken: balken.map((b, i) => {
      const mitteX = rand.links + schritt * (i + 0.5);
      const spitze = yFuer(b.wert);
      const hoeheBalken = sichtbar(Math.abs(spitze - nullLinieY), b.wert);
      const y = b.wert >= 0 ? nullLinieY - hoeheBalken : nullLinieY;
      let extraBereich = null;
      let ende = b.wert >= 0 ? y : y + hoeheBalken; // Ende des Balkens (oben bei plus, unten bei minus)
      if (b.extra !== 0) {
        const ziel = yFuer(b.wert + b.extra);
        const oben = Math.min(ende, ziel);
        extraBereich = { y: runde(oben), hoehe: runde(Math.max(Math.abs(ziel - ende), 2)) };
        ende = b.wert + b.extra >= 0 ? Math.min(ende, ziel) : Math.max(ende, ziel);
      }
      return {
        monat: b.monat,
        wert: b.wert,
        extra: b.extra,
        art: b.wert > 0 ? 'plus' : b.wert < 0 ? 'minus' : 'null',
        mitteX: runde(mitteX),
        x: runde(mitteX - balkenBreite / 2),
        breite: runde(balkenBreite),
        y: runde(y),
        hoehe: runde(hoeheBalken),
        extraBereich,
        labelY: runde(b.wert + b.extra >= 0 ? Math.min(ende, y) - 4 : Math.max(ende, y + hoeheBalken) + 11),
      };
    }),
  };
}
