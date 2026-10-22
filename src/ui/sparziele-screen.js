// Ansicht „Sparziele“ im Konto-Tab (Umschalter „Kontostand · Fixkosten · Sparziele“ oben): Kopf (für Ziele zurückgelegt, nötig pro Monat,
// frei, Stand), eine Karte je laufendem Ziel (Balken, gespart/Ziel/%, noch offen, Monate, € pro Monat, Status), „💜 Frei verfügbar“ mit
// „Zu Ziel verschieben“, „＋ Neues Sparziel“ und „Verlauf pro Monat“ (Ersparnis und Aufteilung je Monat, abgeschlossene Ziele mit
// Ausblenden / Endgültig löschen). Alle Zahlen kommen aus sparziele-model.js (Domäne), alle Texte als Text in die Seite (nie als HTML).
import { h } from './dom.js';
import { abschnitt } from './components.js';
import { sparzieleModel } from '../app/views/sparziele-model.js';
import { erledigt, oeffneVerschieben, oeffneZielFormular, sicher, zielLoeschenFragen } from './sparziele-formular.js';

const MONATE_SICHTBAR = 4; // „Verlauf pro Monat“ zeigt zuerst nur die neuesten Monate
let ausgeblendeteZeigen = false; // abgeschlossene, ausgeblendete Ziele im Verlauf zeigen
let aeltereOffen = false; // ältere Monate im Verlauf aufgeklappt

/** Knopf „Nochmal versuchen“: liest nur die Sparziele neu (store.zieleLaden); das Neuzeichnen ersetzt ihn. */
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
        await store.zieleLaden?.();
        knopf.disabled = false; // falls die Seite (noch) nicht neu gezeichnet wurde
        knopf.textContent = 'Nochmal versuchen';
      },
    },
    'Nochmal versuchen',
  );
}

function meldungen(m, store) {
  return [
    m.unlesbar ? h('article', { class: 'karte fk-meldung warn sz-meldung' }, h('b', {}, '🔒 Sparziele unlesbar'), h('p', {}, m.unlesbar)) : null,
    m.nichtGeladen ? h('article', { class: 'karte fk-meldung warn sz-meldung' }, h('b', {}, '⚠️ Nicht aktuell'), h('p', {}, m.nichtGeladen), h('div', { class: 'knopfzeile' }, nochmalKnopf(store))) : null,
    m.warnungen.length > 0 ? h('article', { class: 'karte fk-meldung sz-meldung' }, m.warnungen.map((w) => h('p', {}, `⚠️ ${w}`))) : null,
  ];
}

function kopfKarte(m) {
  const k = m.kopf;
  return h(
    'article',
    { class: 'karte fk-kopf sz-kopf' },
    h('span', { class: 'fk-klein' }, 'Für Ziele zurückgelegt'),
    h('b', { class: 'fk-gross' }, k.zurueckgelegt),
    h('div', { class: 'fk-kopf-zeile' }, h('span', {}, 'Nötig pro Monat (alle Ziele)'), h('b', {}, k.noetig)),
    h('div', { class: 'fk-kopf-zeile' }, h('span', {}, 'Frei verfügbar'), h('b', {}, k.frei)),
    h('span', { class: 'fk-klein sz-stand' }, k.stand),
  );
}

function zielKarte(z, { store, ui }, gesperrt) {
  return h(
    'article',
    { class: 'karte sz-ziel', 'aria-label': z.beschriftung, 'data-id': z.id },
    h(
      'div',
      { class: 'sz-ziel-kopf' },
      h('h3', { class: 'sz-ziel-titel' }, h('span', {}, z.titel), h('small', {}, z.bis)),
      h('button', { class: 'sz-aendern', type: 'button', 'aria-label': `${z.name} ändern`, disabled: Boolean(gesperrt), onClick: () => oeffneZielFormular({ store, ui }, z.id) }, '✎'),
    ),
    h(
      'div',
      { class: 'sz-balken', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(z.breite), 'aria-valuetext': z.stand, 'aria-label': `Fortschritt ${z.titel}` },
      h('span', { style: { width: `${z.breite}%`, background: z.farbe } }),
    ),
    h('span', { class: 'fk-klein sz-stand-text' }, z.stand),
    z.hinweis ? h('span', { class: 'fk-klein' }, z.hinweis) : null,
    h('div', { class: 'sz-raster' }, h('span', {}, 'Noch offen'), h('b', {}, z.offen), h('span', {}, z.monate), h('b', {}, z.proMonat)),
    h('span', { class: `sz-status ${z.status.art}` }, z.status.text),
  );
}

function freiKarte(m, ctx) {
  return h(
    'article',
    { class: 'karte sz-frei', 'aria-label': `Frei verfügbar: ${m.frei.betrag}` },
    h('h3', { class: 'sz-ziel-titel' }, h('span', {}, '💜 Frei verfügbar'), h('small', {}, 'Rücklage')),
    h('b', { class: 'sz-frei-betrag' }, m.frei.betrag),
    h('span', { class: 'fk-klein' }, 'Überschuss über den Zielen landet hier und gleicht schlechte Monate zuerst aus.'),
    h('div', { class: 'knopfzeile' }, h('button', { class: 'knopf klein', type: 'button', disabled: !m.frei.kannVerschieben, onClick: () => oeffneVerschieben(ctx) }, 'Zu Ziel verschieben')),
  );
}

const zeile = (z, klasse) => h('div', { class: `sz-zeile ${klasse}`, 'data-cents': String(z.cents) }, h('span', {}, z.text), h('b', {}, z.betrag));

function monatKarte(x) {
  return h(
    'article',
    { class: 'karte sz-monat', 'data-monat': x.monat, ...(x.gespartCents === null ? {} : { 'data-gespart': String(x.gespartCents) }) },
    h('h3', { class: 'sz-monat-titel' }, h('span', {}, x.titel), h('span', { class: `sz-delta ${x.art}` }, x.betrag)),
    x.luecke ? h('p', { class: 'leise sz-hinweis' }, x.luecke) : null,
    x.abschluesse.map((z) => zeile(z, 'sz-abschluss')),
    x.teile.map((z) => zeile(z, 'sz-teil')),
    x.keineVeraenderung ? h('p', { class: 'leise sz-hinweis' }, 'Keine Veränderung – nichts verteilt.') : null,
    x.hinweis ? h('p', { class: 'leise sz-hinweis' }, x.hinweis) : null,
    x.verschoben.map((z) => zeile(z, 'sz-verschoben')),
    h('p', { class: 'leise sz-hinweis sz-frei-danach' }, x.freiDanach),
  );
}

/** Ein abgeschlossenes Ziel im Verlauf: Ausblenden / Einblenden, „Endgültig löschen“ nur ohne Geld (mit Rückfrage). */
function abgeschlossenZeile(a, { store }, gesperrt) {
  const umschalten = h(
    'button',
    {
      class: 'knopf klein',
      type: 'button',
      disabled: Boolean(gesperrt),
      onClick: async (ev) => {
        const knopf = ev.currentTarget;
        sperrbar.forEach((k) => (k.disabled = true));
        if (!erledigt(await sicher(store.zielAusblenden(a.id, !a.aus)), a.aus ? 'Eingeblendet ✓' : 'Ausgeblendet ✓')) sperrbar.forEach((k) => (k.disabled = false));
        knopf.blur?.();
      },
    },
    a.aus ? 'Einblenden' : 'Ausblenden',
  );
  const loeschen = a.loeschbar
    ? h('button', { class: 'knopf klein gefahr', type: 'button', disabled: Boolean(gesperrt), onClick: () => zielLoeschenFragen({ store }, { id: a.id, name: a.name }, () => {}, sperrbar) }, 'Endgültig löschen')
    : null;
  const sperrbar = [umschalten, loeschen].filter(Boolean);
  return h(
    'div',
    { class: `sz-fertig${a.aus ? ' aus' : ''}`, 'data-id': a.id },
    h('div', { class: 'fk-n' }, h('b', {}, `${a.titel}${a.aus ? ' (ausgeblendet)' : ''}`), h('small', {}, a.text)),
    h('div', { class: 'knopfzeile' }, loeschen, umschalten),
  );
}

function verlaufAbschnitt(m, ctx) {
  const { ui } = ctx;
  const karten = m.verlauf.map(monatKarte);
  const aeltere = karten.slice(MONATE_SICHTBAR);
  const zeigen = () => {
    for (const k of aeltere) k.hidden = !aeltereOffen;
  };
  zeigen();
  const beschriftung = () => (aeltereOffen ? 'Weniger anzeigen' : `Ältere anzeigen (${aeltere.length})`);
  const mehr =
    aeltere.length > 0
      ? h(
          'button',
          {
            class: 'knopf klein',
            type: 'button',
            'aria-expanded': String(aeltereOffen),
            onClick: (ev) => {
              aeltereOffen = !aeltereOffen;
              zeigen();
              ev.currentTarget.textContent = beschriftung();
              ev.currentTarget.setAttribute('aria-expanded', String(aeltereOffen));
            },
          },
          beschriftung(),
        )
      : null;
  const fertig =
    m.abgeschlossen.length > 0 || m.ausgeblendet > 0
      ? h(
          'article',
          { class: 'karte sz-abgeschlossen' },
          h('h3', {}, 'Abgeschlossene Ziele'),
          m.abgeschlossen.length > 0 ? m.abgeschlossen.map((a) => abgeschlossenZeile(a, ctx, m.gesperrt)) : h('p', { class: 'leise' }, 'Alle abgeschlossenen Ziele sind ausgeblendet.'),
          m.ausgeblendet > 0
            ? h(
                'label',
                { class: 'fk-haken' },
                h('input', {
                  type: 'checkbox',
                  checked: ausgeblendeteZeigen,
                  onChange: (ev) => {
                    ausgeblendeteZeigen = ev.target.checked;
                    ui.rendern();
                  },
                }),
                ` Ausgeblendete zeigen (${m.ausgeblendet})`,
              )
            : null,
        )
      : null;
  if (karten.length === 0 && !fertig) return null;
  return abschnitt(
    'Verlauf pro Monat',
    karten,
    mehr ? h('div', { class: 'knopfzeile' }, mehr) : null,
    karten.length > 0 ? h('p', { class: 'leise sz-hinweis' }, '„Gespart“ = Änderung des Kontostands (Papa + Mama) gegenüber dem Vormonat. Monate mit Minus nehmen zuerst aus „Frei“, dann anteilig aus den Zielen – der nötige Betrag pro Monat steigt dann automatisch.') : null,
    fertig,
  );
}

/** Inhalt der Ansicht „Sparziele“ (ohne Überschrift und Umschalter). */
export function sparzieleInhalt({ store, ui }) {
  const m = sparzieleModel(store.getState(), store.heute(), { ausgeblendeteZeigen });
  const ctx = { store, ui };
  if (m.zustand === 'nichtGeladen') {
    return [h('article', { class: 'karte hinweis sz-nicht-geladen' }, h('p', {}, 'Die Sparziele sind noch nicht geladen.'), h('div', { class: 'knopfzeile' }, nochmalKnopf(store)))];
  }
  return [
    ...meldungen(m, store),
    kopfKarte(m),
    m.ohneKontostand ? h('article', { class: 'karte hinweis sz-ohne-konto' }, h('p', {}, 'Sobald ihr beide einen Kontostand eingetragen habt, wird verteilt.')) : null,
    m.leer ? h('article', { class: 'karte hinweis' }, h('p', {}, 'Noch keine Sparziele. Legt eines an – z. B. für ein Auto, den Urlaub oder ein Geschenk; die Ersparnis jedes Monats wird dann automatisch verteilt.')) : null,
    m.ziele.map((z) => zielKarte(z, ctx, m.gesperrt)),
    m.leer && m.frei.cents === 0 ? null : freiKarte(m, ctx),
    h('button', { class: 'knopf primaer fk-neu sz-neu', type: 'button', disabled: Boolean(m.gesperrt), onClick: () => oeffneZielFormular(ctx, null) }, '＋ Neues Sparziel'),
    verlaufAbschnitt(m, ctx),
  ];
}
