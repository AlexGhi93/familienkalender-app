import { h } from './dom.js';
import { abschnitt, bestaetigen, chip, farbe, toast, urlaubRing } from './components.js';
import { heuteModel } from '../app/views/heute-model.js';
import { datumKurz } from '../app/format-de.js';
import { werktageText } from '../domain/format.js';
import { TYPES } from '../domain/types.js';
import { sacheErledigt } from './sachen-aktionen.js';
import { zeigeRueckgaengig } from './fortschritt.js';
import { EINKAUF_FARBE } from '../app/views/einkauf-model.js';

function knopf(emoji, titel, untertitel, farbeHex, beiKlick) {
  return h(
    'button',
    { class: 'knopf kachel-knopf', type: 'button', style: farbe(farbeHex), onClick: beiKlick },
    h('span', { class: 'e' }, emoji),
    h('b', {}, titel),
    untertitel ? h('small', {}, untertitel) : null,
  );
}

function terminKarte(t) {
  const [erstes, ...rest] = t.mitnehmen;
  return h(
    'article',
    { class: 'karte tint termin', style: farbe(t.farbe) },
    h(
      'div',
      { class: 'karte-zeile' },
      h('span', { class: 'emoji' }, t.emoji),
      h('div', { class: 'karte-text' }, h('b', {}, t.label, t.time ? ` · ${t.time}` : ''), h('small', {}, datumKurz(t.date))),
    ),
    t.fuerText || t.mitnehmen.length > 0 || t.kosten
      ? h(
          'div',
          { class: 'chips' },
          t.fuerText ? chip(`${t.fuerEmoji} ${t.fuerText}`) : null,
          erstes ? chip(`🎒 ${erstes}`) : null,
          rest.map((x) => chip(x)),
          t.kosten ? chip(`💶 ${t.kosten}`) : null,
        )
      : null,
    t.notiz ? h('p', { class: 'notiz' }, `📝 ${t.notiz}`) : null,
  );
}

/** Programmierung von HEUTE: groß, mit Uhrzeit, Farbband, Stand („in 2 Std 15 Min“) und – beim nächsten – einem pulsierenden Punkt. */
function terminHeuteKarte(t) {
  const [erstes, ...rest] = t.mitnehmen;
  const hatChips = t.fuerText || t.mitnehmen.length > 0 || t.kosten;
  return h(
    'article',
    { class: `karte termin-heute ${t.zeitStatus}${t.naechster ? ' naechster' : ''}`, style: farbe(t.farbe), 'aria-label': `${t.label}, ${t.time ?? 'ganztägig'}, ${t.inText}` },
    h(
      'div',
      { class: 'th-kopf' },
      h('div', { class: `th-zeit${t.time ? '' : ' ganztags'}` }, t.time ?? 'ganztägig'),
      h('div', { class: 'th-text' }, h('b', {}, `${t.emoji} ${t.label}`), h('span', { class: `th-marke ${t.zeitStatus}` }, t.naechster ? h('i', { class: 'puls', 'aria-hidden': 'true' }) : null, t.inText)),
    ),
    hatChips
      ? h(
          'div',
          { class: 'chips' },
          t.fuerText ? chip(`${t.fuerEmoji} ${t.fuerText}`) : null,
          erstes ? chip(`🎒 ${erstes}`) : null,
          rest.map((x) => chip(x)),
          t.kosten ? chip(`💶 ${t.kosten}`) : null,
        )
      : null,
    t.notiz ? h('p', { class: 'notiz' }, `📝 ${t.notiz}`) : null,
  );
}

function statusKarte(m, store, ui) {
  const s = m.status;
  const kopf = h(
    'div',
    { class: 'karte-zeile' },
    h('span', { class: 'emoji gross' }, s.emoji),
    h('div', { class: 'karte-text' }, h('b', {}, s.text), h('small', {}, s.art === 'offen' ? `${m.einrichtung}: bitte eintragen` : m.datumText)),
  );
  if (s.art === 'offen') {
    const setze = async (typ) => {
      await store.setTag(m.heute, typ);
      toast('Eingetragen ✓');
    };
    return h(
      'article',
      { class: 'karte tint', style: farbe(s.farbe) },
      kopf,
      h(
        'div',
        { class: 'aktionen' },
        knopf('✅', 'Anwesend', 'mit Mittagessen', TYPES.kita_essen.farbe, () => setze('kita_essen')),
        knopf('🏫', 'Anwesend', 'ohne Essen', TYPES.kita_ohne.farbe, () => setze('kita_ohne')),
        knopf('🤒', 'Krank', 'zu Hause', TYPES.krank.farbe, () => setze('krank')),
        knopf('🧸', 'Abwesend', '', TYPES.abwesend.farbe, () => setze('abwesend')),
      ),
    );
  }
  const aenderbar = s.art === 'eintrag';
  return h(
    'article',
    { class: 'karte tint', style: farbe(s.farbe) },
    kopf,
    aenderbar ? h('div', { class: 'knopfzeile rechts' }, h('button', { class: 'knopf klein', type: 'button', onClick: () => ui.tagesblatt(m.heute) }, 'Ändern')) : null,
  );
}

function offeneTageKarte(m, store, ui) {
  const n = m.offeneTage.length;
  if (n === 0) return null;
  return h(
    'article',
    { class: 'karte hinweis' },
    h(
      'div',
      { class: 'karte-zeile' },
      h('span', { class: 'emoji' }, '📝'),
      h('div', { class: 'karte-text' }, h('b', {}, `${n} ${n === 1 ? 'Tag' : 'Tage'} noch nicht eingetragen`), h('small', {}, `Zuletzt: ${datumKurz(m.offeneTage.at(-1))}`)),
    ),
    h(
      'div',
      { class: 'knopfzeile' },
      h('button', { class: 'knopf klein', type: 'button', onClick: () => ui.gehZuMonat(m.offeneTage[0]) }, 'Ansehen'),
      h(
        'button',
        {
          class: 'knopf klein primaer',
          type: 'button',
          onClick: () =>
            bestaetigen({
              titel: 'Alle offenen Tage bestätigen?',
              text: `${n} ${n === 1 ? 'Tag wird' : 'Tage werden'} als „${m.einrichtung} · Mittagessen“ eingetragen.`,
              ja: 'Bestätigen',
              beiJa: async () => {
                const { rueckgaengig } = await store.setTage(m.offeneTage, 'kita_essen');
                zeigeRueckgaengig(`${n} ${n === 1 ? 'Tag' : 'Tage'} bestätigt ✓`, rueckgaengig);
              },
            }),
        },
        'Alle bestätigen',
      ),
    ),
  );
}

const TAG_TEXT = { ueberfaellig: 'Überfällig', heute: 'Heute', morgen: 'Morgen', spaeter: '' };

function sachenKarte(m, store, ui) {
  const sachen = m.sachen;
  const zeile = (e) =>
    h(
      'div',
      { class: `sache ${e.tag}` },
      h('span', { class: 'emoji' }, e.emoji),
      h(
        'div',
        { class: 'karte-text' },
        h('b', {}, `${e.richtungText}: ${e.mitnehmen.join(', ')}`),
        h('small', {}, `${e.datumText} · ${e.time}`),
      ),
      TAG_TEXT[e.tag] ? h('span', { class: `tag-marke ${e.tag}` }, TAG_TEXT[e.tag]) : null,
      h('button', { class: 'knopf klein', type: 'button', onClick: () => sacheErledigt(store, e.id) }, 'Erledigt ✓'),
    );
  return h(
    'article',
    { class: 'karte tint sachen', style: farbe(TYPES.kita_sache.farbe) },
    sachen.eintraege.length > 0
      ? h('div', { class: 'liste' }, sachen.eintraege.map(zeile))
      : h('div', { class: 'karte-zeile' }, h('span', { class: 'emoji' }, '🧺'), h('div', { class: 'karte-text' }, h('b', {}, 'Nichts vorzubereiten 🎉'), h('small', {}, 'Pyjamas, Windeln, Winteranzug … hier merkst du dir alles.'))),
    h('div', { class: 'knopfzeile' }, h('button', { class: 'knopf klein', type: 'button', onClick: () => ui.neuTerminStarten('kita_sache') }, '＋ Sachen eintragen')),
  );
}

/** Einkaufsliste in Kürze (die ersten Artikel), mit Weg zur ganzen Liste. */
function einkaufKarte(m, ui) {
  const e = m.einkauf;
  return h(
    'article',
    { class: 'karte tint einkauf-karte', style: farbe(EINKAUF_FARBE) },
    e.anzahlOffen > 0
      ? h('div', { class: 'chips' }, e.vorschau.map((name) => chip(name)), e.mehr > 0 ? chip(`+ ${e.mehr} weitere`) : null)
      : h('div', { class: 'karte-zeile' }, h('span', { class: 'emoji' }, '🛒'), h('div', { class: 'karte-text' }, h('b', {}, 'Nichts zu kaufen 🎉'), h('small', {}, 'Schreib auf, was fehlt – dann vergisst es niemand.'))),
    h('div', { class: 'knopfzeile' }, h('button', { class: 'knopf klein', type: 'button', onClick: () => ui.gehZu('einkauf') }, e.anzahlOffen > 0 ? 'Liste öffnen' : '＋ Eintragen')),
  );
}

/** Nur am letzten Tag des Monats, solange jemand seinen Kontostand noch nicht eingetragen hat. */
function kontoHeuteKarte(m, ui) {
  const k = m.konto;
  return h(
    'article',
    { class: 'karte tint konto-heute', style: farbe('#2F9E5B') },
    h('div', { class: 'karte-zeile' }, h('span', { class: 'emoji' }, '💶'), h('div', { class: 'karte-text' }, h('b', {}, k.text), h('small', {}, 'Heute ist der letzte Tag des Monats: der Gesamtstand aller Konten.'))),
    h('div', { class: 'knopfzeile' }, h('button', { class: 'knopf klein primaer', type: 'button', onClick: () => ui.gehZu('konto') }, 'Kontostand eintragen')),
  );
}

function urlaubKarte(m) {
  const u = m.urlaub;
  const wochenZiel = u.durchgehend.ziel / 5;
  const fertig = u.offen === 0;
  return h(
    'article',
    { class: 'karte' },
    h(
      'div',
      { class: 'karte-zeile' },
      urlaubRing({ genommen: u.genommen, geplant: u.geplant, ziel: u.ziel }),
      h(
        'div',
        { class: 'karte-text' },
        h('b', {}, fertig ? 'Geschafft! Alle Urlaubswochen sind eingetragen 🎉' : `Noch ${werktageText(u.offen)} offen`),
        h('small', {}, `${u.jahrText}: Ziel ${u.ziel / 5} Wochen`),
        wochenZiel > 0 ? h('small', {}, `${u.durchgehend.erfuellt ? '✅' : '❗'} ${wochenZiel} Wochen am Stück${u.durchgehend.erfuellt ? '' : ' noch offen'}`) : null,
      ),
    ),
  );
}

export function heuteScreen({ store, ui }) {
  const m = heuteModel(store.getState(), store.jetzt());
  const naechster = m.urlaub.countdown;
  return h(
    'section',
    { class: 'screen' },
    h('header', { class: 'kopf' }, h('span', { class: 'marke' }, `🌸 ${ui.titel()}`), h('span', { class: 'pille' }, m.einrichtung)),
    h('h1', { class: 'gruss' }, `${m.gruss.text} ${m.gruss.emoji}`),
    h('p', { class: 'datum' }, m.datumText),
    m.termineHeute.length > 0 ? abschnitt(`📌 Heute steht an · ${m.termineHeute.length}`, m.termineHeute.map(terminHeuteKarte)) : null,
    m.termineMorgen.length > 0 ? abschnitt(`📅 Morgen steht an · ${m.termineMorgen.length}`, m.termineMorgen.map(terminHeuteKarte)) : null,
    abschnitt('Heute', statusKarte(m, store, ui), offeneTageKarte(m, store, ui)),
    abschnitt(`Sachen für ${m.einrichtung}`, sachenKarte(m, store, ui)),
    abschnitt(m.einkauf.anzahlOffen > 0 ? `🛒 Einkauf · ${m.einkauf.anzahlOffen}` : '🛒 Einkauf', einkaufKarte(m, ui)),
    m.konto.faellig ? abschnitt(`💶 Kontostand für ${m.konto.monatText} eintragen`, kontoHeuteKarte(m, ui)) : null,
    m.termineDemnaechst.length > 0 ? abschnitt('Demnächst', m.termineDemnaechst.map(terminKarte)) : null,
    abschnitt('Urlaub im Kindergartenjahr', urlaubKarte(m)),
    naechster ? h('div', { class: 'countdown' }, `✈️ Noch ${naechster.schlafen}× schlafen bis zum Urlaub`) : null,
  );
}
