// Adapter für Google Kalender: gleiche Schnittstelle wie der Demo-Adapter (laden, setzeTag, loescheTag, speichereUrlaub,
// loescheUrlaub, speichereTermin, loescheTermin, speichereSettings) plus ladeBereich und status.
import { addDays, todayVienna } from '../domain/dates.js';
import { kindergartenjahr } from '../domain/urlaub.js';
import { normalizeSettings } from '../domain/settings.js';
import { beendeTestErinnerung, pruefeErinnerungen, repariereErinnerungen, starteTestErinnerung } from './erinnerungen.js';
import { EINKAUF_ID, EINSTELLUNGEN_ID, FIX_IDS, GERAETE_ID, KONTO_ID, SCHICHTARTEN_ID, ZIELE_ID, einkaufAusEreignis, einkaufZuEreignis, kontoAusEreignis, kontoZuEreignis, einstellungenAusEreignis, einstellungenZuEreignis, fixShardAusEreignis, fixShardId, fixShardZuEreignis, geraeteAusEreignis, geraeteZuEreignis, schichtartenAusEreignis, schichtartenZuEreignis, schichtMonatAusEreignis, schichtMonatId, schichtMonatZuEreignis, tagZuEreignis, terminZuEreignis, urlaubCheckZuEreignis, urlaubZuEreignis, zieleAusEreignis, zieleZuEreignis } from './mapping.js';
import { leererMonat, standardKatalog } from '../domain/schicht.js';
import { leererShard, teilGesperrtFehler } from '../domain/fixkosten.js';
import { leereZiele, zieleGesperrtFehler } from '../domain/sparziele.js';
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
   * „Rückgängig“ nach dem Löschen eines Termins oder Urlaubs: ist das Ereignis inzwischen wieder da (nicht „cancelled“, z. B. vom
   * anderen Telefon neu eingetragen), bleibt es unverändert → { schonDa: true }. Ist es gelöscht, aber noch mit Inhalt vorhanden, wird
   * es nur wieder bestätigt – genau das, was gelöscht wurde, auch wenn das andere Telefon es vorher noch geändert hatte. Fehlt es ganz,
   * wird `body` (der Stand dieses Telefons) geschrieben.
   */
  async function wiederherstellen(kalenderId, body) {
    const e = await api.ereignisse.holen(kalenderId, body.id);
    if (e && e.status !== 'cancelled') return { schonDa: true };
    if (e && e.start && e.summary) await api.ereignisse.aendere(kalenderId, body.id, () => ({ status: 'confirmed' }));
    else await api.ereignisse.schreibe(kalenderId, body);
    return { schonDa: false };
  }

  /**
   * Gemeinsames Muster für versteckte Ereignisse (Geräte, Einkauf): gibt es das Ereignis noch nicht, wird es angelegt (bei gleichzeitigem Anlegen
   * gewinnt eines per 409, das andere liest und ergänzt); sonst Lesen–Ändern–Schreiben mit If-Match, bei 412 einmal wiederholt.
   * `aenderung(alt | null)` muss rein sein (sie kann zweimal laufen) und gibt den neuen Wert zurück, oder null = nichts tun. Ergibt der
   * neue Wert dieselbe Beschreibung wie die gespeicherte, wird nichts geschrieben (nur gelesen); zurück kommt der Wert trotzdem.
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
        if (!ergebnis) return null;
        const description = bauen(ergebnis).body.description;
        // Ohne Wirkung (gleicher Inhalt): nichts schreiben – spart den PATCH und macht ein 412 auf dem anderen Telefon seltener
        return description === aktuell.description ? null : { description };
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
      // Sparziele werden mit dem Kontostand gerechnet. Scheitert nur ihr Lesen (Netz, 500 …), lädt der Rest trotzdem: `ziele: null`
      // (der Store sperrt sie dann bis zum nächsten Lesen); eine abgelaufene Anmeldung läuft wie sonst nach oben.
      const zieleGelesen = this.leseZiele().catch((fehler) => {
        if (fehler?.name === 'AuthAbgelaufen') throw fehler;
        return null;
      });
      const [{ konto }, ziele] = await Promise.all([this.leseKonto(), zieleGelesen]);
      return { settings, tage: z.tage, urlaub: z.urlaub, termine: z.termine, konflikte: z.konflikte, warnungen: gelesen.warnungen, fenster: { von, bis }, einkauf, konto, ziele, urlaubChecks: z.urlaubChecks };
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

    /** „Rückgängig“ nach loescheTermin (siehe wiederherstellen): → { schonDa }. */
    async stelleTerminWieder(termin) {
      const r = terminZuEreignis(termin, settings);
      return wiederherstellen(kalender[r.kalender], r.body);
    },

    /** „Rückgängig“ nach loescheUrlaub (siehe wiederherstellen): → { schonDa }. */
    async stelleUrlaubWieder(urlaub) {
      const r = urlaubZuEreignis(urlaub, settings);
      return wiederherstellen(kalender[r.kalender], r.body);
    },

    /**
     * „Rückgängig“ nach loescheTag: steht an dem Tag inzwischen wieder etwas (in einem der beiden Tageskalender, z. B. vom anderen
     * Telefon), bleibt es – { schonDa: true }; sonst wird der Typ gesetzt.
     */
    async stelleTagWieder(date, typ) {
      const r = tagZuEreignis(typ, date, settings);
      for (const k of ['anwesenheit', 'abwesenheit']) {
        const e = await api.ereignisse.holen(kalender[k], r.id);
        if (e && e.status !== 'cancelled') return { schonDa: true };
      }
      await this.setzeTag(date, typ);
      return { schonDa: false };
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

    /** Kontostände von Papa und Mama (verstecktes Ereignis „fkkonto“): { konto } (leer, wenn es noch keins gibt). */
    async leseKonto() {
      const e = await api.ereignisse.holen(kalender.anwesenheit, KONTO_ID);
      return !e || e.status === 'cancelled' ? { konto: kontoAusEreignis(null).konto } : kontoAusEreignis(e);
    },

    /** Ändert die Kontostände: `aenderung(konto)` → neues Konto, angewendet auf die NEUESTE Fassung bei Google; gibt das gespeicherte Konto zurück. */
    aendereKonto: (aenderung) =>
      aendereVersteckt({ id: KONTO_ID, lesen: (e) => kontoAusEreignis(e).konto, bauen: kontoZuEreignis, fehler: 'Der Kontostand konnte nicht gespeichert werden. Bitte noch einmal versuchen.', leer: () => kontoAusEreignis(null).konto }, aenderung),

    /**
     * Sparziele (verstecktes Ereignis „fksparen“): { daten, unlesbar, warnungen, text } – fehlt es: leere Daten. `unlesbar` = diese
     * Version kann den Text nicht lesen (beschädigt oder neuere Version): leer gezeigt, nie überschrieben; `text` = dann der Rohtext (für
     * die Sicherung), sonst null.
     */
    async leseZiele() {
      const e = await api.ereignisse.holen(kalender.anwesenheit, ZIELE_ID);
      const gelesen = zieleAusEreignis(!e || e.status === 'cancelled' ? null : e);
      return { ...gelesen, text: gelesen.unlesbar ? e.description : null };
    },

    /**
     * Ändert die Sparziele: `aenderung(daten)` → neue Daten, angewendet auf die NEUESTE Fassung (fehlt sie: leere Daten); gibt die
     * gespeicherten zurück (null = nichts getan). Ist die neueste Fassung unlesbar, wird nichts geschrieben (Fehler „ZieleGesperrt“).
     */
    aendereZiele(aenderung) {
      const lesen = (e) => {
        const g = zieleAusEreignis(e);
        if (g.unlesbar) throw zieleGesperrtFehler();
        return g.daten;
      };
      return aendereVersteckt({ id: ZIELE_ID, lesen, bauen: zieleZuEreignis, fehler: 'Die Sparziele konnten nicht gespeichert werden. Bitte noch einmal versuchen.', leer: leereZiele }, aenderung);
    },

    /** Schichtarten (verstecktes Ereignis „fkschichtarten“): { katalog, warnungen }, oder { katalog: null }, wenn es noch keine gibt. Nicht beim Start geladen. */
    async leseSchichtarten() {
      const e = await api.ereignisse.holen(kalender.anwesenheit, SCHICHTARTEN_ID);
      return !e || e.status === 'cancelled' ? { katalog: null } : schichtartenAusEreignis(e);
    },

    /** Ändert die Schichtarten: `aenderung(katalog)` → neuer Katalog, angewendet auf die NEUESTE Fassung (fehlt sie: Standardarten); gibt den gespeicherten zurück. */
    aendereSchichtarten: (aenderung) =>
      aendereVersteckt({ id: SCHICHTARTEN_ID, lesen: (e) => schichtartenAusEreignis(e).katalog, bauen: schichtartenZuEreignis, fehler: 'Die Schichtarten konnten nicht gespeichert werden. Bitte noch einmal versuchen.', leer: standardKatalog }, aenderung),

    /** Schichtplan eines Monats 'JJJJ-MM' (verstecktes Ereignis „fksch<JJJJMM>“): { monat, warnungen }, oder { monat: null }, wenn es ihn noch nicht gibt. */
    async leseSchichtMonat(jm) {
      const e = await api.ereignisse.holen(kalender.anwesenheit, schichtMonatId(jm));
      return !e || e.status === 'cancelled' ? { monat: null } : schichtMonatAusEreignis(e, jm);
    },

    /** Ändert einen Monat: `aenderung(monat)` → neuer Monat, angewendet auf die NEUESTE Fassung (fehlt sie: leerer Monat); gibt den gespeicherten zurück. */
    aendereSchichtMonat: (jm, aenderung) =>
      aendereVersteckt({ id: schichtMonatId(jm), lesen: (e) => schichtMonatAusEreignis(e, jm).monat, bauen: (monat) => schichtMonatZuEreignis({ ...monat, jm }), fehler: 'Der Schichtplan konnte nicht gespeichert werden. Bitte noch einmal versuchen.', leer: () => leererMonat(jm) }, aenderung),

    /**
     * Fixkosten (4 versteckte Ereignisse „fkfest0“ … „fkfest3“, gleichzeitig gelesen): { shards: [Teil | null ×4], warnungen, unlesbar }.
     * null = den Teil gibt es (noch) nicht. `unlesbar` = [{ nr, text }]: Teile, deren Text diese Version nicht lesen kann (beschädigt
     * oder neuere Version; leer gezeigt, nie überschrieben), mit dem Rohtext für die Sicherung. Nicht beim Start geladen.
     */
    async leseFixkosten() {
      const ereignisse = await Promise.all(FIX_IDS.map((id) => api.ereignisse.holen(kalender.anwesenheit, id)));
      const gelesen = ereignisse.map((e) => (!e || e.status === 'cancelled' ? null : fixShardAusEreignis(e)));
      const unlesbar = gelesen.flatMap((g, nr) => (g?.unlesbar ? [{ nr, text: ereignisse[nr].description }] : []));
      return { shards: gelesen.map((g) => g?.shard ?? null), warnungen: gelesen.flatMap((g) => g?.warnungen ?? []), unlesbar };
    },

    /**
     * Ändert Teil `nr` (0 … 3): `aenderung(teil)` → neuer Teil, angewendet auf die NEUESTE Fassung (fehlt sie: leerer Teil); gibt den
     * gespeicherten zurück. Ist die neueste Fassung unlesbar, wird nichts geschrieben (Fehler „FixTeilGesperrt“): sonst ginge ihr Inhalt
     * verloren. Ungültiges `nr` → abgelehntes Versprechen.
     */
    async aendereFixShard(nr, aenderung) {
      const lesen = (e) => {
        const g = fixShardAusEreignis(e);
        if (g.unlesbar) throw teilGesperrtFehler();
        return g.shard;
      };
      return aendereVersteckt({ id: fixShardId(nr), lesen, bauen: (shard) => fixShardZuEreignis(nr, shard), fehler: 'Die Fixkosten konnten nicht gespeichert werden. Bitte noch einmal versuchen.', leer: leererShard }, aenderung);
    },

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
