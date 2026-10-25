// Blätter der Sparziele: Formular „Neues Sparziel“ / „Sparziel ändern“ (Name, Symbol, Datum fest oder vorläufig, Zielbetrag, Bis wann →
// sofort „Ab <Monat> → N Monate → X € pro Monat“), „Ziel beenden“ (Geld wurde ausgegeben / Geld zurück zu Frei), „Löschen“ (laufende
// Ziele immer – ihr Geld wird neu verteilt; abgeschlossene nur ohne Geld: „Endgültig löschen“; mit Rückfrage, danach „Gelöscht ✓ ·
// Rückgängig“), „Zu Ziel verschieben“ (aus „Frei verfügbar“) und „Rückgängig“ einer Verschiebung. Ergebnisse des Stores
// ({ ok, fehler?, wartet? }) erscheinen als Meldung; ein Blatt bleibt bei einem Fehler mit der Eingabe offen und seine Knöpfe werden
// wieder benutzbar. Alle Zahlen kommen aus sparziele-model.js (Domäne), alle Texte als Text in die Seite.
import { fuelle, h } from './dom.js';
import { bestaetigen, blatt, toast } from './components.js';
import { bedarfVorschau, entwurfZuZiel, sparzieleModel, zielEntwurf, zielLoeschFrage, zieleSperre, zielSymbole } from '../app/views/sparziele-model.js';
import { MAX_ZIEL_NAME, TEXT_NICHT_LOESCHBAR, zielSchluss } from '../domain/sparziele.js';
import { geloeschtMelden } from './fortschritt.js';
import { betragText, centsAusText } from '../domain/konto.js';
import { MONATE } from '../app/format-de.js';

const ALLGEMEINER_FEHLER = 'Das hat nicht geklappt. Bitte noch einmal versuchen.';
const JAHRE_VORAUS = 15;

/**
 * Ergebnis des Stores melden; true = erledigt (gespeichert oder wartet nur auf die Anmeldung). Ein Fehler mit `gemeldet` zeigt die
 * Shell schon (aus state.fehler) – dann keine zweite Meldung; vor dem Schreiben Abgelehntes (ohne `gemeldet`) zeigt nur diese hier.
 */
export function erledigt(r, erfolg) {
  if (r?.ok || r?.wartet) {
    if (r.ok) toast(typeof erfolg === 'function' ? erfolg(r) : erfolg);
    return true;
  }
  if (!r?.gemeldet) toast(r?.fehler ?? ALLGEMEINER_FEHLER, { art: 'fehler' });
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
  const gesperrt = zieleSperre(state.ziele);
  const symbolListe = zielSymbole(state.settings);
  const e = zielEntwurf(original, heute);
  // laufend: immer löschbar (sein Geld wird neu verteilt); abgeschlossen nur ohne Geld – Knopf und Rückfrage aus zielLoeschFrage
  const loeschFrage = original ? zielLoeschFrage(state, heute, original.id) : null;
  // nach dem Zieldatum automatisch abgeschlossen: mit einem neuen Datum ab jetzt wieder öffnen (kein „Ziel beenden“ mehr)
  const abgeschlossen = original ? zielSchluss(original).monat <= heute.slice(0, 7) : false;
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
    if (v.fehler) return [h('span', { class: 'sz-vorschau-fehler' }, `⚠ ${v.fehler}`)];
    if (v.erreicht) return [h('span', {}, 'Mit dem schon Gesparten ist dieses Ziel erreicht 🎉')];
    return [h('span', {}, `Ab ${v.ab} → ${v.monate} → `), h('b', {}, v.proMonat)];
  }

  /** Während gespeichert wird, ist das ganze Blatt aus (Felder, Speichern, Ziel beenden, Löschen); danach wieder an. */
  async function speichern() {
    if (speichert) return;
    const { ziel, fehler } = entwurfZuZiel(e, heute, { konto: store.getState().konto });
    if (fehler) {
      toast(fehler, { art: 'fehler' }); // das Formular bleibt mit der Eingabe offen
      return;
    }
    speichert = true;
    neuZeichnen();
    const r = await sicher(store.zielSpeichern(ziel));
    speichert = false;
    if (erledigt(r, 'Gespeichert ✓')) {
      b.schliessen();
      return;
    }
    neuZeichnen();
  }

  function datumFelder(aktualisieren) {
    const jahrJetzt = Number(heute.slice(0, 4));
    const jahre = Array.from({ length: JAHRE_VORAUS + 1 }, (_, i) => String(jahrJetzt + i));
    if (!jahre.includes(e.jahr)) jahre.unshift(e.jahr);
    const tage = [['', 'ganzer Monat'], ...Array.from({ length: 31 }, (_, i) => [String(i + 1), `${i + 1}.`])];
    return h(
      'div',
      { class: 'sz-datum', role: 'group', 'aria-label': 'Bis wann?' },
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
      symbolListe.map((s) =>
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
    const aus = Boolean(gesperrt) || speichert;
    const speichernKnopf = h('button', { class: 'knopf klein primaer sz-speichern', type: 'button', disabled: aus, onClick: () => speichern() }, speichert ? 'Speichert …' : 'Speichern');
    felder = h(
      'fieldset',
      { class: 'fk-felder', disabled: aus },
      feld('Name', name),
      h('div', { class: 'feld' }, h('span', { 'aria-hidden': 'true' }, 'Symbol'), symbole),
      h('div', { class: 'feld' }, h('span', { 'aria-hidden': 'true' }, 'Art'), art),
      feld('Zielbetrag (€)', betrag),
      h('div', { class: 'feld' }, h('span', { 'aria-hidden': 'true' }, 'Bis wann?'), datumFelder(aktualisieren)),
      h('div', { class: 'fk-box sz-box' }, vorschau),
      h('p', { class: 'leise fk-tipp' }, '„Datum vorläufig“: z. B. „ca. Juli 2027“ – damit wird schon gerechnet; das genaue Datum tragt ihr ein, sobald es fix ist.'),
      h('p', { class: 'leise fk-tipp' }, 'Ist das Datum vorbei, wird das Ziel automatisch abgeschlossen: das Gesparte gilt als ausgegeben, das Ziel verschwindet aus der Liste und steht nur noch im Verlauf. Hat sich das Datum verschoben, lässt es sich dort mit ✎ und einem neuen Datum wieder öffnen.'),
    );
    const beendenKnopf = original && !abgeschlossen ? h('button', { class: 'knopf klein', type: 'button', disabled: aus, onClick: () => oeffneZielBeenden({ store }, original, () => b.schliessen()) }, 'Ziel beenden') : null;
    // „Löschen“ in einer eigenen Zeile links unter den anderen Knöpfen (abgesetzt; während des Löschens sind alle Knöpfe aus)
    const loeschenKnopf = loeschFrage
      ? h('button', { class: 'knopf klein gefahr sz-loeschen', type: 'button', disabled: aus, onClick: () => zielLoeschenFragen({ store }, original, () => b.schliessen(), [loeschenKnopf, beendenKnopf, speichernKnopf]) }, loeschFrage.knopf)
      : null;
    return [
      gesperrt ? gesperrtHinweis(gesperrt) : null,
      abgeschlossen ? h('p', { class: 'blatt-text sz-wieder' }, 'Nach dem Zieldatum abgeschlossen. Mit einem neuen Datum ab dem laufenden Monat läuft es weiter – das Gesparte bleibt beim Ziel.') : null,
      felder,
      h('div', { class: 'knopfzeile' }, beendenKnopf, speichernKnopf),
      loeschenKnopf ? h('div', { class: 'knopfzeile loeschen-zeile' }, loeschenKnopf) : null,
    ];
  }

  b = blatt({ titel: abgeschlossen ? 'Sparziel wieder öffnen' : original ? 'Sparziel ändern' : 'Neues Sparziel', render });
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
      const ausgegeben = h('button', { class: 'knopf sz-wahl', type: 'button', onClick: () => beenden('ausgegeben', 'Ziel beendet ✓') }, h('b', {}, '🛍️ Geld wurde ausgegeben'), h('small', {}, 'Das Gesparte wurde vom Konto bezahlt (z. B. Urlaub). Die Zahlung steckt schon im Kontostand – deshalb wird sie ausgeglichen, nichts fehlt doppelt.'));
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

/** Rückfrage „Doch nicht ausgegeben?“ für ein automatisch abgeschlossenes Ziel: das Gesparte geht ab seinem Abschlussmonat zu „Frei“. */
export function zurueckZuFreiFragen({ store }, ziel, knoepfe = []) {
  return bestaetigen({
    titel: 'Doch nicht ausgegeben?',
    text: `Das Gesparte von „${ziel.name}“ geht zurück zu „Frei verfügbar“ (z. B. wenn der Urlaub ausgefallen ist). Das lässt sich nicht rückgängig machen.`,
    ja: 'Zurück zu Frei',
    beiJa: async () => {
      sperren(knoepfe, true);
      if (!erledigt(await sicher(store.zielZurueckZuFrei(ziel.id)), 'Zurück zu Frei ✓')) sperren(knoepfe, false); // nochmal versuchen
    },
  });
}

/**
 * Rückfrage vor dem Löschen (Text aus zielLoeschFrage: ein laufendes Ziel mit Geld sagt, wohin das Geld geht); danach „Gelöscht ✓ ·
 * Rückgängig“. `knoepfe` werden während des Löschens gesperrt (bei einem Fehler wieder frei).
 */
export function zielLoeschenFragen({ store }, ziel, danach = () => {}, knoepfe = []) {
  const frage = zielLoeschFrage(store.getState(), store.heute(), ziel.id);
  if (!frage) {
    toast(TEXT_NICHT_LOESCHBAR, { art: 'fehler' });
    return null;
  }
  return bestaetigen({
    titel: frage.titel,
    text: frage.text,
    ja: frage.ja,
    gefahr: true,
    beiJa: async () => {
      sperren(knoepfe, true);
      if (geloeschtMelden(await sicher(store.zielLoeschen(ziel.id)))) danach();
      else sperren(knoepfe, false); // nochmal versuchen
    },
  });
}

/**
 * „Rückgängig“ einer Verschiebung aus „Frei“ (im Verlauf): erst die Rückfrage, dann „Gelöscht ✓ · Rückgängig“ (das holt sie zurück).
 * `knoepfe` werden währenddessen gesperrt.
 */
export function verschiebungRueckgaengigFragen({ store }, verschiebung, knoepfe = []) {
  return bestaetigen({
    titel: 'Verschiebung rückgängig machen?',
    text: verschiebung.frage,
    ja: 'Rückgängig machen',
    beiJa: async () => {
      sperren(knoepfe, true);
      if (!geloeschtMelden(await sicher(store.verschiebungLoeschen(verschiebung.id)))) sperren(knoepfe, false); // nochmal versuchen
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
        const ziel = m.frei.ziele.find((z) => z.id === e.ziel);
        const name = ziel?.titel ?? 'Ziel';
        if (ziel && cents > ziel.offen) {
          toast(`Höchstens ${betragText(ziel.offen)} – mehr fehlt „${name}“ nicht.`, { art: 'fehler' });
          return;
        }
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
