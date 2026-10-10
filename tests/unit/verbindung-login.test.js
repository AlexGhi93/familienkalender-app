// Texte der Verbindung mit Login-Dienst (src/app/views/verbindung-model.js); ohne Dienst bleiben sie wie bisher.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anmeldeHinweis, stillSichtbar, verbindungsModel } from '../../src/app/views/verbindung-model.js';

const geladen = { geladen: true, nurSnapshot: false, anmeldungNoetig: false, stand: null };
const snapshot = { geladen: true, nurSnapshot: true, anmeldungNoetig: true, stand: '2026-10-09T18:00:00.000Z' };
const ruhig = { laeuft: false, fehler: null };
const TIPP_ALT = 'Die Anmeldung gilt eine Stunde. Nach dem Öffnen der App einmal „Verbinden“ tippen; Änderungen ohne Anmeldung warten und werden danach gesendet.';
const TIPP_NEU = 'Einmal anmelden – danach bleibt dieses Telefon angemeldet. Änderungen ohne Verbindung warten und werden danach gesendet.';

test('Ohne Login-Dienst (login fehlt oder null): dieselben Texte wie bisher', () => {
  const faelle = [
    { state: geladen, status: 'verbunden', restMs: 30 * 60_000, verbindung: ruhig },
    { state: snapshot, status: 'getrennt', restMs: null, verbindung: ruhig },
    { state: geladen, status: 'abgelaufen', restMs: 0, verbindung: { laeuft: false, fehler: 'x' }, ausstehend: 2 },
    { state: geladen, status: 'verbunden', restMs: 5 * 60_000, bald: true, verbindung: ruhig },
    { state: snapshot, status: 'getrennt', restMs: null, verbindung: { laeuft: true, fehler: null } },
  ];
  for (const f of faelle) assert.deepEqual(verbindungsModel({ ...f, login: null }), verbindungsModel(f));
  assert.equal(verbindungsModel(faelle[0]).karte.statusText, '✅ Verbunden · Anmeldung noch 30 Min');
  assert.ok(verbindungsModel(faelle[1]).karte.zeilen.includes(TIPP_ALT));
  assert.equal(anmeldeHinweis(null), '');
});

test('Mit Login-Dienst: „bleibt angemeldet“ statt Restzeit, passender Tipp', () => {
  const verbunden = verbindungsModel({ state: geladen, status: 'verbunden', restMs: 30 * 60_000, verbindung: ruhig, login: { dauerhaft: true, still: false } });
  assert.equal(verbunden.banner, null);
  assert.equal(verbunden.karte.statusText, '✅ Verbunden · Dieses Telefon bleibt angemeldet');
  // eingerichtet, aber dieses Telefon (noch) ohne Sitzung: Restzeit wie bisher, Tipp neu
  const ohne = verbindungsModel({ state: geladen, status: 'verbunden', restMs: 30 * 60_000, verbindung: ruhig, login: { dauerhaft: false, still: false } });
  assert.equal(ohne.karte.statusText, '✅ Verbunden · Anmeldung noch 30 Min');
  const getrennt = verbindungsModel({ state: snapshot, status: 'getrennt', restMs: null, verbindung: ruhig, login: { dauerhaft: false, still: false } });
  assert.ok(getrennt.karte.zeilen.includes(TIPP_NEU));
  assert.ok(!getrennt.karte.zeilen.includes(TIPP_ALT));
  assert.equal(getrennt.banner.knopf, 'Verbinden');
  assert.equal(anmeldeHinweis({ dauerhaft: false, still: false }), 'Einmal anmelden – danach bleibt dieses Telefon angemeldet.');
});

test('Stille Anmeldung: „Verbinde …“ ohne Knopf und ohne Pop-up-Hinweis, aber nicht solange schon verbunden', () => {
  const login = { dauerhaft: true, still: true };
  const m = verbindungsModel({ state: snapshot, status: 'getrennt', restMs: null, verbindung: { laeuft: false, fehler: 'alter Fehler' }, login });
  assert.deepEqual(m.banner, { emoji: '⏳', text: 'Verbinde mit Google …', knopf: null, fehler: null });
  assert.equal(m.karte.status, 'laeuft');
  // Erneuern im Hintergrund, während die Verbindung steht: nichts flackert
  const v = verbindungsModel({ state: geladen, status: 'verbunden', restMs: 4 * 60_000, verbindung: ruhig, login });
  assert.equal(v.banner, null);
  assert.equal(v.karte.status, 'verbunden');
  assert.equal(stillSichtbar(login, 'verbunden'), false);
  assert.equal(stillSichtbar(login, 'abgelaufen'), true);
  assert.equal(stillSichtbar(null, 'getrennt'), false);
  // ein Tipp läuft (Google-Fenster): der bisherige Text mit Pop-up-Hinweis hat Vorrang
  const tipp = verbindungsModel({ state: snapshot, status: 'getrennt', restMs: null, verbindung: { laeuft: true, fehler: null }, login });
  assert.match(tipp.banner.text, /Pop-ups/);
});

test('Sitzung abgelaufen (401): Banner bietet wieder „Neu anmelden“', () => {
  const m = verbindungsModel({ state: { ...geladen, anmeldungNoetig: true }, status: 'abgelaufen', restMs: null, verbindung: ruhig, login: { dauerhaft: false, still: false } });
  assert.equal(m.banner.knopf, 'Neu anmelden');
  assert.equal(m.karte.status, 'abgelaufen');
});
