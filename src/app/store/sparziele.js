import { todayVienna } from '../../domain/dates.js';
import { istObjekt } from '../../domain/gemeinsam.js';
import { normalisiereKonto } from '../../domain/konto.js';
import { TEXT_ZIELE_GESPERRT, TEXT_ZIELE_NICHT_GELADEN, freiVerschieben as zielFreiVerschieben, leereZiele, startMonat, verschiebungLoeschen as verschiebungLoeschenRein, verschiebungWiederherstellen as verschiebungWiederherstellenRein, zielAusblenden as zielAusblendenRein, zielBeenden as zielBeendenRein, zielLoeschen as zielLoeschenRein, zielSchluss, zielSetzen, zielSpur, zielWiederherstellen as zielWiederherstellenRein, zieleWarnungen } from '../../domain/sparziele.js';
import { FACHLICH, TEXT_FEHLER, istAuthFehler } from './kern.js';

const TEXT_ZIEL_GELOESCHT = 'Dieses Sparziel gibt es nicht mehr – es wurde wohl auf dem anderen Telefon gelöscht.';
const TEXT_ZIEL_NEUER = 'Dieses Sparziel hat das andere Telefon mit einer neueren App-Version geändert. Bitte die App aktualisieren.';
const TEXT_ZIEL_ABGESCHLOSSEN = 'Dieses Sparziel ist schon abgeschlossen.';
const TEXT_NICHT_AUTOMATISCH = 'Nur ein nach dem Zieldatum automatisch abgeschlossenes Ziel lässt sich so zurück zu Frei geben.';
const TEXT_VERSCHIEBUNG_WEG = 'Diese Verschiebung gibt es nicht mehr – sie wurde wohl auf dem anderen Telefon rückgängig gemacht.';
const TEXT_VERSCHIEBUNG_NEUER = 'Diese Verschiebung hat das andere Telefon mit einer neueren App-Version geändert. Bitte die App aktualisieren.';
/**
 * Sparziele im Zustand: `daten` = { v, beginn?, z, m, fremd? } (siehe domain/sparziele.js; bei unlesbaren Sparzielen leer), `status`
 * null (noch nie gelesen) | 'gespeichert' (aus dem Schnappschuss, noch nicht aus dem Kalender) | 'geladen' (mit laden(), zusammen mit
 * dem Kontostand, oder mit zieleLaden()) | 'fehler' (das letzte Lesen ist gescheitert: `daten` wie zuletzt gelesen, Hinweis
 * TEXT_ZIELE_NICHT_GELADEN in `warnungen`), `unlesbar` = diese Version kann die gespeicherten Sparziele nicht lesen (beschädigt oder
 * neuere Version): leer gezeigt und gesperrt, `warnungen` = Hinweise für die Anzeige (zieleWarnungen). Geändert werden darf nur bei
 * 'geladen' oder 'gespeichert' (dann wartet es ohnehin auf die Anmeldung und wird auf die neueste Fassung angewendet) und lesbar.
 */
export const leererZieleZustand = () => ({ daten: leereZiele(), status: null, unlesbar: false, warnungen: [] });

/** Zustand aus dem, was Adapter ({ daten, unlesbar, … }) oder Schnappschuss ({ daten, unlesbar }) liefern. */
export function zieleZustand(gelesen, status) {
  const daten = gelesen?.daten && typeof gelesen.daten === 'object' ? gelesen.daten : leereZiele();
  const unlesbar = gelesen?.unlesbar === true;
  return { daten, status, unlesbar, warnungen: zieleWarnungen({ daten, unlesbar }) };
}

/**
 * Wirft, wenn es das Ziel `id` in `daten` nicht (mehr) gibt: inzwischen gelöscht, oder vom anderen Telefon mit einer neueren Version
 * geändert (jetzt ein fremder Eintrag, den diese Version nicht anfassen darf). Auf der neuesten Fassung heißt der Wurf: zurücknehmen,
 * neu lesen, die Meldung zeigen.
 */
function zielVorhanden(daten, id) {
  const z = (daten.z ?? []).find((x) => x.id === id);
  if (z) return z;
  throw new Error((daten.fremd?.z ?? []).some((k) => k?.i === id) ? TEXT_ZIEL_NEUER : TEXT_ZIEL_GELOESCHT);
}

/**
 * Scheibe „Sparziele“ des Stores: Ziele und Verschiebungen lesen und ändern. `store` = die Fassade, `zielId` = Quelle neuer Kennungen.
 * → { methoden (öffentliche Methoden des Stores), intern (was die Fassade braucht) }.
 */
export function createSparzieleSlice(kern, { store, zielId }) {
  const { adapter, jetzt, melden, teilAendern, mitRueckgaengig } = kern;
  // Änderungen der Sparziele, die noch nicht gespeichert sind (Warteschlange wie beim Schichtplan, siehe teilAendern), und ein Zähler
  // begonnener Änderungen: ein Laden, das älter sein könnte als eine eigene Änderung, ersetzt die angezeigten Sparziele nicht.
  const zieleOffen = new Map();
  let zieleStand = 0;
  let zieleLesenLaeuft = null; // laufendes zieleLaden(): mehrfaches Anstoßen liest nur einmal
  /** Die zuletzt gelesenen Sparziele bleiben, aber gesperrt: das Lesen ist gescheitert (Netz). */
  const zieleNichtGelesen = () => ({ ...kern.state.ziele, status: 'fehler', warnungen: [TEXT_ZIELE_NICHT_GELADEN] });
  /**
   * Sparziele nach einem Laden (`stand` = zieleStand beim Beginn): `ziele: null` = ihr Lesen ist gescheitert → gesperrt (siehe
   * zieleNichtGelesen); sonst nur übernommen, wenn seitdem nichts selbst geändert wurde. Liefert der Adapter keine (undefined): unverändert.
   */
  function zieleNachLaden(daten, stand) {
    if (daten?.ziele === null) return zieleNichtGelesen();
    if (daten?.ziele?.unlesbar) return zieleUnlesbarUebernehmen(daten.ziele);
    return !daten?.ziele || zieleOffen.size > 0 || stand !== zieleStand ? kern.state.ziele : zieleZustand(daten.ziele, 'geladen');
  }
  kern.nachNeuLaden(() => {
    const stand = zieleStand;
    return (daten) => ({ ziele: zieleNachLaden(daten, stand) });
  });
  /**
   * Frisch gelesene, aber unlesbare Sparziele gehen immer vor: leer und gesperrt, auch wenn eine eigene Änderung unterwegs ist oder auf
   * die Anmeldung wartet (ihr Speichern würde ohnehin abgelehnt) – die Warteschlange wird geleert.
   */
  function zieleUnlesbarUebernehmen(gelesen) {
    const eintrag = zieleOffen.get('ziele');
    if (eintrag) {
      eintrag.basis = leereZiele();
      eintrag.offen.length = 0;
    }
    return zieleZustand(gelesen, 'geladen');
  }
  /** Ist Ändern gerade verboten? → Meldung oder null (unlesbar, oder nicht (erfolgreich) gelesen). */
  const zieleGesperrt = () => (kern.state.ziele.unlesbar ? TEXT_ZIELE_GESPERRT : kern.state.ziele.status === 'geladen' || kern.state.ziele.status === 'gespeichert' ? null : TEXT_ZIELE_NICHT_GELADEN);
  /**
   * Ändert die Sparziele: `fn(daten)` → neue Daten (rein; siehe domain/sparziele.js). Sofort sichtbar; gespeichert als `fn` auf der
   * NEUESTEN Fassung im Kalender (zwei Telefone überschreiben sich nicht), eines nach dem anderen (eigene Warteschlange, siehe
   * teilAendern). Bei einem Fehler wird nur diese Änderung zurückgenommen und die Sparziele werden neu gelesen. Unlesbare Sparziele
   * werden nie geschrieben. → { ok: true } | { ok: false, fehler } | { ok: false, wartet: true, fehler } (nach dem Anmelden
   * gespeichert); nie ein Wurf (lehnt `fn` schon den angezeigten Stand ab, ändert sich nichts und `fehler` ist seine Meldung).
   */
  async function zieleAendern(fn) {
    const gesperrt = zieleGesperrt();
    if (gesperrt) return { ok: false, fehler: gesperrt };
    if (!adapter.aendereZiele) return { ok: false, fehler: TEXT_FEHLER };
    try {
      fn(kern.state.ziele.daten); // schon am angezeigten Stand abgelehnt: nichts ändern, nichts zählen (ein Laden läuft ungestört weiter)
    } catch (e) {
      return { ok: false, fehler: e?.message || TEXT_FEHLER };
    }
    zieleStand += 1;
    try {
      const { ergebnis, fehler } = await teilAendern(zieleOffen, 'ziele', fn, {
        leer: leereZiele,
        aktuell: () => kern.state.ziele.daten,
        // `bestaetigt` = der zuletzt gespeicherte Stand, solange eigene Änderungen offen sind (für den Schnappschuss: eine Änderung, die
        // auf die Anmeldung wartet, lebt nur im Speicher und darf nach einem Neustart nicht als gespeichert erscheinen)
        mit: (daten) => {
          const e = zieleOffen.get('ziele');
          const { bestaetigt: _alt, ...ziele } = kern.state.ziele;
          return { ...kern.state, ziele: e && e.offen.length > 0 ? { ...ziele, daten, bestaetigt: e.basis } : { ...ziele, daten } };
        },
        async speichern(f) {
          try {
            const gespeichert = await adapter.aendereZiele(f);
            // Gespeichert heißt: der Adapter hat die Sparziele eben frisch gelesen (und lesbar gefunden) – eine Sperre nach einem
            // gescheiterten Lesen ('fehler') ist damit aufgehoben.
            if (kern.state.ziele.status !== 'geladen' && kern.state.ziele.status !== 'gespeichert') {
              kern.state = { ...kern.state, ziele: { ...kern.state.ziele, status: 'geladen', warnungen: zieleWarnungen({ daten: gespeichert ?? kern.state.ziele.daten, unlesbar: false }) } };
            }
            return gespeichert;
          } catch (e) {
            // inzwischen (z. B. durch das andere Telefon) unlesbar: der Adapter hat nichts geschrieben; ab jetzt gesperrt und leer
            // gezeigt (auch wenn das folgende neu Lesen scheitert), wartende Änderungen fallen weg (ihr Speichern wird ebenso abgelehnt)
            if (e?.name === 'ZieleGesperrt') {
              FACHLICH.add(e);
              const eintrag = zieleOffen.get('ziele');
              if (eintrag) {
                eintrag.basis = leereZiele();
                eintrag.offen.length = 0;
              }
              kern.state = { ...kern.state, ziele: { ...kern.state.ziele, daten: leereZiele(), unlesbar: true, warnungen: zieleWarnungen({ unlesbar: true }) } };
            }
            throw e;
          }
        },
        async lesen() {
          const g = await adapter.leseZiele();
          kern.state = { ...kern.state, ziele: { ...zieleZustand(g, 'geladen'), daten: kern.state.ziele.daten } };
          return g.daten;
        },
        normalisiere: (daten) => daten ?? leereZiele(),
      });
      if (ergebnis === 'ok') return { ok: true };
      return ergebnis === 'auth' ? { ok: false, wartet: true, fehler } : { ok: false, fehler, gemeldet: true }; // gemeldet: die Meldung steht schon in state.fehler (die Shell zeigt sie)
    } catch (e) {
      return { ok: false, fehler: e?.message || TEXT_FEHLER };
    }
  }

  /**
   * Der Kontostand frisch aus dem Kalender – für den Startmonat eines neuen Ziels und die Löschprüfung (das andere Telefon könnte den
   * Monat eben vervollständigt haben); geht das nicht (offline, Demo), der angezeigte.
   */
  async function kontoFrisch() {
    if (!adapter.leseKonto) return kern.state.konto;
    try {
      const { konto } = await adapter.leseKonto();
      return konto ? normalisiereKonto(konto) : kern.state.konto;
    } catch {
      return kern.state.konto;
    }
  }

  /** Eine Kennung für ein neues Ziel oder eine Verschiebung, die noch nicht vergeben ist (auch nicht an fremde Einträge); sonst null. */
  function neueZielKennung() {
    const d = kern.state.ziele.daten;
    const vergeben = new Set([...(d.z ?? []), ...(d.m ?? [])].map((x) => x.id).concat([...(d.fremd?.z ?? []), ...(d.fremd?.m ?? [])].map((k) => k?.i)));
    for (let versuch = 0; versuch < 20; versuch += 1) {
      const id = zielId();
      if (typeof id !== 'string' || id === '') return null; // eingespeiste Kennungen (Tests) sind aufgebraucht
      if (!vergeben.has(id)) return id;
    }
    return null;
  }

  /**
   * Liest nur die Sparziele neu (z. B. nach „konnten nicht geladen werden“ oder beim Öffnen ihrer Seite). Gelingt es, gelten sie als
   * 'geladen' (Ändern wieder möglich); scheitert es, Status 'fehler' (gesperrt) bzw. bei abgelaufener Anmeldung `anmeldungNoetig`
   * (der Stand bleibt). Wurde inzwischen selbst etwas geändert, bleiben die angezeigten Daten (die Antwort könnte älter sein).
   * → true, wenn gelesen; höchstens ein Lesen gleichzeitig; wirft nie.
   */
  function zieleLesenNeu() {
    if (zieleLesenLaeuft) return zieleLesenLaeuft;
    if (!adapter.leseZiele) return Promise.resolve(false);
    zieleLesenLaeuft = (async () => {
      const stand = zieleStand;
      let g;
      try {
        g = await adapter.leseZiele();
      } catch (fehler) {
        kern.state = istAuthFehler(fehler) ? { ...kern.state, anmeldungNoetig: true } : { ...kern.state, ziele: zieleNichtGelesen() };
        melden();
        return false;
      }
      const frisch = zieleZustand(g, 'geladen');
      const eigene = zieleOffen.size > 0 || stand !== zieleStand;
      if (frisch.unlesbar) kern.state = { ...kern.state, ziele: zieleUnlesbarUebernehmen(g) };
      else kern.state = { ...kern.state, ziele: eigene ? { ...frisch, daten: kern.state.ziele.daten, ...(kern.state.ziele.bestaetigt ? { bestaetigt: kern.state.ziele.bestaetigt } : {}) } : frisch };
      melden();
      return true;
    })()
      .catch(() => false)
      .finally(() => {
        zieleLesenLaeuft = null;
      });
    return zieleLesenLaeuft;
  }

  /** Sparziele für die Sicherung: frisch aus dem Kalender (Anmeldefehler laufen nach oben), sonst der angezeigte Stand. → { daten, unlesbar, text }. */
  async function zieleFuerSicherung() {
    if (!adapter.leseZiele) return { daten: kern.state.ziele.daten, unlesbar: kern.state.ziele.unlesbar, text: null };
    const g = await adapter.leseZiele();
    return { daten: g.daten, unlesbar: g.unlesbar === true, text: g.text ?? null };
  }

  const methoden = {
    /**
     * Sparziel anlegen (ohne `id`: neue Kennung, Startmonat `erstellt` = startMonat(heute, Kontostand) – der laufende Monat, oder der
     * nächste, wenn der Kontostand dieses Monats schon komplett ist) oder ändern (mit `id`: Name, Symbol, Betrag, Datum, vorläufig;
     * Startmonat und Abschluss bleiben, wie sie im Kalender stehen). `erstellt`, `beendet` und `aus` aus dem Entwurf werden nie
     * übernommen. Hat das andere Telefon das Ziel inzwischen gelöscht, wird es nicht wieder angelegt.
     * → { ok: true, id } | { ok: false, fehler } (Meldung der Prüfung, gesperrt, Speicherfehler – dann zurückgenommen und neu gelesen) |
     * { ok: false, wartet: true, fehler } (nach dem Anmelden gespeichert). Wirft nie.
     */
    async zielSpeichern(entwurf) {
      const heute = todayVienna(jetzt());
      const { erstellt: _e, beendet: _b, aus: _a, ...roh } = istObjekt(entwurf) ? entwurf : {};
      const gesperrt = zieleGesperrt();
      if (gesperrt) return { ok: false, fehler: gesperrt };
      if (roh.id) {
        const r = await zieleAendern((d) => (zielVorhanden(d, roh.id), zielSetzen(d, roh, { heute })));
        return r.ok ? { ok: true, id: roh.id } : r;
      }
      const id = neueZielKennung();
      if (!id) return { ok: false, fehler: TEXT_FEHLER };
      const ziel = { ...roh, id, erstellt: startMonat(heute, await kontoFrisch()) };
      const r = await zieleAendern((d) => zielSetzen(d, ziel, { heute }));
      return r.ok ? { ok: true, id } : r;
    },

    /**
     * Ziel von Hand beenden ab dem laufenden Monat: `art` 'ausgegeben' (vom Konto bezahlt) oder 'frei' (es geht zu „Frei verfügbar“).
     * Ein schon abgeschlossenes Ziel → Meldung (für ein automatisch abgeschlossenes siehe `zielZurueckZuFrei`). Ergebnis wie
     * `zielSpeichern` (ohne id).
     */
    zielBeenden(id, art) {
      const monat = todayVienna(jetzt()).slice(0, 7);
      return zieleAendern((d) => {
        const z = zielVorhanden(d, id);
        if (zielSchluss(z).monat <= monat) throw new Error(TEXT_ZIEL_ABGESCHLOSSEN);
        return zielBeendenRein(d, id, { monat, art });
      });
    },

    /**
     * „Doch nicht ausgegeben – zurück zu Frei“: ein nur AUTOMATISCH abgeschlossenes Ziel (Zielmonat vorbei) gibt sein Gespartes ab seinem
     * Abschlussmonat an „Frei“ (`beendet` = { Abschlussmonat, 'frei' }). Sonst → Meldung. Ergebnis wie `zielBeenden`.
     */
    zielZurueckZuFrei(id) {
      const monat = todayVienna(jetzt()).slice(0, 7);
      return zieleAendern((d) => {
        const z = zielVorhanden(d, id);
        const schluss = zielSchluss(z);
        if (!schluss.automatisch || schluss.monat > monat) throw new Error(TEXT_NICHT_AUTOMATISCH);
        return zielBeendenRein(d, id, { monat: schluss.monat, art: 'frei' });
      });
    },

    /**
     * Ziel löschen (domain zielLoeschArt). Ein laufendes Ziel geht immer: hat es Geld bekommen, wird es im laufenden Monat „gelöscht“
     * abgeschlossen (sein Gespartes geht zu Frei, die Vergangenheit bleibt); hat es keine Spur hinterlassen, wird es wirklich entfernt.
     * Ein abgeschlossenes Ziel geht nur, wenn es nie Geld bekommen hat (sonst TEXT_NICHT_LOESCHBAR: nur ausblenden). Geprüft mit dem
     * frisch gelesenen Kontostand (das andere Telefon könnte den Monat eben vervollständigt haben). Ergebnis wie `zielBeenden`, bei Erfolg mit
     * `rueckgaengig()`: holt genau das Gelöschte (Ziel und seine Verschiebungen, wie sie im Kalender standen) zurück.
     */
    async zielLoeschen(id) {
      const heute = todayVienna(jetzt());
      const konto = await kontoFrisch();
      let spur = null;
      const r = await zieleAendern((d) => {
        zielVorhanden(d, id);
        const s = zielSpur(d, id);
        const neu = zielLoeschenRein(d, id, { heute, konto });
        spur = s; // auf der neuesten Fassung: das wirklich Gelöschte
        return neu;
      });
      return mitRueckgaengig(r, spur ? () => store.zielWiederherstellen(spur) : null);
    },

    /**
     * „Rückgängig“ nach zielLoeschen: `spur` (siehe domain zielSpur) zurück – über den normalen Speicherweg mit allen Sperren und
     * Prüfungen (höchstens 20 laufende, Platz, Einträge einer neueren Version). Ergebnis wie `zielBeenden`.
     */
    zielWiederherstellen(spur) {
      const heute = todayVienna(jetzt());
      return zieleAendern((d) => zielWiederherstellenRein(d, spur, { heute }));
    },

    /**
     * Eine Verschiebung aus „Frei“ rückgängig machen (nur zu einem noch laufenden Ziel): ihr Geld geht über die Rechnung zurück zu „Frei“.
     * Gleiche Sperren wie jede Änderung der Sparziele (unlesbar, nicht geladen). → { ok: true, rueckgaengig } | sonst wie `zielBeenden`;
     * `rueckgaengig()` bringt die Verschiebung unverändert an ihre Stelle zurück.
     */
    async verschiebungLoeschen(id) {
      const heute = todayVienna(jetzt());
      let spur = null;
      const r = await zieleAendern((d) => {
        const stelle = (d.m ?? []).findIndex((v) => v.id === id);
        if (stelle < 0) throw new Error((d.fremd?.m ?? []).some((k) => k?.i === id) ? TEXT_VERSCHIEBUNG_NEUER : TEXT_VERSCHIEBUNG_WEG);
        const neu = verschiebungLoeschenRein(d, id, { heute });
        spur = { verschiebung: d.m[stelle], stelle };
        return neu;
      });
      return mitRueckgaengig(r, spur ? () => store.verschiebungWiederherstellen(spur) : null);
    },

    /** „Rückgängig“ nach verschiebungLoeschen (`spur` = { verschiebung, stelle }); Ergebnis wie `zielBeenden`. */
    verschiebungWiederherstellen(spur) {
      const heute = todayVienna(jetzt());
      return zieleAendern((d) => verschiebungWiederherstellenRein(d, spur, { heute }));
    },

    /** Abgeschlossenes Ziel im Verlauf ausblenden (`an` = true) oder wieder einblenden (false); nur Anzeige. Ergebnis wie `zielBeenden`. */
    zielAusblenden(id, an = true) {
      const heute = todayVienna(jetzt());
      return zieleAendern((d) => (zielVorhanden(d, id), zielAusblendenRein(d, id, an, { heute })));
    },

    /**
     * `cents` aus „Frei verfügbar“ zum Ziel `ziel` verschieben, wirksam im laufenden Monat; gedeckelt auf das verfügbare „Frei“ und den
     * noch offenen Betrag (Rechnung mit dem angezeigten Kontostand). → { ok: true, id, cents (tatsächlich verschoben) } | sonst wie
     * `zielSpeichern`.
     */
    async freiVerschieben(ziel, cents) {
      const heute = todayVienna(jetzt());
      const konto = kern.state.konto;
      const gesperrt = zieleGesperrt();
      if (gesperrt) return { ok: false, fehler: gesperrt };
      const id = neueZielKennung();
      if (!id) return { ok: false, fehler: TEXT_FEHLER };
      const r = await zieleAendern((d) => (zielVorhanden(d, ziel), zielFreiVerschieben(d, { id, monat: heute.slice(0, 7), ziel, cents }, { konto, heute })));
      if (!r.ok) return r;
      return { ok: true, id, cents: kern.state.ziele.daten.m.find((v) => v.id === id)?.cents ?? cents };
    },

    /** Nur die Sparziele neu lesen (siehe `zieleLesenNeu`): hebt die Sperre nach einem gescheiterten Lesen auf. → true, wenn gelesen; wirft nie. */
    zieleLaden: () => zieleLesenNeu(),
  };

  return {
    methoden,
    intern: {
      zieleAendern,
      zieleNachLaden,
      zieleFuerSicherung,
      get zieleStand() {
        return zieleStand;
      },
    },
  };
}
