// Push-Erinnerungen „nur an wer bringt bzw. holt“: `nur` im Plan, Auswahl der Telefone, Fingerabdruck, Register und Abgleich.
// Ausführen: node --test tests/unit/push-dienst.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planeErinnerungen } from '../../src/push/plan.js';
import { baueMeldungen, fuerGeraet, planDigest } from '../../src/push/meldungen.js';
import { mitGeraet, neuesRegister, normalisiereRegister } from '../../src/push/geraete.js';
import { createPush } from '../../src/push/client.js';
import { bytesZuB64u } from '../../src/push/base64url.js';
import { normalizeSettings } from '../../src/domain/settings.js';
import { leeresKonto } from '../../src/domain/konto.js';
import { instantZuWien } from '../../src/domain/instant.js';

// Montag 12.10.2026, 10:00 in Wien. Dienstag 13.10.: Sachen hinbringen 07:30 und heimholen 15:30; Mittwoch: Kinderarzt.
const JETZT = new Date('2026-10-12T08:00:00Z');
const MO = '2026-10-12';
const DI = '2026-10-13';

const termine = [
  { id: 'hin1', typ: 'kita_sache', date: DI, time: '07:30', richtung: 'hin', mitnehmen: ['Pyjamas'] },
  { id: 'heim1', typ: 'kita_sache', date: DI, time: '15:30', richtung: 'heim', mitnehmen: ['Wäsche'] },
  { id: 'arzt1', typ: 'arzt', subtyp: 'kinderarzt', date: '2026-10-14', time: '10:00', mitnehmen: ['e-card'] },
];

/** Montag bringt Mama, Dienstag Papa; Dienstag holt Mama. */
function zustand(extra = {}) {
  const settings = normalizeSettings({
    dienstplan: { b: ['mama', 'papa', 'papa', 'papa', 'papa', '', ''], h: ['papa', 'mama', 'mama', 'mama', 'mama', '', ''] },
    ...extra,
  });
  return { geladen: true, nurSnapshot: false, settings, tage: {}, urlaub: [], termine, konto: leeresKonto() };
}

const plane = (state) => planeErinnerungen(state, { jetzt: JETZT, tage: 60 });

test('plan: „An beide“ (Standard) – keine Erinnerung hat `nur`', async () => {
  const plan = await plane(zustand());
  assert.ok(plan.length > 0);
  assert.ok(plan.every((p) => !('nur' in p)));
});

test('plan: „Nur an wer bringt bzw. holt“ – Hinbringen an wer bringt, Heimholen an wer holt', async () => {
  const plan = await plane(zustand({ dienstErinnerung: 'dienst' }));
  const sachen = plan.filter((p) => p.titel.startsWith('👕'));
  const hin = sachen.filter((p) => !p.titel.toLowerCase().includes('heim'));
  const heim = sachen.filter((p) => p.titel.toLowerCase().includes('heim'));
  assert.deepEqual(hin.map((p) => p.art).sort(), ['abend', 'stunde']);
  assert.deepEqual(heim.map((p) => p.art).sort(), ['stunde', 'tag']);
  for (const p of hin) assert.equal(p.nur, 'papa', `hin/${p.art}`);
  for (const p of heim) assert.equal(p.nur, 'mama', `heim/${p.art}`);
  const andere = plan.filter((p) => !p.titel.startsWith('👕'));
  assert.ok(andere.some((p) => p.titel.includes('Kinderarzt')) && andere.some((p) => p.titel.includes('Kontostand')));
  assert.ok(andere.every((p) => !('nur' in p)), 'Arzt, Termine und Kontostand gehen an alle');
});

test('plan: der Vorabend gehört dem, der am nächsten Tag bringt (nicht dem vom Abend)', async () => {
  const plan = await plane(zustand({ dienstErinnerung: 'dienst' }));
  const abend = plan.find((p) => p.art === 'abend');
  assert.equal(instantZuWien(abend.um).date, MO, 'die Erinnerung kommt Montagabend');
  assert.equal(abend.nur, 'papa', 'Montag bringt Mama, aber Dienstag (der Tag der Sachen) Papa');
});

test('plan: Ausnahme für den Tag zählt; niemand eingetragen = an alle', async () => {
  const mitAusnahme = await plane(zustand({ dienstErinnerung: 'dienst', dienstAusnahmen: { [DI]: { b: 'mama', h: '' } } }));
  const sachen = mitAusnahme.filter((p) => p.titel.startsWith('👕'));
  for (const p of sachen.filter((x) => !x.titel.toLowerCase().includes('heim'))) assert.equal(p.nur, 'mama');
  for (const p of sachen.filter((x) => x.titel.toLowerCase().includes('heim'))) assert.ok(!('nur' in p), 'niemand holt: an alle');
});

test('plan: `nur` ändert weder Kennung noch Zeitpunkt oder Text', async () => {
  const beide = await plane(zustand());
  const dienst = await plane(zustand({ dienstErinnerung: 'dienst' }));
  assert.deepEqual(
    dienst.map(({ nur, ...rest }) => rest),
    beide,
  );
});

test('fuerGeraet: Telefone ohne Angabe bekommen alles, sonst nur die eigenen', () => {
  const ohne = { id: 'g0' };
  const papa = { id: 'g1', person: 'papa' };
  const mama = { id: 'g2', person: 'mama' };
  assert.equal(fuerGeraet({ id: 'a' }, papa), true);
  assert.equal(fuerGeraet({ id: 'a', nur: 'papa' }, ohne), true);
  assert.equal(fuerGeraet({ id: 'a', nur: 'papa' }, papa), true);
  assert.equal(fuerGeraet({ id: 'a', nur: 'papa' }, mama), false);
  assert.equal(fuerGeraet({ id: 'a', nur: 'mama' }, mama), true);
});

async function testGeraet(id, person) {
  const paar = await globalThis.crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const p256dh = bytesZuB64u(new Uint8Array(await globalThis.crypto.subtle.exportKey('raw', paar.publicKey)));
  const auth = bytesZuB64u(globalThis.crypto.getRandomValues(new Uint8Array(16)));
  return { id, name: id, endpoint: `https://push.example/${id}`, p256dh, auth, zuletzt: JETZT.getTime(), ...(person ? { person } : {}) };
}

test('baueMeldungen: Erinnerungen mit `nur` nur an passende Telefone und an Telefone ohne Angabe', async () => {
  const geraete = [await testGeraet('ohne1'), await testGeraet('papa1', 'papa'), await testGeraet('mama1', 'mama')];
  const plan = [
    { id: 'alle', um: 1, titel: 'Arzt', text: 'x', ttl: 60 },
    { id: 'hin', um: 2, titel: 'Hin', text: 'y', ttl: 60, nur: 'papa' },
    { id: 'heim', um: 3, titel: 'Heim', text: 'z', ttl: 60, nur: 'mama' },
  ];
  const items = await baueMeldungen(plan, geraete);
  const fuer = (an) => items.filter((i) => i.an === an).map((i) => i.id).sort();
  assert.deepEqual(fuer('ohne1'), ['alle', 'heim', 'hin']);
  assert.deepEqual(fuer('papa1'), ['alle', 'hin']);
  assert.deepEqual(fuer('mama1'), ['alle', 'heim']);
  assert.ok(items.every((i) => typeof i.body === 'string' && i.body.length > 0));
});

test('planDigest: ändert sich, wenn sich die Empfänger ändern; ohne die neuen Felder wie bisher', async () => {
  const g = await testGeraet('g1');
  const plan = [{ id: 'a', um: 1, titel: 't', text: 'k', ttl: 1 }];
  const basis = await planDigest('fid', plan, [g]);
  assert.equal(await planDigest('fid', plan, [{ ...g }]), basis, 'gleicher Inhalt, gleicher Fingerabdruck');

  // wie bisher in client.js berechnet: bestehende Telefone schicken nach dem Update nicht alles neu
  const bisher = bytesZuB64u(
    new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ f: 'fid', g: [[g.id, g.endpoint, g.p256dh, g.auth]], p: [[plan[0].id, plan[0].um, plan[0].titel, plan[0].text]] })))).slice(0, 16),
  );
  assert.equal(basis, bisher);

  const mitNur = await planDigest('fid', [{ ...plan[0], nur: 'papa' }], [g]);
  const mitPerson = await planDigest('fid', plan, [{ ...g, person: 'papa' }]);
  const andererPerson = await planDigest('fid', plan, [{ ...g, person: 'mama' }]);
  const nurMama = await planDigest('fid', [{ ...plan[0], nur: 'mama' }], [g]);
  assert.equal(new Set([basis, mitNur, mitPerson, andererPerson, nurMama]).size, 5);
});

test('Register: `person` bleibt erhalten, Unbekanntes kostet nur die Angabe, nicht das Telefon', async () => {
  const reg = neuesRegister();
  const a = await testGeraet('papaTel1', 'papa');
  const b = { ...(await testGeraet('omaTel01')), person: 'oma' };
  const c = await testGeraet('ohneTel1');
  const gelesen = normalisiereRegister(JSON.parse(JSON.stringify({ ...reg, geraete: [a, b, c] })));
  assert.deepEqual(gelesen.geraete.map((g) => [g.id, g.person]), [['papaTel1', 'papa'], ['omaTel01', undefined], ['ohneTel1', undefined]]);
  assert.ok(!('person' in gelesen.geraete[2]), 'ohne Angabe kein leeres Feld');

  const mit = mitGeraet(gelesen, { ...c, person: 'mama' }, 5);
  assert.equal(mit.geraete.find((g) => g.id === 'ohneTel1').person, 'mama');
  const ohne = mitGeraet(mit, { ...c, person: '' }, 6);
  assert.ok(!('person' in ohne.geraete.find((g) => g.id === 'ohneTel1')));
  assert.equal(ohne.geraete.find((g) => g.id === 'papaTel1').person, 'papa', 'andere Telefone bleiben unverändert');
});

/** createPush mit nachgebauten Teilen: Speicher, Abonnement, Register im „Kalender“ und Push-Dienst (merkt sich die PUTs). */
async function aufbau({ person = '', eigenePerson, state = zustand({ dienstErinnerung: 'dienst' }) } = {}) {
  const daten = new Map([['fk.push.geraet.v1', 'eigenTel1'], ['fk.push.aktiv.v1', '1']]);
  if (person) daten.set('fk.push.person.v1', person);
  const speicher = { getItem: (k) => daten.get(k) ?? null, setItem: (k, v) => daten.set(k, String(v)), removeItem: (k) => daten.delete(k) };
  const eigen = await testGeraet('eigenTel1', eigenePerson);
  const anderes = await testGeraet('mamaTel1', 'mama');
  let register = { ...neuesRegister(), geraete: [eigen, anderes] };
  const schreiben = [];
  const adapter = {
    leseGeraete: async () => ({ register: normalisiereRegister(structuredClone(register)) }),
    aendereGeraete: async (aenderung) => {
      const neu = aenderung(normalisiereRegister(structuredClone(register)));
      schreiben.push(neu);
      register = normalisiereRegister(JSON.parse(JSON.stringify(neu)));
      return register;
    },
  };
  const anfragen = [];
  const fetch = async (url, init) => {
    anfragen.push({ url, body: JSON.parse(init.body) });
    return { ok: true, status: 200, json: async () => ({ geschrieben: 1, geloescht: 0 }) };
  };
  const sub = { toJSON: () => ({ endpoint: eigen.endpoint, keys: { p256dh: eigen.p256dh, auth: eigen.auth } }), unsubscribe: async () => {} };
  const navigator = { serviceWorker: { ready: Promise.resolve({ pushManager: { getSubscription: async () => sub } }) } };
  let geplant = null;
  const push = createPush({
    store: { getState: () => state },
    adapter,
    config: { dienst: 'https://dienst.example', vapidPublic: 'x' },
    fetch,
    navigator,
    Notification: { permission: 'granted' },
    speicher,
    umgebung: { ios: false, installiert: true, pushUnterstuetzt: true, name: 'Android' },
    jetzt: () => JETZT,
    zeitgeber: { setze: (f) => ((geplant = f), 1), loesche: () => {} },
  });
  return { push, speicher, schreiben, anfragen, register: () => register, geplant: () => geplant };
}

test('sync: trägt die Person dieses Telefons wieder ein, wenn eine ältere Version sie verloren hat', async () => {
  const t = await aufbau({ person: 'papa' }); // im Register fehlt `person` (ältere Version hat es umgeschrieben)
  const r = await t.push.sync();
  assert.equal(r.art, 'gesendet');
  assert.equal(t.schreiben.length, 1, 'genau ein Schreiben ins Register');
  assert.equal(t.register().geraete.find((g) => g.id === 'eigenTel1').person, 'papa');
  assert.equal(t.register().geraete.find((g) => g.id === 'mamaTel1').person, 'mama', 'das andere Telefon behält seine Angabe');

  const { items } = t.anfragen[0].body;
  const ids = (an) => new Set(items.filter((i) => i.an === an).map((i) => i.id));
  const plan = await plane(zustand({ dienstErinnerung: 'dienst' }));
  const hin = plan.filter((p) => p.nur === 'papa').map((p) => p.id);
  const heim = plan.filter((p) => p.nur === 'mama').map((p) => p.id);
  assert.ok(hin.length > 0 && heim.length > 0);
  for (const id of hin) assert.ok(ids('eigenTel1').has(id) && !ids('mamaTel1').has(id), 'Hinbringen nur an Papas Telefon');
  for (const id of heim) assert.ok(ids('mamaTel1').has(id) && !ids('eigenTel1').has(id), 'Heimholen nur an Mamas Telefon');
  for (const p of plan.filter((x) => !x.nur)) assert.ok(ids('eigenTel1').has(p.id) && ids('mamaTel1').has(p.id), 'alles andere an beide');

  assert.equal((await t.push.sync()).art, 'unveraendert', 'nichts geändert: kein neuer Abgleich');
});

test('sync: Person geändert → Register, Fingerabdruck und Meldungen ändern sich', async () => {
  const t = await aufbau({ person: 'papa', eigenePerson: 'papa' });
  assert.equal((await t.push.sync()).art, 'gesendet');
  assert.equal(t.schreiben.length, 0, 'Register stimmt schon');
  const vorher = t.speicher.getItem('fk.push.digest.v1');

  t.push.setzePerson('mama');
  assert.equal(t.push.person(), 'mama');
  assert.equal(t.speicher.getItem('fk.push.person.v1'), 'mama');
  assert.equal(typeof t.geplant(), 'function', 'ein Abgleich wird angestoßen');
  await t.geplant()();
  assert.equal(t.schreiben.length, 1);
  assert.equal(t.register().geraete.find((g) => g.id === 'eigenTel1').person, 'mama');
  assert.notEqual(t.speicher.getItem('fk.push.digest.v1'), vorher);
  assert.equal(t.anfragen.length, 2);
  const ids = new Set(t.anfragen[1].body.items.filter((i) => i.an === 'eigenTel1').map((i) => i.id));
  const plan = await plane(zustand({ dienstErinnerung: 'dienst' }));
  assert.ok(plan.filter((p) => p.nur === 'papa').every((p) => !ids.has(p.id)));
  assert.ok(plan.filter((p) => p.nur === 'mama').every((p) => ids.has(p.id)));

  t.push.setzePerson('');
  assert.equal(t.push.person(), '');
  assert.equal(t.speicher.getItem('fk.push.person.v1'), null);
  await t.geplant()();
  assert.ok(!('person' in t.register().geraete.find((g) => g.id === 'eigenTel1')), 'keine Angabe: bekommt wieder alles');
  assert.ok(plan.every((p) => t.anfragen[2].body.items.some((i) => i.an === 'eigenTel1' && i.id === p.id)));
});

test('sync: ohne Angabe auf beiden Seiten bleibt das Register unberührt', async () => {
  const t = await aufbau({ person: '' });
  assert.equal((await t.push.sync()).art, 'gesendet');
  assert.equal(t.schreiben.length, 0);
  t.speicher.setItem('fk.push.person.v1', 'opa');
  assert.equal(t.push.person(), '', 'Unbekanntes im Speicher zählt als keine Angabe');
});
