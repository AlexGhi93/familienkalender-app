// Web-Push-Verschlüsselung nach RFC 8291 (Inhaltskodierung aes128gcm, RFC 8188), mit WebCrypto.
// Die App verschlüsselt jede Erinnerung für ein bestimmtes Telefon; der Push-Dienst und die Push-Server von Google/Apple
// sehen nur den fertigen Körper. Aufbau: Salz (16) | rs (4) | Schlüssellänge (1) | Schlüssel (65) | verschlüsselter Datensatz.
import { b64uZuBytes, bytesZuB64u } from './base64url.js';

const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();
const RS = 4096;
const KOPF = 16 + 4 + 1 + 65;
/** Größter Klartext, der samt Kopf, Trennbyte (1) und Prüfwert (16) noch in 4096 Byte passt (Grenze der Push-Dienste). */
export const MAX_KLARTEXT = RS - KOPF - 1 - 16;

const verbinde = (...teile) => {
  const aus = new Uint8Array(teile.reduce((n, t) => n + t.length, 0));
  let o = 0;
  for (const t of teile) {
    aus.set(t, o);
    o += t.length;
  }
  return aus;
};

async function hkdf(salt, ikm, info, bytes) {
  const schluessel = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, schluessel, bytes * 8));
}

async function fluechtigesPaar(vorgabe) {
  if (!vorgabe) {
    const paar = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    return { privat: paar.privateKey, oeffentlich: new Uint8Array(await subtle.exportKey('raw', paar.publicKey)) };
  }
  const oeffentlich = b64uZuBytes(vorgabe.oeffentlich);
  const jwk = { kty: 'EC', crv: 'P-256', d: vorgabe.privat, x: bytesZuB64u(oeffentlich.slice(1, 33)), y: bytesZuB64u(oeffentlich.slice(33, 65)), ext: true };
  return { privat: await subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']), oeffentlich };
}

/**
 * Verschlüsselt `klartext` (Uint8Array) für ein Push-Abonnement `{ p256dh, auth }` (base64url, wie `PushSubscription.toJSON().keys`).
 * Gibt den vollständigen Körper zurück, der unverändert an die Adresse des Abonnements gesendet wird (`Content-Encoding: aes128gcm`).
 * `salt` und `ephemeral` ({ privat, oeffentlich } in base64url) gibt es nur für den RFC-Testvektor; sonst sind beide zufällig.
 */
export async function verschluessele({ p256dh, auth }, klartext, { salt = null, ephemeral = null } = {}) {
  if (klartext.length > MAX_KLARTEXT) throw new Error(`Die Nachricht ist zu lang (höchstens ${MAX_KLARTEXT} Byte).`);
  const empfaenger = b64uZuBytes(p256dh ?? '');
  const authBytes = b64uZuBytes(auth ?? '');
  if (empfaenger.length !== 65 || empfaenger[0] !== 4 || authBytes.length !== 16) throw new Error('Der Schlüssel des Telefons ist ungültig.');

  const salz = salt ?? globalThis.crypto.getRandomValues(new Uint8Array(16));
  const paar = await fluechtigesPaar(ephemeral);
  const empfaengerSchluessel = await subtle.importKey('raw', empfaenger, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: empfaengerSchluessel }, paar.privat, 256));

  const schluesselInfo = verbinde(enc.encode('WebPush: info\0'), empfaenger, paar.oeffentlich);
  const ikm = await hkdf(authBytes, ecdh, schluesselInfo, 32);
  const cek = await hkdf(salz, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salz, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const aesKey = await subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const datensatz = verbinde(klartext, Uint8Array.of(2)); // 0x02 = letzter (einziger) Datensatz
  const chiffre = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, datensatz));

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, RS);
  return verbinde(salz, rs, Uint8Array.of(paar.oeffentlich.length), paar.oeffentlich, chiffre);
}
