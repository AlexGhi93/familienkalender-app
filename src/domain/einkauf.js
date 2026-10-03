// Einkaufsliste der Familie: rein, ohne DOM und ohne Netz. Die Liste liegt als kleines JSON im geteilten Kalender
// (verstecktes Ereignis „fkeinkauf“); jede Änderung ist eine Funktion Liste → Liste, die auf die NEUESTE Fassung angewendet wird,
// damit zwei Telefone, die gleichzeitig etwas eintragen, nichts voneinander überschreiben.
//
// Form: { v: 1, e: [{ i: Kennung, t: Text, m: Menge, g: 0|1 (gekauft/im Wagen), z: Zeitpunkt in Sekunden }], h: { Text: wie oft gekauft } }

export const MAX_ARTIKEL = 80;
export const MAX_TEXT = 40;
export const MAX_MENGE = 12;
export const MAX_HAEUFIG = 30;
export const MAX_EINKAUF_ZEICHEN = 6000; // Google kürzt Beschreibungen still bei 8192 Zeichen (Vertragsprobe C11b)

const KENNUNG = /^[A-Za-z0-9_-]{1,16}$/;
const sauber = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
const schluessel = (text) => text.toLocaleLowerCase('de');
const sekunden = (ms) => Math.floor(ms / 1000);

export const leereListe = () => ({ v: 1, e: [], h: {} });

/** Die Liste als Text für die Beschreibung des Kalenderereignisses; zu lange Listen werden vor dem Schreiben abgelehnt. */
export function einkaufText(liste) {
  const text = JSON.stringify(liste);
  if (text.length > MAX_EINKAUF_ZEICHEN) throw new Error('Die Liste ist zu lang. Bitte erst Gekauftes entfernen.');
  return text;
}

function artikel(a) {
  if (!a || typeof a !== 'object') return null;
  const t = sauber(a.t);
  const m = sauber(a.m);
  const ok = typeof a.i === 'string' && KENNUNG.test(a.i) && t !== '' && t.length <= MAX_TEXT && m.length <= MAX_MENGE && (a.g === 0 || a.g === 1) && Number.isFinite(a.z) && a.z >= 0;
  return ok ? { i: a.i, t, m, g: a.g, z: a.z } : null;
}

function begrenzeHaeufig(h) {
  const eintraege = Object.entries(h);
  if (eintraege.length <= MAX_HAEUFIG) return h;
  // die häufigsten bleiben; bei Gleichstand gewinnt der zuletzt Hinzugekommene; die Reihenfolge der Einträge bleibt erhalten
  const behalten = new Set(
    eintraege
      .map(([name, anzahl], index) => ({ name, anzahl, index }))
      .sort((a, b) => b.anzahl - a.anzahl || b.index - a.index)
      .slice(0, MAX_HAEUFIG)
      .map((x) => x.name),
  );
  return Object.fromEntries(eintraege.filter(([name]) => behalten.has(name)));
}

/** Prüft eine gelesene Liste streng; Ungültiges wird einzeln verworfen, Unbrauchbares ergibt die leere Liste. */
export function normalisiereListe(roh) {
  if (!roh || typeof roh !== 'object' || Array.isArray(roh) || roh.v !== 1 || !Array.isArray(roh.e)) return leereListe();
  const gesehen = new Set();
  const e = [];
  for (const a of roh.e) {
    const gut = artikel(a);
    if (gut && !gesehen.has(gut.i) && e.length < MAX_ARTIKEL) {
      gesehen.add(gut.i);
      e.push(gut);
    }
  }
  const h = {};
  if (roh.h && typeof roh.h === 'object' && !Array.isArray(roh.h)) {
    for (const [name, anzahl] of Object.entries(roh.h)) {
      const n = sauber(name);
      if (n !== '' && n.length <= MAX_TEXT && Number.isInteger(anzahl) && anzahl >= 1 && anzahl <= 999) h[n] = anzahl;
    }
  }
  return { v: 1, e, h: begrenzeHaeufig(h) };
}

/** Text aus dem Kalender → Liste (kaputtes JSON ergibt die leere Liste). */
export function einkaufAusText(text) {
  if (typeof text !== 'string' || text.trim() === '') return leereListe();
  try {
    return normalisiereListe(JSON.parse(text));
  } catch {
    return leereListe();
  }
}

/**
 * Artikel hinzufügen. Derselbe Name (Groß/Klein egal) steht nur einmal da: ist er offen, ersetzt eine neue Menge die alte;
 * war er schon abgehakt, kommt er zurück auf „offen“. `jetzt` in Millisekunden, `id` für neue Artikel.
 */
export function hinzufuegen(liste, { text, menge = '' }, { jetzt, id }) {
  const t = sauber(text);
  const m = sauber(menge);
  if (t === '') throw new Error('Bitte einen Artikel eingeben.');
  if (t.length > MAX_TEXT) throw new Error(`Der Artikel ist zu lang (höchstens ${MAX_TEXT} Zeichen).`);
  if (m.length > MAX_MENGE) throw new Error(`Die Menge ist zu lang (höchstens ${MAX_MENGE} Zeichen).`);
  const vorhanden = liste.e.find((a) => schluessel(a.t) === schluessel(t));
  let e;
  if (vorhanden) {
    e = liste.e.map((a) => (a === vorhanden ? { ...a, g: 0, m: m || a.m, z: a.g === 1 ? sekunden(jetzt) : a.z } : a));
  } else {
    if (liste.e.length >= MAX_ARTIKEL) throw new Error(`Die Liste ist voll (${MAX_ARTIKEL} Artikel). Bitte erst Gekauftes entfernen.`);
    e = [...liste.e, { i: id, t, m, g: 0, z: sekunden(jetzt) }];
  }
  const neu = { ...liste, e };
  einkaufText(neu); // wirft, wenn die Liste zu lang würde
  return neu;
}

/** Abhaken („im Wagen“) oder zurücknehmen. Unbekannte Kennungen ändern nichts. */
export function umschalten(liste, id, jetzt) {
  if (!liste.e.some((a) => a.i === id)) return liste;
  return { ...liste, e: liste.e.map((a) => (a.i === id ? { ...a, g: a.g === 1 ? 0 : 1, z: sekunden(jetzt) } : a)) };
}

/** Einzelnen Artikel löschen (zählt nicht als „gekauft“). */
export function entfernen(liste, id) {
  return liste.e.some((a) => a.i === id) ? { ...liste, e: liste.e.filter((a) => a.i !== id) } : liste;
}

/** Alle abgehakten Artikel entfernen; sie zählen für „Oft gekauft“. Gibt { liste, entfernt, hVorher } zurück (für „Rückgängig“). */
export function erledigteEntfernen(liste) {
  const entfernt = liste.e.filter((a) => a.g === 1);
  if (entfernt.length === 0) return { liste, entfernt, hVorher: liste.h };
  const h = { ...liste.h };
  for (const a of entfernt) {
    const bekannt = Object.keys(h).find((name) => schluessel(name) === schluessel(a.t));
    h[bekannt ?? a.t] = (h[bekannt ?? a.t] ?? 0) + 1;
  }
  return { liste: { ...liste, e: liste.e.filter((a) => a.g !== 1), h: begrenzeHaeufig(h) }, entfernt, hVorher: liste.h };
}

/** Macht „Gekaufte entfernen“ rückgängig: die Artikel kommen zurück (falls nicht schon da), die Häufigkeiten wie vorher. */
export function wiederherstellen(liste, { entfernt, hVorher }) {
  const vorhanden = new Set(liste.e.map((a) => a.i));
  const namen = new Set(liste.e.map((a) => schluessel(a.t)));
  const zurueck = entfernt.filter((a) => !vorhanden.has(a.i) && !namen.has(schluessel(a.t)));
  return { ...liste, e: [...liste.e, ...zurueck].slice(0, MAX_ARTIKEL), h: hVorher };
}

/** „Oft gekauft“: die häufigsten bisherigen Käufe, die nicht schon auf der Liste stehen. */
export function haeufigeVorschlaege(liste, anzahl = 8) {
  const aufListe = new Set(liste.e.map((a) => schluessel(a.t)));
  return Object.entries(liste.h)
    .filter(([name]) => !aufListe.has(schluessel(name)))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de'))
    .slice(0, anzahl)
    .map(([name]) => name);
}

/** { offen, gekauft }: offene in der Reihenfolge des Hinzufügens, gekaufte (im Wagen) mit dem zuletzt Abgehakten zuerst. */
export function sortiert(liste) {
  return {
    offen: liste.e.filter((a) => a.g === 0).sort((a, b) => a.z - b.z),
    gekauft: liste.e.filter((a) => a.g === 1).sort((a, b) => b.z - a.z),
  };
}
