import { fuelle, h } from './dom.js';
import { datumFeld as datumEingabe, zeitFeld as zeitEingabe } from './eingabefelder.js';
import { chip, farbe, wochenStepper } from './components.js';
import { mitnehmenFeld } from './mitnehmen-feld.js';
import { einmalSpeichern, erledigt } from './formular.js';
import { KITA_RICHTUNGEN, KITA_VORSCHLAEGE, TYPES } from '../domain/types.js';
import { addDays } from '../domain/dates.js';
import { MAX_MITNEHMEN, mitRichtung, terminAusEntwurf, terminVorschau } from '../app/termin.js';
import { MAX_SERIEN_WOCHEN, serieZusammenfassung, wochenSerie } from '../app/serie.js';
import { datumKurz } from '../app/format-de.js';
import { pyjamasEntwurf, pyjamasWechsel } from './pyjamas-wechsel.js';

const RICHTUNG_EMOJI = { hin: '🎒', heim: '🏠' };

/** Die zuletzt verwendeten Sachen (neueste zuerst, ohne Dubletten), aus den vorhandenen Erinnerungen. */
function zuletztBenutzt(state) {
  const gesehen = [];
  const sachen = state.termine.filter((t) => t.typ === 'kita_sache').sort((a, b) => b.date.localeCompare(a.date));
  for (const t of sachen) for (const s of t.mitnehmen) if (!gesehen.includes(s)) gesehen.push(s);
  return gesehen.slice(0, 8);
}

/** Formular „Sachen für Krabbelstube/Kindergarten“ (neu oder zum Bearbeiten, je nach `ui.neu.bearbeiten`). */
export function sachenFormular({ store, ui }, kachel) {
  const n = ui.neu;
  const state = store.getState();
  const settings = state.settings;
  const heute = store.heute();

  const richtungBox = h('div', { class: 'chip-reihe' });
  const wiederholenBox = h('div', { class: 'feld' });
  const planBox = h('div', { class: 'vorschau' });
  const vorschauBox = h('div', { class: 'vorschau', 'aria-live': 'polite' });
  const pyjamasBox = h('div', {});
  pyjamasBox.hidden = true;

  const datumFeld = datumEingabe({
    wert: n.date,
    heute,
    beiAenderung: (w) => {
      n.date = w;
      zeichnePlan();
      zeichneVorschau();
    },
  });
  const zeitFeld = zeitEingabe({
    wert: n.time,
    beiAenderung: (w) => {
      n.time = w;
      n.zeitGeaendert = true;
      zeichneVorschau();
    },
  });

  function zeichneVorschau() {
    const v = terminVorschau(n, settings);
    vorschauBox.classList.toggle('zu-lang', v.ok && v.zuLang);
    fuelle(
      vorschauBox,
      h('small', {}, 'So steht es im Kalender und in der Benachrichtigung:'),
      v.ok ? h('b', {}, v.titel) : h('span', { class: 'leise' }, v.meldung),
      v.ok ? h('small', {}, v.zuLang ? `${v.laenge} von ${v.limit} Zeichen: etwas weniger Sachen, damit alles in der Benachrichtigung steht.` : `${v.laenge} von ${v.limit} Zeichen`) : null,
    );
  }

  function zeichneRichtung() {
    fuelle(
      richtungBox,
      Object.values(KITA_RICHTUNGEN).map((r) =>
        chip(`${RICHTUNG_EMOJI[r.id]} ${r.label}`, {
          art: n.richtung === r.id ? 'aktiv' : '',
          farbeHex: TYPES.kita_sache.farbe,
          onClick: () => {
            Object.assign(n, mitRichtung(n, r.id, settings));
            zeitFeld.setzeWert(n.time);
            zeichneRichtung();
            zeichnePlan();
            zeichneVorschau();
          },
        }),
      ),
    );
  }

  const eigene = state.settings.sachenEigene ?? [];
  const mitnehmen = mitnehmenFeld({
    vorschlaege: {
      zuletzt: n.bearbeiten ? [] : zuletztBenutzt(state),
      gruppen: eigene.length > 0 ? { Eigene: eigene, ...KITA_VORSCHLAEGE } : KITA_VORSCHLAEGE, // „Eigene“ (aus Mehr) steht zuerst
      farbeHex: TYPES.kita_sache.farbe,
    },
    gewaehlt: () => n.mitnehmen,
    beiAenderung: (liste) => {
      n.mitnehmen = liste;
      zeichneVorschau();
    },
    weiteres: n.weiteres, // „Eigene Sache“, getippt, aber noch nicht hinzugefügt
    beiWeiteres: (text) => {
      n.weiteres = text;
    },
    leerText: 'Noch nichts gewählt: unten antippen oder selbst eintragen.',
    platzhalter: 'Etwas anderes, z. B. Lieblingsbuch',
    beschriftung: 'Eigene Sache',
    maxText: `Höchstens ${MAX_MITNEHMEN} Sachen pro Erinnerung.`,
  });

  function zeichneWiederholen() {
    if (n.bearbeiten) {
      fuelle(wiederholenBox, n.serie ? h('p', { class: 'leise' }, 'Diese Änderung gilt nur für diese eine Sache, nicht für die ganze Serie.') : null);
      return;
    }
    const einmalig = n.wiederholen.art === 'einmalig';
    fuelle(
      wiederholenBox,
      h('span', {}, 'Wiederholen'),
      h(
        'div',
        { class: 'chip-reihe serie-wahl' },
        chip('Einmalig', {
          art: einmalig ? 'aktiv' : '',
          onClick: () => {
            n.wiederholen.art = 'einmalig';
            zeichneWiederholen();
            zeichnePlan();
          },
        }),
        chip('🔁 Jede Woche', {
          art: einmalig ? '' : 'aktiv',
          onClick: () => {
            n.wiederholen.art = 'woechentlich';
            zeichneWiederholen();
            zeichnePlan();
          },
        }),
      ),
      einmalig
        ? null
        : wochenStepper({
            wert: n.wiederholen.wochen,
            min: 2,
            max: MAX_SERIEN_WOCHEN,
            beschriftung: 'Wochen',
            beiAenderung: (w) => {
              n.wiederholen.wochen = w;
              zeichneWiederholen();
              zeichnePlan();
            },
          }),
    );
  }

  function zeichnePlan() {
    const aktiv = !n.bearbeiten && n.wiederholen.art === 'woechentlich';
    planBox.hidden = !aktiv;
    if (!aktiv) return;
    try {
      const plan = wochenSerie(state, { start: n.date, wochen: n.wiederholen.wochen, richtung: n.richtung, heute });
      const daten = plan.eintraege.slice(0, 6).map((e) => datumKurz(e.date)).join(' · ');
      fuelle(planBox, h('b', {}, serieZusammenfassung(plan)), plan.eintraege.length > 0 ? h('small', {}, `${daten}${plan.eintraege.length > 6 ? ' · …' : ''}`) : null);
    } catch (fehler) {
      fuelle(planBox, h('span', { class: 'leise' }, fehler.message));
    }
  }

  async function speichern() {
    const wochen = !n.bearbeiten && n.wiederholen.art === 'woechentlich' ? n.wiederholen.wochen : 1;
    const r = await einmalSpeichern(n, () => store.sachenSpeichern(terminAusEntwurf(n), { wochen, id: n.bearbeiten }));
    if (r === undefined) return;
    if (!erledigt(r, n.bearbeiten ? 'Änderung gespeichert ✓' : r.ids.length === 1 ? 'Gespeichert ✓' : `${r.ids.length} Erinnerungen gespeichert ✓`)) {
      ui.rendern(); // nicht gespeichert: das Formular bleibt mit den Eingaben offen, „Speichern“ geht wieder
      return;
    }
    const ziel = n.date;
    ui.neuZuruecksetzen();
    if (ziel > addDays(heute, 7)) ui.gehZuMonat(ziel);
    else ui.gehZu('heute');
  }

  const schnellstart = n.bearbeiten
    ? null
    : h(
        'button',
        {
          class: 'knopf schnellstart',
          type: 'button',
          onClick: () => {
            const p = pyjamasEntwurf(ui);
            p.offen = pyjamasBox.hidden;
            zeichnePyjamas();
          },
        },
        h('span', { class: 'e' }, '🛏️'),
        h('b', {}, 'Pyjamas-Wechsel einrichten'),
        h('small', {}, 'jede Woche hinbringen und zum Waschen mit nach Hause nehmen'),
      );

  /** Der Schnellstart „Pyjamas-Wechsel“ auf oder zu, wie im Entwurf (`ui.neu.pyjamas.offen`): übersteht so das Neuzeichnen. */
  function zeichnePyjamas() {
    const offen = !n.bearbeiten && Boolean(n.pyjamas?.offen);
    if (offen && !pyjamasBox.firstChild) pyjamasBox.append(pyjamasWechsel({ store, ui }));
    pyjamasBox.hidden = !offen;
  }

  zeichnePyjamas();
  zeichneRichtung();
  zeichneWiederholen();
  zeichnePlan();
  zeichneVorschau();

  const abbrechen = () => ui.neuZuruecksetzen(true);
  return h(
    'section',
    { class: 'screen neu-formular' },
    h('button', { class: 'zurueck', type: 'button', onClick: abbrechen }, '‹ Zurück'),
    schnellstart,
    pyjamasBox,
    h(
      'div',
      { class: 'karte tint formular', style: farbe(kachel.farbe) },
      h('div', { class: 'karte-zeile' }, h('span', { class: 'emoji gross' }, kachel.emoji), h('div', { class: 'karte-text' }, h('b', {}, n.bearbeiten ? `${kachel.titel} ändern` : kachel.titel))),
      h('div', { class: 'feld' }, h('span', {}, 'Was passiert?'), richtungBox),
      h('div', { class: 'feld-paar' }, h('label', { class: 'feld' }, h('span', {}, 'Datum'), datumFeld), h('label', { class: 'feld' }, h('span', {}, 'Uhrzeit'), zeitFeld)),
      h('div', { class: 'feld' }, h('span', {}, '🎒 Sachen'), mitnehmen.chips),
      mitnehmen.zuletzt,
      mitnehmen.gruppen,
      mitnehmen.eingabe,
      wiederholenBox,
      planBox,
    ),
    vorschauBox,
    h('div', { class: 'knopfzeile' }, h('button', { class: 'knopf klein', type: 'button', onClick: abbrechen }, 'Abbrechen'), h('button', { class: 'knopf klein primaer', type: 'button', disabled: n.speichert, onClick: speichern }, n.bearbeiten ? 'Änderung speichern' : 'Speichern')),
  );
}
