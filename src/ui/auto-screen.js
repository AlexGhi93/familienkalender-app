// Seite eines Autos (#/autos/<id>): Kopf (Farbe, Name, Kennzeichen, km, „＋ Arbeit eintragen“), „Fällig“ (Stand ✓/⏳/⚠/unbekannt,
// „Erledigt eintragen“, Regel mit Info und Quelle), „Kilometerstand“, „Reifen“ (km je Satz, seit Rotation als Balken, montiert,
// Saison), „Vignette“, „Verlauf“ (neueste zuerst; Tippen = ändern/löschen, nach links wischen = Löschen, mit „Rückgängig“) und
// „Fahrzeugdaten“ (alles aus dem Zulassungsschein, bearbeitbar). Zahlen und Texte aus app/views/autos-model.js.
import { h } from './dom.js';
import { abschnitt } from './components.js';
import { fortschritt, hochzaehlen } from './bewegung.js';
import { nochmalKnopf } from './formular.js';
import { wischbar } from './wischen.js';
import { TEXT_DATENSCHUTZ, autoSeiteModel } from '../app/views/autos-model.js';
import { arbeitLoeschen, kmLoeschen, oeffneArbeitFormular, oeffneAutoFormular, oeffneKmFormular, oeffneRegelFormular, oeffneSatzFormular, regelEinschalten, satzLoeschen } from './auto-formular.js';

/** Hinweise über den Autos (unlesbar, nicht aktuell, Warnungen) – auf der Liste und der Seite eines Autos. */
export function autosMeldungen(m, store) {
  return [
    m.unlesbar ? h('article', { class: 'karte fk-meldung warn au-meldung' }, h('b', {}, '🔒 Autos unlesbar'), h('p', {}, m.unlesbar)) : null,
    m.nichtAktuell ? h('article', { class: 'karte fk-meldung warn au-meldung' }, h('b', {}, '⚠️ Nicht aktuell'), h('p', {}, m.nichtAktuell), h('div', { class: 'knopfzeile' }, nochmalKnopf(() => store.autosLaden?.()))) : null,
    m.warnungen.length > 0 ? h('article', { class: 'karte fk-meldung au-meldung' }, m.warnungen.map((w) => h('p', {}, `⚠️ ${w}`))) : null,
  ];
}

/** Kilometerstand, der in Glas/Bento mit Bewegung hochzählt (Klassisch: gleich der Endwert). */
export function kmZahl(klasse, schluessel, km) {
  const el = h('b', { class: klasse, 'data-bw-schluessel': schluessel });
  if (km.zahl === null) el.textContent = km.text;
  else hochzaehlen(el, km.zahl, (n) => `${km.geschaetzt ? 'ca. ' : ''}${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} km`);
  return el;
}

/** Zeichen und Wort des Stands als Pille (nie nur Farbe). */
export const statusPille = (x, klasse = '') => h('span', { class: `au-status ${x.status} ${klasse}`.trim() }, h('span', { 'aria-hidden': 'true' }, `${x.symbol} `), x.wort);

function knopf(text, klasse, onClick, mehr = {}) {
  return h('button', { class: `knopf klein ${klasse}`.trim(), type: 'button', onClick, ...mehr }, text);
}

function kopfKarte(m, ctx) {
  return h(
    'article',
    { class: 'karte au-held' },
    h(
      'div',
      { class: 'au-kopf' },
      h('span', { class: 'au-kachel gross', 'aria-hidden': 'true' }, '🚗'),
      h('div', { class: 'au-name' }, h('h1', { class: 'au-titel' }, m.name), m.untertitel ? h('small', {}, m.untertitel) : null, m.kennzeichen ? h('span', { class: 'au-kennzeichen' }, m.kennzeichen) : null),
    ),
    h('div', { class: 'au-zeile-km' }, kmZahl('au-km-zahl gross', `au-held-km-${m.id}`, m.km), m.anzahlFaellig > 0 ? h('span', { class: 'au-faellig' }, `${m.anzahlFaellig} fällig`) : null),
    h(
      'div',
      { class: 'knopfzeile au-knoepfe' },
      knopf('＋ Arbeit eintragen', 'primaer', () => oeffneArbeitFormular(ctx, m.id, {}), { disabled: Boolean(m.gesperrt) }),
      knopf('km eintragen', '', () => oeffneKmFormular(ctx, m.id), { disabled: Boolean(m.gesperrt) }),
    ),
  );
}

function regelZeile(z, m, ctx) {
  return h(
    'div',
    { class: `au-regel ${z.status}`, 'data-regel': z.regelId, 'data-typ': z.typ },
    h(
      'div',
      { class: 'au-regel-kopf' },
      h('span', { class: 'emoji', 'aria-hidden': 'true' }, z.emoji),
      h('b', { class: 'au-regel-name' }, z.name),
      statusPille(z),
    ),
    h('p', { class: 'au-regel-text' }, z.text),
    h('small', { class: 'au-intervall' }, z.intervall),
    h(
      'div',
      { class: 'knopfzeile' },
      knopf('ⓘ', 'au-info-knopf', () => oeffneRegelFormular(ctx, z.regelId), { 'aria-label': `${z.name}: Info, Quelle, ändern oder abschalten` }),
      knopf(z.aktion, z.status === 'ok' ? '' : 'primaer', () => (z.ausAuto ? oeffneAutoFormular(ctx, { autoId: m.id }) : oeffneArbeitFormular(ctx, m.id, { regelId: z.regelId })), { disabled: Boolean(m.gesperrt), 'aria-label': `${z.name}: ${z.aktion}` }),
    ),
  );
}

function faelligAbschnitt(m, ctx) {
  const aus =
    m.aus.length > 0
      ? h(
          'div',
          { class: 'au-aus' },
          h('small', { class: 'leise' }, 'Abgeschaltet (keine Erinnerung):'),
          m.aus.map((r) =>
            h(
              'div',
              { class: 'au-aus-zeile' },
              h('span', {}, `${r.emoji} ${r.name}`),
              h('button', { class: 'knopf klein', type: 'button', disabled: Boolean(m.gesperrt), onClick: (ev) => regelEinschalten(ctx, r.regelId, ev.currentTarget) }, 'Einschalten'),
            ),
          ),
        )
      : null;
  return abschnitt(
    'Fällig',
    h('article', { class: 'karte au-liste au-faellig-liste' }, m.faellig.length > 0 ? m.faellig.map((z) => regelZeile(z, m, ctx)) : h('p', { class: 'leise' }, 'Keine Regeln eingeschaltet.'), aus),
  );
}

// „Alle Stände“ bleibt nach dem Neuzeichnen (z. B. nach einem Löschen) offen
const kmListeOffen = new Set();

/** M2 (Abschluss-Review): alle eingegebenen Kilometerstände, je mit „Löschen“ (danach „Rückgängig“). */
function kmListe(m, ctx) {
  const eintraege = m.km.eintraege ?? [];
  if (eintraege.length === 0) return null;
  const liste = h(
    'details',
    { class: 'au-km-alle', open: kmListeOffen.has(m.id) },
    h('summary', { class: 'au-km-alle-kopf' }, `Alle Stände (${eintraege.length})`),
    h(
      'ul',
      { class: 'au-km-liste' },
      eintraege.map((e) =>
        h(
          'li',
          { class: 'au-km-eintrag', 'data-datum': e.datum },
          h('span', {}, e.text),
          h('button', { class: 'knopf klein au-loeschen', type: 'button', 'aria-label': e.beschriftung, disabled: Boolean(m.gesperrt), onClick: (ev) => kmLoeschen(ctx, m.id, e.datum, [ev.currentTarget]) }, 'Löschen'),
        ),
      ),
    ),
  );
  liste.addEventListener('toggle', () => (liste.open ? kmListeOffen.add(m.id) : kmListeOffen.delete(m.id)));
  return liste;
}

function kmAbschnitt(m, ctx) {
  const k = m.km;
  return abschnitt(
    'Kilometerstand',
    h(
      'article',
      { class: 'karte au-km-karte' },
      h('div', { class: 'au-km-kopf' }, kmZahl('au-km-zahl', `au-km-karte-${m.id}`, k), k.geschaetzt ? h('span', { class: 'au-marke' }, 'geschätzt') : null),
      k.stand ? h('small', {}, k.stand) : null,
      k.proTag ? h('small', {}, `${k.proTag} (Schnitt der letzten 90 Tage)`) : null,
      !k.stand && k.zahl === null ? h('small', {}, 'Noch kein Kilometerstand eingetragen – dann rechnet die App die km-Termine.') : null,
      k.warnung ? h('p', { class: 'au-warnung', role: 'note' }, `⚠ ${k.warnung}`) : null,
      h('div', { class: 'knopfzeile' }, knopf('Kilometerstand aktualisieren', 'primaer', () => oeffneKmFormular(ctx, m.id), { disabled: Boolean(m.gesperrt) })),
      kmListe(m, ctx),
    ),
  );
}

function satzKarte(s, r, m, ctx) {
  let balken = null;
  if (r.mitRotation) {
    const breite = Math.round(s.anteil * 100);
    const fuellung = h('span', { style: { width: `${breite}%` }, 'data-bw-schluessel': `au-rotation-${s.id}` });
    balken = h('div', { class: 'au-balken', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(r.rotationKm), 'aria-valuenow': String(Math.min(s.kmSeitRotation, r.rotationKm)), 'aria-valuetext': s.seitRotationText, 'aria-label': `${s.name}: km seit dem letzten Rotieren` }, fuellung);
    fortschritt(fuellung, s.anteil);
  }
  return h(
    'div',
    { class: `au-satz${s.montiert ? ' montiert' : ''}${s.rotationFaellig ? ' faellig' : ''}`, 'data-satz': s.id },
    h('div', { class: 'au-satz-kopf' }, h('span', { class: 'emoji', 'aria-hidden': 'true' }, s.emoji), h('b', {}, s.name), h('span', { class: `au-marke${s.montiert ? ' an' : ''}` }, s.montiertText)),
    h('div', { class: 'au-satz-zahl' }, h('span', {}, 'Gesamt auf diesem Satz'), h('b', {}, s.kmGesamtText)),
    r.mitRotation ? h('div', { class: 'au-satz-zahl' }, h('span', {}, 'Seit dem Rotieren'), h('b', {}, s.seitRotationText)) : null,
    balken,
    s.rotationFaellig ? h('p', { class: 'au-warnung' }, `⚠ Rotieren fällig – vorne/hinten tauschen (alle ${r.rotationKm.toLocaleString('de-AT')} km)`) : null,
    // M2 (Abschluss-Review): steht der Satz im Verlauf, erklärt die Meldung, warum er (noch) nicht gelöscht wird
    h('div', { class: 'knopfzeile au-satz-loeschen' }, knopf('Reifensatz löschen', 'au-loeschen', (ev) => satzLoeschen(ctx, s.id, [ev.currentTarget]), { disabled: Boolean(m.gesperrt), 'aria-label': s.loeschenBeschriftung })),
  );
}

function reifenAbschnitt(m, ctx) {
  const r = m.reifen;
  if (!r) return null;
  return abschnitt(
    'Reifen',
    h(
      'article',
      { class: 'karte au-reifen' },
      r.saetze.length === 0 ? h('p', { class: 'leise' }, 'Noch keine Reifensätze. Lege Sommer- und Winterreifen an – dann rechnet die App die Kilometer je Satz und erinnert an den Wechsel.') : null,
      r.saetze.map((s) => satzKarte(s, r, m, ctx)),
      r.saison ? h('div', { class: 'fk-box au-box au-saison' }, h('b', {}, `🗓️ ${r.saison.text}`), h('small', {}, r.saison.hinweis), h('a', { class: 'au-quelle', href: r.saison.quelle, target: '_blank', rel: 'noopener noreferrer' }, 'Quelle: oesterreich.gv.at ↗')) : null,
      h(
        'div',
        { class: 'knopfzeile au-knoepfe' },
        r.saetze.length > 0 && r.mitRotation ? knopf('＋ Rotation', '', () => oeffneArbeitFormular(ctx, m.id, { typ: 'rotation' }), { disabled: Boolean(m.gesperrt) }) : null,
        r.saetze.length > 0 ? knopf('＋ Reifenwechsel', 'primaer', () => oeffneArbeitFormular(ctx, m.id, { typ: 'reifenwechsel' }), { disabled: Boolean(m.gesperrt) }) : null,
      ),
      h('div', { class: 'knopfzeile au-satz-neu' }, knopf('＋ Reifensatz anlegen', r.saetze.length === 0 ? 'primaer' : '', () => oeffneSatzFormular(ctx, m.id), { disabled: Boolean(m.gesperrt) })),
    ),
  );
}

function vignetteAbschnitt(m, ctx) {
  const v = m.vignette;
  if (!v) return null;
  return abschnitt(
    'Vignette',
    h(
      'article',
      { class: `karte au-vignette ${v.status}` },
      h('div', { class: 'au-regel-kopf' }, h('span', { class: 'emoji', 'aria-hidden': 'true' }, '🎫'), h('b', { class: 'au-regel-name' }, v.titel), statusPille(v)),
      h('p', { class: 'au-regel-text' }, v.text),
      h('ul', { class: 'au-info' }, v.info.map((t) => h('li', {}, t))),
      h('a', { class: 'au-quelle', href: v.quelle, target: '_blank', rel: 'noopener noreferrer' }, 'Quelle: ASFINAG ↗'),
      h('div', { class: 'knopfzeile' }, knopf('Vignette eintragen', 'primaer', () => oeffneArbeitFormular(ctx, m.id, { regelId: v.regelId }), { disabled: Boolean(m.gesperrt) })),
    ),
  );
}

function verlaufZeile(v, m, ctx) {
  const loeschen = h('button', { class: 'au-wisch-loeschen', type: 'button', 'aria-label': `${v.titel} vom ${v.zeile} löschen`, disabled: Boolean(m.gesperrt) }, '🗑️ Löschen');
  const zeile = h(
    'button',
    { class: 'au-eintrag', type: 'button', 'aria-label': `${v.beschriftung} – ändern oder löschen`, 'data-id': v.id },
    h('span', { class: 'emoji', 'aria-hidden': 'true' }, v.emoji),
    h('span', { class: 'au-eintrag-text' }, h('b', {}, v.titel), h('small', {}, v.zeile), v.details ? h('small', { class: 'au-eintrag-details' }, v.details) : null, v.notiz ? h('small', { class: 'au-eintrag-details' }, `„${v.notiz}“`) : null),
    v.kosten ? h('span', { class: 'au-kosten' }, v.kosten) : null,
  );
  const huelle = h('div', { class: 'au-wisch' }, loeschen, zeile);
  const w = wischbar(huelle, zeile, loeschen);
  zeile.addEventListener('click', () => {
    if (zeile.dataset.gewischt) {
      delete zeile.dataset.gewischt;
      return;
    }
    if (w.istOffen()) {
      w.schliessen();
      return;
    }
    oeffneArbeitFormular(ctx, m.id, { arbeitId: v.id });
  });
  loeschen.addEventListener('click', () => arbeitLoeschen(ctx, m.id, v.jahr, v.id, [loeschen]));
  return huelle;
}

function verlaufAbschnitt(m, ctx) {
  return abschnitt(
    'Verlauf',
    h(
      'article',
      { class: 'karte au-liste au-verlauf' },
      m.verlauf.length > 0 ? m.verlauf.map((v) => verlaufZeile(v, m, ctx)) : h('p', { class: 'leise' }, 'Noch nichts eingetragen.'),
      m.verlauf.length > 0 ? h('small', { class: 'leise au-tipp' }, 'Tippen zum Ändern · nach links wischen zum Löschen') : null,
      h('div', { class: 'knopfzeile' }, knopf('＋ Arbeit eintragen', '', () => oeffneArbeitFormular(ctx, m.id, {}), { disabled: Boolean(m.gesperrt) })),
    ),
  );
}

function datenAbschnitt(m, ctx) {
  return abschnitt(
    'Fahrzeugdaten',
    h(
      'article',
      { class: 'karte au-daten' },
      h('dl', { class: 'au-daten-liste' }, m.fahrzeugdaten.map((f) => h('div', { class: `au-datum${f.wert === '—' ? ' leer' : ''}`, 'data-feld': f.feld }, h('dt', {}, f.name), h('dd', {}, f.wert)))),
      h('p', { class: 'fk-box au-box au-datenschutz' }, `🔒 ${TEXT_DATENSCHUTZ}`),
      h('div', { class: 'knopfzeile' }, knopf('Fahrzeugdaten bearbeiten', '', () => oeffneAutoFormular(ctx, { autoId: m.id }), { disabled: Boolean(m.gesperrt) })),
    ),
  );
}

/** Seite des Autos `id`; gibt es das Auto nicht (mehr), ein Hinweis mit dem Weg zurück. */
export function autoScreen({ store, ui }, id) {
  const ctx = { store, ui };
  const m = autoSeiteModel(store.getState(), store.heute(), id);
  const zurueck = h('button', { class: 'zurueck', type: 'button', onClick: () => ui.gehZu('autos') }, '‹ Autos');
  if (!m) {
    const a = store.getState().autos;
    const laedt = ['laedt', null].includes(a?.status) && !a?.frisch;
    // M5 (Review T4): nicht gelesen ist nicht „gibt es nicht“
    const fehler = a?.status === 'fehler' && (a?.daten?.autos ?? []).length === 0;
    const text = laedt ? 'Das Auto wird geladen …' : fehler ? 'Die Autos konnten nicht gelesen werden.' : 'Dieses Auto gibt es nicht (mehr).';
    return h('section', { class: 'screen auto-seite' }, zurueck, h('article', { class: 'karte hinweis' }, h('p', {}, text), fehler ? h('div', { class: 'knopfzeile' }, nochmalKnopf(() => store.autosLaden?.())) : null));
  }
  return h(
    'section',
    { class: 'screen auto-seite', style: { '--auto': m.farbe }, 'data-auto': m.id },
    zurueck,
    kopfKarte(m, ctx),
    ...autosMeldungen(m.meldungen, store),
    m.radmuttern ? h('article', { class: 'karte tint au-radmuttern', style: { '--c': 'var(--abwesend)' } }, h('p', {}, `🔧 ${m.radmuttern}`)) : null,
    faelligAbschnitt(m, ctx),
    kmAbschnitt(m, ctx),
    reifenAbschnitt(m, ctx),
    vignetteAbschnitt(m, ctx),
    verlaufAbschnitt(m, ctx),
    datenAbschnitt(m, ctx),
  );
}
