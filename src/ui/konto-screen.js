// Seite „Kontostand“: am letzten Tag des Monats tragen Papa und Mama ihren Gesamtstand ein; darunter die Ersparnis je Monat
// (auch „ohne Extra“, wenn Sonderbeträge wie Weihnachtsgeld dabei waren). Alle Texte kommen als Text in die Seite, nie als HTML.
// Beträge erscheinen nur hier, nie in Benachrichtigungen.
import { fuelle, h, svg } from './dom.js';
import { abschnitt, bestaetigen, blatt, chip, farbe, toast } from './components.js';
import { kontoModel } from '../app/views/konto-model.js';
import { balkenDiagramm, bereichLeiste, kacheln, verlaufDiagramm } from './konto-diagramm.js';
import { MAX_EXTRA_TEXT, betragText, centsAusText } from '../domain/konto.js';

const GRUEN = '#2F9E5B';
const HINWEIS_EINGABE = 'Bitte einen Betrag eingeben, z. B. 20.711 oder 1.234,56.';

// Eingaben überleben das Neuzeichnen der Seite (z. B. wenn vom anderen Telefon etwas hereinkommt).
const neuerZustand = () => ({ entwurf: { papa: { text: '', minus: false }, mama: { text: '', minus: false } }, bearbeiten: new Set() }); // bearbeiten: wer seinen Eintrag gerade ändert
const eintragenZustand = neuerZustand();
const nachtragenZustand = neuerZustand();
let demoMonat = null; // in der Demo gewählter Monat des Formulars
let nachtragMonat = null; // gewählter Monat beim Nachtragen
let bereich = 12; // Zeitraum der Diagramme (6, 12 oder 0 = alles)
const extraEntwurf = { offen: false, person: 'papa', monat: null, ausgabe: false, betrag: '', text: '' };

/** Eingabe + „Im Minus“ → ganze Cent oder null. Ein eingetipptes „−“ gilt wie der Schalter. */
function betragAusFeld(text, minus) {
  const cents = centsAusText(text);
  return cents === null ? null : minus && cents > 0 ? -cents : cents;
}

/** Feld für einen Betrag mit „Im Minus“-Schalter; `zustand` = { text, minus } wird live nachgeführt. */
function betragFeld(zustand, beschriftung, beiEnter) {
  const eingabe = h('input', { type: 'text', inputmode: 'decimal', class: 'konto-eingabe', value: zustand.text, placeholder: 'z. B. 20.711,50', 'aria-label': beschriftung, autocomplete: 'off', maxlength: '16', enterkeyhint: 'done' });
  const minus = h('button', { class: `chip konto-minus${zustand.minus ? ' aktiv' : ''}`, type: 'button', 'aria-pressed': zustand.minus ? 'true' : 'false' }, 'Im Minus');
  eingabe.addEventListener('input', () => {
    zustand.text = eingabe.value;
  });
  eingabe.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      beiEnter();
    }
  });
  minus.addEventListener('click', () => {
    zustand.minus = !zustand.minus;
    minus.classList.toggle('aktiv', zustand.minus);
    minus.setAttribute('aria-pressed', zustand.minus ? 'true' : 'false');
  });
  return h('div', { class: 'konto-betrag' }, eingabe, minus);
}

async function speichern(store, { person, monat, zustand, demo, nachtrag, danach }) {
  const cents = betragAusFeld(zustand.text, zustand.minus);
  if (cents === null) {
    toast(HINWEIS_EINGABE);
    return;
  }
  try {
    if (nachtrag) await store.kontoNachtragen({ person, monat, cents });
    else await store.kontoSpeichern({ person, monat, cents }, { demo });
  } catch (fehler) {
    toast(fehler.message);
    return;
  }
  danach?.();
  toast('Gespeichert ✓');
}

function personZeile(feld, e, { store, ui }, z = eintragenZustand) {
  const zustand = z.entwurf[feld.person];
  if (feld.hatEintrag && !z.bearbeiten.has(feld.person)) {
    return h(
      'div',
      { class: 'konto-person fertig' },
      h('span', { class: 'emoji' }, feld.emoji),
      h('span', { class: 'karte-text' }, h('b', {}, `${feld.label} ✔ ${feld.wert}`), h('small', {}, 'eingetragen')),
      h(
        'button',
        {
          class: 'knopf klein',
          type: 'button',
          onClick: () => {
            const cents = centsAusText(feld.wert);
            zustand.text = cents === null ? '' : betragText(Math.abs(cents)).replace(' €', '');
            zustand.minus = cents !== null && cents < 0;
            z.bearbeiten.add(feld.person);
            ui.rendern();
          },
        },
        'Ändern',
      ),
    );
  }
  const los = () =>
    speichern(store, {
      person: feld.person,
      monat: e.monat,
      zustand,
      demo: e.demo,
      nachtrag: e.nachtrag,
      danach: () => {
        zustand.text = '';
        zustand.minus = false;
        z.bearbeiten.delete(feld.person);
        ui.rendern();
      },
    });
  return h(
    'div',
    { class: 'konto-person' },
    h('div', { class: 'karte-zeile' }, h('span', { class: 'emoji' }, feld.emoji), h('b', {}, feld.label)),
    betragFeld(zustand, `Kontostand ${feld.label}`, los),
    h('div', { class: 'knopfzeile' }, h('button', { class: 'knopf klein primaer', type: 'button', onClick: los }, 'Speichern')),
  );
}

/** Nur Demo: Monat wählen und Beispieldaten entfernen, damit man eigene Zahlen ausprobieren kann. */
function demoWerkzeuge(e, { store, ui }) {
  const wahl = h(
    'select',
    {
      class: 'konto-eingabe',
      'aria-label': 'Monat für den Kontostand',
      onChange: (ev) => {
        demoMonat = ev.target.value;
        eintragenZustand.bearbeiten.clear();
        ui.rendern();
      },
    },
    e.monate.map((x) => h('option', { value: x.wert, selected: x.wert === e.monat }, x.text)),
  );
  const entfernen = () =>
    bestaetigen({
      titel: 'Beispieldaten entfernen?',
      text: 'Alle Beispiel-Kontostände und Sonderbeträge der Demo werden gelöscht, damit du eigene Zahlen ausprobieren kannst. Das betrifft nur die Demo.',
      ja: 'Entfernen',
      gefahr: true,
      beiJa: async () => {
        try {
          await store.kontoLeeren();
          toast('Beispieldaten entfernt');
        } catch (fehler) {
          toast(fehler.message);
        }
      },
    });
  return h('div', { class: 'konto-demo' }, h('span', { class: 'leise' }, 'Monat zum Ausprobieren:'), wahl, h('button', { class: 'knopf klein', type: 'button', onClick: entfernen }, 'Beispieldaten entfernen'));
}

/** Nachtragen: der Stand vom letzten Tag eines früheren Monats laut Kontoauszug (nicht der heutige Stand). */
function nachtragKarte(m, ctx) {
  const n = m.nachtragen;
  const e = { monat: n.monat, monatText: n.monatText, demo: false, nachtrag: true, felder: n.felder };
  const wahl = h(
    'select',
    {
      class: 'konto-eingabe',
      'aria-label': 'Monat zum Nachtragen',
      onChange: (ev) => {
        nachtragMonat = ev.target.value;
        nachtragenZustand.bearbeiten.clear();
        ctx.ui.rendern();
      },
    },
    n.monate.map((x) => h('option', { value: x.wert, selected: x.wert === n.monat }, x.text)),
  );
  return h(
    'article',
    { class: 'karte' },
    h('div', { class: 'karte-zeile' }, h('span', { class: 'emoji' }, '🕘'), h('div', { class: 'karte-text' }, h('b', {}, `Nachtragen: ${n.monatText}`), h('small', {}, 'Einen früheren Monat nachtragen'))),
    h('p', { class: 'leise' }, 'Bitte den Stand vom LETZTEN Tag des Monats eintragen, so wie er im Kontoauszug steht (z. B. der Stand vom 30.09.), nicht den heutigen. Möglich für die letzten 24 Monate; der laufende Monat geht nur am letzten Tag.'),
    wahl,
    n.felder.map((f) => personZeile(f, e, ctx, nachtragenZustand)),
  );
}

function eintragKarte(m, ctx) {
  const e = m.eintrag;
  return h(
    'article',
    { class: 'karte tint formular', style: farbe(GRUEN) },
    h(
      'div',
      { class: 'karte-zeile' },
      h('span', { class: 'emoji gross' }, '💶'),
      h('div', { class: 'karte-text' }, h('b', {}, `Kontostand ${e.monatText}`), h('small', {}, e.demo ? 'Demo: Hier kannst du Beispielzahlen für jeden Monat eintragen. Alles bleibt nur in diesem Browser.' : 'Heute ist der letzte Tag des Monats. Bitte den Gesamtstand aller deiner Konten eintragen.')),
    ),
    e.demo ? demoWerkzeuge(e, ctx) : null,
    e.felder.map((f) => personZeile(f, e, ctx)),
  );
}

function veraenderungChip(v) {
  return v ? h('span', { class: `konto-delta ${v.art}` }, v.text) : null;
}

function reihe(name, stand, v, hinweis, extra, klasse = '') {
  return h('div', { class: `konto-reihe ${klasse}`.trim() }, h('span', { class: 'konto-name' }, name), h('span', { class: 'konto-stand' }, stand), veraenderungChip(v), hinweis ? h('small', { class: 'konto-hinweis' }, hinweis) : null, extra ? h('small', { class: 'konto-hinweis extra' }, extra.text) : null);
}

function zeile(z, beiKlick) {
  const zeilen = [...z.personen.map((p) => reihe(`${p.emoji} ${p.label}`, p.stand, p.veraenderung, p.hinweis, p.extra)), z.zusammen ? reihe('👪 Zusammen', z.zusammen.stand, z.zusammen.veraenderung, z.zusammen.hinweis, z.zusammen.extra, 'zusammen') : null];
  return h('button', { class: 'karte konto-zeile', type: 'button', 'aria-label': `${z.monatText} korrigieren oder löschen`, onClick: beiKlick }, h('b', { class: 'konto-monat-titel' }, z.monatText), zeilen);
}

/** Korrigieren (Tippfehler) oder Löschen eines vorhandenen Eintrags; neue Monate lassen sich hier nicht anlegen. */
function oeffneKorrektur(z, { store }) {
  const felder = z.personen.filter((p) => p.stand !== '—');
  const zustaende = Object.fromEntries(
    felder.map((p) => {
      const cents = centsAusText(p.stand);
      return [p.person, { text: cents === null ? '' : betragText(Math.abs(cents)).replace(' €', ''), minus: cents !== null && cents < 0 }];
    }),
  );
  return blatt({
    titel: `${z.monatText}: korrigieren oder löschen`,
    render: ({ schliessen }) => [
      h('p', { class: 'leise' }, 'Korrigieren nur für Tippfehler: Ein neuer Wert ändert auch die Ersparnis dieses und des nächsten Monats.'),
      felder.map((p) => {
        const korrigieren = () =>
          bestaetigen({
            titel: 'Kontostand korrigieren?',
            text: `${p.label}: ${z.monatText} wird auf den neuen Betrag gesetzt (nur für Tippfehler).`,
            ja: 'Korrigieren',
            beiJa: async () => {
              const cents = betragAusFeld(zustaende[p.person].text, zustaende[p.person].minus);
              if (cents === null) {
                toast(HINWEIS_EINGABE);
                return;
              }
              try {
                await store.kontoSpeichern({ person: p.person, monat: z.monat, cents });
                schliessen();
                toast('Korrigiert ✓');
              } catch (fehler) {
                toast(fehler.message);
              }
            },
          });
        const loeschen = () =>
          bestaetigen({
            titel: 'Kontostand löschen?',
            text: `${p.label}: ${z.monatText} (${p.stand}) wird gelöscht. Du kannst ihn später mit „Nachtragen“ neu eintragen (Stand vom letzten Tag des Monats laut Kontoauszug); bis dahin wird die Ersparnis „seit …“ berechnet.`,
            ja: 'Löschen',
            gefahr: true,
            beiJa: async () => {
              try {
                await store.kontoLoeschen({ person: p.person, monat: z.monat });
                schliessen();
                toast('Gelöscht ✓');
              } catch (fehler) {
                toast(fehler.message);
              }
            },
          });
        return h(
          'div',
          { class: 'konto-person' },
          h('div', { class: 'karte-zeile' }, h('span', { class: 'emoji' }, p.emoji), h('b', {}, p.label)),
          betragFeld(zustaende[p.person], `Kontostand ${p.label} ${z.monatText}`, korrigieren),
          h('div', { class: 'knopfzeile' }, h('button', { class: 'knopf klein gefahr', type: 'button', onClick: loeschen }, 'Löschen'), h('button', { class: 'knopf klein primaer', type: 'button', onClick: korrigieren }, 'Korrigieren')),
        );
      }),
    ],
  });
}

// ---------- Sonderbeträge ----------

function extraFormular(m, { store, ui }) {
  const f = m.extraFormular;
  const e = extraEntwurf;
  const personen = [['papa', '👨 Papa'], ['mama', '👩 Mama']];
  const arten = [[false, '＋ Einnahme'], [true, '− Ausgabe']];
  const wahl = (liste, aktuell, setze) =>
    h(
      'div',
      { class: 'chip-reihe' },
      liste.map(([wert, text]) => chip(text, { art: aktuell() === wert ? 'aktiv' : '', onClick: () => { setze(wert); ui.rendern(); } })),
    );
  const monatWahl = h(
    'select',
    { class: 'konto-eingabe', 'aria-label': 'Monat des Sonderbetrags', onChange: (ev) => { e.monat = ev.target.value; } },
    f.monate.map((x) => h('option', { value: x.wert, selected: x.wert === (e.monat ?? f.standard) }, x.text)),
  );
  const betrag = h('input', { type: 'text', inputmode: 'decimal', class: 'konto-eingabe', value: e.betrag, placeholder: 'Betrag, z. B. 2.000', 'aria-label': 'Betrag des Sonderbetrags', autocomplete: 'off', maxlength: '16' });
  const text = h('input', { type: 'text', class: 'konto-eingabe', value: e.text, placeholder: 'Bezeichnung, z. B. Weihnachtsgeld', 'aria-label': 'Bezeichnung des Sonderbetrags', autocomplete: 'off', maxlength: String(MAX_EXTRA_TEXT), enterkeyhint: 'done' });
  betrag.addEventListener('input', () => { e.betrag = betrag.value; });
  text.addEventListener('input', () => { e.text = text.value; });
  const speichernExtra = async () => {
    const cents = centsAusText(e.betrag);
    if (cents === null || cents === 0) {
      toast('Bitte einen Betrag eingeben, z. B. 2.000 oder 450,50.');
      return;
    }
    try {
      await store.extraHinzufuegen({ person: e.person, monat: e.monat ?? f.standard, cents: e.ausgabe ? -Math.abs(cents) : Math.abs(cents), text: e.text });
    } catch (fehler) {
      toast(fehler.message);
      return;
    }
    e.betrag = '';
    e.text = '';
    e.offen = false;
    ui.rendern();
    toast('Gespeichert ✓');
  };
  text.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); speichernExtra(); } });
  return h(
    'div',
    { class: 'konto-person extra-formular' },
    wahl(personen, () => e.person, (v) => { e.person = v; }),
    wahl(arten, () => e.ausgabe, (v) => { e.ausgabe = v; }),
    monatWahl,
    betrag,
    text,
    h('div', { class: 'knopfzeile' }, h('button', { class: 'knopf klein', type: 'button', onClick: () => { e.offen = false; ui.rendern(); } }, 'Abbrechen'), h('button', { class: 'knopf klein primaer', type: 'button', onClick: speichernExtra }, 'Speichern')),
  );
}

function extraListe(m, { store }) {
  return m.sonderbetraege.map((g) =>
    h(
      'div',
      { class: 'extra-gruppe' },
      h('b', { class: 'konto-monat-titel' }, g.monatText),
      g.eintraege.map((x) =>
        h(
          'div',
          { class: 'extra-zeile' },
          h('span', { class: 'emoji' }, x.emoji),
          h('span', { class: 'karte-text' }, h('b', {}, x.text), h('small', {}, x.label)),
          h('span', { class: `konto-delta ${x.art}` }, x.betrag),
          h(
            'button',
            {
              class: 'ek-weg',
              type: 'button',
              'aria-label': `${x.text} löschen`,
              onClick: () =>
                bestaetigen({
                  titel: 'Sonderbetrag löschen?',
                  text: `${x.text} (${x.betrag}, ${x.label}, ${g.monatText}) wird gelöscht. Die Ersparnis ohne Extra wird neu berechnet.`,
                  ja: 'Löschen',
                  gefahr: true,
                  beiJa: async () => {
                    try {
                      await store.extraEntfernen(x.id);
                      toast('Gelöscht ✓');
                    } catch (fehler) {
                      toast(fehler.message);
                    }
                  },
                }),
            },
            '✕',
          ),
        ),
      ),
    ),
  );
}

function sonderbetraegeKarte(m, ctx) {
  const { ui } = ctx;
  const f = m.extraFormular;
  const neu = h(
    'button',
    {
      class: 'knopf klein primaer',
      type: 'button',
      disabled: f.voll,
      onClick: () => {
        extraEntwurf.offen = true;
        extraEntwurf.monat ??= f.standard;
        ui.rendern();
      },
    },
    '＋ Sonderbetrag',
  );
  return h(
    'article',
    { class: 'karte' },
    h('p', { class: 'leise' }, 'Das ist nicht der Kontostand: Hier trägst du nur einmalige Beträge ein, zum Beispiel Weihnachtsgeld, einen Bonus oder eine größere Reparatur. Sonderbeträge ändern keinen Kontostand, werden aber aus der Ersparnis herausgerechnet („ohne Extra“). Sie lassen sich jederzeit eintragen und einzeln löschen.'),
    f.voll ? h('p', { class: 'leise' }, 'Es sind 40 Sonderbeträge eingetragen (das Maximum). Bitte erst ältere löschen.') : null,
    extraEntwurf.offen && !f.voll ? extraFormular(m, ctx) : h('div', { class: 'knopfzeile' }, neu),
    m.sonderbetraege.length > 0 ? extraListe(m, ctx) : h('p', { class: 'leise' }, 'Noch keine Sonderbeträge.'),
  );
}

export function kontoScreen({ store, ui }) {
  const demo = ui.konto?.modus === 'demo';
  const m = kontoModel(store.getState(), store.heute(), { demo, monat: demoMonat, nachtragMonat, bereich });
  const z = m.zusammenfassung;
  const ctx = { store, ui };
  return h(
    'section',
    { class: 'screen konto' },
    h('button', { class: 'zurueck', type: 'button', onClick: () => ui.gehZu('mehr') }, '‹ Zurück'),
    h('h1', { class: 'gruss' }, 'Kontostand 💶'),
    h('p', { class: 'datum' }, 'Am letzten Tag des Monats tragt ihr den Gesamtstand eurer Konten ein; so seht ihr, wie viel ihr spart.'),
    m.eintrag ? eintragKarte(m, ctx) : h('article', { class: 'karte hinweis' }, h('div', { class: 'karte-zeile' }, h('span', { class: 'emoji' }, '🗓️'), h('div', { class: 'karte-text' }, h('b', {}, m.naechster), h('small', {}, 'Frühere Monate trägst du weiter unten mit „Nachtragen“ ein.')))),
    m.nachtragen ? abschnitt('Nachtragen', nachtragKarte(m, ctx)) : null,
    m.leer ? h('p', { class: 'leise' }, 'Noch keine Kontostände. Ab dem zweiten Monatsende zeigt die Seite, wie viel ihr gespart habt.') : null,
    z || m.diagramm
      ? [
          bereichLeiste(m, (wert) => {
            bereich = wert;
            ui.rendern();
          }),
          kacheln(m),
        ]
      : null,
    m.diagramm ? abschnitt('Kontostand-Verlauf', verlaufDiagramm(m)) : null,
    m.balken.length > 0 ? abschnitt('Veränderung pro Monat (zusammen)', balkenDiagramm(m)) : null,
    !m.leer && !m.diagramm ? h('p', { class: 'leise' }, 'Das Diagramm erscheint ab dem zweiten Monat mit einem Kontostand. Der erste Eintrag ist der Startwert.') : null,
    abschnitt('Sonderbeträge', sonderbetraegeKarte(m, ctx)),
    m.zeilen.length > 0
      ? abschnitt('Sparen pro Monat', h('p', { class: 'leise' }, 'Veränderung des Kontostands: Gehalt, Rückzahlungen und Abbuchungen zählen mit. Antippen, um einen Eintrag zu korrigieren oder zu löschen.'), ...m.zeilen.map((r) => zeile(r, () => oeffneKorrektur(r, { store }))))
      : null,
  );
}
