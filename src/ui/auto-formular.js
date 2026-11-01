// Blätter der Autos: „Erledigt eintragen“ / „Arbeit ändern“ (je Art eigene Felder: Öl Sorte/Menge/Filter, Reifenwechsel Satz +
// „vorne/hinten getauscht“, Rotation, Vignette Jahr/Art/gekauft am, Pickerl nächster Monat, sonst Datum/km/Notiz/Kosten),
// „Kilometerstand aktualisieren“, „Regel“ (Info, Quelle, Intervall, aktiv), „Auto hinzufügen“ (Vorlage) und „Fahrzeugdaten bearbeiten“
// samt Löschen mit „Rückgängig“. Ergebnisse des Stores erscheinen als eine Meldung (gemeldet = die Shell zeigt sie schon); bei einem
// Fehler bleibt das Blatt mit der Eingabe offen. Alles Rechnen steht in app/views/autos-model.js, alle Texte kommen als Text in die Seite.
import { fuelle, h } from './dom.js';
import { bestaetigen, blatt, chip, toast } from './components.js';
import { datumFeld } from './eingabefelder.js';
import { geloeschtMelden } from './fortschritt.js';
import { sicher } from './sparziele-formular.js';
import { MONATE } from '../app/format-de.js';
import { ARBEIT_TYPEN, AUTO_ANTRIEBE, AUTO_FELDER, AUTO_HALTUNGEN, MAX_ARBEIT_NOTIZ, VIGNETTE_ARTEN, kmText } from '../domain/autos.js';
import {
  FARBEN_WAHL,
  TEXT_DATENSCHUTZ,
  TEXT_VIGNETTE_ONLINE,
  VORLAGEN_WAHL,
  arbeitEntwurf,
  autoEntwurf,
  autoSeiteModel,
  autosSperre,
  detailsVorbelegen,
  entwurfZuArbeit,
  entwurfZuAuto,
  entwurfZuRegel,
  kmAusText,
  kmHinweis,
  monatJahre,
  monatTeile,
  regelEntwurf,
  rotationVorschlag,
  vignetteJahre,
} from '../app/views/autos-model.js';

const TYPEN = new Map(ARBEIT_TYPEN.map((t) => [t.id, t]));
const ALLGEMEINER_FEHLER = 'Das hat nicht geklappt. Bitte noch einmal versuchen.';

/**
 * Ergebnis des Stores melden; true = erledigt (gespeichert oder wartet nur auf die Anmeldung). Ein Fehler mit `gemeldet` zeigt schon die
 * Shell. Die Erfolgsmeldung ersetzt eine noch stehende Fehlermeldung (M2, Review T4: nach einer berichtigten Eingabe soll man sehen, dass
 * gespeichert wurde – sonst trägt man es womöglich ein zweites Mal ein).
 */
function erledigt(r, erfolg) {
  if (r?.ok || r?.wartet) {
    if (r.ok) toast(typeof erfolg === 'function' ? erfolg(r) : erfolg, { ersetztFehler: true });
    return true;
  }
  if (!r?.gemeldet) toast(r?.fehler ?? ALLGEMEINER_FEHLER, { art: 'fehler' });
  return false;
}

const SATZ_EMOJI = { winter: '❄️', sommer: '☀️', ganzjahr: '🌤️' };

const feld = (titel, inhalt, ...mehr) => h('label', { class: 'feld' }, h('span', {}, titel), inhalt, ...mehr);
const gruppe = (titel, inhalt, ...mehr) => h('div', { class: 'feld' }, h('span', { 'aria-hidden': 'true' }, titel), inhalt, ...mehr);

function textFeld({ wert, beschriftung, platzhalter = '', max = 40, modus = null, beiEingabe }) {
  return h('input', { type: 'text', value: wert ?? '', maxlength: String(max), autocomplete: 'off', placeholder: platzhalter, inputmode: modus, 'aria-label': beschriftung, onInput: (ev) => beiEingabe(ev.target.value) });
}

function auswahl(beschriftung, optionen, wert, beiAenderung) {
  return h(
    'select',
    { class: 'fk-auswahl', 'aria-label': beschriftung, onChange: (ev) => beiAenderung(ev.target.value) },
    optionen.map(([w, text]) => h('option', { value: String(w), selected: String(w) === String(wert ?? '') }, text)),
  );
}

function haken(text, wert, beiAenderung) {
  return h('label', { class: 'fk-haken' }, h('input', { type: 'checkbox', checked: Boolean(wert), onChange: (ev) => beiAenderung(ev.target.checked) }), ` ${text}`);
}

/** Monat 'JJJJ-MM' als zwei Auswahllisten (Monat, Jahr). */
function monatFeld(titel, wert, heute, beiAenderung) {
  const t = monatTeile(wert);
  const setze = (teil) => {
    const neu = { ...monatTeile(wert), ...teil };
    beiAenderung(neu.jahr && neu.monat ? `${neu.jahr}-${neu.monat}` : '');
  };
  return gruppe(
    titel,
    h(
      'div',
      { class: 'fk-paar feld-paar au-monat', role: 'group', 'aria-label': titel },
      auswahl(`${titel}: Monat`, MONATE.map((n, i) => [String(i + 1).padStart(2, '0'), n]), t.monat, (m) => setze({ monat: m })),
      auswahl(`${titel}: Jahr`, monatJahre(heute, wert).map((j) => [j, j]), t.jahr, (j) => setze({ jahr: j })),
    ),
  );
}

const gesperrtHinweis = (text) => h('article', { class: 'karte fk-meldung warn' }, h('b', {}, '🔒 Nicht änderbar'), h('p', {}, text));
const hinweisInhalt = (x) => (x ? h('span', { class: `au-feld-hinweis ${x.art}` }, `⚠ ${x.text}`) : null);

/** Ein Blatt mit Formular, das bei Auswahl-Änderungen neu gezeichnet wird (Textfelder melden sich nur über ihre eigenen Hinweise). */
function formularBlatt(titel, bauen) {
  let b = null;
  let tafelOben = 0;
  const neuZeichnen = () => {
    const tafel = [...document.querySelectorAll('.blatt-huelle:not(.zu) .blatt')].at(-1);
    tafelOben = tafel?.scrollTop ?? 0;
    b.neuZeichnen();
    if (tafel) tafel.scrollTop = tafelOben;
  };
  b = blatt({ titel, render: ({ schliessen }) => bauen({ schliessen, neuZeichnen }) });
  return b;
}

// ---------------------------------------------------------------- Arbeit eintragen / ändern

/**
 * „Erledigt eintragen“: `optionen` = { typ } (z. B. „Reifenwechsel eintragen“), { regelId } (aus einer Zeile „Fällig“), { arbeitId }
 * (Verlauf: ändern oder löschen) oder {} (Art frei wählen).
 */
export function oeffneArbeitFormular({ store }, autoId, optionen = {}) {
  const heute = store.heute();
  const e = arbeitEntwurf(store.getState(), heute, autoId, optionen);
  if (!e) {
    toast(optionen.arbeitId ? 'Diese Arbeit gibt es nicht mehr.' : 'Dieses Auto gibt es nicht mehr.', { art: 'fehler' });
    return null;
  }
  const bearbeiten = Boolean(e.id);
  let speichert = false;
  let rotiertVonHand = bearbeiten;
  const titelTyp = () => TYPEN.get(e.typ)?.name ?? 'Arbeit';
  const titel = bearbeiten ? `${TYPEN.get(e.typ)?.emoji ?? '🔧'} ${titelTyp()} ändern` : e.festerTyp ? `${TYPEN.get(e.typ)?.emoji ?? '🔧'} ${titelTyp()} eintragen` : '＋ Arbeit eintragen';

  return formularBlatt(titel, ({ schliessen, neuZeichnen }) => {
    const state = store.getState();
    const gesperrt = autosSperre(state.autos);
    const aus = Boolean(gesperrt) || speichert;

    const kmHinweisKnoten = h('div', { class: 'au-km-hinweis', 'aria-live': 'polite' });
    const kmHinweisZeigen = () => {
      const geschaetzt = e.kmGeschaetzt && kmAusText(e.km) === e.kmVorschlag;
      fuelle(kmHinweisKnoten, hinweisInhalt(kmHinweis(store.getState(), heute, autoId, { datum: e.datum, km: e.km, arbeitId: e.id ?? null })), geschaetzt ? h('small', { class: 'leise' }, 'Geschätzt – bitte vom Tacho ablesen und berichtigen.') : null);
    };

    const felder = [];
    if (!e.festerTyp) {
      felder.push(
        feld(
          'Art der Arbeit',
          auswahl('Art der Arbeit', ARBEIT_TYPEN.map((t) => [t.id, `${t.emoji} ${t.name}`]), e.typ, (w) => {
            e.typ = w;
            e.regel = null;
            rotiertVonHand = false;
            detailsVorbelegen(store.getState(), heute, e);
            neuZeichnen();
          }),
        ),
      );
    }
    const datumKnoten = (beschriftung, wert, setze) =>
      gruppe(
        beschriftung,
        datumFeld({
          wert,
          heute,
          beschriftung,
          beiAenderung: (w) => {
            setze(w);
            kmHinweisZeigen();
          },
        }),
      );
    if (e.typ === 'vignette') {
      felder.push(
        feld('Jahr der Vignette', auswahl('Jahr der Vignette', vignetteJahre(heute).map((j) => [j, j]), e.details.jahr, (w) => (e.details.jahr = w))),
        gruppe(
          'Art',
          h(
            'div',
            { class: 'chip-reihe', role: 'group', 'aria-label': 'Art der Vignette' },
            VIGNETTE_ARTEN.map((art) =>
              chip(art === 'digital' ? '📱 digital' : '🏷️ Klebe', {
                art: e.details.art === art ? 'aktiv' : '',
                onClick: () => {
                  e.details.art = art;
                  neuZeichnen();
                },
              }),
            ),
          ),
        ),
        datumKnoten('Gekauft am', e.details.gekauftAm ?? e.datum, (w) => {
          e.details.gekauftAm = w;
          e.datum = w || heute;
        }),
        h('p', { class: 'fk-box au-box' }, `ℹ️ ${TEXT_VIGNETTE_ONLINE}`),
      );
    } else {
      felder.push(datumKnoten('Datum', e.datum, (w) => (e.datum = w)));
      const pflicht = e.typ === 'reifenwechsel' || e.typ === 'rotation';
      felder.push(
        feld(
          pflicht ? 'Kilometerstand' : 'Kilometerstand (optional)',
          textFeld({
            wert: e.km,
            beschriftung: 'Kilometerstand',
            platzhalter: 'z. B. 18.900',
            max: 12,
            modus: 'numeric',
            beiEingabe: (w) => {
              e.km = w;
              kmHinweisZeigen();
            },
          }),
          kmHinweisKnoten,
        ),
      );
    }

    if (e.typ === 'oelwechsel') {
      felder.push(
        feld('Ölsorte', textFeld({ wert: e.details.oelSorte, beschriftung: 'Ölsorte', platzhalter: e.oel.sorte, max: 40, beiEingabe: (w) => (e.details.oelSorte = w) })),
        feld('Menge (Liter)', textFeld({ wert: e.details.menge, beschriftung: 'Menge in Litern', platzhalter: e.oel.menge, max: 5, modus: 'decimal', beiEingabe: (w) => (e.details.menge = w) })),
        haken('Ölfilter gewechselt', e.details.filter, (w) => (e.details.filter = w)),
        e.oel.info ? h('p', { class: 'leise fk-tipp' }, e.oel.info) : null,
      );
    }
    e.saetze = (state.autos.daten.saetze ?? []).filter((s) => s.auto === autoId); // auch gerade erst angelegte (M7)
    if (e.typ === 'reifenwechsel') {
      // M9 (Review T4): der Vorschlag gilt für heute – nur bei einem neuen Eintrag, nicht beim Ändern eines alten
      const vorschlag = e.details.montiert && !bearbeiten ? rotationVorschlag(store.getState(), heute, autoId, e.details.montiert) : { rotiert: false, text: null };
      felder.push(
        gruppe(
          'Welcher Satz ist jetzt montiert?',
          e.saetze.length === 0
            ? h('p', { class: 'leise' }, 'Dieses Auto hat noch keine Reifensätze – zuerst einen anlegen.')
            : h(
                'div',
                { class: 'chip-reihe', role: 'group', 'aria-label': 'Montierter Reifensatz' },
                e.saetze.map((s) =>
                  chip(`${SATZ_EMOJI[s.art] ?? '🛞'} ${s.name}`, {
                    art: e.details.montiert === s.id ? 'aktiv' : '',
                    onClick: () => {
                      e.details.montiert = s.id;
                      if (!rotiertVonHand) e.details.rotiert = rotationVorschlag(store.getState(), heute, autoId, s.id).rotiert;
                      neuZeichnen();
                    },
                  }),
                ),
              ),
        ),
        haken('Vorne/hinten getauscht (rotiert)', e.details.rotiert, (w) => {
          e.details.rotiert = w;
          rotiertVonHand = true;
        }),
        h('div', { class: 'knopfzeile au-satz-neu' }, h('button', { class: 'knopf klein', type: 'button', onClick: () => oeffneSatzFormular({ store }, autoId, { danach: () => {
                  // der neue Satz: ist noch keiner gewählt, gleich den der Saison vorschlagen
                  e.saetze = (store.getState().autos.daten.saetze ?? []).filter((x) => x.auto === autoId);
                  if (!e.details.montiert) detailsVorbelegen(store.getState(), heute, e);
                  neuZeichnen();
                } }) }, '＋ Reifensatz anlegen')),
        vorschlag.text ? h('p', { class: 'fk-box au-box au-vorschlag' }, `🔄 ${vorschlag.text}`) : null,
      );
    }
    if (e.typ === 'rotation') {
      felder.push(feld('Reifensatz', auswahl('Reifensatz', e.saetze.map((s) => [s.id, s.name]), e.details.satzId, (w) => (e.details.satzId = w))));
    }
    if (e.typ === 'pickerl') {
      felder.push(
        monatFeld('Nächstes Pickerl (laut Plakette)', e.details.naechsterMonat, heute, (w) => (e.details.naechsterMonat = w)),
        h('p', { class: 'leise fk-tipp' }, 'Der Monat ist auf der neuen Plakette gelocht – er gilt ab jetzt als Termin.'),
      );
    }
    felder.push(
      feld('Notiz (optional)', textFeld({ wert: e.notiz, beschriftung: 'Notiz', platzhalter: 'z. B. Werkstatt, Teilenummer', max: MAX_ARBEIT_NOTIZ, beiEingabe: (w) => (e.notiz = w) })),
      feld('Kosten in € (optional)', textFeld({ wert: e.kosten, beschriftung: 'Kosten in Euro', platzhalter: 'z. B. 149,90', max: 12, modus: 'decimal', beiEingabe: (w) => (e.kosten = w) })),
    );
    kmHinweisZeigen();

    const speichern = async () => {
      if (speichert) return;
      const { arbeit, fehler } = entwurfZuArbeit(e);
      if (fehler) {
        toast(fehler, { art: 'fehler' });
        return;
      }
      speichert = true;
      neuZeichnen();
      const r = await sicher(store.arbeitSpeichern(arbeit));
      speichert = false;
      if (erledigt(r, (x) => (x.warnung ? 'Gespeichert ✓ – bitte den Kilometerstand prüfen' : bearbeiten ? 'Gespeichert ✓' : 'Eingetragen ✓'))) {
        schliessen();
        return;
      }
      neuZeichnen();
    };
    const speichernKnopf = h('button', { class: 'knopf klein primaer au-speichern', type: 'button', disabled: aus, onClick: speichern }, speichert ? 'Speichert …' : bearbeiten ? 'Speichern' : 'Eintragen');
    const loeschenKnopf = bearbeiten
      ? h(
          'button',
          {
            class: 'knopf klein gefahr',
            type: 'button',
            disabled: aus,
            onClick: async () => {
              if (speichert) return;
              speichert = true; // M3 (Review T4): während des Löschens ist das ganze Blatt aus – auch nach einem Neuzeichnen
              neuZeichnen();
              const geloescht = geloeschtMelden(await sicher(store.arbeitLoeschen(autoId, e.jahr, e.id)));
              speichert = false;
              if (geloescht) schliessen();
              else neuZeichnen();
            },
          },
          'Löschen',
        )
      : null;
    return [
      gesperrt ? gesperrtHinweis(gesperrt) : null,
      h('fieldset', { class: 'fk-felder au-felder', disabled: aus }, felder),
      h('div', { class: 'knopfzeile' }, speichernKnopf),
      loeschenKnopf ? h('div', { class: 'knopfzeile loeschen-zeile' }, loeschenKnopf) : null,
    ];
  });
}

/** Eine Arbeit ohne Blatt löschen (Wischen im Verlauf) → „Gelöscht ✓ · Rückgängig“. */
export async function arbeitLoeschen({ store }, autoId, jahr, id, knoepfe = []) {
  knoepfe.forEach((k) => (k.disabled = true));
  if (!geloeschtMelden(await sicher(store.arbeitLoeschen(autoId, jahr, id)))) knoepfe.forEach((k) => (k.disabled = false));
}

// ---------------------------------------------------------------- Kilometerstand

export function oeffneKmFormular({ store }, autoId) {
  const heute = store.heute();
  const m = autoSeiteModel(store.getState(), heute, autoId);
  if (!m) {
    toast('Dieses Auto gibt es nicht mehr.', { art: 'fehler' });
    return null;
  }
  const e = { datum: heute, km: '' };
  let speichert = false;
  return formularBlatt('Kilometerstand aktualisieren', ({ schliessen, neuZeichnen }) => {
    const gesperrt = autosSperre(store.getState().autos);
    const aus = Boolean(gesperrt) || speichert;
    const hinweis = h('div', { class: 'au-km-hinweis', 'aria-live': 'polite' });
    const zeigen = () => fuelle(hinweis, hinweisInhalt(kmHinweis(store.getState(), heute, autoId, { datum: e.datum, km: e.km, nurStand: true })));
    zeigen();
    const speichern = async () => {
      if (speichert) return;
      const km = kmAusText(e.km);
      if (km === undefined || Number.isNaN(km)) {
        toast('Bitte den Kilometerstand vom Tacho als ganze Zahl eingeben, z. B. 18.900.', { art: 'fehler' });
        return;
      }
      speichert = true;
      neuZeichnen();
      const r = await sicher(store.kmSpeichern(autoId, { datum: e.datum, km }));
      speichert = false;
      if (erledigt(r, (x) => (x.warnung ? 'Gespeichert ✓ – bitte prüfen: der Stand passt nicht zu den früheren' : 'Kilometerstand gespeichert ✓'))) schliessen();
      else neuZeichnen();
    };
    return [
      gesperrt ? gesperrtHinweis(gesperrt) : null,
      h('p', { class: 'blatt-text' }, m.km.zahl === null ? 'Noch ist kein Stand bekannt.' : `Geschätzt jetzt: ${m.km.text}. ${m.km.stand ?? ''}`.trim()),
      h(
        'fieldset',
        { class: 'fk-felder au-felder', disabled: aus },
        gruppe('Datum', datumFeld({ wert: e.datum, heute, beschriftung: 'Datum', beiAenderung: (w) => ((e.datum = w || heute), zeigen()) })),
        feld(
          'Kilometerstand laut Tacho',
          h('input', {
            type: 'text',
            inputmode: 'numeric',
            maxlength: '12',
            autocomplete: 'off',
            value: e.km,
            placeholder: m.km.zahl === null ? 'z. B. 18.900' : `z. B. ${kmText(m.km.zahl).replace(' km', '')}`,
            'aria-label': 'Kilometerstand laut Tacho',
            onInput: (ev) => {
              e.km = ev.target.value;
              zeigen();
            },
            onKeydown: (ev) => {
              if (ev.key === 'Enter') speichern();
            },
          }),
          hinweis,
        ),
      ),
      h('div', { class: 'knopfzeile' }, h('button', { class: 'knopf klein primaer', type: 'button', disabled: aus, onClick: speichern }, speichert ? 'Speichert …' : 'Speichern')),
    ];
  });
}

// ---------------------------------------------------------------- Regel

export function oeffneRegelFormular({ store }, regelId) {
  const e = regelEntwurf(store.getState(), regelId);
  if (!e) {
    toast('Diese Regel gibt es nicht mehr.', { art: 'fehler' });
    return null;
  }
  const heute = store.heute();
  let speichert = false;
  return formularBlatt(`${TYPEN.get(e.original.typ)?.emoji ?? '🔧'} ${e.original.name}`, ({ schliessen, neuZeichnen }) => {
    const gesperrt = autosSperre(store.getState().autos);
    const aus = Boolean(gesperrt) || speichert;
    const speichern = async () => {
      if (speichert) return;
      const { regel, fehler } = entwurfZuRegel(e);
      if (fehler) {
        toast(fehler, { art: 'fehler' });
        return;
      }
      speichert = true;
      neuZeichnen();
      const r = await sicher(store.regelSpeichern(regel));
      speichert = false;
      if (erledigt(r, regel.aktiv ? 'Gespeichert ✓' : 'Abgeschaltet ✓ – keine Erinnerung mehr')) schliessen();
      else neuZeichnen();
    };
    return [
      gesperrt ? gesperrtHinweis(gesperrt) : null,
      h(
        'div',
        { class: 'fk-box au-box au-regel-info' },
        h('b', {}, e.intervall),
        e.info ? h('p', {}, e.info) : null,
        e.quelle ? h('a', { class: 'au-quelle', href: e.quelle, target: '_blank', rel: 'noopener noreferrer' }, `Quelle: ${new URL(e.quelle).hostname.replace(/^www\./, '')} ↗`) : h('p', { class: 'leise' }, 'Ohne Quelle (eigene Regel oder laut Vertrag).'),
        h('small', { class: 'leise' }, 'Herstellerangaben bzw. Gesetz – keine verbindliche Werkstattvorgabe; alles lässt sich hier ändern.'),
      ),
      h(
        'fieldset',
        { class: 'fk-felder au-felder', disabled: aus },
        feld('Name', textFeld({ wert: e.name, beschriftung: 'Name der Regel', max: 40, beiEingabe: (w) => (e.name = w) })),
        e.mitIntervall
          ? h(
              'div',
              { class: 'fk-paar feld-paar' },
              feld('Alle … Monate', textFeld({ wert: e.monate, beschriftung: 'Intervall in Monaten', platzhalter: 'z. B. 12', max: 3, modus: 'numeric', beiEingabe: (w) => (e.monate = w) })),
              feld('oder … km', textFeld({ wert: e.km, beschriftung: 'Intervall in Kilometern', platzhalter: 'z. B. 15.000', max: 9, modus: 'numeric', beiEingabe: (w) => (e.km = w) })),
            )
          : null,
        e.fixMonat ? monatFeld('Fester Monat', e.fixMonat, heute, (w) => (e.fixMonat = w)) : null,
        haken('Aktiv: erinnern und unter „Fällig“ zeigen', e.aktiv, (w) => (e.aktiv = w)),
      ),
      h('div', { class: 'knopfzeile' }, h('button', { class: 'knopf klein primaer', type: 'button', disabled: aus, onClick: speichern }, speichert ? 'Speichert …' : 'Speichern')),
    ];
  });
}

/** Eine abgeschaltete Regel wieder einschalten (ohne Blatt). */
export async function regelEinschalten({ store }, regelId, knopf) {
  const e = regelEntwurf(store.getState(), regelId);
  if (!e) return;
  if (knopf) knopf.disabled = true;
  const { regel } = entwurfZuRegel({ ...e, aktiv: true });
  if (!erledigt(await sicher(store.regelSpeichern(regel)), 'Eingeschaltet ✓') && knopf) knopf.disabled = false;
}

// ---------------------------------------------------------------- Auto

const AUTO_DEFS = new Map(AUTO_FELDER.map((d) => [d.feld, d]));
const NEU_FELDER = ['kennzeichen', 'fin', 'ezDatum'];
const ALLE_FELDER = ['kennzeichen', 'fin', 'marke', 'handelsbezeichnung', 'typVariante', 'motorcode', 'antrieb', 'leistungKw', 'hubraum', 'ezDatum', 'zulassungDatum', 'reifenGroessen', 'haltung', 'leasingEnde', 'notiz'];
const PLATZHALTER = { kennzeichen: 'z. B. W-12345', fin: '17 Zeichen, Feld E im Schein', leistungKw: 'z. B. 63', hubraum: 'z. B. 875', reifenGroessen: 'z. B. 195/45 R16' };

function autoFeld(e, name, heute) {
  const def = AUTO_DEFS.get(name);
  const titel = name === 'kennzeichen' ? 'Kennzeichen (optional)' : name === 'fin' ? 'FIN – Fahrgestellnummer (optional)' : def.name;
  if (def.art === 'datum') return gruppe(def.name, datumFeld({ wert: e[name], heute, beschriftung: def.name, beiAenderung: (w) => (e[name] = w) }));
  if (def.art === 'wahl') {
    const werte = name === 'antrieb' ? AUTO_ANTRIEBE : AUTO_HALTUNGEN;
    return feld(def.name, auswahl(def.name, [['', '—'], ...werte.map((w) => [w, w])], e[name], (w) => (e[name] = w)));
  }
  const max = name === 'fin' ? 20 : (def.max ?? 6);
  return feld(titel, textFeld({ wert: e[name], beschriftung: def.name, platzhalter: PLATZHALTER[name] ?? '', max, modus: def.art === 'ganz' ? 'numeric' : null, beiEingabe: (w) => (e[name] = w) }));
}

/** „＋ Auto hinzufügen“ (`autoId` null, Vorlage wählbar) oder „Fahrzeugdaten bearbeiten“ (mit Löschen). */
export function oeffneAutoFormular({ store, ui }, { autoId = null, vorlage = 'tesla3' } = {}) {
  const heute = store.heute();
  const vorhanden = autoId ? (store.getState().autos.daten.autos ?? []).find((a) => a.id === autoId) : null;
  if (autoId && !vorhanden) {
    toast('Dieses Auto gibt es nicht mehr.', { art: 'fehler' });
    return null;
  }
  let e = autoEntwurf(vorhanden, vorlage);
  let speichert = false;
  let fragt = false; // die Rückfrage „Auto löschen?“ ist offen
  return formularBlatt(vorhanden ? 'Fahrzeugdaten bearbeiten' : '＋ Auto hinzufügen', ({ schliessen, neuZeichnen }) => {
    const gesperrt = autosSperre(store.getState().autos);
    const aus = Boolean(gesperrt) || speichert;
    const vorlagen = vorhanden
      ? null
      : gruppe(
          'Vorlage',
          h(
            'div',
            { class: 'au-vorlagen', role: 'group', 'aria-label': 'Vorlage' },
            VORLAGEN_WAHL.map((v) =>
              h(
                'button',
                {
                  class: `au-vorlage${e.vorlage === v.id ? ' aktiv' : ''}`,
                  type: 'button',
                  'aria-pressed': String(e.vorlage === v.id),
                  onClick: () => {
                    const alt = e;
                    e = autoEntwurf(null, v.id);
                    for (const f of NEU_FELDER) e[f] = alt[f]; // schon Getipptes bleibt
                    neuZeichnen();
                  },
                },
                h('b', {}, v.name),
                h('small', {}, v.text),
              ),
            ),
          ),
        );
    const farben = gruppe(
      'Farbe',
      h(
        'div',
        { class: 'chip-reihe au-farben', role: 'group', 'aria-label': 'Farbe' },
        FARBEN_WAHL.map((f) =>
          h(
            'button',
            {
              class: `chip au-farbe${e.farbeKennung === f.id ? ' aktiv' : ''}`,
              type: 'button',
              'aria-pressed': String(e.farbeKennung === f.id),
              style: { '--auto': f.hex },
              onClick: () => {
                e.farbeKennung = f.id;
                neuZeichnen();
              },
            },
            h('span', { class: 'au-farbpunkt', 'aria-hidden': 'true' }),
            f.name,
          ),
        ),
      ),
    );
    const speichern = async () => {
      if (speichert) return;
      const x = entwurfZuAuto(e);
      if (x.fehler) {
        toast(x.fehler, { art: 'fehler' });
        return;
      }
      speichert = true;
      neuZeichnen();
      const r = await sicher(store.autoSpeichern(x.paket ?? x.auto));
      speichert = false;
      if (erledigt(r, vorhanden ? 'Gespeichert ✓' : 'Auto angelegt ✓')) {
        schliessen();
        if (!vorhanden && r.ok && r.id) ui.gehZu(`autos/${r.id}`);
        return;
      }
      neuZeichnen();
    };
    // M3 (Review T4): nur eine Rückfrage zugleich; ab „Löschen“ ist das Blatt aus, nach einem Fehler wieder an
    const loeschenKnopf = vorhanden
      ? h(
          'button',
          {
            class: 'knopf klein gefahr',
            type: 'button',
            disabled: aus || fragt,
            onClick: () => {
              if (fragt || speichert) return;
              fragt = true;
              neuZeichnen();
              autoLoeschenFragen({ store, ui }, vorhanden, schliessen, {
                beimSchliessen: () => {
                  fragt = false;
                  if (!speichert) neuZeichnen();
                },
                beginnt: () => {
                  speichert = true;
                  neuZeichnen();
                },
                fehlgeschlagen: () => {
                  speichert = false;
                  neuZeichnen();
                },
              });
            },
          },
          'Auto löschen',
        )
      : null;
    return [
      gesperrt ? gesperrtHinweis(gesperrt) : null,
      h(
        'fieldset',
        { class: 'fk-felder au-felder', disabled: aus },
        vorlagen,
        feld('Name', textFeld({ wert: e.name, beschriftung: 'Name', platzhalter: 'z. B. Familienauto', max: 30, beiEingabe: (w) => (e.name = w) })),
        farben,
        (vorhanden ? ALLE_FELDER : NEU_FELDER).map((f) => autoFeld(e, f, heute)),
        haken('Neu gekauft (seit der Erstzulassung bei uns)', e.neuGekauft, (w) => (e.neuGekauft = w)),
        h('small', { class: 'leise fk-tipp' }, 'Neu gekauft: die Termine ohne Eintrag zählen ab der Erstzulassung. Sonst: „Letzte Erledigung eintragen“.'),
        h('p', { class: 'fk-box au-box au-datenschutz' }, `🔒 ${TEXT_DATENSCHUTZ}`),
      ),
      h('div', { class: 'knopfzeile' }, h('button', { class: 'knopf klein primaer', type: 'button', disabled: aus, onClick: speichern }, speichert ? 'Speichert …' : vorhanden ? 'Speichern' : 'Auto anlegen')),
      loeschenKnopf ? h('div', { class: 'knopfzeile loeschen-zeile' }, loeschenKnopf) : null,
    ];
  });
}

/** Rückfrage „Auto löschen?“, danach „Gelöscht ✓ · Rückgängig“ und zurück zur Liste. */
export function autoLoeschenFragen({ store, ui }, auto, danach = () => {}, { beimSchliessen = () => {}, beginnt = () => {}, fehlgeschlagen = () => {} } = {}) {
  return bestaetigen({
    titel: 'Auto löschen?',
    text: `„${auto.name}“ mit allen Regeln und Reifensätzen löschen? Mit „Rückgängig“ kommt alles samt Verlauf zurück.`,
    ja: 'Löschen',
    gefahr: true,
    beimSchliessen,
    beiJa: async () => {
      beginnt();
      if (geloeschtMelden(await sicher(store.autoLoeschen(auto.id)))) {
        danach();
        ui.gehZu('autos');
      } else fehlgeschlagen();
    },
  });
}

// ---------------------------------------------------------------- Reifensatz

const SATZ_NAMEN = [
  ['Sommer', 'sommer'],
  ['Winter', 'winter'],
  ['Ganzjahr', 'ganzjahr'],
];

/**
 * „Reifensatz anlegen“ (M7, Review T4): Name (Sommer/Winter/Ganzjahr oder frei), Art, optional Größe – damit auch ein „Leer“-Auto einen
 * Reifenwechsel eintragen kann. Umbenennen und Löschen kommen später. `danach` läuft nach dem Speichern (z. B. das Reifenwechsel-Blatt neu zeichnen).
 */
export function oeffneSatzFormular({ store }, autoId, { danach = () => {} } = {}) {
  const auto = (store.getState().autos.daten.autos ?? []).find((a) => a.id === autoId);
  if (!auto) {
    toast('Dieses Auto gibt es nicht mehr.', { art: 'fehler' });
    return null;
  }
  const vorhanden = new Set((store.getState().autos.daten.saetze ?? []).filter((s) => s.auto === autoId).map((s) => s.art));
  const start = SATZ_NAMEN.find(([, art]) => !vorhanden.has(art)) ?? SATZ_NAMEN[0];
  const e = { name: start[0], art: start[1], groesse: auto.reifenGroessen ?? '' };
  let speichert = false;
  return formularBlatt('🛞 Reifensatz anlegen', ({ schliessen, neuZeichnen }) => {
    const gesperrt = autosSperre(store.getState().autos);
    const aus = Boolean(gesperrt) || speichert;
    const speichern = async () => {
      if (speichert) return;
      speichert = true;
      neuZeichnen();
      const r = await sicher(store.satzSpeichern({ auto: autoId, name: e.name, art: e.art, ...(e.groesse.trim() ? { groesse: e.groesse } : {}) }));
      speichert = false;
      if (erledigt(r, 'Reifensatz angelegt ✓')) {
        schliessen();
        danach();
        return;
      }
      neuZeichnen();
    };
    const name = textFeld({ wert: e.name, beschriftung: 'Name des Reifensatzes', platzhalter: 'z. B. Winter Alu', max: 20, beiEingabe: (w) => (e.name = w) });
    return [
      gesperrt ? gesperrtHinweis(gesperrt) : null,
      h(
        'fieldset',
        { class: 'fk-felder au-felder', disabled: aus },
        gruppe(
          'Welcher Satz?',
          h(
            'div',
            { class: 'chip-reihe', role: 'group', 'aria-label': 'Art des Reifensatzes' },
            SATZ_NAMEN.map(([text, art]) =>
              chip(`${SATZ_EMOJI[art]} ${text}`, {
                art: e.art === art ? 'aktiv' : '',
                onClick: () => {
                  if (SATZ_NAMEN.some(([n]) => n === e.name) || e.name.trim() === '') e.name = text; // einen eigenen Namen nicht überschreiben
                  e.art = art;
                  neuZeichnen();
                },
              }),
            ),
          ),
        ),
        feld('Name', name),
        feld('Reifengröße (optional)', textFeld({ wert: e.groesse, beschriftung: 'Reifengröße', platzhalter: 'z. B. 205/55 R16', max: 30, beiEingabe: (w) => (e.groesse = w) })),
        h('small', { class: 'leise fk-tipp' }, 'Die Kilometer je Satz rechnet die App aus den Reifenwechseln – beim ersten Wechsel den Kilometerstand eintragen.'),
      ),
      h('div', { class: 'knopfzeile' }, h('button', { class: 'knopf klein primaer', type: 'button', disabled: aus, onClick: speichern }, speichert ? 'Speichert …' : 'Anlegen')),
    ];
  });
}
