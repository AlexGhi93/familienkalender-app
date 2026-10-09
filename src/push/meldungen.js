// Aus dem Plan (siehe plan.js) die fertigen, verschlüsselten Meldungen für den Push-Dienst bauen: eine je Erinnerung und Telefon.
import { bytesZuB64u } from './base64url.js';
import { verschluessele } from './verschluesselung.js';

const enc = new TextEncoder();
const ZIEL = '#/heute'; // was beim Tippen auf die Benachrichtigung geöffnet wird

async function kurzHash(text) {
  return bytesZuB64u(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', enc.encode(text))).slice(0, 16));
}

/** Klartext der Benachrichtigung (nur auf dem Telefon lesbar): t = Titel, k = Text, g = Kennung (ersetzt Doppelte), u = Ziel (`#/…`, sonst „Heute“). */
export const nutzlastText = (p) => JSON.stringify({ t: p.titel, k: p.text, g: p.id, u: typeof p.ziel === 'string' && p.ziel.startsWith('#/') ? p.ziel : ZIEL });

/**
 * `plan`: [{ id, um, titel, text, ttl }]; `geraete`: [{ id, p256dh, auth }] (alle Telefone der Familie, auch dieses).
 * Gibt [{ id, an, um, h, ttl, body }] zurück. `h` hängt nur an Inhalt und Schlüssel des Telefons, nicht am Zufall der Verschlüsselung:
 * so erkennt der Dienst unveränderte Meldungen und schreibt sie nicht neu.
 */
export async function baueMeldungen(plan, geraete) {
  const items = [];
  for (const g of geraete) {
    for (const p of plan) {
      const h = await kurzHash(`${p.um}|${p.titel}|${p.text}${p.ziel ? `|${p.ziel}` : ''}|${g.p256dh}|${g.auth}`);
      const body = bytesZuB64u(await verschluessele(g, enc.encode(nutzlastText(p))));
      items.push({ id: p.id, an: g.id, um: p.um, h, ttl: p.ttl, body });
    }
  }
  return items;
}
