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
 * Bekommt das Telefon `g` die Erinnerung `p`? Erinnerungen mit `nur` (siehe plan.js) gehen an die Telefone dieser Person
 * und an alle Telefone ohne Angabe, wem sie gehören – so verpasst niemand eine Erinnerung.
 */
export const fuerGeraet = (p, g) => !p.nur || !g.person || g.person === p.nur;

/**
 * Fingerabdruck dessen, was baueMeldungen aus `plan` und `geraete` machen würde (ohne zu verschlüsseln): ändert er sich nicht,
 * muss der Push-Dienst nichts Neues bekommen. `nur` und `person` stehen nur darin, wenn gesetzt: ohne „Bringen & Abholen“
 * bleibt der Fingerabdruck wie in früheren Versionen.
 */
export async function planDigest(fid, plan, geraete) {
  return kurzHash(
    JSON.stringify({
      f: fid,
      g: geraete.map((g) => [g.id, g.endpoint, g.p256dh, g.auth, ...(g.person ? [g.person] : [])]),
      p: plan.map((p) => [p.id, p.um, p.titel, p.text, ...(p.nur ? [p.nur] : [])]),
    }),
  );
}

/**
 * `plan`: [{ id, um, titel, text, ttl, nur? }]; `geraete`: [{ id, p256dh, auth, person? }] (alle Telefone der Familie, auch dieses).
 * Gibt [{ id, an, um, h, ttl, body }] zurück. `h` hängt nur an Inhalt und Schlüssel des Telefons, nicht am Zufall der Verschlüsselung:
 * so erkennt der Dienst unveränderte Meldungen und schreibt sie nicht neu. Telefone, für die eine Erinnerung nicht ist (`fuerGeraet`), bekommen keine.
 */
export async function baueMeldungen(plan, geraete) {
  const items = [];
  for (const g of geraete) {
    for (const p of plan) {
      if (!fuerGeraet(p, g)) continue;
      const h = await kurzHash(`${p.um}|${p.titel}|${p.text}${p.ziel ? `|${p.ziel}` : ''}|${g.p256dh}|${g.auth}`);
      const body = bytesZuB64u(await verschluessele(g, enc.encode(nutzlastText(p))));
      items.push({ id: p.id, an: g.id, um: p.um, h, ttl: p.ttl, body });
    }
  }
  return items;
}
