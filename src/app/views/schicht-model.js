// Ansicht des Schichtplans (ohne DOM): ein Monat als Raster Montag bis Sonntag mit zwei Streifen je Tag (oben Papa, unten Mama),
// Marken für Zusatz (z. B. DB) und Notiz, die Zählung je Person und die Legende. Dazu der Filter „Beide · Papa · Mama“,
// den sich jedes Telefon selbst merkt (localStorage).
import { addDays, eachDay, weekday } from '../../domain/dates.js';
import { feiertagName } from '../../domain/feiertage.js';
import { monatVor } from '../../domain/konto.js';
import { PALETTE, SCHICHT_PERSONEN, aktiveArten, artAendern, artFuer, artHinzufuegen, istNacht, monatZaehlung, schichtAm, standardKatalog, tageImMonat } from '../../domain/schicht.js';
import { WOCHENTAGE_KURZ, datumLang, monatTitel } from '../format-de.js';

export const SCHICHT_FILTER = Object.freeze(['beide', 'papa', 'mama']);
export const SCHICHT_FILTER_SCHLUESSEL = 'fk.schicht.filter.v1';

const gueltigerFilter = (filter) => (SCHICHT_FILTER.includes(filter) ? filter : 'beide');
const pad2 = (n) => String(n).padStart(2, '0');

/** Gemerkter Filter dieses Telefons; ohne Speicher, bei Unsinn oder Fehlern „beide“. */
export function schichtFilterLesen(speicher = globalThis.localStorage) {
  try {
    return gueltigerFilter(speicher?.getItem(SCHICHT_FILTER_SCHLUESSEL));
  } catch {
    return 'beide';
  }
}

/** Merkt den Filter (Fehler des Speichers, z. B. im privaten Modus, stören nicht) und gibt den gültigen Wert zurück. */
export function schichtFilterSpeichern(filter, speicher = globalThis.localStorage) {
  const wert = gueltigerFilter(filter);
  try {
    speicher?.setItem(SCHICHT_FILTER_SCHLUESSEL, wert);
  } catch {
    // dann eben nur bis zum Neuladen
  }
  return wert;
}

/** Die angezeigten Personen zum Filter, in fester Reihenfolge (oben Papa, unten Mama). */
export const personenFuer = (filter) => (gueltigerFilter(filter) === 'beide' ? [...SCHICHT_PERSONEN] : [gueltigerFilter(filter)]);

const zeitenText = (art) => (art.von && art.bis ? `${art.von}–${art.bis}` : null);
/** Muster einer Art für die Anzeige: 'urlaub' oder 'offen' (beide gestreift, z. B. Ersatzdienst E), sonst null. */
const musterVon = (art) => art.muster ?? null;

/** Ein Streifen für den Schlüssel `k`; eine Art, die der Katalog (noch) nicht kennt, wird grau mit „?“ gezeigt – verloren geht nichts. */
function streifen(katalog, person, k) {
  if (k === null) return null;
  const art = artFuer(katalog, person, k);
  if (!art) return { k, kuerzel: '?', name: 'Unbekannte Art', farbe: 'grau', nacht: false, muster: null, unbekannt: true };
  return { k, kuerzel: art.kuerzel, name: art.name, farbe: art.farbe, nacht: istNacht(art), muster: musterVon(art), unbekannt: false };
}

/** Marke oben rechts: der erste Zusatz der angezeigten Personen (Papa vor Mama); `weitere` = Anzahl der übrigen (Anzeige „+1“), `mehr` = es gibt welche. */
function zusatzMarke(monat, katalog, personen, tag) {
  const alle = personen.flatMap((person) => (monat.z?.[person]?.[tag] ?? []).map((z) => ({ person, ...z })));
  if (alle.length === 0) return null;
  const erste = alle[0];
  const art = artFuer(katalog, erste.person, erste.k);
  return { kuerzel: art?.kuerzel ?? '?', farbe: art?.farbe ?? 'grau', mehr: alle.length > 1, weitere: alle.length - 1 };
}

/** „20 Dienste · 4× F · 4× N · 5× U“ (Katalog-Reihenfolge; Urlaub ist kein Dienst) oder „Noch nichts eingetragen“. */
function zaehlungText(monat, katalog, person) {
  const { dienste, jeArt } = monatZaehlung(monat, katalog, person);
  if (jeArt.length === 0) return 'Noch nichts eingetragen';
  return [`${dienste} ${dienste === 1 ? 'Dienst' : 'Dienste'}`, ...jeArt.map((e) => `${e.anzahl}× ${e.kuerzel}`)].join(' · ');
}

/** Legende einer Person: alle aktiven Arten (mit Zeiten, wo es welche gibt), archivierte nur, wenn sie in diesem Monat vorkommen. */
function legende(monat, katalog, person) {
  const benutzt = new Set([...(monat?.t?.[person] ?? '')]);
  for (const liste of Object.values(monat?.z?.[person] ?? {})) for (const z of liste) benutzt.add(z.k);
  const aktiv = new Set(aktiveArten(katalog, person).map((a) => a.k));
  return (katalog.arten[person] ?? [])
    .filter((a) => aktiv.has(a.k) || benutzt.has(a.k))
    .map((a) => {
      const zeiten = zeitenText(a);
      return { k: a.k, kuerzel: a.kuerzel, name: a.name, farbe: a.farbe, text: zeiten ? `${a.name} ${zeiten}` : a.name, nacht: istNacht(a), muster: musterVon(a) };
    });
}

/**
 * Monat `jm` ('JJJJ-MM') des Schichtplans. `geladen` = die Daten des Monats sind da (auch aus der Offline-Kopie, selbst wenn das
 * Neuladen gerade scheiterte); sonst gibt es keine Tage, nur `laedt` bzw. `fehler`. Ohne gelesene Schichtarten gelten die Standardarten.
 */
export function schichtMonatModel(state, jm, { heute, filter = 'beide' } = {}) {
  const tage = tageImMonat(jm);
  const [jahr, monatNr] = jm.split('-').map(Number);
  const f = gueltigerFilter(filter);
  const personen = personenFuer(f);
  const schicht = state.schicht ?? {};
  const katalog = schicht.katalog ?? standardKatalog();
  const monat = schicht.monate?.[jm] ?? null;
  const status = schicht.status?.[jm] ?? null;
  const geladen = monat !== null;

  const erster = `${jm}-01`;
  const letzter = `${jm}-${pad2(tage)}`;
  const zellen = eachDay(addDays(erster, -weekday(erster)), addDays(letzter, 6 - weekday(letzter))).map((datum) => {
    const imMonat = datum >= erster && datum <= letzter;
    const tag = Number(datum.slice(8));
    const daten = imMonat && geladen;
    return {
      datum,
      tag,
      imMonat,
      istHeute: datum === heute,
      wochenende: weekday(datum) >= 5,
      feiertag: feiertagName(datum),
      streifen: daten ? Object.fromEntries(personen.map((p) => [p, streifen(katalog, p, schichtAm(monat, p, tag))])) : {},
      zusatz: daten ? zusatzMarke(monat, katalog, personen, tag) : null,
      notiz: daten ? personen.some((p) => Boolean(monat.n?.[p]?.[tag])) : false,
    };
  });

  return {
    titel: monatTitel(jahr, monatNr),
    jm,
    vorher: monatVor(jm, 1),
    nachher: monatVor(jm, -1),
    filter: f,
    personen,
    geladen,
    laedt: !geladen && status === 'laedt',
    fehler: status === 'fehler',
    wochentage: [...WOCHENTAGE_KURZ],
    zellen,
    zaehlung: geladen ? Object.fromEntries(personen.map((p) => [p, zaehlungText(monat, katalog, p)])) : {},
    legende: Object.fromEntries(personen.map((p) => [p, legende(monat, katalog, p)])),
  };
}

// ---------- Pinsel (Leiste zum schnellen Eintragen) ----------

const katalogVon = (state) => state.schicht?.katalog ?? standardKatalog();

/**
 * Der Filter, mit dem das Raster gezeichnet wird: blendet der gemerkte Filter die Person des offenen Pinsels aus, werden beim Malen
 * beide gezeigt (sonst landete jeder Tipp unsichtbar im Kalender); der gemerkte Filter bleibt unverändert.
 */
export function rasterFilter(filter, pinsel) {
  const f = gueltigerFilter(filter);
  return pinsel && !personenFuer(f).includes(pinsel.person) ? 'beide' : f;
}

/** Pinsel beim Öffnen: zeigt der Filter nur Mama, malt er Mama, sonst Papa; gewählt ist die erste aktive Art (keine → „Frei“). */
export function pinselStart(state, filter) {
  const person = gueltigerFilter(filter) === 'mama' ? 'mama' : 'papa';
  return { person, k: aktiveArten(katalogVon(state), person)[0]?.k ?? null };
}

/**
 * Die Leiste: aktive Arten der Person (beide Gruppen, Katalog-Reihenfolge), die gewählte markiert, und ein Hinweis zur Wahl.
 * `k` ist die tatsächlich gewählte Art: wurde die gewählte inzwischen archiviert, gilt die erste aktive – nie still „Frei“.
 */
export function pinselModel(state, { person, k }) {
  const aktiv = aktiveArten(katalogVon(state), person);
  const gewaehlt = k === null ? null : (aktiv.find((a) => a.k === k) ?? aktiv[0] ?? null);
  const arten = aktiv.map((a) => ({ k: a.k, kuerzel: a.kuerzel, name: a.name, farbe: a.farbe, muster: musterVon(a), gewaehlt: a === gewaehlt }));
  let hinweis = 'Frei: Tage antippen löscht den Dienst; Notiz und Zusätze bleiben.';
  if (gewaehlt?.gruppe === 'zusatz') hinweis = `${gewaehlt.kuerzel} ${gewaehlt.name} ${zeitenText(gewaehlt)}: Tage antippen. Nochmal tippen: wieder weg.`;
  else if (gewaehlt) hinweis = `${gewaehlt.kuerzel} ${gewaehlt.name}: Tage antippen. Nochmal tippen: wieder frei.`;
  return { person, k: gewaehlt?.k ?? null, frei: gewaehlt === null, arten, hinweis };
}

/**
 * Was ein Tipp auf Tag `tag` des Monats `jm` tut: „Frei“ → Dienst löschen (`setzen`, k null); ein Dienst → `pinsel` (der Store ersetzt
 * oder löscht bei gleicher Art); ein Zusatz → `zusatzWeg` mit Von und Bis genau eines Eintrags, wenn die Person ihn an dem Tag schon hat
 * (bevorzugt den mit den Zeiten der Art, sonst den ersten dieser Art), sonst `zusatzDazu` mit den Zeiten der Art. Eine archivierte oder unbekannte Art tut nichts (null).
 */
export function pinselAktion(state, jm, tag, { person, k }) {
  if (k === null) return { aktion: 'setzen', k: null };
  const art = aktiveArten(katalogVon(state), person).find((a) => a.k === k);
  if (!art) return null;
  if (art.gruppe !== 'zusatz') return { aktion: 'pinsel', k };
  const liste = state.schicht?.monate?.[jm]?.z?.[person]?.[tag] ?? [];
  const da = liste.find((z) => z.k === k && z.von === art.von && z.bis === art.bis) ?? liste.find((z) => z.k === k);
  return da ? { aktion: 'zusatzWeg', k, von: da.von, bis: da.bis } : { aktion: 'zusatzDazu', k, von: art.von, bis: art.bis };
}

// ---------- Tagesblatt (ein Tag, beide Personen) ----------

const PERSONEN_TAG = { papa: { name: 'Papa', emoji: '👨', ihr: 'seinem' }, mama: { name: 'Mama', emoji: '👩', ihr: 'ihrem' } };
const personKopf = (person) => ({ name: PERSONEN_TAG[person].name, emoji: PERSONEN_TAG[person].emoji });

/**
 * Hinweis unter dem Formular eines Zusatzes mit „Erinnern“. Die Erinnerung geht nur an Telefone dieser Person (und an Telefone ohne
 * Angabe). `telefone` = wem laut Geräte-Register ein Telefon gehört (Set, siehe push.personenMitTelefon); null = auf diesem Telefon
 * unbekannt (Benachrichtigungen hier aus); undefined = Demo (ohne Push). Ergebnis { art: 'ok'|'fehlt'|'unbekannt'|'demo', text }.
 */
export function erinnerungHinweis(person, telefone) {
  const { name, emoji, ihr } = PERSONEN_TAG[person];
  const ok = `🔔 Erinnerung 1 Tag und 1 Stunde vorher auf dem Telefon von ${name}`;
  const wahl = `„Dieses Telefon gehört: ${emoji} ${name}“`;
  if (telefone === undefined) return { art: 'demo', text: `${ok} (in der Demo kommen keine Benachrichtigungen)` };
  if (telefone === null) {
    return { art: 'unbekannt', text: `⚠️ Auf diesem Telefon sind die Benachrichtigungen aus, deshalb ist nicht zu sehen, ob ein Telefon „${name}“ gehört. Die Erinnerung kommt nur, wenn auf ${ihr} Telefon unter Mehr → Konto & App → 🔔 Erinnerungen ${wahl} gewählt ist.` };
  }
  if (telefone.has(person)) return { art: 'ok', text: ok };
  return { art: 'fehlt', text: `⚠️ Noch kein Telefon gehört „${name}“: Die Erinnerung kommt erst, wenn auf ${ihr} Telefon unter Mehr → Konto & App → 🔔 Erinnerungen die Benachrichtigungen aktiv sind und ${wahl} gewählt ist.` };
}

/**
 * Für „Konto & App“: Personen mit aktiven Zusatz-Arten mit „Erinnern“, denen laut Register (`telefone`, Set) kein Telefon gehört –
 * deren Erinnerungen kämen nirgends an (außer auf Telefonen ohne Angabe). Unbekannt (null): nichts. [{ person, arten, text }]
 */
export function fehlendeErinnerungsTelefone(state, telefone) {
  if (!telefone) return [];
  const katalog = katalogVon(state);
  return SCHICHT_PERSONEN.filter((person) => !telefone.has(person)).flatMap((person) => {
    const arten = aktiveArten(katalog, person, 'zusatz')
      .filter((a) => a.erinnern !== false)
      .map((a) => a.name);
    if (arten.length === 0) return [];
    const { name, emoji, ihr } = PERSONEN_TAG[person];
    return [{ person, arten, text: `⚠️ Noch kein Telefon gehört „${name}“: Erinnerungen an ${arten.join(', ')} kommen erst, wenn auf ${ihr} Telefon „Dieses Telefon gehört: ${emoji} ${name}“ gewählt ist.` }];
  });
}
const UNBEKANNT = { kuerzel: '?', name: 'Unbekannte Art', farbe: 'grau' };

/** Eine Person im Tagesblatt: Kopf (Art mit Zeiten, Nacht), Knöpfe der aktiven Dienst-Arten, Notiz, Zusätze und Zusatz-Arten zum Hinzufügen (mit Hinweis auf die Erinnerung). */
function tagPerson(katalog, monat, person, tag) {
  const k = schichtAm(monat, person, tag);
  const art = k === null ? null : artFuer(katalog, person, k);
  const arten = aktiveArten(katalog, person, 'dienst').map((a) => ({ k: a.k, kuerzel: a.kuerzel, name: a.name, farbe: a.farbe, muster: musterVon(a), aktiv: a.k === k }));
  let schicht = { text: 'Frei', nacht: false };
  if (k !== null) schicht = art ? { text: zeitenText(art) ? `${art.name} ${zeitenText(art)}` : art.name, nacht: istNacht(art) } : { text: UNBEKANNT.name, nacht: false };
  // Eingetragen, aber nicht (mehr) wählbar: archiviert, unbekannt oder inzwischen ein Zusatz – sichtbar, aber kein Knopf
  let nichtWaehlbar = null;
  if (k !== null && !arten.some((a) => a.aktiv)) {
    nichtWaehlbar = art ? { kuerzel: art.kuerzel, name: art.archiv ? `${art.name} (ausgeblendet)` : art.name, farbe: art.farbe, muster: musterVon(art) } : { ...UNBEKANNT, muster: null };
  }
  const zusaetze = (monat?.z?.[person]?.[tag] ?? []).map((z) => {
    const a = artFuer(katalog, person, z.k) ?? UNBEKANNT;
    return { k: z.k, von: z.von, bis: z.bis, kuerzel: a.kuerzel, name: a.name, farbe: a.farbe, text: `${a.name} ${z.von}–${z.bis}` };
  });
  // je Zusatz-Art ein Knopf „＋ <Name>“; mit `erinnern` steht unter dem Formular der Hinweis (siehe erinnerungHinweis)
  const zusatzArten = aktiveArten(katalog, person, 'zusatz').map((a) => ({
    k: a.k,
    kuerzel: a.kuerzel,
    name: a.name,
    farbe: a.farbe,
    von: a.von ?? '',
    bis: a.bis ?? '',
    erinnern: a.erinnern !== false,
  }));
  return { person, ...personKopf(person), schicht, arten, frei: k === null, nichtWaehlbar, notiz: monat?.n?.[person]?.[tag] ?? '', zusaetze, zusatzArten };
}

/**
 * Tagesblatt für `datum` ('JJJJ-MM-TT'): Titel wie „Mittwoch, 21. Oktober“ und immer beide Personen (der Filter der Seite gilt hier
 * nicht). Ohne gelesene Schichtarten gelten die Standardarten; ein nicht geladener Monat zeigt beide frei (`geladen: false`).
 */
export function schichtTagModel(state, datum) {
  const jm = datum.slice(0, 7);
  const tag = Number(datum.slice(8));
  const katalog = katalogVon(state);
  const monat = state.schicht?.monate?.[jm] ?? null;
  return { titel: datumLang(datum), jm, tag, geladen: monat !== null, personen: SCHICHT_PERSONEN.map((p) => tagPerson(katalog, monat, p, tag)) };
}

// ---------- Schichtarten bearbeiten ----------

/** Text einer Art in der Liste: „Name 07:00–17:45 ☾ · Zusatz“ (Zeiten, Nacht und Gruppe nur, wenn es sie gibt). */
function artListenText(a) {
  const zeiten = zeitenText(a);
  return `${a.name}${zeiten ? ` ${zeiten}` : ''}${istNacht(a) ? ' ☾' : ''}${a.gruppe === 'zusatz' ? ' · Zusatz' : ''}`;
}

const artZeile = (a) => ({ k: a.k, kuerzel: a.kuerzel, name: a.name, farbe: a.farbe, muster: musterVon(a), text: artListenText(a) });

/**
 * Blatt „Schichtarten“: je Person die aktiven Arten in Katalog-Reihenfolge und die ausgeblendeten. `hoch`/`runter` = so viele
 * Tauschschritte (artVerschieben) braucht eine Art, um an der nächsten aktiven vorbeizukommen – ausgeblendete dazwischen werden
 * übersprungen, sonst täte ein Tipp sichtbar nichts; 0 = schon ganz oben bzw. unten.
 */
export function schichtArtenModel(state) {
  const katalog = katalogVon(state);
  return SCHICHT_PERSONEN.map((person) => {
    const alle = katalog.arten[person] ?? [];
    const aktiv = alle.filter((a) => !a.archiv);
    const index = (a) => alle.indexOf(a);
    return {
      person,
      ...personKopf(person),
      aktiv: aktiv.map((a, i) => ({
        ...artZeile(a),
        hoch: i > 0 ? index(a) - index(aktiv[i - 1]) : 0,
        runter: i < aktiv.length - 1 ? index(aktiv[i + 1]) - index(a) : 0,
      })),
      ausgeblendet: alle.filter((a) => a.archiv).map(artZeile),
    };
  });
}

/**
 * Formular-Entwurf: die Felder der Art `k` zum Bearbeiten, mit `k` null für eine neue Art (leer, „Dienst“, die erste Farbe, die bei
 * der Person noch keine aktive Art hat, sonst Grau). Zeiten fehlen als '', „Nacht“ nur wenn angehakt (über Mitternacht gilt ohnehin
 * als Nacht). `erinnern` (Haken „🔔 Erinnern“, nur bei Zusatz zu sehen): wie gespeichert, bei Diensten und neuen Arten angehakt – wird
 * eine Art zum Zusatz, erinnert sie also. Muster und Archiv gehören nicht dazu: artAendern lässt sie unverändert.
 */
export function artEntwurf(state, person, k) {
  const katalog = katalogVon(state);
  const art = k === null ? null : artFuer(katalog, person, k);
  if (art) return { name: art.name, kuerzel: art.kuerzel, farbe: art.farbe, gruppe: art.gruppe, von: art.von ?? '', bis: art.bis ?? '', nacht: art.nacht === true, erinnern: art.erinnern !== false };
  const belegt = new Set(aktiveArten(katalog, person).map((a) => a.farbe));
  const farbe = PALETTE.find((f) => !belegt.has(f.id))?.id ?? 'grau';
  return { name: '', kuerzel: '', farbe, gruppe: 'dienst', von: '', bis: '', nacht: false, erinnern: true };
}

/** Prüft einen Entwurf wie beim Speichern (neu: `k` null) und gibt die deutsche Meldung zurück, oder null, wenn alles passt. */
export function artEntwurfFehler(state, person, k, entwurf) {
  const katalog = katalogVon(state);
  try {
    if (k === null) artHinzufuegen(katalog, person, entwurf);
    else artAendern(katalog, person, k, entwurf);
    return null;
  } catch (fehler) {
    return fehler.message;
  }
}
