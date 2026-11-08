// Versicherung (Privatarzt): eine Polizze mit Jahres-Limits je Kategorie und einem Maximum, dazu die eingereichten Rechnungen – je
// Kalenderjahr. Rein, ohne DOM und ohne Netz. Beträge GANZE CENT (≥ 0), Daten 'JJJJ-MM-TT' (Wiener Datum). Die Rechnung (Verbrauch,
// Rest, Überschreitung, offene Erstattungen) steht in versicherung-rechnung.js.
//
// Im Speicher (lesbare Namen):
//   Versicherung { v: 1, polizze: Polizze | null, ab: erstes Jahr mit Rechnungen | null, fremd?: { k: [Kategorie roh] } }
//   Polizze      { id, name, person?, beginn, kategorien: [Kategorie], maximumCent, vorlage? }   vorlage = Schlüssel in POLIZZE_VORLAGEN
//   Kategorie    { id, name, info?, limitCent }   id = kurzer Schlüssel (a-z, 0-9), auf den die Rechnungen zeigen
//   Jahr-Teil    { v: 1, jahr, rechnungen: [Rechnung], fremd?: { r: [Rechnung roh] } }
//   Rechnung     { id, kategorie, datum (Rechnungsdatum), betragCent, eingereichtAm, erstattetCent?, erstattetAm?, stelle?, notiz? }
//                erstattetCent und erstattetAm gibt es nur zusammen („Erstattung erhalten“). Das Jahr einer Rechnung = Jahr von `datum`.
//
// Im Kalender zwei Arten versteckter Ereignisse (calendar/mapping.js), je ein JSON ≤ 6000 Zeichen mit KURZEN Schlüsseln:
//  1) Hauptteil „fkversicherung“: { v: 1, p?: Polizze, j?: erstes Jahr }
//     Polizze:   i=id n=name w=person b=beginn k=[Kategorie] m=maximumCent v=vorlage
//     Kategorie: i=id n=name o=info l=limitCent
//     j = das ERSTE Jahr mit einem Jahr-Teil – gelesen werden alle Jahre von dort bis heute, ein fehlender Teil zählt leer. So wächst
//     der Hauptteil nicht mit den Jahren (Lehre M3 aus den Autos).
//  2) Rechnungen je Jahr „fkvr<JJJJ>“: { v: 1, j: Jahr, r: [Rechnung] }
//     Rechnung:  i=id k=kategorie d=datum b=betragCent e=eingereichtAm r=erstattetCent t=erstattetAm s=stelle n=notiz
// Wie bei Fixkosten/Sparziele/Autos: Kategorien und Rechnungen, die diese Version nicht versteht (unbekanntes Feld – neuere Version –,
// beschädigt oder doppelte Kennung), bleiben roh in `fremd` und werden unverändert mitgeschrieben; unlesbarer Text (kein JSON, andere
// Version `v`, falscher Aufbau, eine Polizze, die selbst nicht verstanden wird, ein anderes Jahr im Text) ergibt `unlesbar: true` und
// darf NIE überschrieben werden. Neue Felder auf oberster Ebene oder in der Polizze → `v` erhöhen.
// Jede Änderung ist eine reine Funktion Daten → Daten (das Argument bleibt unverändert, zweimal angewendet = einmal angewendet), die
// nach HTTP 412 auf die NEUESTE Fassung angewendet wird. Zwei Telefone, die im selben Jahr Rechnungen eintragen, behalten beide.

import { addDays, heutePruefen, isValidDate } from './dates.js';

export const MAX_VERSICHERUNG_ZEICHEN = 6000; // wie Kontostand/Fixkosten/Sparziele/Autos: Google kürzt Beschreibungen still bei 8192 Zeichen
export const MAX_JAHR_ZEICHEN = 6000;
export const MAX_KATEGORIEN = 12;
export const MAX_POLIZZE_NAME = 40;
export const MAX_PERSON = 30;
export const MAX_KATEGORIE_NAME = 50;
export const MAX_KATEGORIE_INFO = 80;
export const MAX_STELLE = 40;
export const MAX_RECHNUNG_NOTIZ = 120;
export const MAX_BETRAG_CENT = 9_999_999; // 99.999,99 €

/** Friert ein Objekt samt allem darin ein (Vorlagen sind fest). */
function tiefFrieren(x) {
  if (x !== null && typeof x === 'object' && !Object.isFrozen(x)) {
    Object.values(x).forEach(tiefFrieren);
    Object.freeze(x);
  }
  return x;
}

// ---------------------------------------------------------------- Vorlagen

/**
 * Vorlagen für „… anlegen“. MedPLUS Privatarzt Basic (Wiener Städtische): Limits laut Polizze je Kalenderjahr (Spec §2; die Broschüre
 * online nennt andere, ältere Zahlen – darum sind alle Limits änderbar). `hinweis` wird nur angezeigt, nicht gerechnet (Quelle:
 * Sparkasse/Wiener Städtische). Kategorie-Kennungen sind fest, damit Rechnungen über Änderungen der Polizze hinweg zuordenbar bleiben.
 */
export const POLIZZE_VORLAGEN = tiefFrieren({
  medplusBasic: {
    id: 'medplusBasic',
    name: 'MedPLUS Privatarzt Basic',
    versicherer: 'Wiener Städtische',
    hinweis: 'Erstattet werden meist 80 %, wenn die ÖGK nichts zahlt, sonst die Differenz bis 100 %. Limits laut Polizze, je Kalenderjahr.',
    kategorien: [
      { id: 'arzt', name: 'Schul-/Alternativmedizin beim Privatarzt', limitCent: 160000 },
      { id: 'physio', name: 'Physiotherapie', info: 'inkl. Logopädie, Osteopathie', limitCent: 49000 },
      { id: 'psycho', name: 'Psychotherapie', limitCent: 41500 },
      { id: 'medi', name: 'Medikamente/Rezeptgebühren', limitCent: 41500 },
      { id: 'heil', name: 'Heilbehelfe', info: 'Brillen, Einlagen, Bandagen', limitCent: 22400 },
    ],
    maximumCent: 314400,
  },
});

// ---------------------------------------------------------------- Meldungen

export const TEXT_VERSICHERUNG_VOLL = 'Im Kalender ist kein Platz mehr für die Polizze – bitte Namen oder Hinweise der Kategorien kürzen.';
export const TEXT_JAHR_VOLL = 'In diesem Jahr ist kein Platz mehr für weitere Rechnungen – bitte Notizen oder „Arzt/Apotheke“ kürzen.';
export const TEXT_VERSICHERUNG_GESPERRT = 'Die Versicherung ist unlesbar (beschädigt oder von einer neueren App-Version). Damit nichts verloren geht, lässt sie sich hier nicht ändern – bitte die App auf beiden Telefonen aktualisieren.';
export const TEXT_JAHR_GESPERRT = 'Die Rechnungen dieses Jahres sind unlesbar (beschädigt oder von einer neueren App-Version). Damit nichts verloren geht, lassen sie sich hier nicht ändern – bitte die App auf beiden Telefonen aktualisieren.';
export const TEXT_POLIZZE_WEG = 'Diese Polizze gibt es nicht mehr.';
export const TEXT_RECHNUNG_WEG = 'Diese Rechnung gibt es nicht mehr.';
const TEXT_KENNUNG_NEUER = 'Diese Kennung gehört einem Eintrag einer neueren App-Version – bitte die App aktualisieren.';
const TEXT_BETRAG = 'Bitte einen Betrag von 0 € bis 99.999,99 € eingeben.';

/** Fehler „Versicherung gesperrt“ (Name 'VersicherungGesperrt'): ein Adapter wirft ihn, statt einen unlesbaren Hauptteil zu überschreiben. */
export const versicherungGesperrtFehler = () => Object.assign(new Error(TEXT_VERSICHERUNG_GESPERRT), { name: 'VersicherungGesperrt' });
/** Fehler „Jahr gesperrt“ (Name 'VersicherungJahrGesperrt'): ein Adapter wirft ihn, statt einen unlesbaren Jahr-Teil zu überschreiben. */
export const jahrGesperrtFehler = () => Object.assign(new Error(TEXT_JAHR_GESPERRT), { name: 'VersicherungJahrGesperrt' });

// ---------------------------------------------------------------- Hilfen

const KENNUNG = /^[0-9a-v]{4,16}$/;
const KATEGORIE_KENNUNG = /^[a-z0-9]{1,16}$/;
const VORLAGE_SCHLUESSEL = /^[A-Za-z0-9-]{1,30}$/;
const ID_ZEICHEN = '0123456789abcdefghijklmnopqrstuv';
const ID_LAENGE = 8;
const MIN_JAHR = 2000;
const MAX_JAHR = 2100;

/** Bereinigter Text; was kein Text ist, ergibt '' – nie ein Fehler. */
const sauber = (text) => (typeof text === 'string' ? text.normalize('NFC').replace(/\s+/g, ' ').trim() : '');
const zeichen = (text) => [...text].length;
const istObjekt = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const istKennung = (x) => typeof x === 'string' && KENNUNG.test(x);
const istKategorieKennung = (x) => typeof x === 'string' && KATEGORIE_KENNUNG.test(x);
const istDatum = (x) => typeof x === 'string' && isValidDate(x);
const leer = (x) => x === undefined || x === null || x === '';
const istCent = (x) => Number.isInteger(x) && x >= 0 && x <= MAX_BETRAG_CENT;
const istJahr = (j) => Number.isInteger(j) && j >= MIN_JAHR && j <= MAX_JAHR;
const fremdeKennung = (liste, id) => (liste ?? []).some((k) => k?.i === id);
const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const datumText = (d) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;

/** Neue Kennung aus 0-9 und a-v (8 Zeichen) für Polizze und Rechnungen. `zufall` wie Math.random (für Tests). */
export function neueVersicherungId(zufall = Math.random) {
  let id = '';
  for (let i = 0; i < ID_LAENGE; i += 1) id += ID_ZEICHEN[Math.floor(zufall() * ID_ZEICHEN.length) % ID_ZEICHEN.length];
  return id;
}

/** Das Jahr einer Rechnung = das Jahr ihres Rechnungsdatums. */
export const rechnungJahr = (rechnung) => Number(rechnung.datum.slice(0, 4));

/** Gültige Einträge (der erste je Kennung gilt) und die nicht verstandenen roh – auch doppelte Kennungen: sie bleiben so erhalten. */
function trenne(liste, lang) {
  const gut = [];
  const fremd = [];
  const ids = new Set();
  for (const k of liste) {
    const x = lang(k);
    if (!x || ids.has(x.id)) fremd.push(k);
    else {
      ids.add(x.id);
      gut.push(x);
    }
  }
  return { gut, fremd };
}

const eingefuegt = (liste, eintrag, stelle) => {
  const i = Math.min(Math.max(0, Number.isInteger(stelle) ? stelle : liste.length), liste.length);
  return [...liste.slice(0, i), eintrag, ...liste.slice(i)];
};

/** Ersetzt den Eintrag mit derselben Kennung an seiner Stelle oder hängt ihn an; gleich → null (nichts zu tun). */
function setzeIn(liste, neu) {
  const i = liste.findIndex((x) => x.id === neu.id);
  if (i < 0) return [...liste, neu];
  if (gleich(liste[i], neu)) return null;
  return liste.map((x, j) => (j === i ? neu : x));
}

// ---------------------------------------------------------------- Polizze

/** Prüft eine Kategorie → erste Fehlermeldung oder null. */
function kategoriePruefen(k) {
  if (!istObjekt(k)) return 'Ungültige Kategorie.';
  if (!istKategorieKennung(k.id)) return 'Ungültige Kennung einer Kategorie.';
  const name = sauber(k.name);
  if (name === '' || typeof k.name !== 'string') return 'Bitte einen Namen für jede Kategorie eingeben.';
  if (zeichen(name) > MAX_KATEGORIE_NAME) return `Der Name einer Kategorie darf höchstens ${MAX_KATEGORIE_NAME} Zeichen haben.`;
  if (!leer(k.info) && typeof k.info !== 'string') return 'Ungültiger Hinweis bei einer Kategorie.';
  if (zeichen(sauber(k.info)) > MAX_KATEGORIE_INFO) return `Der Hinweis einer Kategorie darf höchstens ${MAX_KATEGORIE_INFO} Zeichen haben.`;
  if (!istCent(k.limitCent)) return `Bitte bei „${name}“ ein Limit von 0 € bis 99.999,99 € eingeben.`;
  return null;
}

function normalisiereKategorie(k) {
  if (kategoriePruefen(k) !== null) return null;
  const n = { id: k.id, name: sauber(k.name) };
  const info = sauber(k.info);
  if (info !== '') n.info = info;
  n.limitCent = k.limitCent;
  return n;
}

/** Prüft alles an der Polizze außer den Kategorien → erste Fehlermeldung oder null. */
function kopfPruefen(e) {
  const name = sauber(e.name);
  if (name === '' || typeof e.name !== 'string') return 'Bitte einen Namen eingeben.';
  if (zeichen(name) > MAX_POLIZZE_NAME) return `Der Name darf höchstens ${MAX_POLIZZE_NAME} Zeichen haben.`;
  if (!leer(e.person) && typeof e.person !== 'string') return 'Ungültige Angabe bei „Person“.';
  if (zeichen(sauber(e.person)) > MAX_PERSON) return `Die Person darf höchstens ${MAX_PERSON} Zeichen haben.`;
  if (!istDatum(e.beginn)) return 'Bitte den Beginn der Polizze als gültiges Datum angeben.';
  if (!istCent(e.maximumCent)) return 'Bitte ein Maximum von 0 € bis 99.999,99 € eingeben.';
  if (!leer(e.vorlage) && !(typeof e.vorlage === 'string' && VORLAGE_SCHLUESSEL.test(e.vorlage))) return 'Ungültige Vorlage.';
  if (e.id !== undefined && !istKennung(e.id)) return 'Ungültige Kennung.';
  return null;
}

/**
 * Prüft eine Polizze (Formular oder gelesen) → erste Fehlermeldung (deutsch) oder null. Pflicht: Name, Beginn, Maximum und 1 bis
 * MAX_KATEGORIEN Kategorien mit verschiedenen Kennungen; Person freiwillig. Die Kennung darf fehlen; ist sie da, muss sie gültig sein.
 */
export function polizzePruefen(entwurf) {
  const e = istObjekt(entwurf) ? entwurf : {};
  const kopf = kopfPruefen(e);
  if (kopf) return kopf;
  if (!Array.isArray(e.kategorien) || e.kategorien.length === 0) return 'Bitte wenigstens eine Kategorie angeben.';
  if (e.kategorien.length > MAX_KATEGORIEN) return `Höchstens ${MAX_KATEGORIEN} Kategorien.`;
  const ids = new Set();
  for (const k of e.kategorien) {
    const f = kategoriePruefen(k);
    if (f) return f;
    if (ids.has(k.id)) return `Die Kategorie „${sauber(k.name)}“ ist doppelt.`;
    ids.add(k.id);
  }
  return null;
}

function normalisiereKopf(roh) {
  const p = { id: roh.id, name: sauber(roh.name) };
  const person = sauber(roh.person);
  if (person !== '') p.person = person;
  p.beginn = roh.beginn;
  return p;
}
const mitSchluss = (p, roh) => {
  p.maximumCent = roh.maximumCent;
  if (!leer(roh.vorlage)) p.vorlage = roh.vorlage;
  return p;
};

/** Eine gültige Polizze mit Kennung → bereinigt in fester Feldreihenfolge (leere Felder und Zusatzfelder fallen weg); sonst null. */
export function normalisierePolizze(roh) {
  if (polizzePruefen(roh) !== null || !istKennung(roh.id)) return null;
  const p = normalisiereKopf(roh);
  p.kategorien = roh.kategorien.map(normalisiereKategorie);
  return mitSchluss(p, roh);
}

const kurzKategorie = (k) => (k.info ? { i: k.id, n: k.name, o: k.info, l: k.limitCent } : { i: k.id, n: k.name, l: k.limitCent });
const KATEGORIE_SCHLUESSEL = new Set(['i', 'n', 'o', 'l']);
function langKategorie(k) {
  if (!istObjekt(k) || Object.keys(k).some((s) => !KATEGORIE_SCHLUESSEL.has(s))) return null;
  return normalisiereKategorie({ id: k.i, name: k.n, info: k.o, limitCent: k.l });
}

function kurzPolizze(p, fremdeKategorien = []) {
  const k = { i: p.id, n: p.name };
  if (p.person) k.w = p.person;
  k.b = p.beginn;
  k.k = [...p.kategorien.map(kurzKategorie), ...fremdeKategorien];
  k.m = p.maximumCent;
  if (p.vorlage) k.v = p.vorlage;
  return k;
}

const POLIZZE_SCHLUESSEL = new Set(['i', 'n', 'w', 'b', 'k', 'm', 'v']);

/** Polizze aus dem Kalender → { polizze, fremd: [Kategorie roh] } oder null (dann ist der ganze Hauptteil unlesbar). */
function langPolizze(k) {
  if (!istObjekt(k) || Object.keys(k).some((s) => !POLIZZE_SCHLUESSEL.has(s)) || !Array.isArray(k.k)) return null;
  const roh = { id: k.i, name: k.n, person: k.w, beginn: k.b, maximumCent: k.m, vorlage: k.v };
  if (!istKennung(roh.id) || kopfPruefen(roh) !== null) return null;
  const kat = trenne(k.k, langKategorie);
  const polizze = normalisiereKopf(roh);
  polizze.kategorien = kat.gut;
  return { polizze: mitSchluss(polizze, roh), fremd: kat.fremd };
}

/** Die Vorlage einer Polizze (für den Hinweis) oder null. */
export function polizzeVorlage(polizze) {
  const id = polizze?.vorlage;
  return typeof id === 'string' && Object.hasOwn(POLIZZE_VORLAGEN, id) ? POLIZZE_VORLAGEN[id] : null;
}

/**
 * Eine neue Polizze aus einer Vorlage (nicht rein: vergibt die Kennung mit `zufall`) für polizzeAnlegen. `felder` setzen Person und
 * Beginn (Pflicht) und dürfen Name, Limits (kategorien) und Maximum überschreiben. Wirft bei unbekannter Vorlage oder ungültigen Feldern.
 */
export function polizzeAusVorlage(vorlageId, felder = {}, { zufall = Math.random } = {}) {
  const v = typeof vorlageId === 'string' && Object.hasOwn(POLIZZE_VORLAGEN, vorlageId) ? POLIZZE_VORLAGEN[vorlageId] : null;
  if (!v) throw new Error('Unbekannte Vorlage.');
  const roh = { name: v.name, kategorien: v.kategorien.map((k) => ({ ...k })), maximumCent: v.maximumCent, ...felder, id: neueVersicherungId(zufall), vorlage: v.id };
  const fehler = polizzePruefen(roh);
  if (fehler) throw new Error(fehler);
  return normalisierePolizze(roh);
}

// ---------------------------------------------------------------- Hauptteil: lesen und schreiben

export const leereVersicherung = () => ({ v: 1, polizze: null, ab: null });

const mitFremd = (d, fremd) => (fremd?.k?.length > 0 ? { ...d, fremd: { k: fremd.k } } : d);
const baueVersicherung = (alt, polizze, ab) => mitFremd({ v: 1, polizze, ab }, polizze ? alt?.fremd : undefined);

/** Die Daten als Text für das Ereignis „fkversicherung“ (kurze Schlüssel, fremde Kategorien am Ende); zu voll → TEXT_VERSICHERUNG_VOLL. */
export function versicherungText(daten) {
  const polizze = daten?.polizze ? normalisierePolizze(daten.polizze) : null;
  const roh = { v: 1 };
  if (polizze) roh.p = kurzPolizze(polizze, daten.fremd?.k ?? []);
  if (istJahr(daten?.ab)) roh.j = daten.ab;
  const text = JSON.stringify(roh);
  if (text.length > MAX_VERSICHERUNG_ZEICHEN) throw new Error(TEXT_VERSICHERUNG_VOLL);
  return text;
}

/**
 * Text aus dem Kalender → { daten, unlesbar }. Wirft nie. Fehlender Text → leere Daten. Unlesbar (kein JSON, andere Version, eine
 * Polizze, deren eigene Felder diese Version nicht versteht, `j` kein gültiges Jahr) → leere Daten mit `unlesbar: true`: NIE
 * überschreiben (siehe versicherungGesperrtFehler). Nicht verstandene Kategorien → `daten.fremd.k` (roh, bleiben erhalten).
 */
export function pruefeVersicherung(text) {
  if (typeof text !== 'string' || text.trim() === '') return { daten: leereVersicherung(), unlesbar: false };
  let roh;
  try {
    roh = JSON.parse(text);
  } catch {
    roh = null;
  }
  const kaputt = { daten: leereVersicherung(), unlesbar: true };
  if (!istObjekt(roh) || roh.v !== 1 || Object.keys(roh).some((s) => !['v', 'p', 'j'].includes(s))) return kaputt;
  if (roh.j !== undefined && !istJahr(roh.j)) return kaputt;
  let polizze = null;
  let fremd;
  if (roh.p !== undefined && roh.p !== null) {
    const p = langPolizze(roh.p);
    if (!p) return kaputt;
    polizze = p.polizze;
    fremd = { k: JSON.parse(JSON.stringify(p.fremd)) };
  }
  return { daten: baueVersicherung({ fremd }, polizze, roh.j ?? null), unlesbar: false };
}

const anzahl = (n, eins, mehr) => `${n} ${n === 1 ? eins : mehr}`;

/** Hinweise zum Gelesenen ({ daten, unlesbar } wie aus pruefeVersicherung) für die Anzeige; nichts → []. */
export function versicherungWarnungen({ daten, unlesbar } = {}) {
  if (unlesbar) return ['Die Versicherung ist unlesbar (beschädigt oder von einer neueren App-Version); sie wird leer gezeigt und lässt sich nicht ändern.'];
  const n = daten?.fremd?.k?.length ?? 0;
  return n > 0 ? [`${anzahl(n, 'Kategorie konnte', 'Kategorien konnten')} nicht gelesen werden (beschädigt oder von einer neueren App-Version); ${n === 1 ? 'sie bleibt' : 'sie bleiben'} gespeichert, ${n === 1 ? 'wird' : 'werden'} hier aber nicht gezeigt.`] : [];
}

// ---------------------------------------------------------------- Änderungen am Hauptteil (rein, wiederholbar)

/** Neue Daten; wirft TEXT_VERSICHERUNG_VOLL, wenn sie nicht mehr in den Kalender passen. */
function mitVersicherung(alt, { polizze = alt.polizze, ab = alt.ab } = {}) {
  const neu = baueVersicherung(alt, polizze, ab);
  versicherungText(neu);
  return neu;
}

function polizzeOderFehler(polizze) {
  if (!istObjekt(polizze) || !istKennung(polizze.id)) throw new Error('Ungültige Kennung.');
  const fehler = polizzePruefen(polizze);
  if (fehler) throw new Error(fehler);
  return normalisierePolizze(polizze);
}

/**
 * Legt die Polizze an. Gibt es schon eine (dieselbe oder – zwei Telefone gleichzeitig – eine andere) → dieselben Daten: die zuerst
 * gespeicherte gilt. Wirft mit der Meldung aus polizzePruefen.
 */
export function polizzeAnlegen(daten, polizze) {
  const neu = polizzeOderFehler(polizze);
  if (daten.polizze) return daten;
  return mitVersicherung(daten, { polizze: neu });
}

/**
 * Ändert die bestehende Polizze (gleiche Kennung; sonst TEXT_POLIZZE_WEG): Name, Person, Beginn, Kategorien, Limits, Maximum. Gleich →
 * dieselben Daten. Nicht verstandene Kategorien bleiben erhalten; eine neue Kategorie mit deren Kennung wird abgelehnt.
 */
export function polizzeAendern(daten, polizze) {
  const neu = polizzeOderFehler(polizze);
  const alt = daten.polizze;
  if (!alt || alt.id !== neu.id) throw new Error(TEXT_POLIZZE_WEG);
  if (gleich(alt, neu)) return daten;
  const bekannt = new Set(alt.kategorien.map((k) => k.id));
  if (neu.kategorien.some((k) => !bekannt.has(k.id) && fremdeKennung(daten.fremd?.k, k.id))) throw new Error(TEXT_KENNUNG_NEUER);
  if (neu.kategorien.length + (daten.fremd?.k?.length ?? 0) > MAX_KATEGORIEN) throw new Error(`Höchstens ${MAX_KATEGORIEN} Kategorien.`);
  return mitVersicherung(daten, { polizze: neu });
}

/**
 * Stellt sicher, dass der Hauptteil den Jahr-Teil `jahr` kennt (vor dem ersten Schreiben in dieses Jahr): ist `jahr` früher als das
 * gemerkte erste Jahr (oder gibt es keins), wird es das neue erste Jahr; sonst dieselben Daten.
 */
export function versicherungJahrEintragen(daten, jahr) {
  if (!istJahr(jahr)) throw new Error('Ungültiges Jahr.');
  if (istJahr(daten.ab) && daten.ab <= jahr) return daten;
  return mitVersicherung(daten, { ab: jahr });
}

/** Kennt der Hauptteil den Jahr-Teil `jahr` (erstes Jahr ≤ jahr)? */
export const versicherungJahrBekannt = (daten, jahr) => istJahr(daten?.ab) && daten.ab <= jahr;

// ---------------------------------------------------------------- Rechnung

const RECHNUNG_SCHLUESSEL = new Set(['i', 'k', 'd', 'b', 'e', 'r', 't', 's', 'n']);

/** Aufbau einer Rechnung ohne „heute“ und ohne Polizze → { rechnung (bereinigt, ohne id) } oder { fehler }. */
function rechnungLesen(e) {
  if (leer(e.kategorie)) return { fehler: 'Bitte eine Kategorie wählen.' };
  if (!istKategorieKennung(e.kategorie)) return { fehler: 'Ungültige Kategorie.' };
  if (!istDatum(e.datum)) return { fehler: 'Bitte ein gültiges Rechnungsdatum eingeben.' };
  if (!istCent(e.betragCent)) return { fehler: TEXT_BETRAG };
  if (!istDatum(e.eingereichtAm)) return { fehler: 'Bitte ein gültiges Datum bei „Eingereicht am“ eingeben.' };
  if (e.eingereichtAm < e.datum) return { fehler: 'Das Einreichdatum liegt vor dem Rechnungsdatum.' };
  const mitErstattung = !leer(e.erstattetCent) || !leer(e.erstattetAm);
  if (mitErstattung) {
    if (leer(e.erstattetCent) || leer(e.erstattetAm)) return { fehler: 'Bitte bei der Erstattung Betrag und Datum angeben.' };
    if (!istCent(e.erstattetCent)) return { fehler: 'Bitte bei der Erstattung einen Betrag von 0 € bis 99.999,99 € eingeben.' };
    if (!istDatum(e.erstattetAm)) return { fehler: 'Bitte bei der Erstattung ein gültiges Datum eingeben.' };
    if (e.erstattetAm < e.eingereichtAm) return { fehler: 'Die Erstattung kann nicht vor dem Einreichen liegen.' };
  }
  if (!leer(e.stelle) && typeof e.stelle !== 'string') return { fehler: 'Ungültige Angabe bei „Arzt/Apotheke“.' };
  const stelle = sauber(e.stelle);
  if (zeichen(stelle) > MAX_STELLE) return { fehler: `„Arzt/Apotheke“ darf höchstens ${MAX_STELLE} Zeichen haben.` };
  if (!leer(e.notiz) && typeof e.notiz !== 'string') return { fehler: 'Ungültige Notiz.' };
  const notiz = sauber(e.notiz);
  if (zeichen(notiz) > MAX_RECHNUNG_NOTIZ) return { fehler: `Die Notiz darf höchstens ${MAX_RECHNUNG_NOTIZ} Zeichen haben.` };
  const r = { kategorie: e.kategorie, datum: e.datum, betragCent: e.betragCent, eingereichtAm: e.eingereichtAm };
  if (mitErstattung) {
    r.erstattetCent = e.erstattetCent;
    r.erstattetAm = e.erstattetAm;
  }
  if (stelle !== '') r.stelle = stelle;
  if (notiz !== '') r.notiz = notiz;
  return { rechnung: r };
}

/** Datum höchstens 1 Tag nach `heute` (Zeitzonen) → null, sonst `text`. */
const zukunft = (datum, heute, text) => (datum !== undefined && istDatum(datum) && datum > addDays(heute, 1) ? text : null);

/**
 * Prüft eine Rechnung am Tag `heute` (Pflicht) → { fehler, warnung }: fehler = erste Meldung oder null (ein Datum mehr als 1 Tag in der
 * Zukunft ist ein Fehler; mit `polizze` muss die Kategorie eine ihrer Kategorien sein); warnung = Hinweis, der nicht aufhält (Erstattung
 * höher als der Rechnungsbetrag; Rechnungsdatum vor dem Beginn der Polizze) oder null.
 */
export function rechnungPruefen(entwurf, { heute, polizze } = {}) {
  heutePruefen(heute);
  const e = istObjekt(entwurf) ? entwurf : {};
  const r = rechnungLesen(e);
  const fehler =
    r.fehler ??
    zukunft(e.datum, heute, 'Das Rechnungsdatum liegt in der Zukunft.') ??
    zukunft(e.eingereichtAm, heute, 'Das Einreichdatum liegt in der Zukunft.') ??
    zukunft(e.erstattetAm, heute, 'Das Datum der Erstattung liegt in der Zukunft.') ??
    (polizze && !(polizze.kategorien ?? []).some((k) => k.id === e.kategorie) ? 'Bitte eine Kategorie aus der Polizze wählen.' : null) ??
    (e.id !== undefined && !istKennung(e.id) ? 'Ungültige Kennung.' : null);
  if (fehler) return { fehler, warnung: null };
  let warnung = null;
  if (r.rechnung.erstattetCent !== undefined && r.rechnung.erstattetCent > r.rechnung.betragCent) warnung = 'Die Erstattung ist höher als der Rechnungsbetrag – bitte prüfen. Gespeichert wird sie trotzdem.';
  else if (polizze && istDatum(polizze.beginn) && e.datum < polizze.beginn) warnung = `Das Rechnungsdatum liegt vor dem Beginn der Polizze (${datumText(polizze.beginn)}).`;
  return { fehler: null, warnung };
}

/** Eine gültige Rechnung (mit Kennung) → bereinigt; sonst null. Ohne „heute“ und ohne Polizze (gelesene Daten). */
export function normalisiereRechnung(roh) {
  if (!istObjekt(roh) || !istKennung(roh.id)) return null;
  const r = rechnungLesen(roh);
  return r.fehler ? null : { id: roh.id, ...r.rechnung };
}

function kurzRechnung(r) {
  const k = { i: r.id, k: r.kategorie, d: r.datum, b: r.betragCent, e: r.eingereichtAm };
  if (r.erstattetCent !== undefined) {
    k.r = r.erstattetCent;
    k.t = r.erstattetAm;
  }
  if (r.stelle) k.s = r.stelle;
  if (r.notiz) k.n = r.notiz;
  return k;
}
function langRechnung(k) {
  if (!istObjekt(k) || Object.keys(k).some((s) => !RECHNUNG_SCHLUESSEL.has(s))) return null;
  // kurz gespeicherte Beträge müssen schon Zahlen sein (Text „100“ käme nur von einer fremden Version)
  if (typeof k.b !== 'number' || (k.r !== undefined && typeof k.r !== 'number')) return null;
  return normalisiereRechnung({ id: k.i, kategorie: k.k, datum: k.d, betragCent: k.b, eingereichtAm: k.e, erstattetCent: k.r, erstattetAm: k.t, stelle: k.s, notiz: k.n });
}

// ---------------------------------------------------------------- Jahr-Teil: lesen und schreiben

export const leeresJahr = (jahr) => ({ v: 1, jahr, rechnungen: [] });
const baueJahr = (alt, rechnungen) => (alt.fremd?.r?.length > 0 ? { v: 1, jahr: alt.jahr, rechnungen, fremd: { r: alt.fremd.r } } : { v: 1, jahr: alt.jahr, rechnungen });

/** Der Jahr-Teil als Text für „fkvr<JJJJ>“ (kurze Schlüssel, fremde Rechnungen am Ende); zu voll → TEXT_JAHR_VOLL. */
export function jahrText(teil) {
  const t = teil ?? {};
  if (!istJahr(t.jahr)) throw new Error('Ungültiges Jahr.');
  const rechnungen = (t.rechnungen ?? []).map(normalisiereRechnung).filter(Boolean);
  const text = JSON.stringify({ v: 1, j: t.jahr, r: [...rechnungen.map(kurzRechnung), ...(t.fremd?.r ?? [])] });
  if (text.length > MAX_JAHR_ZEICHEN) throw new Error(TEXT_JAHR_VOLL);
  return text;
}

/**
 * Text eines Jahr-Teils → { teil, unlesbar }. Wirft nie. `jahr` = welches Jahr der Teil sein soll (aus der Ereignis-Kennung): fehlender
 * Text → leerer Teil; kein JSON, andere Version, falscher Aufbau oder ein anderes Jahr im Text → leerer Teil mit `unlesbar: true` (NIE
 * überschreiben, siehe jahrGesperrtFehler). Nicht verstandene oder doppelte Rechnungen → `teil.fremd.r` (roh, bleiben erhalten).
 */
export function pruefeJahr(text, { jahr } = {}) {
  const leerTeil = leeresJahr(jahr);
  if (typeof text !== 'string' || text.trim() === '') return { teil: leerTeil, unlesbar: false };
  let roh;
  try {
    roh = JSON.parse(text);
  } catch {
    roh = null;
  }
  const ok = istObjekt(roh) && roh.v === 1 && istJahr(roh.j) && Array.isArray(roh.r) && Object.keys(roh).every((s) => ['v', 'j', 'r'].includes(s));
  if (!ok || (jahr !== undefined && roh.j !== jahr)) return { teil: leerTeil, unlesbar: true };
  const r = trenne(roh.r, langRechnung);
  return { teil: baueJahr({ jahr: roh.j, fremd: { r: JSON.parse(JSON.stringify(r.fremd)) } }, r.gut), unlesbar: false };
}

/** Hinweis, wenn in einem Jahr-Teil etwas nicht verstanden wurde (bleibt gespeichert) oder er unlesbar ist; sonst []. */
export function jahrWarnungen({ teil, unlesbar } = {}) {
  if (unlesbar) return [`Die Rechnungen${teil?.jahr ? ` ${teil.jahr}` : ''} sind unlesbar (beschädigt oder von einer neueren App-Version); sie werden leer gezeigt und lassen sich nicht ändern.`];
  const n = teil?.fremd?.r?.length ?? 0;
  return n > 0 ? [`${anzahl(n, 'Eintrag', 'Einträge')} im Jahr ${teil.jahr} ${n === 1 ? 'konnte' : 'konnten'} nicht gelesen werden; ${n === 1 ? 'er bleibt' : 'sie bleiben'} gespeichert.`] : [];
}

// ---------------------------------------------------------------- Änderungen am Jahr-Teil (rein, wiederholbar)

function mitJahr(alt, rechnungen) {
  const neu = baueJahr(alt, rechnungen);
  jahrText(neu);
  return neu;
}

function rechnungOderFehler(rechnung, opts) {
  if (!istObjekt(rechnung) || !istKennung(rechnung.id)) throw new Error('Ungültige Kennung.');
  const { fehler } = rechnungPruefen(rechnung, opts);
  if (fehler) throw new Error(fehler);
  return normalisiereRechnung(rechnung);
}

/**
 * Trägt eine Rechnung ein oder ändert die mit derselben Kennung (an derselben Stelle). Sie muss ins Jahr des Teils gehören (ein
 * geändertes Jahr: rechnungJahrWechseln). Wirft mit der Meldung aus rechnungPruefen (`heute` Pflicht, `polizze` freiwillig);
 * Warnungen halten nicht auf. Gleich → derselbe Teil.
 */
export function rechnungSetzen(teil, rechnung, { heute, polizze } = {}) {
  const neu = rechnungOderFehler(rechnung, { heute, polizze });
  if (rechnungJahr(neu) !== teil.jahr) throw new Error('Diese Rechnung gehört in ein anderes Jahr.');
  const liste = teil.rechnungen ?? [];
  if (!liste.some((r) => r.id === neu.id) && fremdeKennung(teil.fremd?.r, neu.id)) throw new Error(TEXT_KENNUNG_NEUER);
  const rechnungen = setzeIn(liste, neu);
  return rechnungen ? mitJahr(teil, rechnungen) : teil;
}

/**
 * „Erstattung erhalten“: setzt NUR erstattetCent und erstattetAm der Rechnung `id` in der neuesten Fassung (was das andere Telefon an
 * ihr geändert hat, bleibt); `erstattung` null entfernt die Erstattung. Fehlt die Rechnung → TEXT_RECHNUNG_WEG. Gleich → derselbe Teil.
 */
export function erstattungSetzen(teil, id, erstattung, { heute } = {}) {
  const alt = (teil.rechnungen ?? []).find((r) => r.id === id);
  if (!alt) throw new Error(TEXT_RECHNUNG_WEG);
  const { erstattetCent: _c, erstattetAm: _a, ...ohne } = alt;
  const neu = erstattung === null ? ohne : { ...ohne, erstattetCent: erstattung?.erstattetCent, erstattetAm: erstattung?.erstattetAm };
  return rechnungSetzen(teil, neu, { heute });
}

/** Löscht eine Rechnung; unbekannt → derselbe Teil. */
export function rechnungLoeschen(teil, id) {
  const liste = teil.rechnungen ?? [];
  if (!liste.some((r) => r.id === id)) return teil;
  return baueJahr(teil, liste.filter((r) => r.id !== id));
}

/** Was rechnungLoeschen entfernt – für „Rückgängig“: { rechnung, stelle }; unbekannt → null. */
export function rechnungSpur(teil, id) {
  const stelle = (teil?.rechnungen ?? []).findIndex((r) => r.id === id);
  return stelle < 0 ? null : { rechnung: teil.rechnungen[stelle], stelle };
}

/** „Rückgängig“ nach rechnungLoeschen: dieselbe Rechnung an ihrer alten Stelle (ohne Zukunfts-Prüfung). Schon da → derselbe Teil. */
export function rechnungWiederherstellen(teil, spur) {
  const r = normalisiereRechnung(spur?.rechnung);
  if (!r || rechnungJahr(r) !== teil.jahr) throw new Error('Ungültige Rechnung.');
  const liste = teil.rechnungen ?? [];
  if (liste.some((x) => x.id === r.id)) return teil;
  if (fremdeKennung(teil.fremd?.r, r.id)) throw new Error(TEXT_KENNUNG_NEUER);
  return mitJahr(teil, eingefuegt(liste, r, spur.stelle));
}

/**
 * Eine Rechnung, deren Rechnungsdatum jetzt in einem anderen Jahr liegt als `vonJahr` (dem Teil, in dem sie steht), wandert dorthin.
 * Zwei Ereignisse sind betroffen, darum kommt ein Plan aus zwei reinen, wiederholbaren Schritten zurück:
 *   { vonJahr, nachJahr, inNeu: (teil von nachJahr) → teil mit der Rechnung, ausAlt: (teil von vonJahr) → teil ohne sie }
 * Reihenfolge beim Schreiben: ERST inNeu, DANN ausAlt – bricht es dazwischen ab, steht die Rechnung höchstens doppelt (sichtbar), nie
 * gar nicht. Vor inNeu muss der Hauptteil das neue Jahr kennen (versicherungJahrEintragen). Gleiches Jahr → null (rechnungSetzen
 * genügt). Ungültige Rechnung → wirft sofort (Meldung aus rechnungPruefen).
 */
export function rechnungJahrWechseln(rechnung, vonJahr, { heute, polizze } = {}) {
  if (!istJahr(vonJahr)) throw new Error('Ungültiges Jahr.');
  const neu = rechnungOderFehler(rechnung, { heute, polizze });
  const nachJahr = rechnungJahr(neu);
  if (nachJahr === vonJahr) return null;
  return {
    vonJahr,
    nachJahr,
    inNeu: (teil) => rechnungSetzen(teil, neu, { heute, polizze }),
    ausAlt: (teil) => rechnungLoeschen(teil, neu.id),
  };
}
