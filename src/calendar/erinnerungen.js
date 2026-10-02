// „Erinnerungen“: prüft, ob die Benachrichtigungen bei diesem Google-Konto richtig eingestellt sind, repariert das,
// und löst auf Wunsch eine Test-Erinnerung aus (Termin in 62 Minuten: „1 Stunde vorher“ klingelt in etwa 2 Minuten).
// Die Benachrichtigungen selbst kommen von Google Kalender auf dem Telefon, nicht von dieser App.
import { CALENDAR_NAMES, TYPES } from '../domain/types.js';
import { CONFIG } from './config.js';
import { ERINNERUNG_VORHER, TEST_ID, endeAus } from './mapping.js';
import { EINSTELLUNG, FreigabeFehlt, KALENDER_SCHLUESSEL } from './setup.js';

export { TEST_ID };
export const TEST_TITEL = '🔔 Test-Erinnerung';

const SCHREIBRECHT = ['writer', 'owner'];

/** Nur die Popup-Zeiten zählen, ihre Reihenfolge nicht (Google liefert sie beliebig, Probe C18). */
const popupMinuten = (liste) =>
  (liste ?? [])
    .filter((r) => r.method === 'popup')
    .map((r) => r.minutes)
    .sort((a, b) => a - b)
    .join(',');
const sollMinuten = popupMinuten(EINSTELLUNG.termine.defaultReminders);

/**
 * Liest die Kalenderliste dieses Kontos und vergleicht sie mit dem Soll. Gibt { ok, reparierbar, punkte } zurück;
 * `punkte` = [{ schluessel, name, ok, probleme: [Text] }]. „Termine“ braucht Sichtbarkeit und „1 Tag + 1 Stunde vorher“,
 * „Abwesenheit“ Sichtbarkeit, „Anwesenheit“ muss nur vorhanden sein (sie ist absichtlich versteckt).
 */
export async function pruefeErinnerungen(api, kalender) {
  const liste = await api.kalenderListe.liste();
  let reparierbar = true;
  const punkte = KALENDER_SCHLUESSEL.map((k) => {
    const name = CALENDAR_NAMES[k];
    const eintrag = liste.find((e) => e.id === kalender[k]);
    const probleme = [];
    if (!eintrag) {
      probleme.push('Dieser Kalender ist in deinem Google-Konto nicht eingetragen.');
    } else {
      if (!SCHREIBRECHT.includes(eintrag.accessRole)) {
        probleme.push('Du hast nur Leserechte (nötig: „Änderungen vornehmen“).');
        reparierbar = false;
      }
      if (k !== 'anwesenheit' && eintrag.selected !== true) probleme.push('Der Kalender ist ausgeblendet.');
      if (k === 'termine' && popupMinuten(eintrag.defaultReminders) !== sollMinuten) probleme.push('Die Standard-Erinnerungen sind nicht „1 Tag vorher“ und „1 Stunde vorher“.');
    }
    return { schluessel: k, name, ok: probleme.length === 0, probleme };
  });
  return { ok: punkte.every((p) => p.ok), reparierbar, punkte };
}

/**
 * Stellt Sichtbarkeit und Standard-Erinnerungen wieder richtig ein (bei fehlendem Eintrag wird der Kalender abonniert)
 * und prüft danach erneut. Fehlt die Freigabe, wirft es FreigabeFehlt, nichts wird erfunden.
 */
export async function repariereErinnerungen(api, kalender) {
  const fehlend = [];
  for (const k of KALENDER_SCHLUESSEL) {
    let r = await api.kalenderListe.patch(kalender[k], EINSTELLUNG[k]);
    if (r.status === 404) r = await api.kalenderListe.einfuegen({ id: kalender[k], ...EINSTELLUNG[k] });
    if (r.status === 404) {
      fehlend.push(CALENDAR_NAMES[k]);
      continue;
    }
    if (r.status !== 200) throw new Error(`Das Einstellen von „${CALENDAR_NAMES[k]}“ hat nicht geklappt (Google-Antwort ${r.status}).`);
  }
  if (fehlend.length > 0) throw new FreigabeFehlt('nicht-geteilt', fehlend);
  return pruefeErinnerungen(api, kalender);
}

const WIEN = new Intl.DateTimeFormat('en-CA', { timeZone: CONFIG.zeitzone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

function wienZeit(datum) {
  const t = Object.fromEntries(WIEN.formatToParts(datum).map((p) => [p.type, p.value]));
  return { datum: `${t.year}-${t.month}-${t.day}`, zeit: `${t.hour}:${t.minute}` };
}

/**
 * Legt (oder verschiebt) das Test-Ereignis „🔔 Test-Erinnerung“ in „Termine“ an: Beginn in 62 Minuten ab der nächsten vollen
 * Minute, damit „1 Stunde vorher“ gleich klingelt. Gibt { datum, zeit, klingeltUm } zurück (Ortszeit Wien).
 * Es gibt immer nur ein Test-Ereignis (feste ID); die App zeigt es nicht als Termin an.
 */
export async function starteTestErinnerung(api, kalender, jetzt = () => new Date()) {
  const naechsteMinute = Math.ceil(jetzt().getTime() / 60_000) * 60_000;
  const beginn = new Date(naechsteMinute + 62 * 60_000);
  const { datum, zeit } = wienZeit(beginn);
  const ende = endeAus(datum, zeit, 30);
  await api.ereignisse.schreibe(kalender.termine, {
    id: TEST_ID,
    summary: TEST_TITEL,
    start: { dateTime: `${datum}T${zeit}:00`, timeZone: CONFIG.zeitzone },
    end: { dateTime: `${ende.date}T${ende.time}:00`, timeZone: CONFIG.zeitzone },
    colorId: TYPES.familie.colorId,
    reminders: { useDefault: false, overrides: ERINNERUNG_VORHER },
    extendedProperties: { private: { fk: '1', typ: 'test', v: '1' } },
  });
  return { datum, zeit, klingeltUm: wienZeit(new Date(beginn.getTime() - 60 * 60_000)).zeit };
}

/** Entfernt das Test-Ereignis; gibt es keins mehr, ist das kein Fehler. */
export async function beendeTestErinnerung(api, kalender) {
  await api.ereignisse.loeschen(kalender.termine, TEST_ID);
}
