// Register der Telefone, die Push-Erinnerungen bekommen, samt Familien-Kennung und -Schlüssel für den Push-Dienst.
// Es liegt im geteilten Kalender („Anwesenheit“, verstecktes Ereignis „fkgeraete“): nur die beiden Eltern sehen es, und jedes Telefon
// kann so Nachrichten für alle Telefone verschlüsseln. Nichts davon steht im Quelltext oder im veröffentlichten Paket.
import { bytesZuB64u } from './base64url.js';

export const MAX_GERAETE = 6;
export const MAX_REGISTER_ZEICHEN = 6000; // Google kürzt Beschreibungen still bei 8192 Zeichen (Vertragsprobe C11b)

const FID = /^[A-Za-z0-9_-]{16,64}$/;
const SCHLUESSEL = /^[A-Za-z0-9_-]{32,128}$/;
const GERAET_ID = /^[A-Za-z0-9_-]{4,32}$/;
const SCHLUESSELTEXT = /^[A-Za-z0-9_-]+$/;

const zufaellig = (bytes) => bytesZuB64u(globalThis.crypto.getRandomValues(new Uint8Array(bytes)));

/** Neues, leeres Register mit zufälliger Familien-Kennung (16 Byte) und zufälligem Schlüssel (32 Byte). */
export const neuesRegister = () => ({ v: 1, fid: zufaellig(16), schluessel: zufaellig(32), geraete: [] });

function gueltigesGeraet(g) {
  if (!g || typeof g !== 'object') return null;
  const name = typeof g.name === 'string' ? g.name.slice(0, 30) : '';
  const ok =
    GERAET_ID.test(g.id ?? '') &&
    typeof g.endpoint === 'string' && g.endpoint.length <= 1024 && g.endpoint.startsWith('https://') &&
    typeof g.p256dh === 'string' && g.p256dh.length === 87 && SCHLUESSELTEXT.test(g.p256dh) &&
    typeof g.auth === 'string' && g.auth.length === 22 && SCHLUESSELTEXT.test(g.auth) &&
    Number.isFinite(g.zuletzt) && g.zuletzt >= 0;
  return ok ? { id: g.id, name, endpoint: g.endpoint, p256dh: g.p256dh, auth: g.auth, zuletzt: g.zuletzt } : null;
}

/** Prüft ein gelesenes Register streng; gibt null zurück, wenn es unbrauchbar ist. Ungültige Geräte werden einzeln verworfen. */
export function normalisiereRegister(roh) {
  if (!roh || typeof roh !== 'object' || roh.v !== 1 || !FID.test(roh.fid ?? '') || !SCHLUESSEL.test(roh.schluessel ?? '') || !Array.isArray(roh.geraete)) return null;
  return { v: 1, fid: roh.fid, schluessel: roh.schluessel, geraete: roh.geraete.map(gueltigesGeraet).filter(Boolean) };
}

/** Fügt ein Telefon hinzu oder ersetzt dasselbe (gleiche `id`), mit „zuletzt“ = `jetzt`. Über MAX_GERAETE fliegt das älteste raus, nie das neue. */
export function mitGeraet(register, geraet, jetzt) {
  const neu = { id: geraet.id, name: geraet.name ?? '', endpoint: geraet.endpoint, p256dh: geraet.p256dh, auth: geraet.auth, zuletzt: jetzt };
  const geraete = [...register.geraete.filter((g) => g.id !== neu.id), neu];
  while (geraete.length > MAX_GERAETE) {
    const aeltester = geraete.filter((g) => g.id !== neu.id).reduce((a, b) => (b.zuletzt < a.zuletzt ? b : a));
    geraete.splice(geraete.indexOf(aeltester), 1);
  }
  return { ...register, geraete };
}

export const ohneGeraet = (register, id) => ({ ...register, geraete: register.geraete.filter((g) => g.id !== id) });
export const bereinige = (register, ungueltigeIds) => ({ ...register, geraete: register.geraete.filter((g) => !ungueltigeIds.includes(g.id)) });

/** Das Register als Text für die Beschreibung des Kalenderereignisses; zu lange Register werden vor dem Schreiben abgelehnt. */
export function registerText(register) {
  const text = JSON.stringify(register);
  if (text.length > MAX_REGISTER_ZEICHEN) throw new Error(`Das Geräte-Register ist zu lang (höchstens ${MAX_REGISTER_ZEICHEN} Zeichen). Bitte nicht benutzte Telefone ausschalten.`);
  return text;
}
