// Schichtplan: wer wann welche Schicht hat (Papa und Mama), von Hand eingetragen – nichts wird automatisch erzeugt.
// Rein, ohne DOM und ohne Netz. Die Daten liegen als kleines JSON in versteckten Kalenderereignissen:
//   „fkschichtarten“  – der Katalog: { v: 1, arten: { papa: Art[], mama: Art[] } }
//   „fksch<JJJJMM>“   – ein Monat:   { v: 1, t: { papa: '…', mama: '…' }, n?: { person: { tag: Notiz } }, z?: { person: { tag: Zusatz[] } } }
// Jede Änderung ist eine reine Funktion (alt → neu), die auf die NEUESTE Fassung angewendet wird; das Argument wird nie verändert,
// und wo es geht ist sie wiederholbar (zweimal angewendet = einmal angewendet).
//
// Art = { k, kuerzel, name, farbe, gruppe: 'dienst'|'zusatz', von?: 'HH:MM', bis?: 'HH:MM', nacht?: true, muster?: 'urlaub'|'offen', erinnern?: boolean, archiv?: true }
// muster: beide gestreift; 'urlaub' zählt nicht als Dienst, 'offen' (z. B. Ersatzdienst) schon.
// erinnern: nur bei Zusätzen und dort immer vorhanden (fehlt es in einem alten Katalog → true); bei Diensten gibt es das Feld nicht.
// k = interne Kennung (ein Zeichen aus SCHLUESSEL_ZEICHEN), je Person eindeutig und NIE wiederverwendet (auch nicht nach dem Archivieren):
// Kürzel, Name und Farbe lassen sich jederzeit ändern, alte Tage bleiben trotzdem richtig.
// Monat im Speicher: { v: 1, jm: 'JJJJ-MM', t, n, z } immer vollständig; t[person] hat ein Zeichen je Tag (Zeichen i = Tag i+1, LEER = nichts).

export const SCHICHT_PERSONEN = Object.freeze(['papa', 'mama']);
export const MAX_SCHICHT_ZEICHEN = 6000; // wie beim Kontostand: Google kürzt Beschreibungen still bei 8192 Zeichen
export const MAX_ARTEN = 24; // je Person, archivierte mitgezählt
export const MAX_NOTIZ = 40; // Zeichen je Notiz (eine Zeile)
export const MAX_ZUSAETZE = 3; // je Person und Tag
export const MAX_NAME = 24;
export const MAX_KUERZEL = 3;
export const SCHLUESSEL_ZEICHEN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
export const LEER = '.';

/** Feste Farbpalette (die Farbwerte selbst stehen als --sf-<id> im Theme). */
export const PALETTE = Object.freeze(
  [
    ['gruen', 'Grün'],
    ['orange', 'Orange'],
    ['hellblau', 'Hellblau'],
    ['dunkelblau', 'Dunkelblau'],
    ['rosa', 'Rosa'],
    ['rot', 'Rot'],
    ['violett', 'Violett'],
    ['tuerkis', 'Türkis'],
    ['gelb', 'Gelb'],
    ['dunkellila', 'Dunkellila'],
    ['schiefer', 'Schiefergrau'],
    ['braun', 'Braun'],
    ['oliv', 'Oliv'],
    ['cyan', 'Cyan'],
    ['magenta', 'Magenta'],
    ['grau', 'Grau'],
  ].map(([id, name]) => Object.freeze({ id, name })),
);

const FARBEN = new Set(PALETTE.map((f) => f.id));
const ERSATZFARBE = 'grau';
const GRUPPEN = ['dienst', 'zusatz'];
const MUSTER = ['urlaub', 'offen'];
const MONAT = /^\d{4}-(0[1-9]|1[0-2])$/;
const UHRZEIT = /^([01]\d|2[0-3]):[0-5]\d$/;
const ZU_GROSS_MONAT = 'Zu viele Notizen in diesem Monat. Bitte einige kürzen oder löschen.';

const sauber = (text) => String(text ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
const zeichen = (text) => [...text].length; // Zeichen (nicht UTF-16-Einheiten), damit „Ü“ oder ein Emoji als eines zählt
const kuerzen = (text, max) => [...text].slice(0, max).join('').trimEnd();
const istSchluessel = (k) => typeof k === 'string' && k.length === 1 && SCHLUESSEL_ZEICHEN.includes(k);
const istObjekt = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const gleichesKuerzel = (a, b) => a.toLocaleLowerCase('de') === b.toLocaleLowerCase('de');

function pruefePerson(person) {
  if (!SCHICHT_PERSONEN.includes(person)) throw new Error('Ungültige Person (Papa oder Mama).');
}

/** Eine Art in fester Feldreihenfolge; leere Zusatzfelder fallen weg. `erinnern` nur bei Zusätzen (fehlt → true). */
function baueArt({ k, kuerzel, name, farbe, gruppe, von, bis, nacht, muster, erinnern, archiv }) {
  const art = { k, kuerzel, name, farbe, gruppe };
  if (von) art.von = von;
  if (bis) art.bis = bis;
  if (nacht === true) art.nacht = true;
  if (MUSTER.includes(muster)) art.muster = muster;
  if (gruppe === 'zusatz') art.erinnern = erinnern !== false;
  if (archiv === true) art.archiv = true;
  return art;
}

// ---------------------------------------------------------------- Katalog

const ERSATZDIENST = Object.freeze({ kuerzel: 'E', name: 'Ersatzdienst', farbe: 'gelb', gruppe: 'dienst', muster: 'offen' });

const STANDARD = {
  papa: [
    { kuerzel: 'F', name: 'Frühdienst', farbe: 'gruen' },
    { kuerzel: 'M', name: 'Mittagsdienst', farbe: 'orange' },
    { kuerzel: 'NM', name: 'Nachmittagsdienst', farbe: 'hellblau' },
    { kuerzel: 'N', name: 'Nacht', farbe: 'dunkelblau', nacht: true },
    { kuerzel: '2T', name: '2Teiler', farbe: 'rosa' },
    { kuerzel: 'Ü', name: 'Überstunde', farbe: 'rot' },
    { kuerzel: 'S', name: 'Schulung', farbe: 'violett' },
    { kuerzel: 'U', name: 'Urlaub', farbe: 'tuerkis', muster: 'urlaub' },
    ERSATZDIENST, // später dazugekommen: steht hinten, damit die Schlüssel der alten Arten bleiben (siehe katalogErgaenzen)
  ],
  mama: [
    { kuerzel: 'T', name: 'Tagdienst', farbe: 'gelb', von: '07:00', bis: '17:45' },
    { kuerzel: 'N', name: 'Nachtdienst', farbe: 'dunkellila', von: '17:30', bis: '07:00' },
    { kuerzel: 'S', name: 'Schulung', farbe: 'violett' },
    { kuerzel: 'Ü', name: 'Überstunde', farbe: 'rot' },
    { kuerzel: 'U', name: 'Urlaub', farbe: 'tuerkis', muster: 'urlaub' },
    { kuerzel: 'DB', name: 'Dienstbesprechung', farbe: 'schiefer', gruppe: 'zusatz', von: '18:00', bis: '19:30' },
  ],
};

/** Die Schichtarten beim ersten Öffnen; Schlüssel A, B, C … je Person in dieser Reihenfolge. */
export function standardKatalog() {
  const liste = (person) => STANDARD[person].map((a, i) => baueArt({ gruppe: 'dienst', ...a, k: SCHLUESSEL_ZEICHEN[i] }));
  return { v: 1, arten: { papa: liste('papa'), mama: liste('mama') } };
}

function uhrzeit(wert) {
  const t = sauber(wert);
  if (t === '') return undefined;
  if (!UHRZEIT.test(t)) throw new Error('Bitte eine Uhrzeit wie 07:30 eingeben.');
  return t;
}

/** Prüft einen Entwurf aus dem Formular streng und gibt die bereinigten Felder zurück (ohne k und archiv). */
function pruefeEntwurf(e) {
  const name = sauber(e?.name);
  if (name === '') throw new Error('Bitte einen Namen eingeben.');
  if (zeichen(name) > MAX_NAME) throw new Error(`Der Name darf höchstens ${MAX_NAME} Zeichen haben.`);
  const kuerzel = sauber(e.kuerzel);
  if (zeichen(kuerzel) < 1 || zeichen(kuerzel) > MAX_KUERZEL) throw new Error('Das Kürzel muss 1 bis 3 Zeichen haben.');
  if (!FARBEN.has(e.farbe)) throw new Error('Unbekannte Farbe.');
  const gruppe = e.gruppe ?? 'dienst';
  if (!GRUPPEN.includes(gruppe)) throw new Error('Unbekannte Gruppe.');
  const von = uhrzeit(e.von);
  const bis = uhrzeit(e.bis);
  if (gruppe === 'zusatz' && (!von || !bis)) throw new Error('Ein Zusatz braucht Von und Bis.');
  if (!von !== !bis) throw new Error('Bitte Von und Bis eingeben oder beide leer lassen.');
  const muster = MUSTER.includes(e.muster) ? e.muster : undefined;
  const erinnern = gruppe === 'zusatz' ? e.erinnern !== false : undefined; // bei Diensten ohne Bedeutung → fällt weg
  return { kuerzel, name, farbe: e.farbe, gruppe, von, bis, nacht: e.nacht === true, muster, erinnern };
}

function pruefeKuerzelFrei(arten, kuerzel, ausser = null) {
  if (arten.some((a) => a.k !== ausser && gleichesKuerzel(a.kuerzel, kuerzel))) throw new Error('Dieses Kürzel gibt es schon.');
}

/** Neuer Katalog mit geänderter Liste einer Person; wirft, wenn der Platz im Kalender nicht reicht. */
function mitArten(katalog, person, arten) {
  const neu = { v: 1, arten: { ...katalog.arten, [person]: arten } };
  katalogText(neu);
  return neu;
}

function indexVon(katalog, person, k) {
  pruefePerson(person);
  const i = katalog.arten[person].findIndex((a) => a.k === k);
  if (i < 0) throw new Error('Unbekannte Schichtart.');
  return i;
}

/** Fügt eine Art hinzu; ihr Schlüssel ist das erste Zeichen, das keine Art der Person je hatte (archivierte eingeschlossen). */
export function artHinzufuegen(katalog, person, entwurf) {
  pruefePerson(person);
  const arten = katalog.arten[person];
  const felder = pruefeEntwurf(entwurf);
  pruefeKuerzelFrei(arten, felder.kuerzel);
  if (arten.length >= MAX_ARTEN) throw new Error(`Höchstens ${MAX_ARTEN} Schichtarten pro Person.`);
  const k = [...SCHLUESSEL_ZEICHEN].find((z) => !arten.some((a) => a.k === z));
  if (!k) throw new Error(`Höchstens ${MAX_ARTEN} Schichtarten pro Person.`); // kann bei 24 Arten und 62 Zeichen nicht eintreten
  return mitArten(katalog, person, [...arten, baueArt({ ...felder, k })]);
}

/** Ändert Felder einer Art (Schlüssel und Archiv bleiben); leere Zeiten oder `nacht: false` entfernen sie. Wiederholbar. */
export function artAendern(katalog, person, k, aenderung) {
  const i = indexVon(katalog, person, k);
  const arten = katalog.arten[person];
  const alt = arten[i];
  const felder = pruefeEntwurf({ ...alt, ...aenderung });
  pruefeKuerzelFrei(arten, felder.kuerzel, k);
  const neu = baueArt({ ...felder, k, archiv: alt.archiv });
  if (JSON.stringify(neu) === JSON.stringify(alt)) return katalog;
  return mitArten(katalog, person, arten.map((a, j) => (j === i ? neu : a)));
}

/** Archiviert eine Art (`archiv: true`; sie verschwindet aus Pinsel und Knöpfen, alte Tage zeigen sie weiter) oder holt sie zurück. Wiederholbar. */
export function artArchivieren(katalog, person, k, archiv) {
  const i = indexVon(katalog, person, k);
  const alt = katalog.arten[person][i];
  if ((alt.archiv === true) === (archiv === true)) return katalog;
  const neu = baueArt({ ...alt, archiv: archiv === true });
  return mitArten(katalog, person, katalog.arten[person].map((a, j) => (j === i ? neu : a)));
}

/** Tauscht eine Art mit ihrer Nachbarin (−1 = nach oben, 1 = nach unten); an den Enden ändert sich nichts. */
export function artVerschieben(katalog, person, k, richtung) {
  if (richtung !== -1 && richtung !== 1) throw new Error('Ungültige Richtung.');
  const i = indexVon(katalog, person, k);
  const j = i + richtung;
  const arten = katalog.arten[person];
  if (j < 0 || j >= arten.length) return katalog;
  const neu = [...arten];
  [neu[i], neu[j]] = [neu[j], neu[i]];
  return mitArten(katalog, person, neu);
}

/** Die Art mit Schlüssel `k` (auch archiviert) oder null. */
export function artFuer(katalog, person, k) {
  return katalog?.arten?.[person]?.find((a) => a.k === k) ?? null;
}

/** Die nicht archivierten Arten einer Person in Katalog-Reihenfolge, wahlweise nur einer Gruppe. */
export function aktiveArten(katalog, person, gruppe) {
  return (katalog?.arten?.[person] ?? []).filter((a) => !a.archiv && (gruppe === undefined || a.gruppe === gruppe));
}

/** Nachtschicht: ausdrücklich angehakt oder die Zeiten gehen über Mitternacht (Bis ≤ Von). */
export function istNacht(art) {
  if (!art) return false;
  return art.nacht === true || (Boolean(art.von) && Boolean(art.bis) && art.bis <= art.von);
}

/** Prüft eine gelesene Art nachsichtig: Unbrauchbares → null (mit Warnung), Reparierbares wird repariert (mit Warnung). */
function leseArt(roh, person, gesehen, warnungen) {
  if (!istObjekt(roh) || !istSchluessel(roh.k)) {
    warnungen.push(`Schichtart ohne gültige Kennung (${person}) entfernt.`);
    return null;
  }
  if (gesehen.has(roh.k)) {
    warnungen.push(`Doppelte Schichtart „${roh.k}“ (${person}) entfernt.`);
    return null;
  }
  const name = sauber(roh.name);
  const kuerzel = sauber(roh.kuerzel);
  const gruppe = roh.gruppe ?? 'dienst';
  if (name === '' || zeichen(name) > MAX_NAME || zeichen(kuerzel) < 1 || zeichen(kuerzel) > MAX_KUERZEL || !GRUPPEN.includes(gruppe)) {
    warnungen.push(`Ungültige Schichtart „${roh.k}“ (${person}) entfernt.`);
    return null;
  }
  let farbe = roh.farbe;
  if (!FARBEN.has(farbe)) {
    warnungen.push(`Unbekannte Farbe bei „${kuerzel}“ (${person}); grau verwendet.`);
    farbe = ERSATZFARBE;
  }
  const zeit = (wert, feld) => {
    if (wert === undefined || wert === null || wert === '') return undefined;
    if (typeof wert === 'string' && UHRZEIT.test(wert)) return wert;
    warnungen.push(`Ungültige Uhrzeit (${feld}) bei „${kuerzel}“ (${person}) entfernt.`);
    return undefined;
  };
  let von = zeit(roh.von, 'von');
  let bis = zeit(roh.bis, 'bis');
  if (!von !== !bis) {
    // Zeiten gibt es nur paarweise
    if (von || bis) warnungen.push(`Unvollständige Zeiten bei „${kuerzel}“ (${person}) entfernt.`);
    von = undefined;
    bis = undefined;
  }
  let erinnern = roh.erinnern;
  if (gruppe === 'zusatz' && erinnern !== undefined && typeof erinnern !== 'boolean') {
    warnungen.push(`Ungültige Erinnerung bei „${kuerzel}“ (${person}); eingeschaltet.`);
    erinnern = true;
  }
  gesehen.add(roh.k);
  return baueArt({ k: roh.k, kuerzel, name, farbe, gruppe, von, bis, nacht: roh.nacht, muster: roh.muster, erinnern, archiv: roh.archiv });
}

/** Prüft einen gelesenen Katalog nachsichtig. null → Standardarten; Unbrauchbares → Standardarten mit Warnung. */
export function normalisiereKatalog(roh) {
  if (roh === null || roh === undefined) return { katalog: standardKatalog(), warnungen: [] };
  if (!istObjekt(roh) || roh.v !== 1 || !istObjekt(roh.arten)) {
    return { katalog: standardKatalog(), warnungen: ['Die Schichtarten waren unlesbar; es werden die Standardarten gezeigt.'] };
  }
  const warnungen = [];
  const arten = {};
  for (const person of SCHICHT_PERSONEN) {
    const liste = roh.arten[person];
    if (!Array.isArray(liste)) {
      warnungen.push(`Schichtarten (${person}) fehlten oder waren unlesbar.`);
      arten[person] = [];
      continue;
    }
    const gesehen = new Set();
    const gut = liste.map((a) => leseArt(a, person, gesehen, warnungen)).filter(Boolean);
    if (gut.length > MAX_ARTEN) warnungen.push(`Mehr als ${MAX_ARTEN} Schichtarten (${person}); die übrigen wurden entfernt.`);
    arten[person] = gut.slice(0, MAX_ARTEN);
  }
  return { katalog: { v: 1, arten }, warnungen };
}

/**
 * Ergänzt einen gespeicherten Katalog um später dazugekommene Standardarten: Papa bekommt einmal „E – Ersatzdienst“ (nächster nie
 * benutzter Schlüssel), wenn er keine Art mit dem Kürzel E hat – auch keine archivierte, egal ob groß oder klein geschrieben.
 * Rein und wiederholbar; ist kein Platz mehr (24 Arten, Kalendergröße), bleibt alles wie es ist.
 */
export function katalogErgaenzen(katalog) {
  const unveraendert = { katalog, geaendert: false };
  const papa = katalog?.arten?.papa;
  if (!Array.isArray(papa) || papa.some((a) => typeof a?.kuerzel === 'string' && gleichesKuerzel(a.kuerzel, ERSATZDIENST.kuerzel))) return unveraendert;
  try {
    return { katalog: artHinzufuegen(katalog, 'papa', ERSATZDIENST), geaendert: true };
  } catch {
    return unveraendert; // voll – lieber ohne E als ein Fehler beim Öffnen
  }
}

/** Der Katalog als Text für die Beschreibung des Kalenderereignisses; zu große Kataloge werden vor dem Schreiben abgelehnt. */
export function katalogText(katalog) {
  const text = JSON.stringify(normalisiereKatalog(katalog).katalog);
  if (text.length > MAX_SCHICHT_ZEICHEN) throw new Error('Zu viele Schichtarten für den Kalender. Bitte Namen kürzen.');
  return text;
}

/** Text aus dem Kalender → { katalog, warnungen } (leer → Standardarten; kaputt → Standardarten mit Warnung). */
export function katalogAusText(text) {
  if (typeof text !== 'string' || text.trim() === '') return normalisiereKatalog(null);
  let roh;
  try {
    roh = JSON.parse(text);
  } catch {
    return { katalog: standardKatalog(), warnungen: ['Die Schichtarten waren unlesbar; es werden die Standardarten gezeigt.'] };
  }
  return normalisiereKatalog(roh);
}

// ---------------------------------------------------------------- Monat

/** Anzahl der Tage im Monat 'JJJJ-MM' (auch Schaltjahre). */
export function tageImMonat(jm) {
  if (!MONAT.test(String(jm))) throw new Error(`Ungültiger Monat: ${jm}`);
  const [jahr, monat] = jm.split('-').map(Number);
  return new Date(Date.UTC(jahr, monat, 0)).getUTCDate();
}

/** Ein Monat ohne Einträge. */
export function leererMonat(jm) {
  const leer = LEER.repeat(tageImMonat(jm));
  return { v: 1, jm, t: { papa: leer, mama: leer }, n: { papa: {}, mama: {} }, z: { papa: {}, mama: {} } };
}

/** Tag-Schlüssel '1' … '31' → Zahl, sonst null (keine führenden Nullen, nichts außerhalb des Monats). */
function tagAusSchluessel(schluessel, tage) {
  if (!/^[1-9]\d?$/.test(schluessel)) return null;
  const tag = Number(schluessel);
  return tag <= tage ? tag : null;
}

function leseZeile(roh, person, tage, warnungen) {
  if (typeof roh !== 'string') {
    if (roh !== undefined) warnungen.push(`Schichten (${person}) waren unlesbar.`);
    return LEER.repeat(tage);
  }
  let zeile = [...roh].map((z) => (z === LEER || istSchluessel(z) ? z : '\0'));
  if (zeile.includes('\0')) {
    warnungen.push(`Ungültige Zeichen in den Schichten (${person}) entfernt.`);
    zeile = zeile.map((z) => (z === '\0' ? LEER : z));
  }
  if (zeile.length !== tage) warnungen.push(`Die Schichten (${person}) hatten ${zeile.length} statt ${tage} Tage.`);
  return zeile.slice(0, tage).join('').padEnd(tage, LEER);
}

function leseNotizen(roh, person, tage, warnungen) {
  if (roh === undefined) return {};
  if (!istObjekt(roh)) {
    warnungen.push(`Notizen (${person}) waren unlesbar.`);
    return {};
  }
  const aus = {};
  for (const [schluessel, wert] of Object.entries(roh)) {
    const tag = tagAusSchluessel(schluessel, tage);
    const text = typeof wert === 'string' ? sauber(wert) : '';
    if (tag === null || typeof wert !== 'string') {
      warnungen.push(`Ungültige Notiz (${person}, ${schluessel}) entfernt.`);
      continue;
    }
    if (text === '') continue;
    if (zeichen(text) > MAX_NOTIZ) warnungen.push(`Notiz (${person}, ${tag}.) auf ${MAX_NOTIZ} Zeichen gekürzt.`);
    aus[tag] = kuerzen(text, MAX_NOTIZ);
  }
  return aus;
}

const istZusatz = (x) => istObjekt(x) && istSchluessel(x.k) && typeof x.von === 'string' && UHRZEIT.test(x.von) && typeof x.bis === 'string' && UHRZEIT.test(x.bis);
const gleicherZusatz = (a, b) => a.k === b.k && a.von === b.von && a.bis === b.bis;

function leseZusaetze(roh, person, tage, warnungen) {
  if (roh === undefined) return {};
  if (!istObjekt(roh)) {
    warnungen.push(`Zusätze (${person}) waren unlesbar.`);
    return {};
  }
  const aus = {};
  for (const [schluessel, liste] of Object.entries(roh)) {
    const tag = tagAusSchluessel(schluessel, tage);
    if (tag === null || !Array.isArray(liste)) {
      warnungen.push(`Ungültige Zusätze (${person}, ${schluessel}) entfernt.`);
      continue;
    }
    const gut = [];
    for (const x of liste) {
      if (!istZusatz(x)) {
        warnungen.push(`Ungültiger Zusatz (${person}, ${tag}.) entfernt.`);
        continue;
      }
      if (gut.some((g) => gleicherZusatz(g, x))) continue; // doppelt → einmal
      gut.push({ k: x.k, von: x.von, bis: x.bis });
    }
    if (gut.length > MAX_ZUSAETZE) warnungen.push(`Mehr als ${MAX_ZUSAETZE} Zusätze (${person}, ${tag}.); die übrigen wurden entfernt.`);
    if (gut.length > 0) aus[tag] = gut.slice(0, MAX_ZUSAETZE);
  }
  return aus;
}

/** Prüft einen gelesenen Monat nachsichtig (zu kurz → aufgefüllt, zu lang → gekürzt, ungültige Zeichen → LEER); `jm` gilt immer. */
export function normalisiereMonat(roh, jm) {
  const tage = tageImMonat(jm);
  if (roh === null || roh === undefined) return { monat: leererMonat(jm), warnungen: [] };
  if (!istObjekt(roh) || roh.v !== 1 || !istObjekt(roh.t)) {
    return { monat: leererMonat(jm), warnungen: [`Der Schichtplan ${jm} war unlesbar; er wird leer gezeigt.`] };
  }
  const warnungen = [];
  const n = istObjekt(roh.n) ? roh.n : {};
  const z = istObjekt(roh.z) ? roh.z : {};
  if (roh.n !== undefined && !istObjekt(roh.n)) warnungen.push('Notizen waren unlesbar.');
  if (roh.z !== undefined && !istObjekt(roh.z)) warnungen.push('Zusätze waren unlesbar.');
  const monat = { v: 1, jm, t: {}, n: {}, z: {} };
  for (const person of SCHICHT_PERSONEN) {
    monat.t[person] = leseZeile(roh.t[person], person, tage, warnungen);
    monat.n[person] = leseNotizen(n[person], person, tage, warnungen);
    monat.z[person] = leseZusaetze(z[person], person, tage, warnungen);
  }
  return { monat, warnungen };
}

/** Nur Personen mit Einträgen; null, wenn niemand etwas hat. */
function ohneLeere(jePerson) {
  const voll = SCHICHT_PERSONEN.filter((p) => Object.keys(jePerson[p]).length > 0);
  return voll.length > 0 ? Object.fromEntries(voll.map((p) => [p, jePerson[p]])) : null;
}

/** Der Monat als Text für die Beschreibung des Kalenderereignisses (ohne jm und ohne leere n/z); zu große Monate werden abgelehnt. */
export function monatText(m) {
  const { monat } = normalisiereMonat(m, m?.jm);
  const aus = { v: 1, t: monat.t };
  const n = ohneLeere(monat.n);
  const z = ohneLeere(monat.z);
  if (n) aus.n = n;
  if (z) aus.z = z;
  const text = JSON.stringify(aus);
  if (text.length > MAX_SCHICHT_ZEICHEN) throw new Error(ZU_GROSS_MONAT);
  return text;
}

/** Text aus dem Kalender → { monat, warnungen } (leer → leerer Monat; kaputt → leerer Monat mit Warnung). */
export function monatAusText(text, jm) {
  if (typeof text !== 'string' || text.trim() === '') return normalisiereMonat(null, jm);
  let roh;
  try {
    roh = JSON.parse(text);
  } catch {
    return { monat: leererMonat(jm), warnungen: [`Der Schichtplan ${jm} war unlesbar; er wird leer gezeigt.`] };
  }
  return normalisiereMonat(roh, jm);
}

function pruefeTag(monat, tag) {
  if (!Number.isInteger(tag) || tag < 1 || tag > monat.t.papa.length) throw new Error('Ungültiger Tag.');
}

function pruefeSchluessel(k) {
  if (!istSchluessel(k)) throw new Error('Ungültige Schichtart.');
}

/** Schlüssel der Schicht an `tag` (1 …) oder null. */
export function schichtAm(monat, person, tag) {
  const z = monat?.t?.[person]?.[tag - 1];
  return z && z !== LEER ? z : null;
}

/** Setzt die Schicht eines Tages (`k: null` = frei); Notiz und Zusätze bleiben. Wiederholbar. */
export function setzeSchicht(monat, { person, tag, k }) {
  pruefePerson(person);
  pruefeTag(monat, tag);
  if (k !== null) pruefeSchluessel(k);
  const wert = k ?? LEER;
  const zeile = monat.t[person];
  if (zeile[tag - 1] === wert) return monat;
  return { ...monat, t: { ...monat.t, [person]: zeile.slice(0, tag - 1) + wert + zeile.slice(tag) } };
}

/** Pinsel: derselbe Schlüssel schon eingetragen → Tag frei, sonst wird er (ersetzend) eingetragen. */
export function schaltePinsel(monat, { person, tag, k }) {
  pruefeSchluessel(k);
  pruefePerson(person);
  pruefeTag(monat, tag);
  return setzeSchicht(monat, { person, tag, k: schichtAm(monat, person, tag) === k ? null : k });
}

/** Neuer Monat, in dem bei `n` oder `z` für Person und Tag `wert` steht (undefined = Eintrag entfernt). */
function mitTagEintrag(monat, feld, person, tag, wert) {
  const { [tag]: _alt, ...rest } = monat[feld][person];
  const neu = wert === undefined ? rest : { ...rest, [tag]: wert };
  return { ...monat, [feld]: { ...monat[feld], [person]: neu } };
}

/** Prüft, ob der Monat noch in den Kalender passt (wirft sonst die Meldung für zu viele Notizen). */
function passt(monat) {
  monatText(monat);
  return monat;
}

/** Setzt die Notiz eines Tages (eine Zeile, höchstens 40 Zeichen); leerer Text löscht sie. Wiederholbar. */
export function setzeNotiz(monat, { person, tag, text }) {
  pruefePerson(person);
  pruefeTag(monat, tag);
  const notiz = sauber(text);
  if (zeichen(notiz) > MAX_NOTIZ) throw new Error(`Höchstens ${MAX_NOTIZ} Zeichen.`);
  const alt = monat.n[person][tag];
  if (notiz === '') return alt === undefined ? monat : mitTagEintrag(monat, 'n', person, tag, undefined);
  if (alt === notiz) return monat;
  return passt(mitTagEintrag(monat, 'n', person, tag, notiz));
}

/** Fügt einen Zusatz (z. B. Dienstbesprechung) mit Uhrzeiten hinzu; ein gleicher vorhandener ändert nichts. */
export function zusatzHinzufuegen(monat, { person, tag, k, von, bis }) {
  pruefePerson(person);
  pruefeTag(monat, tag);
  pruefeSchluessel(k);
  if (typeof von !== 'string' || !UHRZEIT.test(von) || typeof bis !== 'string' || !UHRZEIT.test(bis)) throw new Error('Bitte eine Uhrzeit wie 07:30 eingeben.');
  const neu = { k, von, bis };
  const liste = monat.z[person][tag] ?? [];
  if (liste.some((x) => gleicherZusatz(x, neu))) return monat;
  if (liste.length >= MAX_ZUSAETZE) throw new Error(`Höchstens ${MAX_ZUSAETZE} Zusätze pro Tag.`);
  return passt(mitTagEintrag(monat, 'z', person, tag, [...liste, neu]));
}

/**
 * Entfernt Zusätze nach Inhalt, nicht nach Position – daher wiederholbar. Mit `bis` genau den einen (Schlüssel, Von und Bis; zwei mit
 * gleichem Von und anderem Bis sind verschiedene Zusätze), ohne `bis` alle mit diesem Schlüssel und Von.
 */
export function zusatzEntfernen(monat, { person, tag, k, von, bis }) {
  pruefePerson(person);
  pruefeTag(monat, tag);
  const liste = monat.z[person][tag] ?? [];
  const rest = liste.filter((x) => !(x.k === k && x.von === von && (bis === undefined || x.bis === bis)));
  if (rest.length === liste.length) return monat;
  return mitTagEintrag(monat, 'z', person, tag, rest.length > 0 ? rest : undefined);
}

/**
 * Zählung einer Person im Monat: `dienste` = Tage mit einer Art der Gruppe „dienst“ außer Urlaub; `jeArt` = je Art (Katalog-Reihenfolge,
 * archivierte eingeschlossen) die Anzahl Tage, nur Arten mit mindestens einem Tag. Schlüssel, die der Katalog nicht kennt, zählen nicht.
 */
export function monatZaehlung(monat, katalog, person) {
  const anzahl = new Map();
  for (const z of monat?.t?.[person] ?? '') if (z !== LEER) anzahl.set(z, (anzahl.get(z) ?? 0) + 1);
  let dienste = 0;
  const jeArt = [];
  for (const art of katalog?.arten?.[person] ?? []) {
    const n = anzahl.get(art.k) ?? 0;
    if (n === 0) continue;
    jeArt.push({ k: art.k, kuerzel: art.kuerzel, anzahl: n });
    if (art.gruppe === 'dienst' && art.muster !== 'urlaub') dienste += n;
  }
  return { dienste, jeArt };
}
