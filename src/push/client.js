// Push-Erinnerungen auf diesem Telefon: aktivieren (Erlaubnis + Abonnement + Eintrag im Register), den Plan beim Push-Dienst
// aktuell halten, testen und ausschalten. Alles Browser- und Netzwerkzeug wird hineingereicht, damit es sich ohne Telefon testen lässt.
// Der Push-Dienst bekommt nur verschlüsselte Meldungen (siehe meldungen.js); Google Kalender bleibt der zweite, unabhängige Weg.
import { b64uZuBytes, bytesZuB64u } from './base64url.js';
import { baueMeldungen } from './meldungen.js';
import { bereinige, mitGeraet, neuesRegister, ohneGeraet } from './geraete.js';
import { planeErinnerungen } from './plan.js';
import { verschluessele } from './verschluesselung.js';

const TAGE_VORAUS = 60;
const TAG_MS = 24 * 3600_000;
const K = { geraet: 'fk.push.geraet.v1', aktiv: 'fk.push.aktiv.v1', digest: 'fk.push.digest.v1', stand: 'fk.push.stand.v1', erloschen: 'fk.push.erloschen.v1' };
const enc = new TextEncoder();

export class PushFehler extends Error {
  /** `code`: abgelehnt, nicht-eingerichtet, nicht-unterstuetzt, ios-installieren, dienst-nicht-erreichbar, schluessel, besetzt, dienst-fehler, kein-abo, nicht-registriert, abo-erloschen, … */
  constructor(code, message) {
    super(message);
    this.name = 'PushFehler';
    this.code = code;
  }
}

export const GRUND_TEXT = Object.freeze({
  'nicht-eingerichtet': 'Der Push-Dienst ist noch nicht eingerichtet.',
  'nicht-unterstuetzt': 'Dieses Gerät oder dieser Browser unterstützt keine Benachrichtigungen von Apps.',
  'ios-installieren': 'Auf dem iPhone geht das nur aus der App auf dem Home-Bildschirm (iOS 16.4 oder neuer): in Safari „Teilen“ → „Zum Home-Bildschirm“, dann die App von dort öffnen.',
});

/** Erkennt Gerät und Fähigkeiten: { ios, installiert (Home-Bildschirm-Modus), pushUnterstuetzt, name }. */
export function erkenneUmgebung(navigator, fenster) {
  const ua = navigator?.userAgent ?? '';
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator?.platform === 'MacIntel' && navigator?.maxTouchPoints > 1);
  const installiert = navigator?.standalone === true || Boolean(fenster?.matchMedia?.('(display-mode: standalone)')?.matches);
  const pushUnterstuetzt = Boolean(navigator && 'serviceWorker' in navigator && fenster && 'PushManager' in fenster && 'Notification' in fenster);
  const name = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : 'Computer';
  return { ios, installiert, pushUnterstuetzt, name };
}

async function kurzHash(text) {
  return bytesZuB64u(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', enc.encode(text))).slice(0, 16));
}

const NICHT_ERREICHBAR = () => new PushFehler('dienst-nicht-erreichbar', 'Der Push-Dienst ist gerade nicht erreichbar. Google Kalender erinnert trotzdem.');

/**
 * `store` (getState), `adapter` (leseGeraete, aendereGeraete), `config` ({ dienst, vapidPublic }), `fetch`, `navigator`, `Notification`,
 * `speicher` (localStorage-artig), `umgebung` (siehe erkenneUmgebung), `jetzt`, `zeitgeber` ({ setze, loesche }).
 */
export function createPush({ store, adapter, config, fetch, navigator, Notification, speicher, umgebung, jetzt = () => new Date(), zeitgeber = { setze: (f, ms) => setTimeout(f, ms), loesche: (id) => clearTimeout(id) } }) {
  let letzterFehler = null;
  let timer = null;
  let registriert = null; // zuletzt bekannt: steht dieses Telefon im Register? (null = noch nicht geprüft)
  let geraeteAnzahl = 0;

  const eingerichtet = () => Boolean(config?.dienst && config?.vapidPublic);
  const aktiv = () => speicher.getItem(K.aktiv) === '1';

  function verfuegbar() {
    if (!eingerichtet()) return { ok: false, grund: 'nicht-eingerichtet' };
    if (umgebung.ios && !umgebung.installiert) return { ok: false, grund: 'ios-installieren' };
    if (!umgebung.pushUnterstuetzt) return { ok: false, grund: 'nicht-unterstuetzt' };
    return { ok: true };
  }

  function geraeteId() {
    let id = speicher.getItem(K.geraet);
    if (!id) {
      id = bytesZuB64u(globalThis.crypto.getRandomValues(new Uint8Array(8)));
      speicher.setItem(K.geraet, id);
    }
    return id;
  }

  const registrierung = () => navigator.serviceWorker.ready;
  const abonnement = async () => (await registrierung()).pushManager.getSubscription();

  async function status() {
    const stand = Number(speicher.getItem(K.stand)) || null;
    const basis = { geraete: geraeteAnzahl, letzteSync: stand, letzterFehler };
    const v = verfuegbar();
    if (!v.ok) return { ...basis, zustand: 'nicht-moeglich', grund: v.grund };
    if (Notification.permission === 'denied') return { ...basis, zustand: 'abgelehnt' };
    if (!aktiv()) return { ...basis, zustand: 'aus' };
    const sub = await abonnement();
    const erloschen = sub && speicher.getItem(K.erloschen) === sub.toJSON().endpoint;
    return { ...basis, zustand: !sub || erloschen || registriert === false ? 'erneut' : 'aktiv' };
  }

  async function dienstAnfrage(methode, pfad, register, body) {
    let antwort;
    try {
      antwort = await fetch(`${config.dienst}${pfad}`, { method: methode, headers: { Authorization: `Bearer ${register.schluessel}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } catch {
      throw NICHT_ERREICHBAR();
    }
    if (antwort.status === 401) throw new PushFehler('schluessel', 'Der Push-Dienst erkennt diese Familie nicht (der Schlüssel passt nicht).');
    if (antwort.status === 403) throw new PushFehler('besetzt', 'Der Push-Dienst gehört schon einer anderen Familie.');
    if (!antwort.ok) throw new PushFehler('dienst-fehler', `Der Push-Dienst hat den Fehler ${antwort.status} gemeldet.`);
    return antwort.json();
  }

  /** Trägt dieses Telefon (mit den Schlüsseln seines Abonnements) im Register ein und gibt das Register zurück. */
  async function eintragen(sub) {
    const j = sub.toJSON();
    const register = await adapter.aendereGeraete((reg) => mitGeraet(reg ?? neuesRegister(), { id: geraeteId(), name: umgebung.name, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }, jetzt().getTime()));
    registriert = true;
    geraeteAnzahl = register.geraete.length;
    return register;
  }

  /** Muss direkt aus dem Tippen auf den Knopf aufgerufen werden (iOS verlangt eine Nutzeraktion für die Erlaubnis). */
  async function aktivieren() {
    const v = verfuegbar();
    if (!v.ok) throw new PushFehler(v.grund, GRUND_TEXT[v.grund]);
    const erlaubnis = await Notification.requestPermission();
    if (erlaubnis !== 'granted') throw new PushFehler('abgelehnt', 'Die Erlaubnis wurde nicht erteilt. Bitte in den Einstellungen des Telefons die Benachrichtigungen für diese App erlauben und noch einmal versuchen.');
    const reg = await registrierung();
    let sub = await reg.pushManager.getSubscription();
    if (sub && speicher.getItem(K.erloschen) === sub.toJSON().endpoint) {
      await sub.unsubscribe(); // der Push-Server hat diese Adresse für erloschen erklärt: ein neues Abonnement holen
      sub = null;
    }
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uZuBytes(config.vapidPublic) });
    await eintragen(sub);
    speicher.removeItem(K.erloschen);
    speicher.setItem(K.aktiv, '1');
    await sync({ erzwingen: true });
    return status();
  }

  /**
   * Hält den Plan beim Push-Dienst aktuell. Läuft nur nach einem frischen Laden aus Google (nie aus dem gespeicherten Stand) und nur,
   * wenn sich etwas geändert hat (oder mit `erzwingen`). Gibt { art: 'uebersprungen' | 'unveraendert' | 'gesendet', … } zurück.
   */
  async function sync({ erzwingen = false } = {}) {
    if (!eingerichtet() || !aktiv()) return { art: 'uebersprungen' };
    const state = store.getState();
    if (!state.geladen || state.nurSnapshot || Notification.permission !== 'granted') return { art: 'uebersprungen' };
    const sub = await abonnement();
    if (!sub) return { art: 'uebersprungen' };
    const j = sub.toJSON();
    if (speicher.getItem(K.erloschen) === j.endpoint) return { art: 'uebersprungen' }; // bis zur erneuten Aktivierung

    let { register } = await adapter.leseGeraete();
    const eigenes = register?.geraete.find((g) => g.id === geraeteId());
    const veraltet = !eigenes || eigenes.endpoint !== j.endpoint || eigenes.p256dh !== j.keys.p256dh || eigenes.auth !== j.keys.auth || jetzt().getTime() - eigenes.zuletzt > TAG_MS;
    if (veraltet) register = await eintragen(sub); // neue Schlüssel, neues Telefon im Register oder „zuletzt“ auffrischen
    else {
      registriert = true;
      geraeteAnzahl = register.geraete.length;
    }

    const plan = await planeErinnerungen(state, { jetzt: jetzt(), tage: TAGE_VORAUS });
    const geraete = register.geraete;
    const digest = await kurzHash(JSON.stringify({ f: register.fid, g: geraete.map((g) => [g.id, g.endpoint, g.p256dh, g.auth]), p: plan.map((p) => [p.id, p.um, p.titel, p.text]) }));
    if (!erzwingen && speicher.getItem(K.digest) === digest) return { art: 'unveraendert' };

    const von = jetzt().getTime();
    const items = await baueMeldungen(plan, geraete);
    const r = await dienstAnfrage('PUT', `/v1/plan/${register.fid}`, register, { von, bis: von + (TAGE_VORAUS + 1) * TAG_MS, geraete: geraete.map((g) => ({ id: g.id, endpoint: g.endpoint })), entfernt: [], items });
    speicher.setItem(K.digest, digest);
    speicher.setItem(K.stand, String(von));
    letzterFehler = null;
    if (r.ungueltig?.length > 0) {
      if (r.ungueltig.includes(geraeteId())) {
        speicher.setItem(K.erloschen, j.endpoint);
        registriert = false;
      }
      const bereinigt = await adapter.aendereGeraete((reg) => (reg ? bereinige(reg, r.ungueltig) : null));
      geraeteAnzahl = bereinigt?.geraete.length ?? 0;
    }
    return { art: 'gesendet', geschrieben: r.geschrieben, geloescht: r.geloescht };
  }

  /** Schickt sofort eine Test-Nachricht an dieses Telefon (Weg: App → Push-Dienst → Push-Server → Telefon). */
  async function testSenden() {
    const sub = await abonnement();
    if (!sub) throw new PushFehler('kein-abo', 'Dieses Telefon ist noch nicht aktiviert.');
    const { register } = await adapter.leseGeraete();
    const eigenes = register?.geraete.find((g) => g.id === geraeteId());
    if (!eigenes) throw new PushFehler('nicht-registriert', 'Dieses Telefon steht nicht im Register. Bitte „Benachrichtigungen aktivieren“ drücken.');
    const body = bytesZuB64u(await verschluessele(eigenes, enc.encode(JSON.stringify({ t: '🔔 Test-Push', k: 'Das kommt direkt von der App.', g: 'test', u: '#/heute' }))));
    const r = await dienstAnfrage('POST', `/v1/senden/${register.fid}`, register, { gid: eigenes.id, body, ttl: 120 });
    if (r.art === 'ungueltig') {
      speicher.setItem(K.erloschen, eigenes.endpoint);
      registriert = false;
      throw new PushFehler('abo-erloschen', 'Der Push-Server hat dieses Telefon abgemeldet. Bitte die Benachrichtigungen erneut aktivieren.');
    }
    if (r.art !== 'ok') throw new PushFehler('abgelehnt', `Der Push-Server hat die Test-Nachricht nicht angenommen (Antwort ${r.status}).`);
    return { ok: true, status: r.status };
  }

  /** Schaltet dieses Telefon aus: Meldungen beim Dienst und Eintrag im Register entfernen, Abonnement beenden. */
  async function deaktivieren() {
    const gid = geraeteId();
    let problem = null;
    try {
      const { register } = await adapter.leseGeraete();
      if (register?.geraete.some((g) => g.id === gid)) {
        try {
          const von = jetzt().getTime();
          await dienstAnfrage('PUT', `/v1/plan/${register.fid}`, register, { von, bis: von + (TAGE_VORAUS + 1) * TAG_MS, geraete: [], entfernt: [gid], items: [] });
        } catch {
          // Dienst nicht erreichbar: die Meldungen verfallen von selbst, der Eintrag im Register wird trotzdem entfernt
        }
        await adapter.aendereGeraete((reg) => (reg ? ohneGeraet(reg, gid) : null));
      }
    } catch (fehler) {
      problem = fehler;
    }
    const sub = await abonnement();
    if (sub) await sub.unsubscribe();
    for (const k of [K.aktiv, K.digest, K.stand, K.erloschen]) speicher.removeItem(k);
    registriert = null;
    geraeteAnzahl = 0;
    if (problem) throw problem;
    return status();
  }

  /** Plant einen Sync in einigen Sekunden (viele Auslöser kurz hintereinander ergeben einen); Fehler werden nur gemerkt, nicht geworfen. */
  function anstossen(verzoegerungMs = 3000) {
    if (timer !== null) zeitgeber.loesche(timer);
    timer = zeitgeber.setze(async () => {
      timer = null;
      try {
        await sync();
      } catch (fehler) {
        letzterFehler = fehler?.message || 'Unbekannter Fehler beim Abgleich.';
      }
    }, verzoegerungMs);
  }

  return { verfuegbar, status, aktivieren, deaktivieren, sync, testSenden, anstossen };
}
