import { fuelle, h } from './dom.js';
import { toast } from './components.js';
import { standText } from '../app/format-de.js';
import { GRUND_TEXT } from '../push/client.js';
import { GERAET_PERSONEN } from '../push/geraete.js';
import { FUER } from '../domain/types.js';

const MELDUNG_ANMELDEN = 'Bitte zuerst neu anmelden (Mehr → Konto & App → Neu anmelden).';
const fehlerText = (fehler) => (fehler?.name === 'AuthAbgelaufen' ? MELDUNG_ANMELDEN : fehler?.message || 'Das hat nicht geklappt.');

/**
 * „Benachrichtigungen von der App“ in Konto & App → Erinnerungen: aktivieren, testen, abgleichen, ausschalten.
 * `push` kommt aus createPush (src/push/client.js). Ist der Push-Dienst noch nicht eingerichtet, bleibt der Abschnitt unsichtbar.
 */
export function pushAbschnitt({ push }) {
  const box = h('div', { class: 'push-abschnitt' });

  async function ausfuehren(arbeit, erfolg) {
    try {
      const ergebnis = await arbeit();
      if (erfolg) toast(typeof erfolg === 'function' ? erfolg(ergebnis) : erfolg);
    } catch (fehler) {
      toast(fehlerText(fehler), { art: 'fehler', dauer: 7000 });
    }
    zeichne();
  }

  // Wichtig: `push.aktivieren()` wird direkt im Tippen gestartet (iOS verlangt eine Nutzeraktion für die Erlaubnis).
  const aktivieren = () => ausfuehren(() => push.aktivieren(), 'Benachrichtigungen aktiviert ✓');
  const testen = () => ausfuehren(() => push.testSenden(), 'Gesendet ✓ Die Benachrichtigung erscheint gleich.');
  const abgleichen = () => ausfuehren(() => push.sync({ erzwingen: true }), 'Abgeglichen ✓');
  const ausschalten = () => ausfuehren(() => push.deaktivieren(), 'Ausgeschaltet');

  const knopf = (text, beiKlick, art = '') => h('button', { class: `knopf klein ${art}`.trim(), type: 'button', onClick: beiKlick }, text);

  /** „Dieses Telefon gehört: 👨 Papa / 👩 Mama“ – für Erinnerungen „nur an wer bringt bzw. holt“. Nochmal antippen = keine Angabe (bekommt alle). */
  function personFeld() {
    const aktuell = push.person();
    const waehle = (p) => {
      push.setzePerson(aktuell === p ? '' : p);
      toast('Gespeichert ✓');
      zeichne();
    };
    return h(
      'div',
      { class: 'feld push-person' },
      h('span', {}, 'Dieses Telefon gehört'),
      h(
        'div',
        { class: 'chip-reihe' },
        GERAET_PERSONEN.map((p) =>
          h('button', { class: `chip ${aktuell === p ? 'aktiv' : ''}`.trim(), type: 'button', 'aria-pressed': String(aktuell === p), onClick: () => waehle(p) }, `${FUER[p].emoji} ${FUER[p].label}`),
        ),
      ),
      h('small', { class: 'leise' }, 'Mit „Nur an den, der bringt bzw. holt“ (Mehr → Bringen & Abholen) kommen Erinnerungen für Sachen nur auf das Telefon dessen, der bringt bzw. abholt. Ohne Angabe bekommt dieses Telefon alle.'),
    );
  }

  function inhalt(s) {
    if (s.zustand === 'nicht-moeglich') {
      if (s.grund === 'nicht-eingerichtet') return null;
      return [h('h4', {}, 'Benachrichtigungen von der App'), h('p', { class: 'leise' }, GRUND_TEXT[s.grund] ?? 'Hier nicht möglich.')];
    }
    const kopf = h('h4', {}, 'Benachrichtigungen von der App');
    const fehler = s.letzterFehler ? h('p', { class: 'fehlertext' }, s.letzterFehler) : null;
    if (s.zustand === 'aktiv') {
      const letzte = s.letzteSync ? `Letzter Abgleich: ${standText(new Date(s.letzteSync).toISOString())}` : 'Noch nicht abgeglichen';
      return [
        kopf,
        h('p', {}, '✅ Aktiv auf diesem Telefon. Die App erinnert zusätzlich zu Google Kalender, auch wenn sie geschlossen ist.'),
        h('p', { class: 'leise' }, `${s.geraete} ${s.geraete === 1 ? 'Telefon' : 'Telefone'} in der Familie · ${letzte}`),
        fehler,
        h('div', { class: 'knopfzeile' }, knopf('Test-Push senden', testen, 'primaer'), knopf('Jetzt abgleichen', abgleichen), knopf('Ausschalten', ausschalten)),
        personFeld(),
      ];
    }
    if (s.zustand === 'erneut') {
      return [kopf, h('p', {}, '⚠️ Bitte noch einmal aktivieren: Dieses Telefon ist beim Push-Dienst nicht mehr angemeldet.'), fehler, h('div', { class: 'knopfzeile' }, knopf('Benachrichtigungen aktivieren', aktivieren, 'primaer'), knopf('Ausschalten', ausschalten)), personFeld()];
    }
    if (s.zustand === 'abgelehnt') {
      return [kopf, h('p', {}, 'Die Erlaubnis fehlt. Bitte in den Einstellungen des Telefons die Benachrichtigungen für diese App erlauben, dann hier noch einmal versuchen.'), h('div', { class: 'knopfzeile' }, knopf('Noch einmal versuchen', aktivieren, 'primaer')), personFeld()];
    }
    return [kopf, h('p', { class: 'leise' }, 'Die App kann dir selbst Erinnerungen schicken, auch wenn sie geschlossen ist, zusätzlich zu Google Kalender. Jedes Telefon schaltet das für sich ein.'), fehler, h('div', { class: 'knopfzeile' }, knopf('Benachrichtigungen aktivieren', aktivieren, 'primaer')), personFeld()];
  }

  async function zeichne() {
    let status;
    try {
      status = await push.status();
    } catch {
      status = { zustand: 'aus' };
    }
    const teile = inhalt(status);
    box.hidden = teile === null;
    fuelle(box, ...(teile ?? []));
  }

  zeichne();
  return box;
}
