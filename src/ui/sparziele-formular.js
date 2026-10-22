// Blätter der Sparziele: Formular „Neues Sparziel“ / „Sparziel ändern“ (Name, Symbol, Datum fest oder vorläufig, Zielbetrag, Bis wann →
// sofort „Ab <Monat> → N Monate → X € pro Monat“), „Ziel beenden“ (Geld wurde ausgegeben / Geld zurück zu Frei), „Endgültig löschen“
// (nur für Ziele, die nie Geld bekommen haben, mit Rückfrage) und „Zu Ziel verschieben“ (aus „Frei verfügbar“). Ergebnisse des Stores
// ({ ok, fehler?, wartet? }) erscheinen als Meldung; ein Blatt bleibt bei einem Fehler mit der Eingabe offen und seine Knöpfe werden
// wieder benutzbar. Alle Zahlen kommen aus sparziele-model.js (Domäne), alle Texte als Text in die Seite.
import { fuelle, h } from './dom.js';
import { bestaetigen, blatt, toast } from './components.js';
import { bedarfVorschau, entwurfZuZiel, sparzieleModel, zielEntwurf } from '../app/views/sparziele-model.js';
import { MAX_ZIEL_NAME, zielLoeschbar } from '../domain/sparziele.js';
import { betragText, centsAusText } from '../domain/konto.js';
import { MONATE } from '../app/format-de.js';

const ALLGEMEINER_FEHLER = 'Das hat nicht geklappt. Bitte noch einmal versuchen.';
const JAHRE_VORAUS = 15;

/** Ergebnis des Stores melden; true = erledigt (gespeichert oder wartet nur auf die Anmeldung). */
export function erledigt(r, erfolg) {
  if (r?.ok || r?.wartet) {
    if (r.ok) toast(typeof erfolg === 'function' ? erfolg(r) : erfolg);
    return true;
  }
  toast(r?.fehler ?? ALLGEMEINER_FEHLER, { art: 'fehler' });
  return false;
}

export async function sicher(lauf) {
  try {
    return await lauf;
  } catch (e) {
    return { ok: false, fehler: e?.message ?? ALLGEMEINER_FEHLER };
  }
}

/** Knöpfe während einer Speicherung sperren; nach einem Fehler wieder freigeben (nach `await` ist ev.currentTarget schon null). */
const sperren = (knoepfe, an) => knoepfe.forEach((k) => k && (k.disabled = an));

const gesperrtHinweis = (text) => h('article', { class: 'karte fk-meldung warn' }, h('b', {}, '🔒 Nicht änderbar'), h('p', {}, text));

function auswahl(beschriftung, optionen, wert, beiAenderung) {
  return h(
    'select',
    { class: 'fk-auswahl', 'aria-label': beschriftung, onChange: (ev) => beiAenderung(ev.target.value) },
    optionen.map(([w, text]) => h('option', { value: String(w), selected: String(w) === String(wert) }, text)),
  );
}

const feld = (titel, inhalt) => h('label', { class: 'feld' }, h('span', {}, titel), inhalt);

/** Ziel `id` im angezeigten Stand (oder null). */
const finde = (state, id) => (state.ziele?.daten?.z ?? []).find((z) => z.id === id) ?? null;

/** Formular für ein neues (`id` = null) oder vorhandenes, laufendes Ziel. */
export function oeffneZielFormular({ store }, id) {
  const heute = store.heute();
  const state = store.getState();
  const original = id ? finde(state, id) : null;
  if (id && !original) {
    toast('Dieses Sparziel gibt es nicht mehr.', { art: 'fehler' });
    return null;
  }
  const m = sparzieleModel(state, heute);
  const gesperrt = m.gesperrt;
  const e = zielEntwurf(original, heute);
  const loeschbar = original ? zielLoeschbar(state.ziele.daten, state.konto, heute, original.id) : false;
  let speichert = false;
  let b = null;
  let felder = null;

  function neuZeichnen() {
    const tafel = felder?.closest('.blatt');
    const oben = tafel?.scrollTop ?? 0;
    b.neuZeichnen();
    if (tafel) tafel.scrollTop = oben;
  }

  function vorschauInhalt() {
    const s = store.getState();
    const v = bedarfVorschau(e, { daten: s.ziele?.daten, konto: s.konto, heute });
    if (!v) return [h('span', {}, 'Nach Eingabe von Zielbetrag und Datum steht hier, wie viel ihr pro Monat zurücklegen müsst.')];
    if (v.erreicht) return [h('span', {}, 'Mit dem schon Gesparten ist dieses Ziel erreicht 🎉')];
    return [h('span', {}, `Ab ${v.ab} → ${v.monate} → `), h('b', {}, v.proMonat)];
  }

  async function speichern(knopf) {
    if (speichert) return;
    const { ziel, fehler } = entwurfZuZiel(e, heute);
    if (fehler) {
      toast(fehler, { art: 'fehler' }); // das Formular bleibt mit der Eingabe offen
      return;
    }
    speichert = true;
    knopf.disabled = true;
    knopf.textContent = 'Speichert …';
    const r = await sicher(store.zielSpeichern(ziel));
    speichert = false;
    if (erledigt(r, 'Gespeichert ✓')) {
      b.schliessen();
      return;
    }
    knopf.disabled = false;
    knopf.textContent = 'Speichern';
  }

  function datumFelder(aktualisieren) {
    const jahrJetzt = Number(heute.slice(0, 4));
    const jahre = Array.from({ length: JAHRE_VORAUS + 1 }, (_, i) => String(jahrJetzt + i));
    if (!jahre.includes(e.jahr)) jahre.unshift(e.jahr);
    const tage = [['', 'ganzer Monat'], ...Array.from({ length: 31 }, (_, i) => [String(i + 1), `${i + 1}.`])];
    return h(
      'div',
      { class: 'sz-datum' },
      feld('Monat', auswahl('Monat', MONATE.map((n, i) => [String(i + 1).padStart(2, '0'), n]), e.monat, (w) => ((e.monat = w), aktualisieren()))),
      feld('Jahr', auswahl('Jahr', jahre.map((j) => [j, j]), e.jahr, (w) => ((e.jahr = w), aktualisieren()))),
      e.art === 'fest' ? feld('Tag (optional)', auswahl('Tag (optional)', tage, e.tag, (w) => ((e.tag = w), aktualisieren()))) : null,
    );
  }

  function render() {
    const vorschau = h('p', { class: 'sz-vorschau', 'aria-live': 'polite' }, vorschauInhalt());
    const aktualisieren = () => fuelle(vorschau, vorschauInhalt());
    const name = h('input', { type: 'text', value: e.name, maxlength: String(MAX_ZIEL_NAME), autocomplete: 'off', placeholder: 'z. B. Neues Fahrrad', 'aria-label': 'Name', onInput: (ev) => (e.name = ev.target.value) });
    const betrag = h('input', { type: 'text', inputmode: 'decimal', value: e.betrag, maxlength: '12', autocomplete: 'off', placeholder: 'z. B. 3.000', 'aria-label': 'Zielbetrag in Euro', onInput: (ev) => ((e.betrag = ev.target.value), aktualisieren()) });
    const symbole = h(
      'div',
      { class: 'chip-reihe sz-symbole', role: 'group', 'aria-label': 'Symbol' },
      m.symbole.map((s) =>
        h(
          'button',
          {
            class: `chip symbol${e.emoji === s.emoji ? ' aktiv' : ''}`,
            type: 'button',
            'aria-label': s.name,
            'aria-pressed': e.emoji === s.emoji ? 'true' : 'false',
            onClick: () => {
              e.emoji = s.emoji;
              neuZeichnen();
            },
          },
          s.emoji,
        ),
      ),
    );
    const art = h(
      'div',
      { class: 'chip-reihe', role: 'group', 'aria-label': 'Art des Datums' },
      [
        ['fest', 'Datum fest'],
        ['vorlaeufig', 'Datum vorläufig (ca.)'],
      ].map(([wert, text]) =>
        h(
          'button',
          {
            class: `chip${e.art === wert ? ' aktiv' : ''}`,
            type: 'button',
            'aria-pressed': e.art === wert ? 'true' : 'false',
            onClick: () => {
              e.art = wert;
              if (wert === 'vorlaeufig') e.tag = ''; // „ca. Juli 2027“: nur der Monat
              neuZeichnen();
            },
          },
          text,
        ),
      ),
    );
    const speichernKnopf = h('button', { class: 'knopf klein primaer sz-speichern', type: 'button', disabled: Boolean(gesperrt), onClick: (ev) => speichern(ev.currentTarget) }, 'Speichern');
    felder = h(
      'fieldset',
      { class: 'fk-felder', disabled: Boolean(gesperrt) },
      feld('Name', name),
      h('div', { class: 'feld' }, h('span', { 'aria-hidden': 'true' }, 'Symbol'), symbole),
      h('div', { class: 'feld' }, h('span', { 'aria-hidden': 'true' }, 'Art'), art),
      feld('Zielbetrag (€)', betrag),
      h('div', { class: 'feld' }, h('span', { 'aria-hidden': 'true' }, 'Bis wann?'), datumFelder(aktualisieren)),
      h('div', { class: 'fk-box sz-box' }, vorschau),
      h('p', { class: 'leise fk-tipp' }, '„Datum vorläufig“: z. B. „ca. Juli 2027“ – damit wird schon gerechnet; das genaue Datum tragt ihr ein, sobald es fix ist.'),
      h('p', { class: 'leise fk-tipp' }, 'Ist das Datum vorbei, wird das Ziel automatisch abgeschlossen: das Gesparte gilt als ausgegeben, das Ziel verschwindet aus der Liste und steht nur noch im Verlauf.'),
    );
    return [
      gesperrt ? gesperrtHinweis(gesperrt) : null,
      felder,
      h(
        'div',
        { class: 'knopfzeile' },
        original && loeschbar
          ? h('button', { class: 'knopf klein gefahr', type: 'button', disabled: Boolean(gesperrt), onClick: () => zielLoeschenFragen({ store }, original, () => b.schliessen()) }, 'Endgültig löschen')
          : null,
        original ? h('button', { class: 'knopf klein', type: 'button', disabled: Boolean(gesperrt), onClick: () => oeffneZielBeenden({ store }, original, () => b.schliessen()) }, 'Ziel beenden') : null,
        speichernKnopf,
      ),
    ];
  }

  b = blatt({ titel: original ? 'Sparziel ändern' : 'Neues Sparziel', render });
  return b;
}

/** „Ziel beenden“: Geld wurde ausgegeben (fällt aus der Summe) oder Geld zurück zu Frei – ab diesem Monat. */
export function oeffneZielBeenden({ store }, ziel, danach = () => {}) {
  return blatt({
    titel: `„${ziel.name}“ beenden`,
    render: ({ schliessen }) => {
      const beenden = async (art, erfolg) => {
        sperren(knoepfe, true);
        if (erledigt(await sicher(store.zielBeenden(ziel.id, art)), erfolg)) {
          schliessen();
          danach();
        } else sperren(knoepfe, false); // nochmal versuchen
      };
      const ausgegeben = h('button', { class: 'knopf sz-wahl', type: 'button', onClick: () => beenden('ausgegeben', 'Ziel beendet ✓') }, h('b', {}, '🛍️ Geld wurde ausgegeben'), h('small', {}, 'Das Gesparte ist weg (z. B. Urlaub bezahlt) und zählt nicht mehr mit.'));
      const zurueck = h('button', { class: 'knopf sz-wahl', type: 'button', onClick: () => beenden('frei', 'Ziel beendet – Geld zurück zu Frei ✓') }, h('b', {}, '💜 Geld zurück zu Frei'), h('small', {}, 'Das Gesparte geht zu „Frei verfügbar“ und lässt sich anderen Zielen geben.'));
      const knoepfe = [ausgegeben, zurueck];
      return [
        h('p', { class: 'blatt-text' }, 'Ab diesem Monat bekommt das Ziel nichts mehr; es steht danach im Verlauf.'),
        h('div', { class: 'sz-wahlen' }, ausgegeben, zurueck),
        h('div', { class: 'knopfzeile' }, h('button', { class: 'knopf klein', type: 'button', onClick: schliessen }, 'Abbrechen')),
      ];
    },
  });
}

/** Rückfrage „Endgültig löschen?“ (nur für Ziele, die nie Geld bekommen haben); `knoepfe` werden während des Löschens gesperrt. */
export function zielLoeschenFragen({ store }, ziel, danach = () => {}, knoepfe = []) {
  return bestaetigen({
    titel: 'Endgültig löschen?',
    text: `„${ziel.name}“ hat nie Geld bekommen und wird endgültig gelöscht. Das lässt sich nicht rückgängig machen.`,
    ja: 'Endgültig löschen',
    gefahr: true,
    beiJa: async () => {
      sperren(knoepfe, true);
      if (erledigt(await sicher(store.zielLoeschen(ziel.id)), 'Gelöscht ✓')) danach();
      else sperren(knoepfe, false); // nochmal versuchen
    },
  });
}

/** „Zu Ziel verschieben“: Betrag (höchstens „Frei verfügbar“) aus Frei zu einem laufenden Ziel. */
export function oeffneVerschieben({ store }) {
  const heute = store.heute();
  const m = sparzieleModel(store.getState(), heute);
  if (!m.frei.kannVerschieben) {
    toast(m.gesperrt ?? 'In „Frei verfügbar“ ist nichts zum Verschieben.', { art: 'fehler' });
    return null;
  }
  const e = { ziel: m.frei.ziele[0].id, betrag: '' };
  return blatt({
    titel: 'Zu Ziel verschieben',
    render: ({ schliessen }) => {
      const betrag = h('input', { type: 'text', inputmode: 'decimal', value: e.betrag, maxlength: '12', autocomplete: 'off', placeholder: `höchstens ${m.frei.betrag}`, 'aria-label': 'Betrag in Euro', onInput: (ev) => (e.betrag = ev.target.value) });
      const los = async (ev) => {
        const knopf = ev.currentTarget; // nach dem `await` ist currentTarget schon null
        const cents = centsAusText(e.betrag);
        if (cents === null || cents <= 0) {
          toast('Bitte einen Betrag eingeben, z. B. 200.', { art: 'fehler' });
          return;
        }
        if (cents > m.frei.cents) {
          toast(`Höchstens ${m.frei.betrag} – mehr ist nicht frei.`, { art: 'fehler' });
          return;
        }
        const name = m.frei.ziele.find((z) => z.id === e.ziel)?.text.replace(/ \(offen .*\)$/, '') ?? 'Ziel';
        knopf.disabled = true;
        if (erledigt(await sicher(store.freiVerschieben(e.ziel, cents)), (r) => `${betragText(r.cents)} zu ${name} verschoben ✓`)) schliessen();
        else knopf.disabled = false; // nochmal versuchen
      };
      return [
        h('p', { class: 'blatt-text' }, `Frei verfügbar: ${m.frei.betrag}. Das Geld zählt ab diesem Monat zum Ziel (höchstens so viel, wie ihm noch fehlt).`),
        h(
          'div',
          { class: 'fk-felder' },
          feld('Zu welchem Ziel?', auswahl('Zu welchem Ziel?', m.frei.ziele.map((z) => [z.id, z.text]), e.ziel, (w) => (e.ziel = w))),
          feld('Betrag (€)', betrag),
        ),
        h('div', { class: 'knopfzeile' }, h('button', { class: 'knopf klein', type: 'button', onClick: schliessen }, 'Abbrechen'), h('button', { class: 'knopf klein primaer', type: 'button', onClick: los }, 'Verschieben')),
      ];
    },
  });
}
