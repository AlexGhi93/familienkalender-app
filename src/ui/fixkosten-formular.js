// Blätter der Fixkosten: Formular „Neue Fixkosten“ / „Fixkosten ändern“ (Vorlage, Name, Betrag, Wie oft?, Fällig am, nächste Zahlung,
// Kategorie, Gehört zu, „~ Betrag schwankt“, optional Vertrag mit Kündigungsfrist samt berechnetem „Kündbar bis“, Notiz), „Archivieren“
// mit Datum und für archivierte Posten „Zurückholen“ / „Endgültig löschen“ (mit Rückfrage). Kein offen/bezahlt. Ergebnisse des Stores
// ({ ok, fehler?, wartet? }) erscheinen wie beim Schichtplan als Meldung; das Formular bleibt bei einem Fehler mit der Eingabe offen.
import { h, fuelle } from './dom.js';
import { bestaetigen, blatt, toast } from './components.js';
import { datumFeld } from './eingabefelder.js';
import { entwurfZuPosten, fixEntwurf, startMonate, vertragVorschau, vorlageAnwenden } from '../app/views/fixkosten-model.js';
import { FIX_FRISTEN, FIX_INTERVALLE, FIX_KATEGORIEN, FIX_PERSONEN, FIX_VERLAENGERUNG, FIX_VORLAGEN, MAX_FIX_NAME, MAX_FIX_NOTIZ, TEXT_TEIL_GESPERRT, istAktiv } from '../domain/fixkosten.js';
import { betragText } from '../domain/konto.js';
import { datumAnzeige } from '../domain/eingabe.js';

const ALLGEMEINER_FEHLER = 'Das hat nicht geklappt. Bitte noch einmal versuchen.';
const TAGE = [...Array.from({ length: 31 }, (_, i) => [String(i + 1), `${i + 1}. des Monats`]), ['letzter', 'Monatsletzter']];
const verlaengerungText = (n) => (n === 0 ? 'verlängert sich nicht' : n === 1 ? '1 Monat' : `${n} Monate`);

/** Posten `id` im angezeigten Stand und ob sein Teil gesperrt ist (unlesbar); null, wenn es ihn nicht (mehr) gibt. */
function finde(state, id) {
  const shards = state.fixkosten?.shards ?? [];
  for (let nr = 0; nr < shards.length; nr += 1) {
    const posten = shards[nr]?.posten?.find((p) => p.id === id);
    if (posten) return { posten, gesperrt: (state.fixkosten.unlesbar ?? []).includes(nr) };
  }
  return null;
}

/** Ergebnis des Stores melden; true = erledigt (gespeichert oder wartet nur auf die Anmeldung). */
function erledigt(r, erfolg) {
  if (r?.ok || r?.wartet) {
    if (r.ok) toast(erfolg);
    return true;
  }
  toast(r?.fehler ?? ALLGEMEINER_FEHLER, { art: 'fehler' });
  return false;
}

async function sicher(lauf) {
  try {
    return await lauf;
  } catch (e) {
    return { ok: false, fehler: e?.message ?? ALLGEMEINER_FEHLER };
  }
}

const gesperrtHinweis = () => h('article', { class: 'karte fk-meldung warn' }, h('b', {}, '🔒 Nicht änderbar'), h('p', {}, TEXT_TEIL_GESPERRT));

function auswahl(beschriftung, optionen, wert, beiAenderung, mehr = {}) {
  return h(
    'select',
    { class: 'fk-auswahl', 'aria-label': beschriftung, onChange: (ev) => beiAenderung(ev.target.value), ...mehr },
    optionen.map(([w, text]) => h('option', { value: String(w), selected: String(w) === String(wert) }, text)),
  );
}

const feld = (titel, inhalt, klasse = '') => h('label', { class: `feld ${klasse}`.trim() }, h('span', {}, titel), inhalt);

/** Formular für einen neuen (`id` = null) oder vorhandenen Posten. */
export function oeffneFixFormular({ store }, id) {
  const heute = store.heute();
  const gefunden = id ? finde(store.getState(), id) : null;
  if (id && !gefunden) {
    toast('Diesen Posten gibt es nicht mehr.', { art: 'fehler' });
    return null;
  }
  const original = gefunden?.posten ?? null;
  const gesperrt = gefunden?.gesperrt ?? false;
  const e = fixEntwurf(original, heute);
  let speichert = false;
  let b = null;
  let felder = null; // die Felder im Blatt (um die Stelle beim Neuzeichnen zu halten)

  /** Neu zeichnen (Vertrag, Intervall, Vorlage, Person); die Stelle im Blatt bleibt. */
  function neuZeichnen() {
    const tafel = felder?.closest('.blatt');
    const oben = tafel?.scrollTop ?? 0;
    b.neuZeichnen();
    if (tafel) tafel.scrollTop = oben;
  }

  function vorschauInhalt() {
    const v = vertragVorschau(e, heute);
    if (!v) return [h('span', {}, 'Nach Eingabe des Vertragsendes steht hier, bis wann ihr kündigen könnt.')];
    if (v.beendet) return [h('span', {}, 'Dieser Vertrag ist schon beendet (er verlängert sich nicht).')];
    if (v.monatlich) return [h('span', {}, '→ Kündbar bis '), h('b', {}, v.kuendbarBis), h('span', {}, ', danach monatlich kündbar – keine Erinnerung nötig.')];
    return [h('span', {}, '→ Kündbar bis '), h('b', {}, v.kuendbarBis), v.erinnerung ? [h('span', {}, ' · 🔔 Erinnerung an beide am '), h('b', {}, v.erinnerung), h('span', {}, ' (1 Monat vorher)')] : null];
  }

  function vertragBox() {
    const vorschau = h('p', { class: 'fk-vorschau', 'aria-live': 'polite' }, vorschauInhalt());
    const aktualisieren = () => fuelle(vorschau, vorschauInhalt());
    const haken = h('input', {
      type: 'checkbox',
      onChange: (ev) => {
        e.mitVertrag = ev.target.checked;
        neuZeichnen();
      },
    });
    haken.checked = e.mitVertrag;
    const inhalt = e.mitVertrag
      ? [
          h(
            'div',
            { class: 'feld-paar fk-paar' },
            h('div', { class: 'feld' }, h('span', { 'aria-hidden': 'true' }, 'Vertrag läuft bis'), datumFeld({ wert: e.bis, heute, beschriftung: 'Vertrag läuft bis', beiAenderung: (w) => ((e.bis = w), aktualisieren()) })),
            feld('Verlängert sich um', auswahl('Verlängert sich um', FIX_VERLAENGERUNG.map((n) => [n, verlaengerungText(n)]), e.verlaengerung, (w) => ((e.verlaengerung = Number(w)), aktualisieren()))),
          ),
          feld('Kündigungsfrist', auswahl('Kündigungsfrist', FIX_FRISTEN.map((f) => [f.id, `${f.text} vor Ende`]), e.frist, (w) => ((e.frist = w), aktualisieren()))),
          vorschau,
          e.hinweis ? h('p', { class: 'leise fk-tipp' }, `Tipp: ${e.hinweis}`) : null,
        ]
      : null;
    return h('div', { class: 'fk-box' }, h('label', { class: 'fk-haken' }, haken, ' 📝 Vertrag mit Kündigungsfrist'), inhalt);
  }

  function personWahl() {
    const kindname = String(store.getState().settings?.kindname ?? '').trim();
    return h(
      'div',
      { class: 'chip-reihe', role: 'group', 'aria-label': 'Gehört zu' },
      FIX_PERSONEN.map((p) =>
        h(
          'button',
          {
            class: `chip${e.person === p.id ? ' aktiv' : ''}`,
            type: 'button',
            'aria-pressed': e.person === p.id ? 'true' : 'false',
            onClick: () => {
              e.person = p.id;
              neuZeichnen();
            },
          },
          `${p.emoji} ${p.id === 'kind' ? kindname || p.name : p.name}`,
        ),
      ),
    );
  }

  function vorlagen() {
    return h(
      'div',
      { class: 'feld' },
      h('span', { id: 'fk-vorlage-titel' }, 'Vorlage (optional)'),
      h(
        'div',
        { class: 'fk-vorlagen', role: 'group', 'aria-labelledby': 'fk-vorlage-titel' },
        FIX_VORLAGEN.map((v) =>
          h(
            'button',
            {
              class: `fk-vorlage${e.vorlage === v.id ? ' aktiv' : ''}`,
              type: 'button',
              'aria-pressed': e.vorlage === v.id ? 'true' : 'false',
              onClick: () => {
                Object.assign(e, vorlageAnwenden(e, v.id, heute));
                neuZeichnen();
              },
            },
            `${v.emoji} ${v.name}`,
          ),
        ),
      ),
      e.hinweis && !e.mitVertrag ? h('p', { class: 'leise fk-tipp' }, `Tipp: ${e.hinweis}`) : null,
    );
  }

  async function speichern(knopf) {
    if (speichert) return;
    const { posten, fehler } = entwurfZuPosten(e, original, heute);
    if (fehler) {
      toast(fehler, { art: 'fehler' }); // das Formular bleibt mit der Eingabe offen
      return;
    }
    speichert = true;
    knopf.disabled = true;
    knopf.textContent = 'Speichert …';
    const r = await sicher(store.fixPostenSpeichern(posten));
    speichert = false;
    if (erledigt(r, 'Gespeichert ✓')) {
      b.schliessen();
      return;
    }
    knopf.disabled = false;
    knopf.textContent = 'Speichern';
  }

  function render() {
    const name = h('input', { type: 'text', value: e.name, maxlength: String(MAX_FIX_NAME), autocomplete: 'off', placeholder: 'z. B. Kfz-Versicherung', 'aria-label': 'Name', onInput: (ev) => (e.name = ev.target.value) });
    const betrag = h('input', { type: 'text', inputmode: 'decimal', value: e.betrag, maxlength: '12', autocomplete: 'off', placeholder: 'z. B. 59,90', 'aria-label': 'Betrag in Euro', onInput: (ev) => (e.betrag = ev.target.value) });
    const notiz = h('input', { type: 'text', value: e.notiz, maxlength: String(MAX_FIX_NOTIZ), autocomplete: 'off', placeholder: 'z. B. Polizzennummer, Kontakt', 'aria-label': 'Notiz', onInput: (ev) => (e.notiz = ev.target.value) });
    const ungefaehr = h('input', { type: 'checkbox', onChange: (ev) => (e.ungefaehr = ev.target.checked) });
    ungefaehr.checked = e.ungefaehr;
    const speichernKnopf = h('button', { class: 'knopf klein primaer fk-speichern', type: 'button', disabled: gesperrt, onClick: (ev) => speichern(ev.currentTarget) }, 'Speichern');
    felder = h(
        'fieldset',
        { class: 'fk-felder', disabled: gesperrt },
        original ? null : vorlagen(),
        feld('Name', name),
        h(
          'div',
          { class: 'feld-paar fk-paar' },
          feld('Betrag (€)', betrag),
          feld(
            'Wie oft?',
            auswahl('Wie oft?', FIX_INTERVALLE.map((i) => [i.monate, i.text]), e.intervall, (w) => {
              e.intervall = Number(w);
              if (!startMonate(e.intervall, heute).some((m) => m.wert === e.naechste)) e.naechste = heute.slice(0, 7);
              neuZeichnen();
            }),
          ),
        ),
        // Fällig am und (bei Intervall > 1) die nächste Zahlung nebeneinander; die Kategorie bekommt die ganze Breite (lange Namen)
        h(
          'div',
          { class: 'feld-paar fk-paar' },
          feld('Fällig am', auswahl('Fällig am', TAGE, e.tag, (w) => (e.tag = w))),
          e.intervall > 1
            ? feld(
                'Nächste Zahlung im',
                auswahl(
                  'Nächste Zahlung im',
                  (() => {
                    const liste = startMonate(e.intervall, heute);
                    return (liste.some((m) => m.wert === e.naechste) ? liste : [{ wert: e.naechste, text: e.naechste }, ...liste]).map((m) => [m.wert, m.text]);
                  })(),
                  e.naechste,
                  (w) => (e.naechste = w),
                ),
              )
            : null,
        ),
        feld('Kategorie', auswahl('Kategorie', FIX_KATEGORIEN.map((k) => [k.id, `${k.emoji} ${k.name}`]), e.kategorie, (w) => (e.kategorie = w))),
        h('div', { class: 'feld' }, h('span', { 'aria-hidden': 'true' }, 'Gehört zu'), personWahl()),
        h('label', { class: 'fk-haken' }, ungefaehr, ' ~ Betrag schwankt (ungefähr)'),
        vertragBox(),
        feld('Notiz (optional)', notiz),
      );
    return [
      gesperrt ? gesperrtHinweis() : null,
      felder,
      h(
        'div',
        { class: 'knopfzeile' },
        original ? h('button', { class: 'knopf klein', type: 'button', disabled: gesperrt, onClick: () => oeffneArchivieren({ store }, original, () => b.schliessen()) }, '🗄️ Archivieren') : null,
        speichernKnopf,
      ),
    ];
  }

  b = blatt({ titel: original ? 'Fixkosten ändern' : 'Neue Fixkosten', render });
  return b;
}

/** Rückfrage „Archivieren“ mit Datum (Standard heute): ab diesem Tag zählt der Posten nicht mehr; nichts wird gelöscht. */
function oeffneArchivieren({ store }, posten, danach) {
  const heute = store.heute();
  let datum = heute;
  return blatt({
    titel: `„${posten.name}“ archivieren`,
    render: ({ schliessen }) => [
      h('p', { class: 'blatt-text' }, 'Ab diesem Tag zählt der Posten nicht mehr zu den Fixkosten (z. B. gekündigt). Frühere Zahlungen bleiben, nichts wird gelöscht; im Archiv lässt er sich zurückholen.'),
      h('div', { class: 'feld' }, h('span', { 'aria-hidden': 'true' }, 'Archivieren ab'), datumFeld({ wert: datum, heute, beschriftung: 'Archivieren ab', beiAenderung: (w) => (datum = w) })),
      h(
        'div',
        { class: 'knopfzeile' },
        h('button', { class: 'knopf klein', type: 'button', onClick: schliessen }, 'Abbrechen'),
        h(
          'button',
          {
            class: 'knopf klein primaer',
            type: 'button',
            onClick: async (ev) => {
              if (!datum) {
                toast('Bitte ein Datum eingeben, z. B. 01.11.2026.', { art: 'fehler' });
                return;
              }
              const knopf = ev.currentTarget; // nach dem `await` ist currentTarget schon null
              knopf.disabled = true;
              if (erledigt(await sicher(store.fixPostenArchivieren(posten.id, datum)), 'Archiviert ✓')) {
                schliessen();
                danach();
              } else knopf.disabled = false; // nochmal versuchen
            },
          },
          'Archivieren',
        ),
      ),
    ],
  });
}

/** Archivierter Posten: „Zurückholen“ oder „Endgültig löschen“ (mit Rückfrage). */
export function oeffneFixArchiviert({ store }, id) {
  const gefunden = finde(store.getState(), id);
  if (!gefunden) {
    toast('Diesen Posten gibt es nicht mehr.', { art: 'fehler' });
    return null;
  }
  const { posten, gesperrt } = gefunden;
  const aktiv = istAktiv(posten, store.heute());
  const intervall = FIX_INTERVALLE.find((i) => i.monate === posten.intervall)?.text ?? '';
  return blatt({
    titel: posten.name,
    render: ({ schliessen }) => [
      gesperrt ? gesperrtHinweis() : null,
      h('p', { class: 'blatt-text' }, `Archiviert ab ${datumAnzeige(posten.archiv)}. ${aktiv ? 'Bis dahin zählt er noch zu den Fixkosten.' : 'Er zählt nicht mehr zu den Fixkosten.'}`),
      h('p', { class: 'leise' }, `${posten.ungefaehr ? '~ ' : ''}${betragText(posten.cents)} ${intervall}`),
      h(
        'div',
        { class: 'knopfzeile' },
        h(
          'button',
          {
            class: 'knopf klein gefahr',
            type: 'button',
            disabled: gesperrt,
            onClick: () =>
              bestaetigen({
                titel: 'Endgültig löschen?',
                text: `„${posten.name}“ wird endgültig gelöscht – auch aus den früheren Monaten. Das lässt sich nicht rückgängig machen.`,
                ja: 'Endgültig löschen',
                gefahr: true,
                beiJa: async () => {
                  if (erledigt(await sicher(store.fixPostenLoeschen(posten.id)), 'Gelöscht ✓')) schliessen();
                },
              }),
          },
          'Endgültig löschen',
        ),
        h(
          'button',
          {
            class: 'knopf klein primaer',
            type: 'button',
            disabled: gesperrt,
            onClick: async (ev) => {
              const knopf = ev.currentTarget; // nach dem `await` ist currentTarget schon null
              knopf.disabled = true;
              if (erledigt(await sicher(store.fixPostenWiederherstellen(posten.id)), 'Zurückgeholt ✓')) schliessen();
              else knopf.disabled = false; // nochmal versuchen
            },
          },
          'Zurückholen',
        ),
      ),
    ],
  });
}
