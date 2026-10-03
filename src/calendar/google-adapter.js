// Adapter für Google Kalender: gleiche Schnittstelle wie der Demo-Adapter (laden, setzeTag, loescheTag, speichereUrlaub,
// loescheUrlaub, speichereTermin, loescheTermin, speichereSettings) plus ladeBereich und status.
import { addDays, todayVienna } from '../domain/dates.js';
import { kindergartenjahr } from '../domain/urlaub.js';
import { normalizeSettings } from '../domain/settings.js';
import { beendeTestErinnerung, pruefeErinnerungen, repariereErinnerungen, starteTestErinnerung } from './erinnerungen.js';
import { EINKAUF_ID, EINSTELLUNGEN_ID, GERAETE_ID, einkaufAusEreignis, einkaufZuEreignis, einstellungenAusEreignis, einstellungenZuEreignis, geraeteAusEreignis, geraeteZuEreignis, tagZuEreignis, terminZuEreignis, urlaubCheckZuEreignis, urlaubZuEreignis } from './mapping.js';
import { istUrlaubCheckId } from '../domain/ids.js';
import { ereignisseZuZustand } from './zustand.js';

const TAGE_ZURUECK = 31;
const TAGE_VORAUS = 540;
const ALLES_AB = '2020-01-01'; // „Sicherung“: so weit zurück wird alles geholt (vor dem Start der App gibt es nichts)
const ALLES_TAGE_VORAUS = 3 * 366;
const KALENDER = ['termine', 'abwesenheit', 'anwesenheit'];
const ANDERER_TAGESKALENDER = { anwesenheit: 'abwesenheit', abwesenheit: 'anwesenheit' };

/** Standardfenster beim Laden: ab Beginn des Kindergartenjahres (oder „Erfassung ab“, oder 31 Tage zurück), 540 Tage voraus. */
export function ladeFenster(heute, settings) {
  const kandidaten = [kindergartenjahr(heute, settings.jahresstart).start, addDays(heute, -TAGE_ZURUECK)];
  if (settings.erfassungAb) kandidaten.push(settings.erfassungAb);
  return { von: kandidaten.sort()[0], bis: addDays(heute, TAGE_VORAUS) };
}

/**
 * `api` kommt aus createApi, `kalender` = { termine, abwesenheit, anwesenheit } (IDs der drei Google-Kalender).
 * Optional `auth` für `status()`.
 */
export function createGoogleAdapter({ api, kalender, jetzt = () => new Date(), auth = null }) {
  for (const k of KALENDER) if (!kalender?.[k]) throw new Error(`Kalender „${k}“ fehlt in der Konfiguration.`);
  let settings = normalizeSettings();

  async function einstellungenLesen() {
    const e = await api.ereignisse.holen(kalender.anwesenheit, EINSTELLUNGEN_ID); // per ID, nicht per Liste (Vertragsprobe C12)
    if (!e || e.status === 'cancelled') return { settings: normalizeSettings(), warnungen: [] };
    return einstellungenAusEreignis(e);
  }

  async function ereignisseLesen(von, bis) {
    const gruppen = await Promise.all(KALENDER.map(async (k) => (await api.ereignisse.liste(kalender[k], { von, bis })).map((event) => ({ kalender: k, event }))));
    return gruppen.flat();
  }

  /** Korrigiert Uhrzeiten in Titeln, die nicht mehr zur echten Startzeit passen (best effort; Fehler stören das Laden nicht). */
  async function titelKorrigieren(liste) {
    for (const r of liste) {
      try {
        await api.ereignisse.aendere(kalender[r.kalender], r.id, () => ({ summary: r.summary }));
      } catch {
        // wird beim nächsten Laden erneut versucht
      }
    }
  }

  async function tagLoeschenIn(k, id) {
    return api.ereignisse.loeschen(kalender[k], id); // 404/410 gelten als erledigt
  }

  /**
   * Gemeinsames Muster für versteckte Ereignisse (Geräte, Einkauf): gibt es das Ereignis noch nicht, wird es angelegt (bei gleichzeitigem Anlegen
   * gewinnt eines per 409, das andere liest und ergänzt); sonst Lesen–Ändern–Schreiben mit If-Match, bei 412 einmal wiederholt.
   * `aenderung(alt | null)` muss rein sein (sie kann zweimal laufen) und gibt den neuen Wert zurück, oder null = nichts tun.
   */
  async function aendereVersteckt({ id, lesen, bauen, fehler, leer = () => null }, aenderung) {
    for (let versuch = 0; versuch < 3; versuch += 1) {
      const e = await api.ereignisse.holen(kalender.anwesenheit, id);
      if (!e || e.status === 'cancelled') {
        const neu = aenderung(leer());
        if (!neu) return null;
        const body = bauen(neu).body;
        if (e) {
          await api.ereignisse.schreibe(kalender.anwesenheit, body); // gelöscht war es nur, wenn jemand es von Hand entfernt hat
          return neu;
        }
        const r = await api.ereignisse.einfuegen(kalender.anwesenheit, body);
        if (!r.bereitsVorhanden) return neu;
        continue; // jemand war schneller: lesen und ergänzen
      }
      let ergebnis = null;
      await api.ereignisse.aendere(kalender.anwesenheit, id, (aktuell) => {
        ergebnis = aenderung(lesen(aktuell));
        return ergebnis ? { description: bauen(ergebnis).body.description } : null;
      }, { versuche: 8 }); // mehrere Telefone können gleichzeitig schreiben: jede Änderung wird auf die neueste Fassung neu angewendet
      return ergebnis;
    }
    throw new Error(fehler);
  }

  return {
    async laden() {
      const heute = todayVienna(jetzt());
      const gelesen = await einstellungenLesen();
      settings = gelesen.settings;
      const { von, bis } = ladeFenster(heute, settings);
      const z = ereignisseZuZustand({ ereignisse: await ereignisseLesen(von, bis), settings });
      await titelKorrigieren(z.resync);
      const einkauf = (await this.leseEinkauf()).liste;
      return { settings, tage: z.tage, urlaub: z.urlaub, termine: z.termine, konflikte: z.konflikte, warnungen: gelesen.warnungen, fenster: { von, bis }, einkauf, urlaubChecks: z.urlaubChecks };
    },

    /** Urlaub-Checks im Kalender „Termine“ anlegen/aktualisieren (`schreiben`) und löschen (`loeschen`); nur eigene IDs (`fkc…`), Fremdes bleibt unberührt. */
    async gleicheUrlaubChecksAb({ schreiben = [], loeschen = [] }) {
      for (const check of schreiben) {
        const r = urlaubCheckZuEreignis(check);
        await api.ereignisse.schreibe(kalender[r.kalender], r.body);
      }
      for (const id of loeschen) if (istUrlaubCheckId(id)) await api.ereignisse.loeschen(kalender.termine, id);
    },

    /** Der gesamte Verlauf (für die Sicherung): Tage, Urlaub und Termine aus allen drei Kalendern; die Seitenfenster und der App-Zustand bleiben unberührt. */
    async ladeAlles() {
      const bis = addDays(todayVienna(jetzt()), ALLES_TAGE_VORAUS);
      const z = ereignisseZuZustand({ ereignisse: await ereignisseLesen(ALLES_AB, bis), settings });
      return { tage: z.tage, urlaub: z.urlaub, termine: z.termine };
    },

    /** Historie und andere Monate: nur Tage, Urlaub und Termine im Zeitfenster [von, bis). */
    async ladeBereich(von, bis) {
      const z = ereignisseZuZustand({ ereignisse: await ereignisseLesen(von, bis), settings });
      return { tage: z.tage, urlaub: z.urlaub, termine: z.termine };
    },

    /**
     * Erst im Zielkalender schreiben, dann den Tag im anderen Tageskalender entfernen: bei Abbruch bleibt höchstens ein sichtbarer Konflikt.
     * Hat das wirklich etwas gelöscht, könnte ein zweites Telefon gleichzeitig das Gegenteil getan und UNSER Ereignis gelöscht haben
     * (beide löschen einander): dann wird unseres wieder geschrieben. Ergebnis: nie ein leerer Tag, im Zweifel ein sichtbarer Konflikt.
     */
    async setzeTag(date, typ) {
      const r = tagZuEreignis(typ, date, settings);
      await api.ereignisse.schreibe(kalender[r.kalender], r.body);
      const { geloescht } = await tagLoeschenIn(ANDERER_TAGESKALENDER[r.kalender], r.id);
      if (geloescht) {
        const eigenes = await api.ereignisse.holen(kalender[r.kalender], r.id);
        if (!eigenes || eigenes.status === 'cancelled') await api.ereignisse.schreibe(kalender[r.kalender], r.body);
      }
    },

    async loescheTag(date) {
      const { id } = tagZuEreignis('kita_essen', date, settings);
      await tagLoeschenIn('anwesenheit', id);
      await tagLoeschenIn('abwesenheit', id);
    },

    async speichereUrlaub(urlaub) {
      const r = urlaubZuEreignis(urlaub, settings);
      await api.ereignisse.schreibe(kalender[r.kalender], r.body);
    },

    async loescheUrlaub(id) {
      await api.ereignisse.loeschen(kalender.abwesenheit, id);
    },

    async speichereTermin(termin) {
      const r = terminZuEreignis(termin, settings);
      await api.ereignisse.schreibe(kalender[r.kalender], r.body);
    },

    async loescheTermin(id) {
      await api.ereignisse.loeschen(kalender.termine, id);
    },

    /** Register der Push-Telefone (verstecktes Ereignis „fkgeraete“): { register | null }. */
    async leseGeraete() {
      const e = await api.ereignisse.holen(kalender.anwesenheit, GERAETE_ID);
      return !e || e.status === 'cancelled' ? { register: null } : geraeteAusEreignis(e);
    },

    /** Ändert das Register: `aenderung(register | null)` gibt das neue Register zurück (oder null = nichts tun). */
    aendereGeraete: (aenderung) =>
      aendereVersteckt({ id: GERAETE_ID, lesen: (e) => geraeteAusEreignis(e).register, bauen: geraeteZuEreignis, fehler: 'Das Geräte-Register konnte nicht gespeichert werden. Bitte noch einmal versuchen.' }, aenderung),

    /** Gemeinsame Einkaufsliste (verstecktes Ereignis „fkeinkauf“): { liste } (leer, wenn es noch keine gibt). */
    async leseEinkauf() {
      const e = await api.ereignisse.holen(kalender.anwesenheit, EINKAUF_ID);
      return !e || e.status === 'cancelled' ? { liste: einkaufAusEreignis(null).liste } : einkaufAusEreignis(e);
    },

    /** Ändert die Einkaufsliste: `aenderung(liste)` → neue Liste, angewendet auf die NEUESTE Fassung bei Google; gibt die gespeicherte Liste zurück. */
    aendereEinkauf: (aenderung) =>
      aendereVersteckt({ id: EINKAUF_ID, lesen: (e) => einkaufAusEreignis(e).liste, bauen: einkaufZuEreignis, fehler: 'Die Einkaufsliste konnte nicht gespeichert werden. Bitte noch einmal versuchen.', leer: () => einkaufAusEreignis(null).liste }, aenderung),

    /** Erinnerungen dieses Kontos prüfen/reparieren und eine Test-Erinnerung auslösen (siehe erinnerungen.js). */
    pruefeErinnerungen: () => pruefeErinnerungen(api, kalender),
    repariereErinnerungen: () => repariereErinnerungen(api, kalender),
    starteTestErinnerung: () => starteTestErinnerung(api, kalender, jetzt),
    beendeTestErinnerung: () => beendeTestErinnerung(api, kalender),

    /** Schreibt nur die geänderten Felder auf den aktuellen Stand im Kalender (Änderungen des anderen Telefons gehen nicht verloren). */
    async speichereSettings(teil) {
      const vorhanden = await api.ereignisse.holen(kalender.anwesenheit, EINSTELLUNGEN_ID);
      if (!vorhanden || vorhanden.status === 'cancelled') {
        settings = normalizeSettings({ ...settings, ...teil });
        await api.ereignisse.schreibe(kalender.anwesenheit, einstellungenZuEreignis(settings).body);
        return;
      }
      let zusammen = settings;
      await api.ereignisse.aendere(kalender.anwesenheit, EINSTELLUNGEN_ID, (aktuell) => {
        zusammen = normalizeSettings({ ...einstellungenAusEreignis(aktuell).settings, ...teil });
        return { description: einstellungenZuEreignis(zusammen).body.description };
      });
      settings = zusammen;
    },

    async zuruecksetzen() {
      throw new Error('Das Zurücksetzen gibt es nur im Demo-Modus.');
    },

    status: () => auth?.status() ?? 'verbunden',
  };
}
