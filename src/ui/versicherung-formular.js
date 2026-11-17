// Blätter der Versicherung: „Rechnung einreichen“ / „Rechnung ändern“ (Kategorie, Rechnungsdatum, Betrag, Eingereicht am, Arzt/Apotheke,
// Notiz; Vorschau „⚠ Limit überschritten“; beim Ändern dazu „Erstattung erhalten“ und „Löschen“ mit „Rückgängig“), „Erstattung erhalten“
// (Betrag + Datum, auch ändern oder entfernen) und „Polizze“ (anlegen aus der Vorlage, „Eigene Polizze“ oder bearbeiten: Name, Person,
// Beginn, Kategorien mit Limit, Maximum; eine Kategorie mit Rechnungen lässt sich nicht entfernen – Entscheid C4). Ergebnisse des Stores
// ({ ok, fehler?, gemeldet?, wartet?, warnung?, rueckgaengig? }) erscheinen als eine Meldung; bei einem Fehler bleibt das Blatt mit der
// Eingabe offen. Rechnen und Prüfen in app/views/versicherung-model.js; alle Texte kommen als Text in die Seite.
import { fuelle, h } from './dom.js';
import { bestaetigen, blatt, toast } from './components.js';
import { auswahl, erledigt, feld, gesperrtHinweis, gruppe, sicher, textFeld } from './formular.js';
import { datumFeld } from './eingabefelder.js';
import { geloeschtMelden, sicherLoeschen } from './fortschritt.js';
import { betragText } from '../domain/konto.js';
import { datumAnzeige } from '../domain/eingabe.js';
import { MAX_KATEGORIE_INFO, MAX_KATEGORIE_NAME, MAX_PERSON, MAX_POLIZZE_NAME, MAX_RECHNUNG_NOTIZ, MAX_STELLE } from '../domain/versicherung.js';
import {
  ERINNERUNG_NACH_TAGEN,
  benutzteKategorien,
  entwurfZuErstattung,
  entwurfZuPolizze,
  entwurfZuRechnung,
  erstattungEntwurf,
  kategorieMoeglich,
  kategorieWahl,
  neueKategorieId,
  gezeigtePolizze,
  polizzeEntwurf,
  rechnungEntwurf,
  rechnungVorschau,
  versicherungRechnung,
  versicherungSperre,
} from '../app/views/versicherung-model.js';

// ---------------------------------------------------------------- Rechnung einreichen / ändern

/** Formular für eine neue (`id` = null) oder vorhandene Rechnung. */
export function oeffneRechnungFormular({ store, ui }, id) {
  const heute = store.heute();
  const e = rechnungEntwurf(store.getState(), heute, id);
  if (!e) {
    toast('Diese Rechnung gibt es nicht mehr.', { art: 'fehler' });
    return null;
  }
  if (!gezeigtePolizze(store.getState().versicherung?.daten)) {
    toast('Bitte zuerst die Polizze anlegen.', { art: 'fehler' });
    return null;
  }
  const bearbeiten = Boolean(e.id);
  let speichert = false;

  return blatt({ titel: bearbeiten ? '🧾 Rechnung ändern' : '＋ Rechnung einreichen', render: ({ schliessen, neuZeichnen }) => {
    const state = store.getState();
    const gesperrt = versicherungSperre(state.versicherung);
    const aus = Boolean(gesperrt) || speichert;
    const vorschau = h('p', { class: 'vs-vorschau', 'aria-live': 'polite' });
    const vorschauZeigen = () => {
      const text = rechnungVorschau(store.getState(), heute, e);
      fuelle(vorschau, text);
      vorschau.hidden = !text;
    };
    const original = bearbeiten ? versicherungRechnung(state, e.id) : null;

    const felder = [
      feld('Kategorie', auswahl('Kategorie', kategorieWahl(state, e), e.kategorie, (w) => ((e.kategorie = w), vorschauZeigen()))),
      gruppe('Rechnungsdatum', datumFeld({ wert: e.datum, heute, beschriftung: 'Rechnungsdatum', beiAenderung: (w) => ((e.datum = w), vorschauZeigen()) })),
      feld('Betrag in €', textFeld({ wert: e.betrag, beschriftung: 'Betrag in Euro', platzhalter: 'z. B. 89,90', max: 12, modus: 'decimal', beiEingabe: (w) => ((e.betrag = w), vorschauZeigen()) })),
      gruppe('Eingereicht am', datumFeld({ wert: e.eingereichtAm, heute, beschriftung: 'Eingereicht am', beiAenderung: (w) => (e.eingereichtAm = w) })),
      feld('Arzt/Apotheke (optional)', textFeld({ wert: e.stelle, beschriftung: 'Arzt oder Apotheke', platzhalter: 'z. B. Apotheke', max: MAX_STELLE, beiEingabe: (w) => (e.stelle = w) })),
      feld('Notiz (optional)', textFeld({ wert: e.notiz, beschriftung: 'Notiz', platzhalter: 'z. B. Rezept, Behandlung', max: MAX_RECHNUNG_NOTIZ, beiEingabe: (w) => (e.notiz = w) })),
      vorschau,
    ];
    vorschauZeigen();

    const speichern = async () => {
      if (speichert) return;
      const { rechnung, fehler } = entwurfZuRechnung(store.getState(), heute, e);
      if (fehler) {
        toast(fehler, { art: 'fehler' }); // das Formular bleibt mit der Eingabe offen
        return;
      }
      speichert = true;
      neuZeichnen();
      const r = await sicher(store.rechnungSpeichern(rechnung));
      speichert = false;
      if (erledigt(r, bearbeiten ? 'Gespeichert ✓' : 'Eingereicht ✓')) {
        schliessen();
        return;
      }
      neuZeichnen();
    };
    const loeschen = async () => {
      if (speichert) return;
      speichert = true; // während des Löschens ist das ganze Blatt aus – auch nach einem Neuzeichnen
      neuZeichnen();
      const geloescht = geloeschtMelden(await sicherLoeschen(store.rechnungLoeschen(e.id)));
      speichert = false;
      if (geloescht) schliessen();
      else neuZeichnen();
    };
    const erstattung = original
      ? h(
          'div',
          { class: `fk-box vs-erstattung-box${Number.isInteger(original.erstattetCent) ? ' erstattet' : ''}` },
          h('b', {}, Number.isInteger(original.erstattetCent) ? '✓ Erstattung eingetragen' : '⏳ Noch keine Erstattung'),
          h('small', { class: 'leise' }, Number.isInteger(original.erstattetCent) ? `${betragText(original.erstattetCent)} am ${datumAnzeige(original.erstattetAm)} – gerechnet wird mit diesem Betrag.` : `Bis dahin zählt der volle Betrag. Nach ${ERINNERUNG_NACH_TAGEN} Tagen erinnert die App, falls noch nichts eingetragen ist.`),
          h('div', { class: 'knopfzeile' }, h('button', { class: 'knopf klein primaer vs-erstattung', type: 'button', disabled: aus, onClick: () => oeffneErstattung({ store, ui }, e.id, { danach: neuZeichnen }) }, Number.isInteger(original.erstattetCent) ? 'Erstattung ändern' : '✓ Erstattung erhalten')),
        )
      : null;
    const speichernKnopf = h('button', { class: 'knopf klein primaer vs-speichern', type: 'button', disabled: aus, onClick: speichern }, speichert ? 'Speichert …' : bearbeiten ? 'Speichern' : 'Einreichen');
    const loeschenKnopf = bearbeiten ? h('button', { class: 'knopf klein gefahr', type: 'button', disabled: aus, onClick: loeschen }, 'Löschen') : null;
    return [
      gesperrt ? gesperrtHinweis(gesperrt) : null,
      erstattung,
      h('fieldset', { class: 'fk-felder vs-felder', disabled: aus }, felder),
      h('div', { class: 'knopfzeile' }, speichernKnopf),
      loeschenKnopf ? h('div', { class: 'knopfzeile loeschen-zeile' }, loeschenKnopf) : null,
    ];
  } });
}

/** Eine Rechnung ohne Blatt löschen (Wischen in der Liste) → „Gelöscht ✓ · Rückgängig“. */
export async function rechnungWischLoeschen({ store }, id, knoepfe = []) {
  knoepfe.forEach((k) => (k.disabled = true));
  if (!geloeschtMelden(await sicherLoeschen(store.rechnungLoeschen(id)))) knoepfe.forEach((k) => (k.disabled = false));
}

// ---------------------------------------------------------------- Erstattung erhalten

/** „Erstattung erhalten“: Betrag + Datum (auch ändern); eine eingetragene lässt sich wieder entfernen (dann zählt der volle Betrag). */
function oeffneErstattung({ store }, id, { danach = () => {} } = {}) {
  const heute = store.heute();
  const e = erstattungEntwurf(store.getState(), heute, id);
  if (!e) {
    toast('Diese Rechnung gibt es nicht mehr.', { art: 'fehler' });
    return null;
  }
  let speichert = false;
  return blatt({ titel: e.vorhanden ? 'Erstattung ändern' : '✓ Erstattung erhalten', render: ({ schliessen, neuZeichnen }) => {
    const gesperrt = versicherungSperre(store.getState().versicherung);
    const aus = Boolean(gesperrt) || speichert;
    const los = async (erstattung, erfolg) => {
      if (speichert) return;
      speichert = true;
      neuZeichnen();
      const r = await sicher(store.erstattungSpeichern(id, erstattung));
      speichert = false;
      if (erledigt(r, erfolg)) {
        schliessen();
        danach(); // das Blatt der Rechnung darunter zeigt die neue Erstattung
        return;
      }
      neuZeichnen();
    };
    const speichern = () => {
      const { erstattung, fehler } = entwurfZuErstattung(store.getState(), heute, id, e);
      if (fehler) {
        toast(fehler, { art: 'fehler' });
        return;
      }
      los(erstattung, 'Erstattung gespeichert ✓');
    };
    const entfernen = () =>
      bestaetigen({
        titel: 'Erstattung entfernen?',
        text: 'Die Rechnung gilt dann wieder als eingereicht; gerechnet wird mit dem vollen Betrag.',
        ja: 'Entfernen',
        gefahr: true,
        beiJa: () => los(null, 'Erstattung entfernt ✓'),
      });
    return [
      gesperrt ? gesperrtHinweis(gesperrt) : null,
      h('p', { class: 'blatt-text' }, e.titel),
      h(
        'fieldset',
        { class: 'fk-felder vs-felder', disabled: aus },
        feld('Erstattet in €', textFeld({ wert: e.betrag, beschriftung: 'Erstatteter Betrag in Euro', platzhalter: 'z. B. 12,16', max: 12, modus: 'decimal', beiEingabe: (w) => (e.betrag = w) }), h('small', { class: 'leise' }, e.vorschlag)),
        gruppe('Erstattet am', datumFeld({ wert: e.datum, heute, beschriftung: 'Erstattet am', beiAenderung: (w) => (e.datum = w) })),
      ),
      h('div', { class: 'knopfzeile' }, h('button', { class: 'knopf klein primaer vs-erstattung-speichern', type: 'button', disabled: aus, onClick: speichern }, speichert ? 'Speichert …' : 'Speichern')),
      e.vorhanden ? h('div', { class: 'knopfzeile loeschen-zeile' }, h('button', { class: 'knopf klein gefahr', type: 'button', disabled: aus, onClick: entfernen }, 'Erstattung entfernen')) : null,
    ];
  } });
}

// ---------------------------------------------------------------- Polizze

/**
 * Polizze anlegen (aus der Vorlage `vorlageId` oder leer: „Eigene Polizze“) oder bearbeiten (`bearbeiten`). Kategorien mit Rechnungen
 * (auch aus anderen Jahren) lassen sich nicht entfernen (C4: der Knopf ist aus und sagt warum); der Store prüft es noch einmal.
 */
export function oeffnePolizzeFormular({ store }, { vorlageId = null, bearbeiten = false } = {}) {
  const heute = store.heute();
  const e = polizzeEntwurf(store.getState(), heute, { vorlageId, bearbeiten });
  let speichert = false;
  const titel = bearbeiten ? 'Polizze bearbeiten' : vorlageId ? `${e.name} anlegen` : 'Eigene Polizze';
  return blatt({ titel, render: ({ schliessen, neuZeichnen }) => {
    const state = store.getState();
    const gesperrt = versicherungSperre(state.versicherung);
    const aus = Boolean(gesperrt) || speichert;
    const benutzt = bearbeiten ? benutzteKategorien(state) : new Set();
    const bisherige = new Set(bearbeiten ? (gezeigtePolizze(state.versicherung?.daten)?.kategorien ?? []).map((k) => k.id) : []);

    const kategorieZeile = (k, i) => {
      const gesperrtWeg = bisherige.has(k.id) && benutzt.has(k.id);
      const weg = h(
        'button',
        {
          class: 'knopf klein vs-kat-weg',
          type: 'button',
          disabled: aus || gesperrtWeg || e.kategorien.length <= 1,
          'aria-label': `${k.name || `Kategorie ${i + 1}`} entfernen`,
          onClick: () => {
            e.kategorien = e.kategorien.filter((x) => x !== k);
            neuZeichnen();
          },
        },
        'Entfernen',
      );
      return h(
        'div',
        { class: 'vs-kat-zeile', 'data-kategorie': k.id },
        feld(`Kategorie ${i + 1}`, textFeld({ wert: k.name, beschriftung: `Name der Kategorie ${i + 1}`, platzhalter: 'z. B. Physiotherapie', max: MAX_KATEGORIE_NAME, beiEingabe: (w) => (k.name = w) })),
        feld('Hinweis (optional)', textFeld({ wert: k.info, beschriftung: `Hinweis zur Kategorie ${i + 1}`, platzhalter: 'z. B. inkl. Logopädie', max: MAX_KATEGORIE_INFO, beiEingabe: (w) => (k.info = w) })),
        h('div', { class: 'vs-kat-unten' }, feld('Limit pro Jahr (€)', textFeld({ wert: k.limit, beschriftung: `Limit der Kategorie ${i + 1} in Euro`, platzhalter: 'z. B. 415', max: 12, modus: 'decimal', beiEingabe: (w) => (k.limit = w) })), weg),
        gesperrtWeg ? h('small', { class: 'leise' }, 'Hat Rechnungen – lässt sich nicht entfernen.') : null,
      );
    };

    const dazu = h(
      'button',
      {
        class: 'knopf klein vs-kat-dazu',
        type: 'button',
        disabled: aus || !kategorieMoeglich(e),
        onClick: () => {
          e.kategorien = [...e.kategorien, { id: neueKategorieId([...e.kategorien.map((k) => k.id), ...bisherige, ...benutzt]), name: '', info: '', limit: '' }];
          neuZeichnen();
        },
      },
      '＋ Kategorie',
    );

    const speichern = async () => {
      if (speichert) return;
      const { polizze, fehler } = entwurfZuPolizze(e);
      if (fehler) {
        toast(fehler, { art: 'fehler' });
        return;
      }
      speichert = true;
      neuZeichnen();
      const r = await sicher(store.polizzeSpeichern(polizze));
      speichert = false;
      if (erledigt(r, bearbeiten ? 'Polizze gespeichert ✓' : 'Polizze angelegt ✓')) {
        schliessen();
        return;
      }
      neuZeichnen();
    };

    return [
      gesperrt ? gesperrtHinweis(gesperrt) : null,
      vorlageId && !bearbeiten ? h('p', { class: 'blatt-text' }, 'Limits laut Polizze (Basic, je Kalenderjahr). Weicht eure Polizze ab, hier gleich ändern – das geht auch später.') : null,
      h(
        'fieldset',
        { class: 'fk-felder vs-felder', disabled: aus },
        feld('Name der Polizze', textFeld({ wert: e.name, beschriftung: 'Name der Polizze', platzhalter: 'z. B. Privatarzt-Versicherung', max: MAX_POLIZZE_NAME, beiEingabe: (w) => (e.name = w) })),
        feld('Versicherte Person (optional)', textFeld({ wert: e.person, beschriftung: 'Versicherte Person', platzhalter: 'Vorname', max: MAX_PERSON, beiEingabe: (w) => (e.person = w) })),
        gruppe('Beginn', datumFeld({ wert: e.beginn, heute, beschriftung: 'Beginn der Polizze', beiAenderung: (w) => (e.beginn = w) })),
        h('div', { class: 'feld' }, h('span', { 'aria-hidden': 'true' }, 'Leistungen (Limits je Kalenderjahr)'), h('div', { class: 'vs-kat-liste' }, e.kategorien.map(kategorieZeile)), h('div', { class: 'knopfzeile' }, dazu)),
        feld('Maximum pro Jahr (€)', textFeld({ wert: e.maximum, beschriftung: 'Maximum pro Jahr in Euro', platzhalter: 'z. B. 3.144', max: 12, modus: 'decimal', beiEingabe: (w) => (e.maximum = w) })),
        h('p', { class: 'leise fk-tipp' }, 'Keine Polizzennummer nötig – die App speichert sie nicht.'),
      ),
      h('div', { class: 'knopfzeile' }, h('button', { class: 'knopf klein primaer vs-polizze-speichern', type: 'button', disabled: aus, onClick: speichern }, speichert ? 'Speichert …' : bearbeiten ? 'Speichern' : 'Anlegen')),
    ];
  } });
}
