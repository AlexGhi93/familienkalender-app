// Push-Meldungen: eine je Telefon und Erinnerung, verschlüsselt nach RFC 8291 (mit Testvektor), stabile Prüfsumme `h`; Geräte-Register.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { baueMeldungen, nutzlastText } from '../../src/push/meldungen.js';
import { MAX_KLARTEXT, verschluessele } from '../../src/push/verschluesselung.js';
import { b64uZuBytes, bytesZuB64u } from '../../src/push/base64url.js';
import { MAX_GERAETE, bereinige, mitGeraet, neuesRegister, normalisiereRegister, ohneGeraet, registerText } from '../../src/push/geraete.js';

const { subtle } = globalThis.crypto;
const enc = new TextEncoder();

/** Ein Telefon mit echtem Schlüsselpaar (wie PushSubscription.toJSON().keys) – der private Schlüssel bleibt im Test. */
async function telefon(id) {
  const paar = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const p256dh = bytesZuB64u(new Uint8Array(await subtle.exportKey('raw', paar.publicKey)));
  const auth = bytesZuB64u(globalThis.crypto.getRandomValues(new Uint8Array(16)));
  return { id, name: `Telefon ${id}`, endpoint: `https://push.example/${id}`, p256dh, auth, zuletzt: 1, privat: paar.privateKey };
}

async function hkdf(salt, ikm, info, bytes) {
  const k = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, bytes * 8));
}

/** Entschlüsselt einen aes128gcm-Körper so, wie es der Browser des Telefons tut. */
async function entschluessele(geraet, body) {
  const salz = body.slice(0, 16);
  const rs = new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0);
  const laenge = body[20];
  const absender = body.slice(21, 21 + laenge);
  const chiffre = body.slice(21 + laenge);
  const empfaenger = b64uZuBytes(geraet.p256dh);
  const absenderSchluessel = await subtle.importKey('raw', absender, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: absenderSchluessel }, geraet.privat, 256));
  const info = new Uint8Array([...enc.encode('WebPush: info\0'), ...empfaenger, ...absender]);
  const ikm = await hkdf(b64uZuBytes(geraet.auth), ecdh, info, 32);
  const cek = await hkdf(salz, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salz, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const k = await subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const klar = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: nonce }, k, chiffre));
  assert.equal(rs, 4096);
  assert.equal(klar.at(-1), 2); // letzter Datensatz
  return new TextDecoder().decode(klar.slice(0, -1));
}

describe('base64url', () => {
  test('ohne Auffüllzeichen, hin und zurück', () => {
    for (const n of [0, 1, 2, 3, 16, 65]) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 250) % 256);
      const text = bytesZuB64u(bytes);
      assert.doesNotMatch(text, /[+/=]/);
      assert.deepEqual(b64uZuBytes(text), bytes);
    }
    assert.equal(bytesZuB64u(Uint8Array.of(251, 255)), '-_8');
  });
});

describe('Verschlüsselung (RFC 8291, aes128gcm)', () => {
  test('Testvektor aus RFC 8291, Anhang A', async () => {
    const body = await verschluessele(
      { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' },
      enc.encode('When I grow up, I want to be a watermelon'),
      { salt: b64uZuBytes('DGv6ra1nlYgDCS1FRnbzlw'), ephemeral: { privat: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw', oeffentlich: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8' } },
    );
    assert.equal(
      bytesZuB64u(body),
      'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
    );
  });

  test('das Telefon kann entschlüsseln; jedes Mal anderer Körper', async () => {
    const g = await telefon('a1b2');
    const a = await verschluessele(g, enc.encode('Hallo Familie'));
    const b = await verschluessele(g, enc.encode('Hallo Familie'));
    assert.notDeepEqual(a, b);
    assert.equal(await entschluessele(g, a), 'Hallo Familie');
  });

  test('ungültige Schlüssel und zu lange Nachrichten', async () => {
    const g = await telefon('a1b2');
    await assert.rejects(verschluessele({ ...g, p256dh: 'AAAA' }, enc.encode('x')), /Schlüssel des Telefons ist ungültig/);
    await assert.rejects(verschluessele({ ...g, auth: 'AAAA' }, enc.encode('x')), /ungültig/);
    await assert.rejects(verschluessele({}, enc.encode('x')), /ungültig/);
    await assert.rejects(verschluessele(g, new Uint8Array(MAX_KLARTEXT + 1)), /zu lang/);
    assert.ok((await verschluessele(g, new Uint8Array(MAX_KLARTEXT))).length <= 4096);
  });
});

describe('baueMeldungen', () => {
  const plan = [
    { id: 'erinnerung1', um: 1_000, art: 'tag', titel: '🦷 Zahnarzt 09:00', text: 'Morgen um 09:00', ttl: 21600 },
    { id: 'erinnerung2', um: 2_000, art: 'konto', titel: '💶 Kontostand eintragen', text: 'Heute ist der letzte Tag des Monats.', ttl: 10800, ziel: '#/konto' },
  ];

  test('eine Meldung je Telefon und Erinnerung, entschlüsselbar mit dem Inhalt der Erinnerung', async () => {
    const geraete = [await telefon('handy1'), await telefon('handy2')];
    const items = await baueMeldungen(plan, geraete);
    assert.deepEqual(items.map((i) => [i.id, i.an, i.um, i.ttl]), [
      ['erinnerung1', 'handy1', 1_000, 21600],
      ['erinnerung2', 'handy1', 2_000, 10800],
      ['erinnerung1', 'handy2', 1_000, 21600],
      ['erinnerung2', 'handy2', 2_000, 10800],
    ]);
    const klar = JSON.parse(await entschluessele(geraete[1], b64uZuBytes(items[3].body)));
    assert.deepEqual(klar, { t: '💶 Kontostand eintragen', k: 'Heute ist der letzte Tag des Monats.', g: 'erinnerung2', u: '#/konto' });
    assert.deepEqual(JSON.parse(await entschluessele(geraete[0], b64uZuBytes(items[0].body))).u, '#/heute');
  });

  test('`h` ist stabil (trotz zufälliger Verschlüsselung) und ändert sich mit Inhalt, Zeit und Telefon', async () => {
    const g = await telefon('handy1');
    const [a] = await baueMeldungen(plan.slice(0, 1), [g]);
    const [b] = await baueMeldungen(plan.slice(0, 1), [g]);
    assert.equal(a.h, b.h);
    assert.notEqual(a.body, b.body);
    assert.match(a.h, /^[A-Za-z0-9_-]{22}$/);
    const anders = async (p, geraet = g) => (await baueMeldungen([p], [geraet]))[0].h;
    assert.notEqual(await anders({ ...plan[0], text: 'Morgen um 10:00' }), a.h);
    assert.notEqual(await anders({ ...plan[0], um: 1_001 }), a.h);
    assert.notEqual(await anders({ ...plan[0], titel: 'x' }), a.h);
    assert.notEqual(await anders({ ...plan[0], ziel: '#/konto' }), a.h);
    assert.notEqual(await anders(plan[0], await telefon('handy1')), a.h);
    assert.equal(await anders({ ...plan[0], ttl: 1 }), a.h); // die Haltbarkeit gehört nicht zum Inhalt
  });

  test('ohne Telefone oder ohne Plan: nichts', async () => {
    assert.deepEqual(await baueMeldungen(plan, []), []);
    assert.deepEqual(await baueMeldungen([], [await telefon('x1y2')]), []);
  });

  test('Nutzlast: Ziel nur als „#/…“, sonst „Heute“', () => {
    assert.deepEqual(JSON.parse(nutzlastText({ titel: 'T', text: 'K', id: 'I' })), { t: 'T', k: 'K', g: 'I', u: '#/heute' });
    assert.equal(JSON.parse(nutzlastText({ titel: 'T', text: 'K', id: 'I', ziel: 'https://boese.example' })).u, '#/heute');
    assert.equal(JSON.parse(nutzlastText({ titel: 'T', text: 'K', id: 'I', ziel: '#/einkauf' })).u, '#/einkauf');
  });
});

describe('Geräte-Register', () => {
  const geraet = (id, zuletzt) => ({ id, name: `Handy ${id}`, endpoint: `https://push.example/${id}`, p256dh: 'B'.repeat(87), auth: 'a'.repeat(22), zuletzt });

  test('neues Register: zufällige Familien-Kennung und Schlüssel, gültig', () => {
    const r = neuesRegister();
    assert.equal(r.fid.length, 22);
    assert.equal(r.schluessel.length, 43);
    assert.notEqual(neuesRegister().fid, r.fid);
    assert.deepEqual(normalisiereRegister(r), r);
  });

  test('Prüfung: unbrauchbar → null, ungültige Geräte einzeln verworfen, Name gekürzt', () => {
    const r = neuesRegister();
    assert.equal(normalisiereRegister(null), null);
    assert.equal(normalisiereRegister({ ...r, v: 2 }), null);
    assert.equal(normalisiereRegister({ ...r, fid: 'kurz' }), null);
    assert.equal(normalisiereRegister({ ...r, geraete: {} }), null);
    const n = normalisiereRegister({ ...r, geraete: [geraet('gut1', 5), { ...geraet('http', 1), endpoint: 'http://unsicher' }, { ...geraet('k1', 1), p256dh: 'kurz' }, { ...geraet('lang', 1), name: 'x'.repeat(50) }, null] });
    assert.deepEqual(n.geraete.map((g) => g.id), ['gut1', 'lang']);
    assert.equal(n.geraete[1].name.length, 30);
  });

  test('mitGeraet ersetzt dasselbe Telefon und wirft über dem Maximum das älteste hinaus, nie das neue', () => {
    let r = { ...neuesRegister(), geraete: Array.from({ length: MAX_GERAETE }, (_, i) => geraet(`g${i}aa`, 10 + i)) };
    r = mitGeraet(r, geraet('g3aa', 0), 100);
    assert.equal(r.geraete.length, MAX_GERAETE);
    assert.equal(r.geraete.find((g) => g.id === 'g3aa').zuletzt, 100);
    r = mitGeraet(r, { ...geraet('neu1', 0), name: undefined }, 200);
    assert.deepEqual(r.geraete.map((g) => g.id), ['g1aa', 'g2aa', 'g4aa', 'g5aa', 'g3aa', 'neu1']);
    assert.equal(r.geraete.at(-1).name, '');
  });

  test('ohneGeraet, bereinige, registerText', () => {
    const r = { ...neuesRegister(), geraete: [geraet('a1a1', 1), geraet('b2b2', 2), geraet('c3c3', 3)] };
    assert.deepEqual(ohneGeraet(r, 'b2b2').geraete.map((g) => g.id), ['a1a1', 'c3c3']);
    assert.deepEqual(bereinige(r, ['a1a1', 'c3c3']).geraete.map((g) => g.id), ['b2b2']);
    assert.deepEqual(JSON.parse(registerText(r)), r);
    assert.throws(() => registerText({ ...r, geraete: Array.from({ length: 40 }, (_, i) => geraet(`x${i}xx`, i)) }), /Geräte-Register ist zu lang/);
  });
});
