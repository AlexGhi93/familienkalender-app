// „Wer bringt, wer holt?“: Wochenplan in „Mehr“, die Zeile auf „Heute“ und die Knöpfe im Tages-Blatt.
// Jeder Knopf wechselt mit einem Tipp: — → 👨 Papa → 👩 Mama → —. Auf „Heute“ und im Tages-Blatt gilt das nur für diesen einen Tag.
import { h } from './dom.js';
import { farbe, toast } from './components.js';
import { WOCHENTAGE, WOCHENTAGE_KURZ } from '../app/format-de.js';
import { addDays } from '../domain/dates.js';
import { dienstFuer, mitAusnahme, mitPlan, naechstePerson } from '../domain/dienst.js';
import { FUER } from '../domain/types.js';

const VERB = { b: 'bringt', h: 'holt' };
const FARBE = { papa: 'var(--serie-papa)', mama: 'var(--serie-mama)' };
const personText = (p) => (p ? `${FUER[p].emoji} ${FUER[p].label}` : '—');

/** „heute“, „morgen“ oder „diesen Tag“ für die Bestätigung. */
function fuerText(datum, heute) {
  if (datum === heute) return 'heute';
  return datum === addDays(heute, 1) ? 'morgen' : 'diesen Tag';
}

/** Wechselt die Person für `rolle` nur an `datum` (Ausnahme vom Wochenplan); gelesen wird der aktuelle Stand, nicht der beim Zeichnen. */
async function wechsle(store, datum, rolle) {
  const settings = store.getState().settings;
  const heute = store.heute();
  const person = naechstePerson(dienstFuer(datum, settings)[rolle]);
  try {
    await store.einstellungen({ dienstAusnahmen: mitAusnahme(settings, datum, rolle, person, heute) });
    toast(`Nur für ${fuerText(datum, heute)} geändert ✓`);
  } catch {
    toast('Das konnte nicht gespeichert werden.');
  }
}

/** Knopf für eine Aufgabe eines Tages: oben die Person (oder „❔ Wer?“), darunter „bringt 07:30“ bzw. „holt 15:30“. */
function aufgabeKnopf(store, datum, a) {
  const verb = VERB[a.rolle];
  return h(
    'button',
    {
      class: `dienst-knopf ${a.person || 'niemand'}`,
      type: 'button',
      style: a.person ? farbe(FARBE[a.person]) : null,
      'aria-label': `${a.person ? `${a.name} ${verb}` : `Wer ${verb}?`} ${a.zeit}. Antippen wechselt, nur für diesen Tag.`,
      onClick: () => wechsle(store, datum, a.rolle),
    },
    h('b', {}, a.person ? `${a.emoji} ${a.name}` : '❔ Wer?'),
    h('small', {}, `${verb} ${a.zeit}`),
  );
}

/** „Heute“: kompakte Zeile(n) „🚗 Heute: 👨 Papa bringt 07:30 · 👩 Mama holt 15:30“ (am Abend auch für morgen); `zeilen` aus dienstHeute. */
export function dienstKarte({ store, zeilen }) {
  if (zeilen.length === 0) return null;
  const zeile = (z) => {
    if (z.leer) {
      return h(
        'button',
        { class: 'dienst-leer', type: 'button', onClick: () => wechsle(store, z.datum, 'b') },
        h('span', { 'aria-hidden': 'true' }, '🚗'),
        h('span', { class: 'karte-text' }, h('b', {}, `Wer bringt ${z.wann}?`), h('small', {}, 'Antippen zum Festlegen')),
      );
    }
    return h(
      'div',
      { class: 'dienst-zeile' },
      h('span', { class: 'dienst-wann' }, h('span', { 'aria-hidden': 'true' }, '🚗 '), z.wann === 'heute' ? 'Heute' : 'Morgen'),
      aufgabeKnopf(store, z.datum, z.b),
      aufgabeKnopf(store, z.datum, z.h),
    );
  };
  return h('article', { class: 'karte dienst-karte' }, zeilen.map(zeile));
}

/** Tages-Blatt: dieselben zwei Knöpfe für diesen Tag; `tag` aus dienstTag (null = das Kind geht an dem Tag nicht hin). */
export function dienstImBlatt({ store, tag }) {
  if (!tag) return null;
  return h(
    'div',
    { class: 'dienst-blatt' },
    h('h3', {}, '🚗 Bringen & Abholen'),
    h('div', { class: 'dienst-zeile' }, aufgabeKnopf(store, tag.datum, tag.b), aufgabeKnopf(store, tag.datum, tag.h)),
    h('small', { class: 'leise' }, 'Antippen wechselt: — → 👨 Papa → 👩 Mama. Gilt nur für diesen Tag; den Wochenplan gibt es in „Mehr“.'),
  );
}

/** „Mehr“ → „Bringen & Abholen“: eine Zeile je erwartetem Wochentag, dazu, wer die Erinnerungen der App für Sachen bekommt. */
export function bringenHolenInhalt({ settings, formen, speichern }) {
  const zelle = (tag, rolle) => {
    const p = settings.dienstplan[rolle][tag];
    return h(
      'button',
      {
        class: `chip dienst-chip ${p ? 'aktiv' : ''}`.trim(),
        type: 'button',
        style: p ? farbe(FARBE[p]) : null,
        'aria-label': `${WOCHENTAGE[tag]}: ${rolle === 'b' ? 'bringt' : 'holt'} ${p ? FUER[p].label : 'niemand'}. Antippen wechselt.`,
        onClick: () => speichern({ dienstplan: mitPlan(settings, tag, rolle, naechstePerson(p)) }),
      },
      personText(p),
    );
  };
  const wahl = (text, wert) =>
    h(
      'button',
      { class: `chip ${settings.dienstErinnerung === wert ? 'aktiv' : ''}`.trim(), type: 'button', onClick: () => speichern({ dienstErinnerung: wert }) },
      text,
    );

  return [
    h('p', { class: 'leise' }, `Wer bringt dein Kind ${formen.indie} und wer holt es ab? Antippen wechselt: — → 👨 Papa → 👩 Mama. Einzelne Tage änderst du auf „Heute“ oder im Monat.`),
    settings.erwartung.length > 0
      ? h(
          'div',
          { class: 'dienst-plan' },
          settings.erwartung.map((tag) =>
            h(
              'div',
              { class: 'dienst-plan-zeile' },
              h('b', { class: 'dienst-plan-tag' }, WOCHENTAGE_KURZ[tag]),
              h('span', { class: 'dienst-plan-rolle' }, 'Bringt'),
              zelle(tag, 'b'),
              h('span', { class: 'dienst-plan-rolle' }, 'Holt'),
              zelle(tag, 'h'),
            ),
          ),
        )
      : h('p', { class: 'leise' }, 'Zuerst bei „Betreuung“ die Wochentage wählen.'),
    h(
      'div',
      { class: 'feld' },
      h('span', {}, 'Benachrichtigungen der App für Sachen'),
      h('div', { class: 'chip-reihe' }, wahl('👪 An beide', 'beide'), wahl('🚗 Nur an wer bringt bzw. holt', 'dienst')),
      h(
        'small',
        { class: 'leise' },
        'Hinbringen (auch am Vorabend) bekommt, wer bringt; Heimholen, wer abholt. Wem welches Telefon gehört, steht in Konto & App. Google Kalender erinnert weiterhin beide (gemeinsamer Kalender).',
      ),
    ),
  ];
}
