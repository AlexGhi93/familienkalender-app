import { h } from './dom.js';
import { abschnitt, bestaetigen, chip, farbe, toast, urlaubRing } from './components.js';
import { heuteModel } from '../app/views/heute-model.js';
import { datumKurz } from '../app/format-de.js';
import { werktageText } from '../domain/format.js';
import { TYPES } from '../domain/types.js';

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
    t.mitnehmen.length > 0 || t.kosten
      ? h(
          'div',
          { class: 'chips' },
          erstes ? chip(`🎒 ${erstes}`) : null,
          rest.map((x) => chip(x)),
          t.kosten ? chip(`💶 ${t.kosten}`) : null,
        )
      : null,
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
                await store.setTage(m.offeneTage, 'kita_essen');
                toast(`${n} ${n === 1 ? 'Tag' : 'Tage'} bestätigt ✓`);
              },
            }),
        },
        'Alle bestätigen',
      ),
    ),
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
    abschnitt('Heute', statusKarte(m, store, ui), offeneTageKarte(m, store, ui)),
    m.termineHeute.length > 0 ? abschnitt('Termine heute', m.termineHeute.map(terminKarte)) : null,
    m.termineMorgen.length > 0 ? abschnitt('Morgen', m.termineMorgen.map(terminKarte)) : null,
    m.termineDemnaechst.length > 0 ? abschnitt('Demnächst', m.termineDemnaechst.map(terminKarte)) : null,
    abschnitt('Urlaub im Kindergartenjahr', urlaubKarte(m)),
    naechster ? h('div', { class: 'countdown' }, `✈️ Noch ${naechster.schlafen}× schlafen bis zum Urlaub`) : null,
  );
}
