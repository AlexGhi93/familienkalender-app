// Ansicht des Schichtplans (ohne DOM): ein Monat als Raster Montag bis Sonntag mit zwei Streifen je Tag (oben Papa, unten Mama),
// Marken für Zusatz (z. B. DB) und Notiz, die Zählung je Person und die Legende. Dazu der Filter „Beide · Papa · Mama“,
// den sich jedes Telefon selbst merkt (localStorage).
import { addDays, eachDay, pad2, weekday } from '../../domain/dates.js';
import { feiertagName } from '../../domain/feiertage.js';
import { monatVor } from '../../domain/konto.js';
import { PALETTE, SCHICHT_PERSONEN, aktiveArten, artAendern, artFuer, artHinzufuegen, istNacht, monatZaehlung, schichtAm, standardKatalog, tageImMonat, tagZeitenAm, zeitenFuer } from '../../domain/schicht.js';
import { tauschAm, tauschBilanz, tauschErsetzt, tauschIstOffen, tauschOffenPruefen, tauschOffenTag, tauschPruefen, tauschRueckgabePruefen, tauschZustand } from '../../domain/schicht-tausch.js';
import { standardSpeicher } from '../speicher.js';
import { WOCHENTAGE_KURZ, datumLang, monatTitel } from '../format-de.js';

const SCHICHT_FILTER = Object.freeze(['beide', 'papa', 'mama']);
export const SCHICHT_FILTER_SCHLUESSEL = 'fk.schicht.filter.v1';

const gueltigerFilter = (filter) => (SCHICHT_FILTER.includes(filter) ? filter : 'beide');

/** Gemerkter Filter dieses Telefons; ohne Speicher, bei Unsinn oder Fehlern „beide“. */
export function schichtFilterLesen(speicher = standardSpeicher()) {
  try {
    return gueltigerFilter(speicher?.getItem(SCHICHT_FILTER_SCHLUESSEL));
  } catch {
    return 'beide';
  }
}

/** Merkt den Filter (Fehler des Speichers, z. B. im privaten Modus, stören nicht) und gibt den gültigen Wert zurück. */
export function schichtFilterSpeichern(filter, speicher = standardSpeicher()) {
  const wert = gueltigerFilter(filter);
  try {
    speicher?.setItem(SCHICHT_FILTER_SCHLUESSEL, wert);
  } catch {
    // dann eben nur bis zum Neuladen
  }
  return wert;
}

/** Die angezeigten Personen zum Filter, in fester Reihenfolge (oben Papa, unten Mama). */
const personenFuer = (filter) => (gueltigerFilter(filter) === 'beide' ? [...SCHICHT_PERSONEN] : [gueltigerFilter(filter)]);

const zeitenText = (art) => (art.von && art.bis ? `${art.von}–${art.bis}` : null);
/** „Name von–bis“ bzw. nur „Name“, wenn Von oder Bis fehlt (Zeiten ohne Wert: undefined oder ''). */
const mitSpanne = (name, von, bis) => (von && bis ? `${name} ${von}–${bis}` : name);
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

const kurzDatumTT = (datum) => `${datum.slice(8, 10)}.${datum.slice(5, 7)}.`;

/** Die Diensttausche und der Monats-Nachschlag aus dem Zustand (nicht gelesen = keine Tausche). */
function tauschQuelle(state) {
  const monate = state.schicht?.monate ?? {};
  return { daten: state.schicht?.tausch ?? null, monate: (jm) => monate[jm] ?? null };
}

/** Monat des Tages `tag` aus dem Nachschlag (ein offener Tausch hat nur einen Tag: der andere fehlt → null). */
const monatVonTag = (q, tag) => (tag === undefined ? null : q.monate(tag.slice(0, 7)));
/** Zustand eines Eintrags (geschlossen oder offen) nach den Monaten seiner Tage. */
const zustandVon = (q, e) => tauschZustand(e, monatVonTag(q, e.a), monatVonTag(q, e.b));

/** Text eines sichtbaren Tauschs am Tag: „⇄ getauscht mit <wer> / gegen TT.MM.“ bzw. „⚠ Tausch unvollständig“. */
const tauschText = (t) => {
  if (t.zustand !== 'ganz') return '⚠ Tausch unvollständig';
  const e = t.eintrag;
  if (t.offen) {
    const verb = e.richtung === 'abgegeben' ? `abgegeben${e.mitWem ? ` an ${e.mitWem}` : ''}` : `übernommen${e.mitWem ? ` von ${e.mitWem}` : ''}`;
    return `⇄ ${verb} · Rückgabe offen`;
  }
  return `⇄ getauscht${e.mitWem ? ` mit ${e.mitWem}` : ''} / gegen ${kurzDatumTT(t.rolle === 'a' ? e.b : e.a)}`;
};

/**
 * Tausch einer Person an einem Tag fürs Tagesblatt: { zustand: 'ganz'|'halb'|'offen', text, id } oder null. Ein „offener“ eigener Tausch
 * (Verknüpfung geschrieben, Monate nicht) ist hier sichtbar, damit man ihn abschließen oder verwerfen kann (er blockiert den Tag).
 * `aktiv` = der Tag hält einen Tausch fest (auch einen mit nicht geladenem Monat): dann gibt es keinen zweiten.
 */
function tauschFuerTag(q, person, datum) {
  const sichtbar = tauschAm(q.daten, q.monate, person, datum);
  if (sichtbar) return { tausch: { zustand: sichtbar.zustand, text: tauschText(sichtbar), id: sichtbar.eintrag.id, ...(sichtbar.offen ? { offen: true } : {}) }, aktiv: true };
  let aktiv = false;
  for (const e of [...(q.daten?.eintraege ?? [])].reverse()) {
    if (e.person !== person || (e.a !== datum && e.b !== datum)) continue;
    const zustand = zustandVon(q, e);
    if (zustand === 'offen') return { tausch: { zustand, text: '⚠ Tausch unvollständig', id: e.id }, aktiv: true };
    if (zustand === 'unbekannt') aktiv = true;
  }
  return { tausch: null, aktiv };
}

/** Raster: `tausch` = ein ganzer Tausch an diesem Tag (⇄), `halb` = ein unvollständiger (⚠), je für die angezeigten Personen. */
function tauschMarken(q, personen, datum) {
  const z = personen.map((p) => tauschAm(q.daten, q.monate, p, datum)?.zustand);
  return { tausch: z.includes('ganz'), halb: z.includes('halb') };
}

/** Eigene Uhrzeiten des Tages der angezeigten Personen: `zeiten` = mindestens eine, `zeitenText` = „von–bis“ je Person (nur wo es welche gibt). */
function eigeneZeiten(monat, personen, tag) {
  const zeitenText = {};
  for (const p of personen) {
    const z = tagZeitenAm(monat, p, tag);
    if (z) zeitenText[p] = `${z.von}–${z.bis}`;
  }
  return { zeiten: Object.keys(zeitenText).length > 0, zeitenText };
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
  const tq = tauschQuelle(state);
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
      ...(daten ? eigeneZeiten(monat, personen, tag) : { zeiten: false, zeitenText: {} }),
      ...(daten ? tauschMarken(tq, personen, datum) : { tausch: false, halb: false }),
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
function tagPerson(katalog, monat, person, tag, katalogGelesen = true, tq = null) {
  const k = schichtAm(monat, person, tag);
  const art = k === null ? null : artFuer(katalog, person, k);
  const arten = aktiveArten(katalog, person, 'dienst').map((a) => ({ k: a.k, kuerzel: a.kuerzel, name: a.name, farbe: a.farbe, muster: musterVon(a), aktiv: a.k === k }));
  let schicht = { text: 'Frei', nacht: false };
  let zeiten = { von: '', bis: '', artVon: '', artBis: '', eigene: false };
  if (k !== null) {
    const z = zeitenFuer(monat, katalog, person, tag); // Zeiten des Tages vor den Zeiten der Art; Von/Bis können ohne Wert sein
    schicht = art ? { text: mitSpanne(art.name, z.von, z.bis), nacht: z.nacht } : { text: UNBEKANNT.name, nacht: false };
    zeiten = { von: z.von || '', bis: z.bis || '', artVon: art?.von ?? '', artBis: art?.bis ?? '', eigene: z.eigene };
  }
  // Zeiten für diesen Tag: bei jedem Dienst außer Urlaub (und nur mit gelesenen Schichtarten, siehe store.schichtTagZeiten)
  const zeitenMoeglich = katalogGelesen && Boolean(art) && art.muster !== 'urlaub' && art.gruppe !== 'zusatz';
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
  const { tausch, aktiv } = tq ? tauschFuerTag(tq.quelle, person, tq.datum) : { tausch: null, aktiv: false };
  // „⇄ Diensttausch“ nur mit gelesenen Schichtarten, geladenem Monat und lesbaren Tauschen, an einem Dienst oder freien Tag (nicht Urlaub),
  // wenn der Tag nicht schon getauscht ist (R10)
  const tagOk = k === null || (Boolean(art) && art.muster !== 'urlaub' && art.gruppe === 'dienst');
  const tauschMoeglich = Boolean(tq) && !tq.gesperrt && katalogGelesen && monat !== null && tagOk && !aktiv;
  return { person, ...personKopf(person), schicht, zeiten, zeitenMoeglich, arten, frei: k === null, nichtWaehlbar, notiz: monat?.n?.[person]?.[tag] ?? '', zusaetze, zusatzArten, tausch, tauschMoeglich };
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
  const tq = { quelle: tauschQuelle(state), datum, gesperrt: (state.unlesbar ?? []).includes('schichttausch') };
  return { titel: datumLang(datum), jm, tag, geladen: monat !== null, personen: SCHICHT_PERSONEN.map((p) => tagPerson(katalog, monat, p, tag, state.schicht?.katalog != null, tq)) };
}

// ---------- Heute ----------

/**
 * Zeilen für die Karte auf „Heute“: je Person, die HEUTE eigene Uhrzeiten für den Dienst hat (im Tagesblatt eingetragen), eine Zeile
 * wie „Schulung 08:00–16:00“. Die Zeiten der Art allein zählen nicht (sie stehen im Schichtplan); sonst [].
 */
export function schichtHeuteZeilen(state, heute) {
  const monat = state.schicht?.monate?.[heute.slice(0, 7)] ?? null;
  if (!monat) return [];
  const katalog = katalogVon(state);
  const tag = Number(heute.slice(8));
  return SCHICHT_PERSONEN.flatMap((person) => {
    const z = tagZeitenAm(monat, person, tag);
    if (!z) return [];
    const art = artFuer(katalog, person, schichtAm(monat, person, tag));
    return [{ person, emoji: PERSONEN_TAG[person].emoji, name: PERSONEN_TAG[person].name, text: mitSpanne(art?.name ?? UNBEKANNT.name, z.von, z.bis) }];
  });
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

// ---------- Diensttausch (Formular) ----------

const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const RICHTUNG_TEXT = { abgegeben: 'Dienst abgeben', uebernommen: 'Dienst übernehmen' };
const nichtsErsetzt = (datum) => `Am ${kurzDatumTT(datum)} ist kein Dienst eingetragen – nichts wird ersetzt.`;

/** Aktive Dienste der Person ohne Urlaub als [[k, „F Frühdienst“], …] und die gewählte Art `kb` (leer oder unpassend → die erste). */
function dienstWahl(katalog, person, gewuenscht) {
  const dienste = aktiveArten(katalog, person, 'dienst').filter((x) => x.muster !== 'urlaub');
  const kb = dienste.some((x) => x.k === gewuenscht) ? gewuenscht : (dienste[0]?.k ?? '');
  return { kb, dienste: dienste.map((x) => [x.k, `${x.kuerzel} ${x.name}`]) };
}

/**
 * Formular „Diensttausch“ am Tag `tag`: `entwurf` = { person, tag, richtung, kb, rueckgabe, mitWem } (`kb` und `rueckgabe` dürfen leer sein;
 * `rueckgabe` leer = die Rückgabe bleibt offen). → `richtungen` (Dienst abgeben nur, wenn der Tag einen Dienst hat), `richtung` (die gewählte,
 * sonst abgeben am Dienst, übernehmen am freien Tag), `dienste`/`kb` (der Dienst, der übernommen wird), `brauchtDienst` (übernehmen oder abgeben
 * mit Rückgabe: dann wird ein Dienst gewählt), `rueckgabe`, `rGeladen` (der Monat des Rückgabetags ist da), `ersetzt` (was ersetzt wird, null =
 * unklar oder nichts zu sagen), `fehler` (die Meldung, mit der Speichern abgelehnt würde, null = passt) und `speichern` = was der Store bekommt:
 * `{ art: 'offen', entwurf }` (diensttauschOffenSpeichern) oder `{ art: 'verknuepft', entwurf }` (diensttauschSpeichern; abgegeben: a = Tag,
 * b = Rückgabe; übernommen: a = Rückgabe, b = Tag – R3). `heute` nur für das Alter offener Tausche.
 */
export function tauschFormModel(state, entwurf, heute) {
  const katalog = katalogVon(state);
  const { person, tag, mitWem } = entwurf;
  const q = tauschQuelle(state);
  const monatTag = monatVonTag(q, tag);
  const k = schichtAm(monatTag, person, Number(tag.slice(8)));
  const hatDienst = k !== null && artFuer(katalog, person, k)?.muster !== 'urlaub';
  const richtungen = (hatDienst ? ['abgegeben', 'uebernommen'] : ['uebernommen']).map((r) => [r, RICHTUNG_TEXT[r]]);
  const richtung = richtungen.some(([r]) => r === entwurf.richtung) ? entwurf.richtung : richtungen[0][0];
  const rFertig = DATUM.test(entwurf.rueckgabe ?? '');
  const rueckgabe = rFertig ? entwurf.rueckgabe : '';
  const brauchtDienst = richtung === 'uebernommen' || rFertig;
  const { kb, dienste } = dienstWahl(katalog, person, entwurf.kb);
  const rGeladen = !rFertig || q.monate(rueckgabe.slice(0, 7)) !== null;
  const optionen = { ...q, katalog, heute };
  let fehler = null;
  let ersetzt = null;
  let speichern;
  if (rFertig) {
    const [a, b] = richtung === 'abgegeben' ? [tag, rueckgabe] : [rueckgabe, tag];
    const voll = { person, a, b, kb, mitWem };
    speichern = { art: 'verknuepft', entwurf: voll };
    if (!rGeladen) fehler = 'Der Monat des Rückgabetags wird noch geladen.';
    else if (monatTag === null) fehler = 'Der Monat des Tages wird noch geladen.';
    else fehler = tauschPruefen(voll, optionen);
    if (rGeladen && monatTag !== null) ersetzt = tauschErsetzt(voll, q.monate(b.slice(0, 7)), katalog) ?? nichtsErsetzt(b);
  } else {
    const offen = { person, richtung, tag, ...(richtung === 'uebernommen' ? { kb } : {}), mitWem };
    speichern = { art: 'offen', entwurf: offen };
    if (monatTag === null) fehler = 'Der Monat des Tages wird noch geladen.';
    else {
      fehler = tauschOffenPruefen(offen, optionen);
      if (richtung === 'uebernommen') ersetzt = tauschErsetzt({ person, b: tag }, monatTag, katalog) ?? nichtsErsetzt(tag);
    }
  }
  return { person, tag, richtungen, richtung, dienste, kb, brauchtDienst, rueckgabe, rGeladen, ersetzt, fehler, speichern };
}

/** Text der Rückfrage „Eintrag entfernen“ (nur ein von Hand geänderter offener Tausch). */
export const TAUSCH_EINTRAG_ENTFERNEN_TEXT = 'Nur der Eintrag wird entfernt – der Tag bleibt, wie er jetzt ist.';
/** Text der Rückfrage „Tausch rückgängig“ für einen offenen Tausch (nur sein einer Tag wird zurückgesetzt). */
export const TAUSCH_OFFEN_RUECKGAENGIG_TEXT = 'Der Tag kommt genau so zurück, wie er vor dem Tausch war – mit seinem Dienst und den Uhrzeiten, die an dem Tag eingetragen waren.';

// ---------- Offene Diensttausche (Karte, Rückgabe) ----------

const langDatum = (datum) => `${kurzDatumTT(datum)}${datum.slice(0, 4)}`;

/** Eine Zeile der Liste „Offene Diensttausche“ zu einem offenen Eintrag. */
function offeneZeile(q, katalog, e, heute) {
  const tag = tauschOffenTag(e);
  const abgegeben = e.richtung === 'abgegeben';
  const name = artFuer(katalog, e.person, abgegeben ? e.ka : e.kb)?.name ?? 'Unbekannte Art';
  const mit = e.mitWem ? ` (${abgegeben ? 'an' : 'von'} ${e.mitWem})` : '';
  const text = abgegeben
    ? `${name} abgegeben am ${kurzDatumTT(tag)}${mit} – noch eine Schicht übernehmen bis ${langDatum(e.frist)}`
    : `${name} übernommen am ${kurzDatumTT(tag)}${mit} – Rückgabe offen bis ${langDatum(e.frist)}`;
  const zustand = zustandVon(q, e);
  const ueberfaellig = heute > e.frist;
  let hinweis = null;
  if (zustand === 'offen') hinweis = '⚠ Tausch unvollständig';
  else if (zustand === 'gebrochen') hinweis = '⚠ Von Hand geändert';
  return {
    id: e.id,
    text: ueberfaellig ? `⚠ ${text}` : text,
    ueberfaellig,
    hinweis,
    kannRueckgabe: zustand === 'ganz' || zustand === 'unbekannt',
    kannAbschliessen: zustand === 'offen',
    kannVerwerfen: zustand === 'gebrochen',
  };
}

/**
 * Karte „Offene Diensttausche“: je angezeigter Person (Filter der Seite) ihre offenen Tausche, nach Frist sortiert; null, wenn es keine gibt.
 * `kannRueckgabe` = Zustand ganz (oder noch unbekannt), `kannAbschliessen` = offen, `kannVerwerfen` = von Hand geändert („Eintrag entfernen“).
 */
export function offeneTauscheModel(state, { filter = 'beide', heute } = {}) {
  const q = tauschQuelle(state);
  const katalog = katalogVon(state);
  const alle = (q.daten?.eintraege ?? []).filter(tauschIstOffen);
  const bilanz = tauschBilanz(q.daten);
  const personen = personenFuer(filter)
    .map((person) => {
      const eigene = alle.filter((e) => e.person === person).sort((x, y) => (x.frist < y.frist ? -1 : x.frist > y.frist ? 1 : 0));
      return { person, kopf: `${PERSONEN_TAG[person].emoji} ${PERSONEN_TAG[person].name}`, bilanz: `${PERSONEN_TAG[person].name}: +${bilanz[person].plus} / −${bilanz[person].minus}`, zeilen: eigene.map((e) => offeneZeile(q, katalog, e, heute)) };
    })
    .filter((p) => p.zeilen.length > 0);
  return personen.length > 0 ? { personen } : null;
}

/**
 * Blatt „Rückgabe eintragen“ zum offenen Tausch `id`: `entwurf` = { id, tag, kb } (Rückgabetag, bei „abgegeben“ der übernommene Dienst). null =
 * den Tausch gibt es nicht (mehr) oder er ist schon geschlossen. → `richtung`, `kopf` (die Zeile der Liste), `dienste`/`kb`, `brauchtDienst`
 * (nur bei „abgegeben“: am Rückgabetag wird ein Dienst übernommen), `tGeladen` (Monat des Rückgabetags da), `ersetzt`, `fehler` (null = passt).
 */
export function rueckgabeFormModel(state, { id, tag, kb }, heute) {
  const q = tauschQuelle(state);
  const e = (q.daten?.eintraege ?? []).find((x) => x.id === id);
  if (!e || !tauschIstOffen(e)) return null;
  const katalog = katalogVon(state);
  const abgegeben = e.richtung === 'abgegeben';
  const gewaehlt = dienstWahl(katalog, e.person, kb);
  const tFertig = DATUM.test(tag ?? '');
  const monatT = tFertig ? q.monate(tag.slice(0, 7)) : null;
  const tGeladen = !tFertig || monatT !== null;
  let fehler = null;
  let ersetzt = null;
  if (!tFertig) fehler = 'Bitte den Rückgabetag wählen.';
  else if (!tGeladen) fehler = 'Der Monat des Rückgabetags wird noch geladen.';
  else {
    fehler = tauschRueckgabePruefen(e, { tag, kb: gewaehlt.kb }, { ...q, katalog, heute });
    if (abgegeben) ersetzt = tauschErsetzt({ person: e.person, b: tag }, monatT, katalog) ?? nichtsErsetzt(tag);
    else {
      const frei = schichtAm(monatT, e.person, Number(tag.slice(8)));
      if (frei !== null) ersetzt = `Am ${kurzDatumTT(tag)} wird frei: ${artFuer(katalog, e.person, frei)?.name ?? 'Unbekannte Art'}`;
    }
  }
  return { richtung: e.richtung, kopf: offeneZeile(q, katalog, e, heute), dienste: gewaehlt.dienste, kb: gewaehlt.kb, brauchtDienst: abgegeben, tGeladen, ersetzt, fehler };
}
/** Text der Rückfrage „Tausch rückgängig“: beide Tage kommen genau so zurück, wie sie waren (Dienst und eigene Uhrzeiten je Tag). */
export const TAUSCH_RUECKGAENGIG_TEXT = 'Beide Tage kommen genau so zurück, wie sie vor dem Tausch waren – mit ihrem Dienst und den Uhrzeiten, die an dem Tag eingetragen waren.';
