import { todayVienna } from '../../domain/dates.js';
import { istObjekt } from '../../domain/gemeinsam.js';
import { FIX_SHARDS, TEXT_FIX_UNLESBAR, TEXT_FIX_VOLL, TEXT_TEIL_GESPERRT, leererShard, normalisiereShard, postenAnzahlPruefen, postenArchivieren, postenLoeschen, postenPruefen, postenSetzen, postenWiederanlegen, postenWiederherstellen, shardFuer } from '../../domain/fixkosten.js';
import { FACHLICH, TEXT_FEHLER, istAuthFehler } from './kern.js';

const TEXT_FIX_NICHT_GELESEN = 'Die Fixkosten konnten nicht gelesen werden. Bitte noch einmal versuchen.';
const TEXT_FIX_ANMELDEN = 'Bitte zuerst neu anmelden; danach lassen sich die Fixkosten ändern.';
const TEXT_FIX_GELOESCHT = 'Diesen Posten gibt es nicht mehr – er wurde wohl auf dem anderen Telefon gelöscht.';
const TEXT_FIX_NEUER = 'Diesen Posten hat das andere Telefon mit einer neueren App-Version geändert. Bitte die App aktualisieren.';
/**
 * Fixkosten im Zustand: `shards` = die vier Teile (null = noch nie gelesen), `status` null (noch nie gelesen) | 'gespeichert' (aus dem
 * Schnappschuss oder den Beispieldaten, noch nicht aus dem Kalender) | 'laedt' | 'geladen' | 'fehler', `warnungen` = Meldungen des
 * letzten Lesens für die Anzeige, `unlesbar` = Nummern der Teile, die diese Version nicht lesen kann (beschädigt oder von einer neueren
 * Version): sie werden leer gezeigt und sind gesperrt (kein Schreiben, bis ein späteres Lesen sie wieder lesbar findet).
 */
export const leereFixkosten = () => ({ shards: null, status: null, warnungen: [], unlesbar: [] });

/** Nummern der unlesbaren Teile aus dem, was Adapter ([{ nr, text }]) oder Schnappschuss ([nr]) liefern. */
const unlesbareNummern = (liste) => [...new Set((Array.isArray(liste) ? liste : []).map((u) => (typeof u === 'number' ? u : u?.nr)).filter((nr) => Number.isInteger(nr) && nr >= 0 && nr < FIX_SHARDS))].sort();

/** Die vier Teile, wie sie ein Adapter, der Schnappschuss oder die Beispieldaten liefern (fehlender Teil → leerer Teil). */
const fixTeile = (shards) => Array.from({ length: FIX_SHARDS }, (_, nr) => normalisiereShard(shards?.[nr] ?? leererShard()));

/** Fixkosten aus Schnappschuss oder Beispieldaten ({ shards }); ohne → noch nicht gelesen. */
export const fixAusDaten = (roh) => (Array.isArray(roh?.shards) ? { shards: fixTeile(roh.shards), status: 'gespeichert', warnungen: [], unlesbar: unlesbareNummern(roh.unlesbar) } : leereFixkosten());

/**
 * Scheibe „Fixkosten“ des Stores: die vier Teile lesen und Posten anlegen, ändern, archivieren, löschen. `store` = die Fassade,
 * `fixId` = Quelle neuer Kennungen.
 * → { methoden (öffentliche Methoden des Stores), intern (was Fassade und Schichtplan brauchen) }.
 */
export function createFixkostenSlice(kern, { store, fixId }) {
  const { adapter, jetzt, wartend, melden, teilAendern, mitRueckgaengig } = kern;
  let fixGelesen = false; // wurden die Fixkosten seit dem Start schon einmal aus dem Kalender gelesen? Erst dann wird geschrieben.
  let fixLesenLaeuft = null; // laufendes Lesen der Fixkosten: mehrfaches Anstoßen fragt nur einmal
  let fixFrischLaeuft = null; // laufendes Frisch-Lesen der Fixkosten (siehe fixFrischLesen): höchstens eines
  const fixOffen = new Map();
  const fixSchreibtNoch = () => fixOffen.size > 0;

  /** Zustand mit Teil `nr` der Fixkosten = `shard` (die anderen Teile bleiben). */
  function mitFixTeil(nr, shard) {
    const shards = [...(kern.state.fixkosten.shards ?? fixTeile(null))];
    shards[nr] = shard;
    return { ...kern.state, fixkosten: { ...kern.state.fixkosten, shards } };
  }

  /**
   * Ändert Teil `nr` der Fixkosten (siehe `teilAendern`): sofort sichtbar, gespeichert als `fn` auf der NEUESTEN Fassung dieses Teils
   * (die anderen drei Teile bleiben unberührt). Ergebnis wie `schichtKatalogAendern`: { ok: true } | { ok: false, fehler, gemeldet: true } |
   * { ok: false, wartet: true, fehler }. Wirft, wenn `fn` schon auf dem angezeigten Stand ablehnt (dann ändert sich nichts).
   */
  async function fixTeilAendern(nr, fn) {
    const { ergebnis, fehler } = await teilAendern(fixOffen, nr, fn, {
      leer: leererShard,
      aktuell: () => kern.state.fixkosten.shards?.[nr] ?? null,
      mit: (shard) => mitFixTeil(nr, shard),
      async speichern(f) {
        try {
          return await adapter.aendereFixShard(nr, f);
        } catch (fehler) {
          // Der Teil ist (inzwischen, z. B. durch das andere Telefon) unlesbar: der Adapter hat nichts geschrieben; ab jetzt gesperrt.
          if (fehler?.name === 'FixTeilGesperrt') {
            FACHLICH.add(fehler);
            kern.state = { ...kern.state, fixkosten: { ...kern.state.fixkosten, unlesbar: unlesbareNummern([...kern.state.fixkosten.unlesbar, nr]) } };
          }
          throw fehler;
        }
      },
      lesen: async () => (await adapter.leseFixkosten()).shards?.[nr] ?? null,
      normalisiere: (shard) => normalisiereShard(shard ?? leererShard()),
    });
    if (ergebnis === 'ok') return { ok: true };
    return ergebnis === 'auth' ? { ok: false, wartet: true, fehler } : { ok: false, fehler, gemeldet: true }; // gemeldet: die Meldung steht schon in state.fehler (die Shell zeigt sie)
  }

  /**
   * Liest die vier Teile der Fixkosten (alle gleichzeitig). Status 'laedt' → 'geladen' bzw. 'fehler' (abgelaufene Anmeldung setzt
   * zusätzlich `anmeldungNoetig`). Wurde inzwischen selbst etwas geändert, bleiben die angezeigten Teile (die Antwort könnte älter sein).
   * Ergebnis: true, wenn gelesen werden konnte. Höchstens ein Lesen gleichzeitig; wirft nicht.
   */
  function fixLesen() {
    if (fixLesenLaeuft) return fixLesenLaeuft;
    if (!adapter.leseFixkosten) return Promise.resolve(false);
    fixLesenLaeuft = (async () => {
      const stand = kern.schreibStand;
      kern.state = { ...kern.state, fixkosten: { ...kern.state.fixkosten, status: 'laedt' } };
      melden();
      let gelesen;
      try {
        gelesen = await adapter.leseFixkosten();
      } catch (fehler) {
        kern.state = { ...kern.state, fixkosten: { ...kern.state.fixkosten, status: 'fehler' }, ...(istAuthFehler(fehler) ? { anmeldungNoetig: true } : {}) };
        melden();
        return false;
      }
      const eigene = stand !== kern.schreibStand || kern.schreibend > 0 || wartend.length > 0 || fixSchreibtNoch();
      const f = kern.state.fixkosten;
      const frisch = fixTeile(gelesen?.shards);
      // eigene Änderung inzwischen: das Angezeigte bleibt; unverändert: dieselben Teile (kein neuer Push-Plan, kein Neuzeichnen der Liste)
      const shards = f.shards && (eigene || JSON.stringify(frisch) === JSON.stringify(f.shards)) ? f.shards : frisch;
      kern.state = { ...kern.state, fixkosten: { shards, status: 'geladen', warnungen: gelesen?.warnungen ?? [], unlesbar: unlesbareNummern(gelesen?.unlesbar) } };
      fixGelesen = true;
      melden();
      return true;
    })()
      .catch(() => false)
      .finally(() => {
        fixLesenLaeuft = null;
      });
    return fixLesenLaeuft;
  }

  /** Vor dem ersten Schreiben müssen die Fixkosten einmal aus dem Kalender gelesen sein (Anzahl, Anzeige, Warnungen). → Fehlertext oder null. */
  async function fixBereit() {
    if (fixGelesen && kern.state.fixkosten.shards) return null;
    if (await fixLesen()) return null;
    return kern.state.anmeldungNoetig ? TEXT_FIX_ANMELDEN : TEXT_FIX_NICHT_GELESEN;
  }

  /** In welchem Teil der Posten `id` steht (angezeigter Stand); sonst der Teil, in den er gehört. */
  function fixTeilVon(id) {
    const nr = (kern.state.fixkosten.shards ?? []).findIndex((s) => s?.posten.some((p) => p.id === id));
    return nr >= 0 ? nr : shardFuer(id);
  }

  /**
   * Kennung für einen neuen Posten: noch nicht vergeben (auch nicht unter den fremden Posten), und ihr Teil ist lesbar und hat für
   * `posten` noch Platz (geprüft am angezeigten Stand). Der Teil hängt an der zufälligen Kennung; deshalb werden so lange neue gezogen,
   * bis eine passt oder jeder Teil ausgeschieden ist. → { id } | { fehler } (verständlich, ohne „Teil“).
   */
  function neueFixIdFuer(posten) {
    const shards = kern.state.fixkosten.shards ?? fixTeile(null);
    const vergeben = new Set(shards.flatMap((s) => [...(s?.posten.map((p) => p.id) ?? []), ...(s?.fremd ?? []).map((k) => k?.i)]));
    const raus = new Set(); // Teile, die nicht in Frage kommen (unlesbar oder voll)
    let voll = false;
    for (let versuch = 0; versuch < 64 && raus.size < FIX_SHARDS; versuch += 1) {
      const id = fixId();
      if (typeof id !== 'string' || id === '') break; // eingespeiste Kennungen (Tests) sind aufgebraucht
      const nr = shardFuer(id);
      if (vergeben.has(id) || raus.has(nr)) continue;
      if (fixGesperrt(nr)) {
        raus.add(nr);
        continue;
      }
      try {
        postenSetzen(shards[nr] ?? leererShard(), { ...posten, id });
        return { id };
      } catch {
        raus.add(nr);
        voll = true;
      }
    }
    return { fehler: voll ? TEXT_FIX_VOLL : raus.size >= FIX_SHARDS ? TEXT_FIX_UNLESBAR : TEXT_FEHLER };
  }

  /** Ist Teil `nr` gesperrt, weil diese Version ihn nicht lesen kann? */
  const fixGesperrt = (nr) => kern.state.fixkosten.unlesbar.includes(nr);

  /**
   * Der Posten `id` in Teil `shard`, sonst ein Wurf mit klarer Meldung: inzwischen gelöscht, oder vom anderen Telefon mit einer neueren
   * Version geändert (jetzt ein fremder Eintrag, den diese Version nicht anfassen darf). Auf der neuesten Fassung heißt der Wurf:
   * zurücknehmen, den Teil neu lesen und die Meldung zeigen (siehe teilAendern).
   */
  function fixVorhanden(shard, id) {
    const p = shard.posten.find((x) => x.id === id);
    if (p) return p;
    throw new Error((shard.fremd ?? []).some((k) => k?.i === id) ? TEXT_FIX_NEUER : TEXT_FIX_GELOESCHT);
  }

  /** Ändert einen vorhandenen Posten mit `fn(teil)` (Archivieren usw.): { ok, fehler?, wartet? }; nie ein Wurf. Fehlt er (auch inzwischen), { ok: false, fehler }. */
  async function fixPostenAendern(id, fn) {
    const fehler = await fixBereit();
    if (fehler) return { ok: false, fehler };
    const nr = fixTeilVon(id);
    if (fixGesperrt(nr)) return { ok: false, fehler: TEXT_TEIL_GESPERRT };
    try {
      return await fixTeilAendern(nr, (shard) => (fixVorhanden(shard, id), fn(shard)));
    } catch (e) {
      return { ok: false, fehler: e?.message || TEXT_FEHLER }; // schon auf dem angezeigten Stand abgelehnt: nichts geändert
    }
  }

  /**
   * Fixkosten für die Sicherung: frisch aus dem Kalender (Anmeldefehler laufen nach oben); ohne passenden Adapter der angezeigte Stand.
   * { shards (mit fremden Posten), unlesbar: [{ nr, text }] } – unlesbare Teile kommen als Rohtext mit, damit nichts unbemerkt fehlt.
   */
  async function fixFuerSicherung() {
    if (!adapter.leseFixkosten) return { shards: kern.state.fixkosten.shards ?? fixTeile(null), unlesbar: kern.state.fixkosten.unlesbar.map((nr) => ({ nr, text: null })) };
    const gelesen = await adapter.leseFixkosten();
    return { shards: fixTeile(gelesen.shards), unlesbar: (gelesen.unlesbar ?? []).map(({ nr, text }) => ({ nr, text })) };
  }

  const methoden = {
    /** Fixkosten beim Öffnen ihrer Seite: die vier Teile lesen (siehe `fixLesen`). → true, wenn gelesen; wirft nicht. */
    fixLaden: () => fixLesen(),

    /**
     * Fixkosten frisch aus dem Kalender (vor dem Senden des Push-Plans, siehe `schichtFrischLesen`; auch beim Zurückkehren nutzbar).
     * Eigene Änderungen gehen vor: solange etwas gespeichert wird oder wartet, wird nicht gefragt, und eine Antwort, während der selbst
     * etwas geändert wurde, wird verworfen. Gemeldet wird nur eine echte Änderung. → true = aktuell, false = ging gerade nicht. Wirft nicht.
     */
    fixFrischLesen() {
      if (fixFrischLaeuft) return fixFrischLaeuft;
      const moeglich = () => adapter.leseFixkosten && kern.state.geladen && !kern.state.nurSnapshot && !kern.state.anmeldungNoetig;
      const eigene = () => kern.schreibend > 0 || wartend.length > 0 || fixSchreibtNoch();
      if (!moeglich() || eigene()) return Promise.resolve(false);
      fixFrischLaeuft = (async () => {
        const stand = kern.schreibStand;
        let gelesen;
        try {
          gelesen = await adapter.leseFixkosten();
        } catch (fehler) {
          if (istAuthFehler(fehler)) {
            kern.state = { ...kern.state, anmeldungNoetig: true };
            melden();
          }
          return false;
        }
        if (stand !== kern.schreibStand || eigene()) return false;
        const neu = { shards: fixTeile(gelesen?.shards), status: 'geladen', warnungen: gelesen?.warnungen ?? [], unlesbar: unlesbareNummern(gelesen?.unlesbar) };
        fixGelesen = true;
        if (JSON.stringify(neu) !== JSON.stringify(kern.state.fixkosten)) {
          kern.state = { ...kern.state, fixkosten: neu };
          melden();
        }
        return true;
      })()
        .catch(() => false)
        .finally(() => {
          fixFrischLaeuft = null;
        });
      return fixFrischLaeuft;
    },

    /**
     * Fixkosten-Posten anlegen (ohne `id`: neue Kennung; Startmonat = `start` oder der laufende Monat in Wien) oder ändern (mit `id`; das
     * Archivdatum bleibt, wie es im Kalender steht – dafür gibt es Archivieren/Zurückholen). Geschrieben wird nur in den Teil des Postens,
     * als reine Änderung auf der NEUESTEN Fassung (zwei Telefone überschreiben sich nicht; hat das andere Telefon den Posten inzwischen
     * endgültig gelöscht, wird er nicht wieder angelegt). Vorher müssen die Fixkosten einmal gelesen sein (sonst wird erst gelesen).
     * Ergebnis: { ok: true, id } | { ok: false, fehler } (ungültige Eingabe mit der Meldung von `postenPruefen`, mehr als 100 Posten,
     * Teil zu voll, Speicherfehler – dann zurückgenommen und neu gelesen) | { ok: false, wartet: true, fehler } (nach dem Anmelden
     * gespeichert). Wirft nie.
     */
    async fixPostenSpeichern(entwurf) {
      const { archiv: _archiv, ...roh } = entwurf && typeof entwurf === 'object' ? entwurf : {};
      const neu = !roh.id;
      const posten = { ...roh, start: roh.start || todayVienna(jetzt()).slice(0, 7) };
      if (neu) delete posten.id;
      const ungueltig = postenPruefen(posten);
      if (ungueltig) return { ok: false, fehler: ungueltig };
      const nichtBereit = await fixBereit();
      if (nichtBereit) return { ok: false, fehler: nichtBereit };
      if (neu) {
        const zuViele = postenAnzahlPruefen(kern.state.fixkosten.shards, null);
        if (zuViele) return { ok: false, fehler: zuViele };
        const wahl = neueFixIdFuer(posten); // erst nach dem Lesen: so ist sie sicher noch nicht vergeben, und ihr Teil hat Platz
        if (wahl.fehler) return { ok: false, fehler: wahl.fehler };
        posten.id = wahl.id;
      }
      const nr = neu ? shardFuer(posten.id) : fixTeilVon(posten.id);
      if (fixGesperrt(nr)) return { ok: false, fehler: TEXT_TEIL_GESPERRT };
      const fn = neu
        ? (shard) => postenSetzen(shard, posten)
        : (shard) => {
            const alt = fixVorhanden(shard, posten.id);
            return postenSetzen(shard, alt.archiv ? { ...posten, archiv: alt.archiv } : posten);
          };
      try {
        const r = await fixTeilAendern(nr, fn);
        return r.ok ? { ok: true, id: posten.id } : r;
      } catch (e) {
        return { ok: false, fehler: e?.message || TEXT_FEHLER }; // schon auf dem angezeigten Stand abgelehnt (z. B. Teil zu voll): nichts geändert
      }
    },

    /** Posten ins Archiv ab `datum` ('JJJJ-MM-TT', Standard: heute in Wien); zählt ab dann nicht mehr. Ergebnis wie `fixPostenSpeichern` (ohne id). */
    fixPostenArchivieren: (id, datum = todayVienna(jetzt())) => fixPostenAendern(id, (shard) => postenArchivieren(shard, id, datum)),
    /** Posten aus dem Archiv zurückholen. */
    fixPostenWiederherstellen: (id) => fixPostenAendern(id, (shard) => postenWiederherstellen(shard, id)),
    /**
     * Posten endgültig löschen – aktiv (z. B. doppelt eingetragen) oder aus dem Archiv. Ergebnis wie `fixPostenArchivieren`, bei Erfolg
     * mit `rueckgaengig()`: legt genau den gelöschten Posten (wie er im Kalender stand) wieder an, siehe `fixPostenWiederanlegen`.
     */
    async fixPostenLoeschen(id) {
      let weg = null;
      let stelle = -1;
      const r = await fixPostenAendern(id, (shard) => {
        stelle = shard.posten.findIndex((p) => p.id === id); // auf der neuesten Fassung: das wirklich Gelöschte und seine Stelle
        weg = shard.posten[stelle] ?? null;
        return postenLoeschen(shard, id);
      });
      return mitRueckgaengig(r, weg ? () => store.fixPostenWiederanlegen(weg, stelle) : null);
    },

    /**
     * „Rückgängig“ nach dem Löschen: speichert genau diesen Posten (mit seiner Kennung, auch archiviert; an seiner alten Stelle `stelle`,
     * falls angegeben) wieder – über denselben Weg wie
     * einen neuen (Prüfung, vorher gelesen, höchstens 100 Posten, gesperrter Teil, Platz im Teil, auf der neuesten Fassung). Gibt es ihn
     * schon wieder, bleibt alles, wie es ist; ein Eintrag einer neueren Version mit derselben Kennung wird nie überschrieben.
     * → { ok: true, id } | { ok: false, fehler, gemeldet? } | { ok: false, wartet: true, fehler }. Wirft nie.
     */
    async fixPostenWiederanlegen(posten, stelle) {
      if (!istObjekt(posten) || typeof posten.id !== 'string' || posten.id === '') return { ok: false, fehler: 'Ungültige Kennung.' };
      const ungueltig = postenPruefen(posten);
      if (ungueltig) return { ok: false, fehler: ungueltig };
      const nichtBereit = await fixBereit();
      if (nichtBereit) return { ok: false, fehler: nichtBereit };
      const nr = shardFuer(posten.id);
      if (fixGesperrt(nr)) return { ok: false, fehler: TEXT_TEIL_GESPERRT };
      const schonDa = (kern.state.fixkosten.shards ?? []).some((s) => s?.posten.some((p) => p.id === posten.id));
      const zuViele = schonDa ? null : postenAnzahlPruefen(kern.state.fixkosten.shards, posten.id);
      if (zuViele) return { ok: false, fehler: zuViele };
      const fn = (shard) => {
        if (shard.posten.some((p) => p.id === posten.id)) return shard;
        if ((shard.fremd ?? []).some((k) => k?.i === posten.id)) throw new Error(TEXT_FIX_NEUER);
        return postenWiederanlegen(shard, posten, stelle);
      };
      try {
        const r = await fixTeilAendern(nr, fn);
        return r.ok ? { ok: true, id: posten.id } : r;
      } catch (e) {
        return { ok: false, fehler: e?.message || TEXT_FEHLER }; // schon auf dem angezeigten Stand abgelehnt (z. B. Teil zu voll): nichts geändert
      }
    },
  };

  return {
    methoden,
    intern: {
      fixLesen,
      fixBereit,
      fixGesperrt,
      fixTeilAendern,
      fixFuerSicherung,
      set fixGelesen(wert) {
        fixGelesen = wert;
      },
    },
  };
}
