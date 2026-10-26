// Ansicht „Fixkosten“ im Konto-Tab (Umschalter „Kontostand · Fixkosten · Sparziele“ oben): Kopf mit Ø pro Monat, im Jahr, diesen Monat fällig und
// Ø Ersparnis aus dem Kontostand; Filter je Person mit Teilsumme; „Diesen Monat fällig“ (ohne offen/bezahlt – wird automatisch
// abgebucht); Listen je Kategorie; Kündigungsfristen; Fixkosten und Ersparnis; Archiv. Alle Zahlen kommen aus fixkosten-model.js,
// alle Texte als Text in die Seite (nie als HTML). Ein Tipp auf einen Posten öffnet das Formular (fixkosten-formular.js).
import { h } from './dom.js';
import { fixkostenModel } from '../app/views/fixkosten-model.js';
import { oeffneFixArchiviert, oeffneFixFormular } from './fixkosten-formular.js';
import { betragText } from '../domain/konto.js';
import { effekteAn, hochzaehlen } from './bewegung.js';

const ANSICHTEN = [
  ['kontostand', 'Kontostand'],
  ['fixkosten', 'Fixkosten'],
  ['sparziele', 'Sparziele'],
];

let gezeichneteAnsicht = null; // zuletzt gezeichnete Ansicht im Konto-Tab (für data-von)
let wechsel = null; // letzter Wechsel { von, nach, x, erstellt, zeit } (für data-von)
/** So lange nach dem ersten gemalten Bild gleitet der Tropfen/Blob noch (themes/konto.css: ≤ 0,5 s). */
export const GLEITEN_MS = 600;
/** Wird nie ein Bild gemalt (Seite im Hintergrund), gilt das Gleiten nach dieser Zeit als vorbei (großzügig: ein langsames Telefon
 *  braucht für das erste Zeichnen samt Laden der Sparziele über 2 s). */
export const OHNE_BILD_MS = 5000;

const jetztMs = () => globalThis.performance?.now?.() ?? Date.now();
const naechstesBild = (fn) => globalThis.requestAnimationFrame?.(fn);

/** Wo der Tropfen/Blob gerade steht (px, auch mitten im Gleiten) – nur in Glas/Bento mit Bewegung, sonst null. */
function tropfenJetzt() {
  const dokument = globalThis.document;
  if (!effekteAn(dokument)) return null;
  const segment = dokument.querySelector?.('.konto-segment');
  const transform = segment ? globalThis.getComputedStyle?.(segment, '::before')?.transform : null;
  if (!transform || transform === 'none' || typeof globalThis.DOMMatrixReadOnly !== 'function') return null;
  return Math.round(new globalThis.DOMMatrixReadOnly(transform).m41 * 100) / 100;
}

/**
 * Umschalter oben im Konto-Tab; die Wahl wird auf diesem Telefon gemerkt (ui.setzeKontoAnsicht). Nach dem Umschalten nennt
 * `data-von` die vorige Ansicht, `--kt-von` die Stelle, an der der Tropfen/Blob gerade stand (px; auch mitten in einem Gleiten), und
 * `--kt-seit` die Zeit seit dem ersten GEMALTEN Bild (negativ): daran gleitet er in Glas/Bento (themes/konto.css). Neuzeichnen vor dem
 * ersten Bild (z. B. die Fixkosten/Sparziele laden gleich nach dem Öffnen) beginnt das Gleiten deshalb ganz von vorn, eines danach
 * setzt es an derselben Stelle fort; nach GLEITEN_MS, beim Betreten der Seite und bei jedem späteren Neuzeichnen gibt es kein data-von.
 * In Klassisch und bei „Reduziert“ läuft nichts (kein Bildwechsel, kein data-von). `jetzt`, `bild` (erstes gemaltes Bild), `tropfenX`
 * und `effekte` (Glas/Bento mit Bewegung?) lassen sich für Tests ersetzen.
 */
export function kontoUmschalter(ui, { jetzt = jetztMs(), bild = naechstesBild, tropfenX = tropfenJetzt, effekte = () => effekteAn(globalThis.document) } = {}) {
  const aktuell = ui.kontoAnsicht ?? 'kontostand';
  if (ui.seiteBetreten || !effekte()) wechsel = null;
  else if (gezeichneteAnsicht !== null && gezeichneteAnsicht !== aktuell) {
    const neu = { von: gezeichneteAnsicht, nach: aktuell, x: tropfenX(), erstellt: jetzt, zeit: null };
    wechsel = neu;
    bild((t) => {
      neu.zeit ??= Number.isFinite(t) ? t : jetztMs();
    });
  }
  gezeichneteAnsicht = aktuell;
  const laeuft =
    wechsel && wechsel.nach === aktuell && (wechsel.zeit === null ? jetzt - wechsel.erstellt < OHNE_BILD_MS : jetzt - wechsel.zeit < GLEITEN_MS) ? wechsel : null;
  const seit = laeuft && laeuft.zeit !== null ? Math.max(0, jetzt - laeuft.zeit) : 0;
  const stil = laeuft ? { '--kt-seit': `${-Math.round(seit)}ms`, ...(laeuft.x === null ? {} : { '--kt-von': `${laeuft.x}px` }) } : null;
  return h(
    'div',
    {
      class: 'konto-segment',
      role: 'group',
      'aria-label': 'Ansicht im Konto',
      'data-von': laeuft?.von,
      style: stil,
    },
    ANSICHTEN.map(([wert, text]) =>
      h('button', { class: `konto-segment-knopf${aktuell === wert ? ' aktiv' : ''}`, type: 'button', 'aria-pressed': aktuell === wert ? 'true' : 'false', onClick: () => aktuell !== wert && ui.setzeKontoAnsicht?.(wert) }, text),
    ),
  );
}

/** „~ ungefähr“ und „~ 89 €“ brechen nicht nach der Tilde um. */
const fest = (text) => text.replaceAll('~ ', '~ ');

/** Person als Kürzel mit Farbe (nie nur Farbe). */
const personPille = (person) => h('span', { class: `fk-person fk-person-${person.id}`, title: person.name }, person.kuerzel);

const abzeichen = (a) => (a ? h('span', { class: `fk-abzeichen${a.warn ? ' warn' : ''}` }, a.text) : null);

/** Karte mit Titel links und kleiner Angabe rechts. */
function karte(titel, rechts, klasse, ...inhalt) {
  return h('article', { class: `karte fk-karte ${klasse ?? ''}`.trim() }, h('h3', { class: 'fk-karte-titel' }, h('span', {}, titel), rechts ? h('small', {}, rechts) : null), ...inhalt);
}

function kopfKarte(m) {
  const k = m.kopf;
  // Glas/Bento mit Bewegung: der Betrag zählt beim ersten Zeigen bzw. nach einem anderen Filter hoch (Klassisch: gleich der Text)
  const gross = h('b', { class: 'fk-gross', 'data-bw-schluessel': 'fk-monatlich' });
  hochzaehlen(gross, k.monatlichCents, betragText);
  return h(
    'article',
    { class: 'karte fk-kopf' },
    h('span', { class: 'fk-klein' }, k.titel),
    gross,
    h('span', { class: 'fk-klein' }, k.jahrText),
    h('div', { class: 'fk-kopf-zeile' }, h('span', {}, 'Diesen Monat fällig'), h('b', {}, k.faellig)),
    h('div', { class: 'fk-kopf-zeile' }, h('span', {}, 'Ø Ersparnis (6 Monate, aus Kontostand)'), h('b', {}, k.ersparnis ?? '—')),
  );
}

function filterLeiste(m, ui) {
  return h(
    'div',
    { class: 'chips fk-filter', role: 'group', 'aria-label': 'Wessen Fixkosten' },
    m.filter.map((f) =>
      h(
        'button',
        { class: `chip fk-filter-${f.id}${f.aktiv ? ' aktiv' : ''}`, type: 'button', 'aria-pressed': f.aktiv ? 'true' : 'false', onClick: () => ui.setzeFixFilter?.(f.id) },
        `${f.text} `,
        h('span', { class: 'fk-chip-betrag' }, f.betrag),
      ),
    ),
  );
}

/** Ein Posten als Knopf (öffnet das Formular bzw. bei archivierten „Zurückholen / Endgültig löschen“). */
function postenKnopf(id, beschriftung, kinder, ctx, archiviert = false) {
  return h(
    'button',
    { class: 'fk-pos', type: 'button', 'aria-label': beschriftung, 'data-id': id, onClick: () => (archiviert ? oeffneFixArchiviert(ctx, id) : oeffneFixFormular(ctx, id)) },
    kinder,
  );
}

function faelligKarte(m, ctx) {
  const f = m.faellig;
  return karte(
    f.titel,
    f.eintraege.length > 0 ? f.summe : null,
    'fk-faellig',
    f.eintraege.length === 0
      ? h('p', { class: 'leise' }, `Im ${f.monatText.split(' ')[0]} ist nichts fällig.`)
      : h(
          'div',
          { class: 'fk-liste' },
          f.eintraege.map((e) =>
            postenKnopf(
              e.id,
              `${e.name}, am ${e.tag} ${e.betrag}`,
              [h('span', { class: 'fk-tag' }, e.tag), h('span', { class: 'fk-n' }, h('b', {}, e.name), h('small', {}, e.unter)), h('span', { class: 'fk-b' }, fest(e.betrag))],
              ctx,
            ),
          ),
        ),
  );
}

function kategorieKarte(k, ctx) {
  return karte(
    k.titel,
    k.summe,
    'fk-kategorie',
    h(
      'div',
      { class: 'fk-liste' },
      k.posten.map((z) =>
        postenKnopf(
          z.id,
          z.beschriftung,
          [
            h('span', { class: 'fk-n' }, h('b', {}, z.name), h('small', {}, personPille(z.person), ` ${fest(z.unter)}`, z.gesperrt ? ' · 🔒 gesperrt' : ''), abzeichen(z.abzeichen)),
            h('span', { class: 'fk-b' }, fest(z.betrag), z.proMonat ? h('small', {}, 'pro Monat') : null),
          ],
          ctx,
          z.archiviert,
        ),
      ),
    ),
  );
}

function fristenKarte(m, ctx) {
  if (m.fristen.length === 0) return null;
  return karte(
    '📝 Kündigungsfristen',
    'nächste zuerst',
    'fk-fristen',
    h(
      'div',
      { class: 'fk-liste' },
      m.fristen.map((f) => postenKnopf(f.id, f.beschriftung, [h('span', { class: 'fk-n' }, h('b', {}, f.name), h('small', {}, f.unter), abzeichen(f.abzeichen))], ctx)),
    ),
  );
}

function diagrammKarte(m) {
  const d = m.diagramm;
  if (!d) return null;
  return karte(
    '📊 Fixkosten und Ersparnis',
    d.monate.length === 1 ? 'dieser Monat' : `letzte ${d.monate.length} Monate`,
    'fk-diagramm',
    h(
      'div',
      { class: 'fk-monate' },
      d.monate.map((x) =>
        h(
          'div',
          { class: 'fk-monat' },
          h('span', { class: 'fk-klein' }, x.text),
          h(
            'div',
            { class: 'fk-balken', 'aria-hidden': 'true' },
            h('span', { class: 'fk-balken-fix', style: { width: `${x.fixBreite}%` } }),
            x.sparBreite > 0 ? h('span', { class: 'fk-balken-spar', style: { width: `${x.sparBreite}%` } }) : null,
          ),
          h('div', { class: 'fk-legende' }, h('span', { class: 'fk-leg-fix' }, x.faellig), h('span', { class: `fk-leg-spar${x.minus ? ' minus' : ''}` }, x.ersparnis)),
        ),
      ),
    ),
    d.hinweis ? h('p', { class: 'leise fk-hinweis fk-waechst' }, d.hinweis) : null,
    h('p', { class: 'leise fk-hinweis' }, 'Monate mit großen Zahlungen (z. B. jährliche Beiträge) zeigen, warum weniger gespart wurde.'),
  );
}

function archivKarte(m, ctx) {
  if (m.archiv.length === 0) return null;
  return karte(
    '🗄️ Archiv',
    String(m.archiv.length),
    'fk-archiv',
    h(
      'div',
      { class: 'fk-liste' },
      m.archiv.map((a) => postenKnopf(a.id, a.beschriftung, [h('span', { class: 'fk-n' }, h('b', {}, a.name), h('small', {}, a.unter)), h('span', { class: 'fk-b' }, '—')], ctx, true)),
    ),
  );
}

/** Warnungen beim Lesen, unlesbare Teile (gesperrt) und ausgeblendete Posten einer neueren Version. */
function meldungen(m) {
  return [
    ...m.unlesbar.map((u) => h('article', { class: 'karte fk-meldung warn' }, h('b', {}, `⚠️ ${u.titel}`), h('p', {}, u.text))),
    m.warnungen.length > 0 ? h('article', { class: 'karte fk-meldung' }, m.warnungen.map((w) => h('p', {}, `⚠️ ${w}`))) : null,
  ];
}

/** Inhalt der Ansicht „Fixkosten“ (ohne Überschrift und Umschalter). */
export function fixkostenInhalt({ store, ui }) {
  const m = fixkostenModel(store.getState(), store.heute(), { filter: ui.fixFilter });
  const ctx = { store, ui };
  if (m.zustand !== 'ok') {
    const text = m.zustand === 'laedt' ? 'Fixkosten werden geladen …' : m.zustand === 'fehler' ? 'Die Fixkosten konnten nicht geladen werden.' : 'Noch nicht geladen – bitte verbinden.';
    return [
      h(
        'article',
        { class: 'karte hinweis fk-nicht-geladen' },
        h('p', {}, text),
        m.zustand === 'fehler' ? h('div', { class: 'knopfzeile' }, h(
                'button',
                {
                  class: 'knopf klein',
                  type: 'button',
                  onClick: (ev) => {
                    // sichtbar, dass es läuft; das Neuzeichnen (Status „lädt“, dann gelesen oder Fehler) ersetzt den Knopf
                    ev.currentTarget.disabled = true;
                    ev.currentTarget.textContent = 'Wird geladen …';
                    ui.fixLaden?.({ nochmal: true });
                  },
                },
                'Nochmal versuchen',
              )) : null,
      ),
    ];
  }
  const neu = h('button', { class: 'knopf primaer fk-neu', type: 'button', onClick: () => oeffneFixFormular(ctx, null) }, '＋ Fixkosten eintragen');
  return [
    m.veraltet ? h('p', { class: 'leise fk-veraltet' }, 'Nicht aktualisiert – gezeigt wird der zuletzt gelesene Stand.') : null,
    ...meldungen(m),
    kopfKarte(m),
    filterLeiste(m, ui),
    m.fremdHinweis ? h('p', { class: 'leise fk-fremd' }, `ℹ️ ${m.fremdHinweis}`) : null,
    neu,
    m.leer ? h('article', { class: 'karte hinweis' }, h('p', {}, 'Noch keine Fixkosten. Tragt Miete, Versicherungen oder Abos ein – mit Vorlagen geht es schnell.')) : faelligKarte(m, ctx),
    m.kategorien.map((k) => kategorieKarte(k, ctx)),
    !m.leer && m.kategorien.length === 0 ? h('p', { class: 'leise' }, 'Für diese Person gibt es keine laufenden Fixkosten.') : null,
    fristenKarte(m, ctx),
    diagrammKarte(m),
    archivKarte(m, ctx),
  ];
}
