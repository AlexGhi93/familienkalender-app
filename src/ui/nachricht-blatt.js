// Nachricht an die Krabbelstube bzw. den Kindergarten: Situation antippen (krank, später, früher abholen …), ein paar Angaben,
// der fertige Text steht zum Nachlesen und Ändern da, dann per WhatsApp, SMS, E-Mail, Teilen oder Kopieren senden.
// Die Texte kommen aus src/app/nachrichten.js; Kontakt, Grußformel und Unterschrift stehen in „Mehr“ → „Nachrichten“.
import { h } from './dom.js';
import { blatt, chip, toast } from './components.js';
import { datumFeld, zeitFeld } from './eingabefelder.js';
import { oeffneMenueZeile } from './menue.js';
import { ANLAESSE, GRUPPEN, KRANKHEITEN, TONARTEN, einrichtungsFormen, nachrichtBetreff, nachrichtText, sendeLinks } from '../app/nachrichten.js';
import { addDays } from '../domain/dates.js';
import { einrichtungFor } from '../domain/modus.js';

const MAX_PERSON = 40;
const MAX_KRANKHEIT = 40;

/** Beschriftung der Uhrzeit bzw. des Datums je Anlass. */
const ZEIT_TEXT = { spaeter: 'Kommt gegen', arzt: 'Arzttermin um', frueher: 'Abholen um', abholer: 'Abholen gegen (optional)', vormittags: 'Abholen gegen (optional)', termin: 'Termin um' };
const DATUM_TEXT = { laenger: 'Krank bis einschließlich', gesund: 'Kommt wieder am (leer = morgen)', frei: 'Frei bis einschließlich' };

/** Ein Knopf zum Senden als Link: ein echter Tipp auf <a href> öffnet WhatsApp, SMS und E-Mail auch aus der installierten App (iPhone, Android). */
function sendeLink(symbol, text, href, { primaer = false, neuesFenster = false } = {}) {
  return h(
    'a',
    { class: `knopf klein senden ${primaer ? 'primaer' : ''}`.trim(), href, target: neuesFenster ? '_blank' : null, rel: neuesFenster ? 'noopener' : null },
    h('span', { 'aria-hidden': 'true' }, symbol),
    ` ${text}`,
  );
}

function sendeKnopf(symbol, text, beiKlick) {
  return h('button', { class: 'knopf klein senden', type: 'button', onClick: beiKlick }, h('span', { 'aria-hidden': 'true' }, symbol), ` ${text}`);
}

async function kopieren(textfeld) {
  try {
    await navigator.clipboard.writeText(textfeld.value);
    toast('Kopiert ✓');
  } catch {
    // ältere Browser oder keine Erlaubnis: markieren und klassisch kopieren
    textfeld.focus();
    textfeld.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    toast(ok ? 'Kopiert ✓' : 'Kopieren ging nicht. Bitte den Text markieren und kopieren.');
  }
}

const ruhig = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/**
 * Öffnet das Blatt „Nachricht an die Krabbelstube“ bzw. „… an den Kindergarten“.
 * `anlass`: id aus ANLAESSE (vorausgewählt); `tag`: 'heute' | 'morgen' (nur für Anlässe mit Heute/Morgen).
 * Mit ausdrücklich gewähltem `anlass` (z. B. aus der Meldung nach „Krank“) zeigt das Blatt gleich Text und Senden.
 */
export function oeffneNachricht({ store, ui }, optionen = {}) {
  const { anlass = 'unwohl', tag = 'heute' } = optionen;
  const heute = store.heute();
  const z = {
    anlass: ANLAESSE.some((a) => a.id === anlass) ? anlass : 'unwohl',
    tag: tag === 'morgen' ? 'morgen' : 'heute',
    zeit: '',
    person: '',
    datum: '',
    krankheit: '',
    ton: 'normal', // Tonart des Textes (TONARTEN)
  };
  let links = []; // [knoten, art] der Sende-Links, deren href dem Text folgt

  const anlassVon = () => ANLAESSE.find((a) => a.id === z.anlass);
  const settings = () => store.getState().settings;
  // Für Heute/Morgen zählt die Einrichtung des gewählten Tages (am Wechseltag heißt es schon „Kindergarten“).
  const einrichtung = () => einrichtungFor(anlassVon().wann && z.tag === 'morgen' ? addDays(heute, 1) : heute, settings());
  const angaben = () => {
    const s = settings();
    return {
      kindname: s.kindname,
      geschlecht: s.kindGeschlecht,
      einrichtung: einrichtung(),
      anrede: s.nachrichtAnrede,
      ton: z.ton,
      gruss: s.nachrichtGruss,
      unterschrift: s.nachrichtUnterschrift,
      tag: z.tag,
      zeit: z.zeit,
      person: z.person,
      datum: z.datum,
      krankheit: z.krankheit,
      heute,
    };
  };

  const textfeld = h('textarea', {
    class: 'nachricht-text',
    rows: '7',
    'aria-label': 'Nachricht',
    autocapitalize: 'sentences',
    onInput: () => {
      passeHoeheAn();
      linksSetzen();
    },
  });
  let details = null; // alles nach der Auswahl der Situation (Wann, Angaben, Text, Senden)

  function linksSetzen() {
    const s = settings();
    const neu = sendeLinks({ telefon: s.einrichtungTelefon, email: s.einrichtungEmail, text: textfeld.value, betreff: nachrichtBetreff(z.anlass, angaben()) });
    for (const [knoten, art] of links) knoten.setAttribute('href', neu[art]);
  }

  /** Das Textfeld wächst mit dem Text: die ganze Nachricht samt Gruß ist ohne Scrollen im Feld zu lesen. */
  function passeHoeheAn() {
    if (!textfeld.isConnected) return;
    textfeld.style.setProperty('height', 'auto');
    textfeld.style.setProperty('height', `${textfeld.scrollHeight + 4}px`); // + Rahmen
  }

  function neuerText() {
    textfeld.value = nachrichtText(z.anlass, angaben());
    passeHoeheAn();
    linksSetzen();
  }

  let b = null;
  const titel = () => `Nachricht ${einrichtungsFormen(einrichtung()).an}`;
  function zeichne() {
    b.neuZeichnen();
    const tafel = textfeld.closest('.blatt');
    tafel?.setAttribute('aria-label', titel());
    const kopf = tafel?.querySelector('.blatt-kopf h2');
    if (kopf) kopf.textContent = titel();
  }
  const waehle = (aenderung) => {
    Object.assign(z, aenderung);
    neuerText();
    zeichne();
  };

  /** Holt nach der Wahl einer Situation Text und Senden ins Bild, aber nicht weiter als bis zum Beginn der Angaben (die Situationen bleiben oben). */
  function zeigeDetails() {
    const tafel = details?.closest('.blatt');
    if (!tafel) return;
    const ende = details.offsetTop + details.offsetHeight + 16;
    if (ende <= tafel.scrollTop + tafel.clientHeight) return;
    const ziel = Math.min(details.offsetTop - 8, ende - tafel.clientHeight);
    if (ziel > tafel.scrollTop) tafel.scrollTo({ top: ziel, behavior: ruhig() ? 'auto' : 'smooth' });
  }

  function feldFuer(art, a) {
    if (art === 'zeit') {
      const beschriftung = ZEIT_TEXT[a.id] ?? 'Uhrzeit';
      return h(
        'div',
        { class: 'feld' },
        h('span', {}, beschriftung),
        zeitFeld({
          wert: z.zeit,
          beschriftung,
          beiAenderung: (w) => {
            z.zeit = w;
            neuerText();
          },
        }),
      );
    }
    if (art === 'datum') {
      const beschriftung = DATUM_TEXT[a.id] ?? 'Datum';
      return h(
        'div',
        { class: 'feld' },
        h('span', {}, beschriftung),
        datumFeld({
          wert: z.datum,
          heute,
          beschriftung,
          beiAenderung: (w) => {
            z.datum = w;
            neuerText();
          },
        }),
      );
    }
    if (art === 'person') {
      return h(
        'label',
        { class: 'feld' },
        h('span', {}, 'Wer holt ab?'),
        h('input', {
          type: 'text',
          maxlength: String(MAX_PERSON),
          autocomplete: 'off',
          autocapitalize: 'words',
          enterkeyhint: 'done',
          placeholder: 'z. B. Oma Maria',
          value: z.person,
          onInput: (e) => {
            z.person = e.target.value;
            neuerText();
          },
        }),
      );
    }
    if (art === 'krankheit') {
      const vorschlaege = KRANKHEITEN.map((k) => chip(k, { art: z.krankheit === k ? 'aktiv' : '', onClick: () => waehle({ krankheit: k }) }));
      const markiere = () => vorschlaege.forEach((c, i) => c.classList.toggle('aktiv', z.krankheit.trim() === KRANKHEITEN[i]));
      return h(
        'div',
        { class: 'feld' },
        h('span', {}, 'Welche Krankheit?'),
        h('input', {
          type: 'text',
          maxlength: String(MAX_KRANKHEIT),
          autocomplete: 'off',
          enterkeyhint: 'done',
          placeholder: 'z. B. Scharlach',
          'aria-label': 'Welche Krankheit?',
          value: z.krankheit,
          onInput: (e) => {
            z.krankheit = e.target.value;
            markiere();
            neuerText();
          },
        }),
        h('div', { class: 'chip-reihe' }, vorschlaege),
      );
    }
    return null;
  }

  function senden(schliessen) {
    const s = settings();
    const neu = sendeLinks({ telefon: s.einrichtungTelefon, email: s.einrichtungEmail, text: textfeld.value, betreff: nachrichtBetreff(z.anlass, angaben()) });
    const knoepfe = [];
    links = [];
    const link = (art, symbol, text, optionen) => {
      if (!neu[art]) return;
      const knoten = sendeLink(symbol, text, neu[art], { ...optionen, primaer: links.length === 0 });
      links.push([knoten, art]);
      knoepfe.push(knoten);
    };
    link('whatsapp', '💬', 'WhatsApp', { neuesFenster: true });
    link('sms', '✉️', 'SMS');
    link('email', '📧', 'E-Mail');
    if (typeof navigator.share === 'function') {
      knoepfe.push(sendeKnopf('📤', 'Teilen …', () => navigator.share({ text: textfeld.value }).catch(() => {}))); // Abbrechen ist kein Fehler
    }
    knoepfe.push(sendeKnopf('📋', 'Kopieren', () => kopieren(textfeld)));

    const ohneKontakt = !s.einrichtungTelefon && !s.einrichtungEmail;
    return [
      ohneKontakt
        ? h(
            'div',
            { class: 'karte hinweis nachricht-kontakt' },
            h('p', {}, `Noch kein Kontakt ${einrichtungsFormen(einrichtung()).der} eingetragen. Mit Telefonnummer oder E-Mail sendest du direkt per WhatsApp, SMS oder E-Mail.`),
            h(
              'div',
              { class: 'knopfzeile' },
              h(
                'button',
                {
                  class: 'knopf klein',
                  type: 'button',
                  onClick: () => {
                    schliessen();
                    oeffneMenueZeile('nachrichten');
                    ui.gehZu('mehr');
                  },
                },
                'Kontakt eintragen',
              ),
            ),
          )
        : null,
      h('div', { class: 'nachricht-senden' }, knoepfe),
    ];
  }

  function render({ schliessen }) {
    const a = anlassVon();
    const situationen = GRUPPEN.map(([gruppe, gruppenTitel]) =>
      h(
        'div',
        { class: 'nachricht-gruppe' },
        h('span', { class: 'nachricht-gruppe-titel' }, gruppenTitel),
        h(
          'div',
          { class: 'chip-reihe' },
          ANLAESSE.filter((x) => x.gruppe === gruppe).map((x) =>
            chip(`${x.emoji} ${x.titel}`, {
              art: x.id === z.anlass ? 'aktiv' : '',
              onClick: () => {
                waehle({ anlass: x.id });
                zeigeDetails();
              },
            }),
          ),
        ),
      ),
    );
    const wann = a.wann
      ? h(
          'div',
          { class: 'feld' },
          h('span', {}, 'Wann?'),
          h(
            'div',
            { class: 'chip-reihe' },
            chip('Heute', { art: z.tag === 'heute' ? 'aktiv' : '', onClick: () => waehle({ tag: 'heute' }) }),
            chip('Morgen', { art: z.tag === 'morgen' ? 'aktiv' : '', onClick: () => waehle({ tag: 'morgen' }) }),
          ),
        )
      : null;
    details = h(
      'div',
      { class: 'nachricht-details' },
      wann,
      a.felder.map((art) => feldFuer(art, a)),
      h('h3', {}, 'Nachricht'),
      h(
        'div',
        { class: 'feld nachricht-ton' },
        h('span', {}, 'Ton'),
        h('div', { class: 'chip-reihe' }, TONARTEN.map(([id, text]) => chip(text, { art: z.ton === id ? 'aktiv' : '', onClick: () => waehle({ ton: id }) }))),
      ),
      h('div', { class: 'feld' }, textfeld, h('small', { class: 'leise' }, 'Du kannst den Text vor dem Senden noch ändern.')),
      h('h3', {}, 'Senden'),
      senden(schliessen),
    );
    return [h('h3', {}, 'Was ist los?'), situationen, details];
  }

  textfeld.value = nachrichtText(z.anlass, angaben());
  b = blatt({ titel: titel(), render });
  passeHoeheAn();
  if (optionen.anlass) requestAnimationFrame(zeigeDetails);
  return b;
}
