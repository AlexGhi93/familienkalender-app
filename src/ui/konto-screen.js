// Seite „Kontostand“: am letzten Tag des Monats tragen Papa und Mama ihren Gesamtstand ein; darunter die Ersparnis je Monat.
// Alle Texte kommen als Text in die Seite, nie als HTML. Beträge erscheinen nur hier, nie in Benachrichtigungen.
import { fuelle, h, svg } from './dom.js';
import { abschnitt, bestaetigen, blatt, farbe, toast } from './components.js';
import { kontoModel } from '../app/views/konto-model.js';
import { betragText, centsAusText } from '../domain/konto.js';

const GRUEN = '#2F9E5B';
const HINWEIS_EINGABE = 'Bitte einen Betrag eingeben, z. B. 20.711 oder 1.234,56.';

// Eingaben überleben das Neuzeichnen der Seite (z. B. wenn vom anderen Telefon etwas hereinkommt).
const entwurf = { papa: { text: '', minus: false }, mama: { text: '', minus: false } };
const bearbeiten = new Set(); // wer seinen heutigen Eintrag gerade ändert

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

async function speichern(store, { person, monat, zustand, demo, danach }) {
  const cents = betragAusFeld(zustand.text, zustand.minus);
  if (cents === null) {
    toast(HINWEIS_EINGABE);
    return;
  }
  try {
    await store.kontoSpeichern({ person, monat, cents }, { demo });
  } catch (fehler) {
    toast(fehler.message);
    return;
  }
  danach?.();
  toast('Gespeichert ✓');
}

function personZeile(feld, e, { store, ui }) {
  const zustand = entwurf[feld.person];
  if (feld.hatEintrag && !bearbeiten.has(feld.person)) {
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
            bearbeiten.add(feld.person);
            ui.rendern();
          },
        },
        'Ändern',
      ),
    );
  }
  const los = () => speichern(store, { person: feld.person, monat: e.monat, zustand, demo: e.demo, danach: () => { zustand.text = ''; zustand.minus = false; bearbeiten.delete(feld.person); ui.rendern(); } });
  return h(
    'div',
    { class: 'konto-person' },
    h('div', { class: 'karte-zeile' }, h('span', { class: 'emoji' }, feld.emoji), h('b', {}, feld.label)),
    betragFeld(zustand, `Kontostand ${feld.label}`, los),
    h('div', { class: 'knopfzeile' }, h('button', { class: 'knopf klein primaer', type: 'button', onClick: los }, 'Speichern')),
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
      h('div', { class: 'karte-text' }, h('b', {}, `Kontostand ${e.monatText}`), h('small', {}, e.demo ? 'Demo: Hier geht das Eintragen an jedem Tag.' : 'Heute ist der letzte Tag des Monats. Bitte den Gesamtstand aller deiner Konten eintragen.')),
    ),
    e.felder.map((f) => personZeile(f, e, ctx)),
  );
}

/** Balkendiagramm der Zusammen-Veränderung (plus grün, minus rot); jeder Balken hat einen Titel, das Ganze eine Textfassung. */
function diagramm(balken) {
  if (balken.length === 0) return null;
  const breite = 320;
  const hoehe = 140;
  const oben = 12;
  const unten = 24;
  const innen = hoehe - oben - unten;
  const max = Math.max(0, ...balken.map((b) => b.wert));
  const min = Math.min(0, ...balken.map((b) => b.wert));
  const spanne = max - min || 1;
  const nullLinie = oben + (max / spanne) * innen;
  const schritt = (breite - 20) / balken.length;
  const balkenBreite = Math.min(28, schritt - 6);
  return svg(
    'svg',
    { class: 'konto-diagramm', viewBox: `0 0 ${breite} ${hoehe}`, role: 'img', 'aria-label': `Veränderung pro Monat: ${balken.map((b) => b.text).join('; ')}` },
    svg('line', { class: 'konto-null', x1: 6, x2: breite - 6, y1: nullLinie, y2: nullLinie }),
    balken.map((b, i) => {
      const x = 10 + i * schritt + (schritt - balkenBreite) / 2;
      const hohe = Math.max(2, (Math.abs(b.wert) / spanne) * innen);
      const y = b.wert >= 0 ? nullLinie - hohe : nullLinie;
      return svg(
        'g',
        {},
        svg('rect', { class: `konto-balken ${b.art}`, x, y, width: balkenBreite, height: hohe, rx: 3 }, svg('title', {}, b.text)),
        svg('text', { class: 'konto-monat', x: x + balkenBreite / 2, y: hoehe - 8, 'text-anchor': 'middle' }, b.kurz),
      );
    }),
  );
}

function veraenderungChip(v) {
  return v ? h('span', { class: `konto-delta ${v.art}` }, v.text) : null;
}

function zeile(z, beiKlick) {
  const zeilen = [
    ...z.personen.map((p) => h('div', { class: 'konto-reihe' }, h('span', { class: 'konto-name' }, `${p.emoji} ${p.label}`), h('span', { class: 'konto-stand' }, p.stand), veraenderungChip(p.veraenderung), p.hinweis ? h('small', { class: 'konto-hinweis' }, p.hinweis) : null)),
    z.zusammen ? h('div', { class: 'konto-reihe zusammen' }, h('span', { class: 'konto-name' }, '👪 Zusammen'), h('span', { class: 'konto-stand' }, z.zusammen.stand), veraenderungChip(z.zusammen.veraenderung), z.zusammen.hinweis ? h('small', { class: 'konto-hinweis' }, z.zusammen.hinweis) : null) : null,
  ];
  return h('button', { class: 'karte konto-zeile', type: 'button', 'aria-label': `${z.monatText} korrigieren`, onClick: beiKlick }, h('b', { class: 'konto-monat-titel' }, z.monatText), zeilen);
}

/** Tippfehler korrigieren: ein Blatt mit den vorhandenen Einträgen dieses Monats (neue Monate lassen sich hier nicht anlegen). */
function oeffneKorrektur(z, { store }) {
  const felder = z.personen.filter((p) => p.stand !== '—');
  const zustaende = Object.fromEntries(
    felder.map((p) => {
      const cents = centsAusText(p.stand);
      return [p.person, { text: cents === null ? '' : betragText(Math.abs(cents)).replace(' €', ''), minus: cents !== null && cents < 0 }];
    }),
  );
  return blatt({
    titel: `${z.monatText} korrigieren`,
    render: ({ schliessen }) => [
      h('p', { class: 'leise' }, 'Nur für Tippfehler: Ein neuer Wert ändert auch die Ersparnis dieses und des nächsten Monats.'),
      felder.map((p) => {
        const los = () =>
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
        return h('div', { class: 'konto-person' }, h('div', { class: 'karte-zeile' }, h('span', { class: 'emoji' }, p.emoji), h('b', {}, p.label)), betragFeld(zustaende[p.person], `Kontostand ${p.label} ${z.monatText}`, los), h('div', { class: 'knopfzeile' }, h('button', { class: 'knopf klein primaer', type: 'button', onClick: los }, 'Korrigieren')));
      }),
    ],
  });
}

export function kontoScreen({ store, ui }) {
  const demo = ui.konto?.modus === 'demo';
  const m = kontoModel(store.getState(), store.heute(), { demo });
  const z = m.zusammenfassung;
  return h(
    'section',
    { class: 'screen konto' },
    h('button', { class: 'zurueck', type: 'button', onClick: () => ui.gehZu('mehr') }, '‹ Zurück'),
    h('h1', { class: 'gruss' }, 'Kontostand 💶'),
    h('p', { class: 'datum' }, 'Am letzten Tag des Monats tragt ihr den Gesamtstand eurer Konten ein; so seht ihr, wie viel ihr spart.'),
    m.eintrag ? eintragKarte(m, { store, ui }) : h('article', { class: 'karte hinweis' }, h('div', { class: 'karte-zeile' }, h('span', { class: 'emoji' }, '🗓️'), h('div', { class: 'karte-text' }, h('b', {}, m.naechster)))),
    m.leer ? h('p', { class: 'leise' }, 'Noch keine Kontostände. Ab dem zweiten Monatsende zeigt die Seite, wie viel ihr gespart habt.') : null,
    z
      ? abschnitt(
          'Zusammenfassung',
          h('article', { class: 'karte konto-summe' }, h('div', { class: 'konto-reihe' }, h('span', {}, 'Seit Beginn'), h('b', {}, z.seitBeginn)), h('div', { class: 'konto-reihe' }, h('span', {}, 'Ø pro Monat'), h('b', {}, z.durchschnitt)), h('div', { class: 'konto-reihe' }, h('b', {}, z.text))),
        )
      : null,
    m.balken.length > 0 ? abschnitt('Veränderung pro Monat (zusammen)', h('article', { class: 'karte' }, diagramm(m.balken))) : null,
    m.zeilen.length > 0
      ? abschnitt('Sparen pro Monat', h('p', { class: 'leise' }, 'Veränderung des Kontostands: Gehalt, Rückzahlungen und Abbuchungen zählen mit. Antippen, um einen Tippfehler zu korrigieren.'), ...m.zeilen.map((r) => zeile(r, () => oeffneKorrektur(r, { store }))))
      : null,
  );
}
