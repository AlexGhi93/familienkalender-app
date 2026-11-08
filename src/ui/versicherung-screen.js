// Ansicht „Versicherung“ im Konto-Tab (Umschalter „Kontostand · Fixkosten · Sparziele · Versicherung“ oben, Spec §3): Jahr ‹ JJJJ ›, Gesamt
// „Noch X € von Y €“ mit Balken, eine Karte je Kategorie (Limit, verbraucht, noch, ⏳ eingereicht und ✓ erstattet getrennt, „⚠ Limit
// überschritten“), „＋ Rechnung einreichen“, die Rechnungen des Jahres (neueste zuerst; Tippen = Blatt mit Ändern, „Erstattung erhalten“,
// Löschen; nach links wischen = Löschen mit „Rückgängig“) und „Polizze bearbeiten“. Ohne Polizze: „MedPLUS Privatarzt Basic anlegen“
// oder „Eigene Polizze“. Zahlen und Texte aus app/views/versicherung-model.js, alle Texte als Text in die Seite (nie als HTML).
import { h } from './dom.js';
import { abschnitt } from './components.js';
import { fortschritt, hochzaehlen } from './bewegung.js';
import { betragText } from '../domain/konto.js';
import { TEXT_VERSICHERUNG_NICHT_GELADEN, VERSICHERUNG_FARBE, versicherungModel } from '../app/views/versicherung-model.js';
import { wischbar } from './auto-screen.js';
import { oeffnePolizzeFormular, oeffneRechnungBlatt, oeffneRechnungFormular, rechnungWischLoeschen } from './versicherung-formular.js';

let gewaehltesJahr = null; // angezeigtes Jahr (null = laufendes); bleibt beim Neuzeichnen und Umschalten im Konto-Tab

/** Knopf „Nochmal versuchen“: liest die Versicherung neu (das Neuzeichnen ersetzt ihn). */
function nochmalKnopf(store) {
  return h(
    'button',
    {
      class: 'knopf klein',
      type: 'button',
      onClick: async (ev) => {
        const knopf = ev.currentTarget; // nach dem `await` ist currentTarget schon null
        knopf.disabled = true;
        knopf.textContent = 'Wird geladen …';
        await store.versicherungLaden?.();
        knopf.disabled = false;
        knopf.textContent = 'Nochmal versuchen';
      },
    },
    'Nochmal versuchen',
  );
}

function meldungen(m, store) {
  const x = m.meldungen;
  return [
    x.unlesbar ? h('article', { class: 'karte fk-meldung warn vs-meldung' }, h('b', {}, '🔒 Versicherung unlesbar'), h('p', {}, x.unlesbar)) : null,
    x.nichtAktuell ? h('article', { class: 'karte fk-meldung warn vs-meldung' }, h('b', {}, '⚠️ Nicht aktuell'), h('p', {}, x.nichtAktuell), h('div', { class: 'knopfzeile' }, nochmalKnopf(store))) : null,
    x.warnungen.length > 0 ? h('article', { class: 'karte fk-meldung vs-meldung' }, x.warnungen.map((w) => h('p', {}, `⚠️ ${w}`))) : null,
  ];
}

/** Balken (Klassisch: Breite in %; Glas/Bento: volle Füllung über scaleX, siehe fortschritt). */
function balken(breite, farbe, beschriftung, wert, schluessel) {
  const fuellung = h('span', { style: { width: `${breite}%`, background: farbe }, 'data-bw-schluessel': schluessel });
  const bahn = h('div', { class: 'sz-balken vs-balken', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(breite), 'aria-valuetext': wert, 'aria-label': beschriftung }, fuellung);
  fortschritt(fuellung, breite / 100);
  return bahn;
}

function jahrWahl(m, ui) {
  const rund = (zeichen, beschriftung, ziel, aktiv) =>
    h('button', { class: 'rund', type: 'button', 'aria-label': beschriftung, disabled: !aktiv, onClick: () => ((gewaehltesJahr = ziel), ui.rendern()) }, zeichen);
  return h(
    'div',
    { class: 'monat-kopf jahr-wahl vs-jahr', role: 'group', 'aria-label': 'Jahr' },
    rund('‹', 'Vorheriges Jahr', m.jahr - 1, m.hatVorher),
    h(
      'div',
      { class: 'jahr-titel' },
      h('b', {}, m.jahrText),
      m.istAktuell ? h('small', {}, 'laufendes Jahr') : h('button', { class: 'knopf klein', type: 'button', onClick: () => ((gewaehltesJahr = null), ui.rendern()) }, 'Zum laufenden Jahr'),
    ),
    rund('›', 'Nächstes Jahr', m.jahr + 1, m.hatNachher),
  );
}

function kopfKarte(m) {
  const g = m.gesamt;
  const rest = h('b', { class: 'fk-gross vs-rest', 'data-bw-schluessel': `vs-rest-${m.jahr}` });
  hochzaehlen(rest, g.restCents, betragText);
  return h(
    'article',
    { class: 'karte fk-kopf vs-kopf', 'aria-label': g.beschriftung, style: { '--sz-farbe': VERSICHERUNG_FARBE } },
    h('span', { class: 'fk-klein vs-polizze' }, m.untertitel ? `${m.titel} · ${m.untertitel}` : m.titel),
    h('p', { class: 'vs-gesamt' }, h('span', { class: 'vs-gesamt-wort' }, 'Noch '), rest, h('span', { class: 'vs-gesamt-wort' }, ` von ${g.maximum}`)),
    balken(g.breite, VERSICHERUNG_FARBE, `Ausgeschöpft ${m.jahrText}`, g.text, `vs-gesamt-${m.jahr}`),
    h('div', { class: 'fk-kopf-zeile' }, h('span', {}, `Verbraucht ${m.jahrText}`), h('b', {}, g.verbraucht)),
    g.ueberschritten ? h('p', { class: 'vs-warnung' }, g.ueberschritten) : null,
    g.ohneKategorie ? h('p', { class: 'vs-warnung' }, `⚠ ${g.ohneKategorie}`) : null,
  );
}

function kategorieKarte(k, m) {
  return h(
    'article',
    { class: `karte vs-kat${k.ueberschritten ? ' ueber' : ''}`, 'data-kategorie': k.id, 'aria-label': k.beschriftung, style: { '--sz-farbe': k.farbe } },
    h('h3', { class: 'sz-ziel-titel vs-kat-titel' }, h('span', {}, k.name), h('small', {}, k.limit)),
    k.info ? h('small', { class: 'fk-klein vs-info' }, k.info) : null,
    balken(k.breite, k.farbe, `Verbraucht ${k.name}`, `${k.verbraucht} von ${k.limit.replace('Limit ', '')}`, `vs-kat-${m.jahr}-${k.id}`),
    h('div', { class: 'sz-raster vs-raster' }, h('span', {}, 'Verbraucht'), h('b', {}, k.verbraucht), h('span', {}, 'Noch'), h('b', { class: 'vs-noch' }, k.rest)),
    k.eingereicht || k.erstattet ? h('div', { class: 'vs-stand' }, k.eingereicht ? h('span', { class: 'vs-pille eingereicht' }, k.eingereicht) : null, k.erstattet ? h('span', { class: 'vs-pille erstattet' }, k.erstattet) : null) : null,
    k.ueberschritten ? h('p', { class: 'vs-warnung' }, k.ueberschritten) : null,
    k.begrenzt ? h('small', { class: 'fk-klein' }, k.begrenzt) : null,
  );
}

function rechnungZeile(r, m, ctx) {
  const loeschen = h('button', { class: 'au-wisch-loeschen', type: 'button', 'aria-label': `${r.titel}, ${r.zeile} löschen`, disabled: Boolean(m.gesperrt) }, '🗑️ Löschen');
  const zeile = h(
    'button',
    { class: `au-eintrag vs-rechnung ${r.status.art}`, type: 'button', 'aria-label': `${r.beschriftung} – ändern, Erstattung oder löschen`, 'data-id': r.id },
    h('span', { class: 'emoji', 'aria-hidden': 'true' }, r.status.art === 'erstattet' ? '✅' : '🧾'),
    h(
      'span',
      { class: 'au-eintrag-text' },
      h('b', {}, r.titel),
      h('small', {}, r.zeile),
      h('small', { class: `vs-status ${r.status.art}` }, r.status.text),
      r.offenSeit ? h('small', { class: 'vs-offen' }, r.offenSeit) : null,
      r.ueberschritten ? h('small', { class: 'vs-warnung' }, r.ueberschritten) : null,
      r.notiz ? h('small', { class: 'au-eintrag-details' }, `„${r.notiz}“`) : null,
    ),
    h('span', { class: 'au-kosten vs-betrag' }, r.betrag),
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
    oeffneRechnungBlatt(ctx, r.id);
  });
  loeschen.addEventListener('click', () => rechnungWischLoeschen(ctx, r.id, [loeschen]));
  return huelle;
}

function rechnungenAbschnitt(m, ctx) {
  return abschnitt(
    `Rechnungen ${m.jahrText}`,
    h(
      'article',
      { class: 'karte au-liste vs-liste' },
      m.rechnungen.length > 0 ? m.rechnungen.map((r) => rechnungZeile(r, m, ctx)) : h('p', { class: 'leise' }, m.leerText),
      m.rechnungen.length > 0 ? h('small', { class: 'leise au-tipp' }, 'Tippen zum Ändern oder für „Erstattung erhalten“ · nach links wischen zum Löschen') : null,
    ),
  );
}

function leerKarte(m, ctx) {
  const [vorlage] = m.vorlagen;
  return h(
    'article',
    { class: 'karte vs-leer' },
    h('h3', {}, '🩺 Noch keine Polizze'),
    h('p', { class: 'leise' }, 'Legt die Privatarzt-Versicherung eures Kindes an: Limits je Leistung und Kalenderjahr, dazu die eingereichten Rechnungen – die App rechnet, wie viel noch übrig ist, und erinnert an offene Erstattungen.'),
    h(
      'div',
      { class: 'knopfzeile vs-anlegen' },
      h('button', { class: 'knopf primaer', type: 'button', disabled: Boolean(m.gesperrt), onClick: () => oeffnePolizzeFormular(ctx, { vorlageId: vorlage.id }) }, `${vorlage.name} anlegen`),
      h('button', { class: 'knopf', type: 'button', disabled: Boolean(m.gesperrt), onClick: () => oeffnePolizzeFormular(ctx, { vorlageId: null }) }, 'Eigene Polizze'),
    ),
    h('p', { class: 'leise fk-tipp' }, 'Die Limits der Vorlage stammen aus der Polizze (Basic, je Kalenderjahr) und lassen sich jederzeit ändern.'),
  );
}

/** Inhalt der Ansicht „Versicherung“ (ohne Überschrift und Umschalter). */
export function versicherungInhalt({ store, ui }) {
  const ctx = { store, ui };
  const m = versicherungModel(store.getState(), store.heute(), { jahr: gewaehltesJahr });
  if (m.zustand === 'laedt') return [h('article', { class: 'karte hinweis vs-laedt' }, h('p', {}, 'Die Versicherung wird geladen …'))];
  if (m.zustand === 'nichtGeladen') return [h('article', { class: 'karte hinweis vs-nicht-geladen' }, h('p', {}, TEXT_VERSICHERUNG_NICHT_GELADEN), h('div', { class: 'knopfzeile' }, nochmalKnopf(store)))];
  if (m.zustand === 'gesperrt') return meldungen(m, store);
  if (m.zustand === 'leer') return [...meldungen(m, store), leerKarte(m, ctx)];
  gewaehltesJahr = m.istAktuell ? null : m.jahr;
  return [
    ...meldungen(m, store),
    jahrWahl(m, ui),
    kopfKarte(m),
    h('button', { class: 'knopf primaer fk-neu vs-neu', type: 'button', disabled: Boolean(m.gesperrt), onClick: () => oeffneRechnungFormular(ctx, null) }, '＋ Rechnung einreichen'),
    h('p', { class: 'fk-box vs-hinweis', role: 'note' }, `ℹ️ ${m.hinweis}`),
    abschnitt(`Leistungen ${m.jahrText}`, m.karten.map((k) => kategorieKarte(k, m))),
    rechnungenAbschnitt(m, ctx),
    h('div', { class: 'knopfzeile vs-polizze-knoepfe' }, h('button', { class: 'knopf klein', type: 'button', disabled: Boolean(m.gesperrt), onClick: () => oeffnePolizzeFormular(ctx, { bearbeiten: true }) }, 'Polizze bearbeiten')),
  ];
}
