// Blätter und Browser-Verlauf (T7 B6+B7): „Zurück“ schließt nur das oberste Blatt, ✕ hinterlässt keinen toten Eintrag,
// Navigation aus einem Blatt schließt es. Mit einer Attrappe von `history` (Einträge + Stelle; `go` läuft später und meldet popstate).
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { blattAbgleich, createBlattVerlauf, nachDemLaden, tiefeAus } from '../../src/app/blatt-verlauf.js';

/** Attrappe von `history`: `go` wie im Browser erst später (eigener Schritt), danach popstate an `beiPopstate`. */
function attrappe({ laenge = 1 } = {}) {
  const v = {
    eintraege: Array.from({ length: laenge }, () => ({ state: null, url: '#/monat' })),
    stelle: laenge - 1,
    gos: [],
    pushs: 0,
    replaces: 0,
    beiPopstate: () => {},
    get state() {
      return v.eintraege[v.stelle].state;
    },
    get length() {
      return v.eintraege.length;
    },
    get url() {
      return v.eintraege[v.stelle].url;
    },
    pushState(state, _titel, url = v.url) {
      v.pushs += 1;
      v.eintraege.splice(v.stelle + 1, Infinity, { state, url });
      v.stelle += 1;
    },
    replaceState(state, _titel, url = v.url) {
      v.replaces += 1;
      v.eintraege[v.stelle] = { state, url };
    },
    // wie Chrome und WebKit: das Ziel steht beim Aufruf fest (Stelle + d), auch wenn bis zum Sprung noch navigiert wird
    go(d) {
      v.gos.push(d);
      const ziel = v.stelle + d;
      setTimeout(() => {
        v.stelle = Math.max(0, Math.min(v.eintraege.length - 1, ziel));
        v.beiPopstate(v.state);
      }, 0);
    },
    back() {
      v.go(-1);
    },
    /** Hash-Navigation (`location.hash = …`): neuer Eintrag ohne Zustand, sofort – und wie in Chrome/WebKit gleich ein popstate (Zustand null). */
    navigiere(url) {
      v.eintraege.splice(v.stelle + 1, Infinity, { state: null, url });
      v.stelle += 1;
      v.beiPopstate(v.state);
    },
  };
  return v;
}
/** alle anstehenden Rücksprünge (je ein Zeitgeber, auch hintereinander) ablaufen lassen */
const ruhe = async () => {
  for (let i = 0; i < 6; i += 1) await new Promise((r) => setTimeout(r, 1));
};

function aufbau(opts) {
  const verlauf = attrappe(opts);
  const bv = createBlattVerlauf({ verlauf, sitzung: 'sitz', adresse: () => verlauf.url, gehe: (url) => verlauf.navigiere(url) });
  verlauf.beiPopstate = (s) => bv.beiPopstate(s);
  const blatt = (name) => {
    const e = { name, offen: true, zuZahl: 0, zu() { if (!e.offen) return; e.offen = false; e.zuZahl += 1; } };
    bv.geoeffnet(e);
    return e;
  };
  /** wie ✕ in blatt(): erst dem Verlauf melden, dann zu. */
  const schliesse = (e) => {
    bv.geschlossen(e);
    e.zu();
  };
  return { verlauf, bv, blatt, schliesse };
}

test('blattAbgleich', () => {
  assert.deepEqual(blattAbgleich({ tiefe: 1, offen: 2 }), { schliessen: 1, zurueck: 0 });
  assert.deepEqual(blattAbgleich({ tiefe: 0, offen: 2 }), { schliessen: 2, zurueck: 0 });
  assert.deepEqual(blattAbgleich({ tiefe: 3, offen: 1 }), { schliessen: 0, zurueck: 2 });
  assert.deepEqual(blattAbgleich({ tiefe: 2, offen: 2 }), { schliessen: 0, zurueck: 0 });
});

test('tiefeAus: fremde Sitzung oder kein Zustand → 0', () => {
  assert.equal(tiefeAus({ fkBlatt: 2, s: 'x' }, 'y'), 0);
  assert.equal(tiefeAus(null, 'y'), 0);
  assert.equal(tiefeAus(undefined, 'y'), 0);
  assert.equal(tiefeAus({ fkBlatt: 0, s: 'y' }, 'y'), 0);
  assert.equal(tiefeAus({ fkBlatt: 1.5, s: 'y' }, 'y'), 0);
  assert.equal(tiefeAus({ fkBlatt: 2, s: 'y' }, 'y'), 2);
});

test('Öffnen legt einen Eintrag mit Tiefe und Sitzung an (gleiche Adresse)', () => {
  const { verlauf, bv, blatt } = aufbau();
  blatt('a');
  blatt('b');
  assert.deepEqual(verlauf.state, { fkBlatt: 2, s: 'sitz' });
  assert.equal(verlauf.length, 3);
  assert.equal(verlauf.url, '#/monat');
  assert.equal(bv.anzahl(), 2);
  assert.equal(bv.oberstes().name, 'b');
});

test('Zurück schließt nur das oberste von zwei Blättern', async () => {
  const { verlauf, bv, blatt } = aufbau();
  const a = blatt('a');
  const b = blatt('b');
  const laenge = verlauf.length;
  verlauf.back();
  await ruhe();
  assert.equal(b.offen, false);
  assert.equal(a.offen, true);
  assert.equal(bv.anzahl(), 1);
  assert.equal(bv.oberstes(), a);
  assert.equal(verlauf.length, laenge);
  assert.deepEqual(verlauf.gos, [-1]); // nur das Zurück selbst, kein weiteres go
  verlauf.back();
  await ruhe();
  assert.equal(a.offen, false);
  assert.equal(bv.anzahl(), 0);
  assert.equal(verlauf.stelle, 0);
});

test('Schließen mit ✕ verbraucht den eigenen Eintrag (kein toter Eintrag)', async () => {
  const { verlauf, bv, blatt, schliesse } = aufbau();
  const a = blatt('a');
  schliesse(a);
  await ruhe();
  assert.deepEqual(verlauf.gos, [-1]);
  assert.equal(verlauf.stelle, 0);
  assert.equal(verlauf.state, null);
  assert.equal(bv.anzahl(), 0);
  assert.equal(a.zuZahl, 1);
  // ein zweites Schließen ändert nichts
  schliesse(a);
  await ruhe();
  assert.deepEqual(verlauf.gos, [-1]);
});

test('zwei Schließungen im selben Schritt → ein go(-2)', async () => {
  const { verlauf, bv, blatt, schliesse } = aufbau();
  const a = blatt('a');
  const b = blatt('b');
  schliesse(b);
  schliesse(a);
  await ruhe();
  assert.deepEqual(verlauf.gos, [-2]);
  assert.equal(verlauf.stelle, 0);
  assert.equal(bv.anzahl(), 0);
});

test('Schließen und sofort neu öffnen (Speichern → Bestätigung) → replaceState statt push, Länge +1', async () => {
  const { verlauf, bv, blatt, schliesse } = aufbau();
  const vorher = verlauf.length;
  const formular = blatt('formular');
  const pushsVorher = verlauf.pushs;
  schliesse(formular);
  const bestaetigung = blatt('bestaetigung');
  await ruhe();
  assert.equal(verlauf.pushs, pushsVorher); // kein neuer Eintrag
  assert.equal(verlauf.replaces, 1);
  assert.deepEqual(verlauf.gos, []); // der Eintrag des Formulars gehört jetzt der Bestätigung
  assert.equal(verlauf.length, vorher + 1);
  assert.deepEqual(verlauf.state, { fkBlatt: 1, s: 'sitz' });
  assert.equal(bv.oberstes(), bestaetigung);
  verlauf.back(); // ein Zurück schließt die Bestätigung, die Seite bleibt
  await ruhe();
  assert.equal(bestaetigung.offen, false);
  assert.equal(verlauf.stelle, 0);
  assert.deepEqual(verlauf.gos, [-1]);
});

test('schließen und im selben Schritt navigieren: kein go (Pre-flight P4)', async () => {
  const { verlauf, bv, blatt, schliesse } = aufbau();
  const a = blatt('a');
  schliesse(a);
  verlauf.navigiere('#/neu'); // ui.neuTerminStarten → location.hash, noch vor dem geplanten go
  await ruhe();
  assert.deepEqual(verlauf.gos, []); // die Navigation wird nicht zurückgenommen
  assert.equal(verlauf.url, '#/neu');
  bv.beiHashwechsel();
  // späteres Zurück: landet auf dem toten Eintrag des Blatts und springt über ihn zur Seite davor
  verlauf.back();
  await ruhe();
  assert.deepEqual(verlauf.gos, [-1, -1]);
  assert.equal(verlauf.stelle, 0);
  assert.equal(verlauf.url, '#/monat');
  assert.equal(bv.anzahl(), 0);
});

test('Hashwechsel schließt alle; späteres Zurück überspringt die toten Einträge', async () => {
  const { verlauf, bv, blatt } = aufbau();
  const a = blatt('a');
  const b = blatt('b');
  verlauf.navigiere('#/neu');
  bv.beiHashwechsel();
  assert.equal(bv.anzahl(), 0);
  assert.equal(a.offen, false);
  assert.equal(b.offen, false);
  assert.deepEqual(verlauf.gos, []); // kein go beim Hashwechsel
  verlauf.back(); // auf Tiefe 2 (tot): springt um 2 zurück
  await ruhe();
  assert.deepEqual(verlauf.gos, [-1, -2]);
  assert.equal(verlauf.stelle, 0);
  assert.equal(verlauf.state, null);
});

test('Erstes Blatt nach Kaltstart (Länge 1): Zurück schließt es, die Seite bleibt (Review Focus 1)', async () => {
  const { verlauf, bv, blatt } = aufbau({ laenge: 1 });
  const a = blatt('a');
  assert.equal(verlauf.length, 2);
  verlauf.back();
  await ruhe();
  assert.equal(a.offen, false);
  assert.equal(bv.anzahl(), 0);
  assert.equal(verlauf.stelle, 0); // auf der Seite geblieben (der Eintrag bleibt nur als „Vorwärts“)
  assert.equal(verlauf.url, '#/monat');
  assert.deepEqual(verlauf.gos, [-1]); // kein weiteres go
});

test('ohne offenes Blatt wird auch ein Eintrag einer früheren Sitzung (nach Neuladen) übersprungen – kein toter Zurück-Druck', async () => {
  const { verlauf, bv } = aufbau({ laenge: 1 });
  verlauf.pushState({ fkBlatt: 1, s: 'alt' }, '');
  verlauf.navigiere('#/neu');
  verlauf.back(); // landet auf dem fremden Eintrag (Tiefe 1) über #/monat
  await ruhe();
  assert.deepEqual(verlauf.gos, [-1, -1]);
  assert.equal(verlauf.stelle, 0);
  assert.equal(verlauf.state, null);
  assert.equal(bv.anzahl(), 0);
});

test('mit offenem Blatt zählt ein fremder Eintrag als Seite: Zurück darauf schließt das Blatt, kein weiteres go', async () => {
  const { verlauf, bv, blatt } = aufbau({ laenge: 1 });
  verlauf.replaceState({ fkBlatt: 1, s: 'alt' }, '');
  const a = blatt('a');
  verlauf.back();
  await ruhe();
  assert.equal(a.offen, false);
  assert.equal(bv.anzahl(), 0);
  assert.deepEqual(verlauf.gos, [-1]);
});

test('App-Start auf einem Blatt-Eintrag (PWA neu geladen): einmal um dessen Tiefe zurück, dann zählt jedes Zurück', async () => {
  const verlauf = attrappe({ laenge: 1 });
  verlauf.pushState({ fkBlatt: 1, s: 'alt' }, '');
  verlauf.pushState({ fkBlatt: 2, s: 'alt' }, '');
  const bv = createBlattVerlauf({ verlauf, sitzung: 'neu', adresse: () => verlauf.url });
  verlauf.beiPopstate = (s) => bv.beiPopstate(s);
  bv.beimStart();
  await ruhe();
  assert.deepEqual(verlauf.gos, [-2]);
  assert.equal(verlauf.stelle, 0);
  assert.equal(verlauf.state, null);
  // ohne Blatt-Eintrag beim Start: nichts
  const leer = attrappe({ laenge: 1 });
  createBlattVerlauf({ verlauf: leer, sitzung: 'neu' }).beimStart();
  await ruhe();
  assert.deepEqual(leer.gos, []);
});

test('während ein go unterwegs ist geöffnetes Blatt bekommt danach seinen Eintrag', async () => {
  const { verlauf, bv, blatt, schliesse } = aufbau();
  const a = blatt('a');
  schliesse(a);
  await Promise.resolve(); // geplantes go läuft (Mikroaufgabe), Rücksprung noch unterwegs
  assert.deepEqual(verlauf.gos, [-1]);
  const b = blatt('b');
  await ruhe();
  assert.equal(bv.anzahl(), 1);
  assert.deepEqual(verlauf.state, { fkBlatt: 1, s: 'sitz' });
  assert.equal(verlauf.length, 2);
  verlauf.back();
  await ruhe();
  assert.equal(b.offen, false);
  assert.equal(verlauf.stelle, 0);
});

test('Navigation, während das eigene go noch läuft (Speichern → await → gehZu): wird nach dem Rücksprung wiederholt', async () => {
  const { verlauf, bv, blatt, schliesse } = aufbau();
  verlauf.eintraege[0].url = '#/autos/x';
  const formular = blatt('formular');
  const frage = blatt('frage');
  schliesse(frage);
  await Promise.resolve(); // go(-1) ist unterwegs
  assert.deepEqual(verlauf.gos, [-1]);
  schliesse(formular); // nach dem await: das Formular zu …
  verlauf.navigiere('#/autos'); // … und gleich zur Liste
  await ruhe();
  assert.equal(verlauf.url, '#/autos'); // die Navigation bleibt
  assert.equal(bv.anzahl(), 0);
  assert.equal(formular.offen, false);
  // ein Zurück: über den toten Eintrag zur Seite davor
  verlauf.back();
  await ruhe();
  assert.equal(verlauf.url, '#/autos/x');
  assert.equal(verlauf.state, null);
});

test('vorzeitiges popstate ohne Sprung (Chrome, Doppeltipp) während das eigene go läuft: kein zweites go', async () => {
  const { verlauf, bv, blatt, schliesse } = aufbau();
  const formular = blatt('formular');
  const frage = blatt('frage');
  schliesse(frage);
  await Promise.resolve(); // go(-1) unterwegs
  schliesse(formular); // nach dem Löschen: auch das Formular zu
  bv.beiPopstate(verlauf.state); // Ereignis vor dem Sprung, Zustand noch Tiefe 2
  await ruhe();
  assert.equal(verlauf.stelle, 0); // auf der Seite, nicht darüber hinaus
  assert.equal(verlauf.state, null);
  assert.deepEqual(verlauf.gos, [-1, -1]);
});

test('popstate ohne Sprung, bevor das geplante go läuft: trotzdem nur ein go', async () => {
  const { verlauf, bv, blatt, schliesse } = aufbau();
  const a = blatt('a');
  schliesse(a);
  bv.beiPopstate(verlauf.state); // noch im selben Schritt, Zustand Tiefe 1
  await ruhe();
  assert.deepEqual(verlauf.gos, [-1]);
  assert.equal(verlauf.stelle, 0);
});

/**
 * Wächter-Aufbau mit Schein-Zeitgebern: Blatt „a“ auf, ✕, der Browser verschluckt das go (kein Sprung, kein popstate).
 * `zwischendurch(t)` läuft nach 799 ms (noch unterwegs); dann schlägt der Wächter an und `go` arbeitet wieder.
 */
async function mitVerschlucktemGo(pruefe, zwischendurch = () => {}) {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const t = aufbau();
    const echtesGo = t.verlauf.go;
    t.verlauf.go = (d) => t.verlauf.gos.push(d);
    t.schliesse(t.blatt('a'));
    await Promise.resolve(); // geplantes go läuft
    assert.deepEqual(t.verlauf.gos, [-1]);
    mock.timers.tick(799);
    const extra = zwischendurch(t);
    mock.timers.tick(1); // Wächter
    t.verlauf.go = echtesGo;
    /** ein Zurück; danach ist nur `b` zu, die Seite bleibt */
    t.zurueckSchliesst = (b) => {
      t.verlauf.back();
      mock.timers.tick(0);
      assert.equal(b.offen, false);
      assert.equal(t.bv.anzahl(), 0);
      assert.equal(t.verlauf.url, '#/monat');
      assert.equal(t.verlauf.state, null);
    };
    pruefe(t, extra);
  } finally {
    mock.timers.reset();
  }
}

test('Wächter: kommt der eigene Rücksprung nie an, ist der Verlauf nach 800 ms wieder im Takt – Zurück schließt nur das Blatt, die Seite bleibt', async () => {
  await mitVerschlucktemGo(
    ({ verlauf, blatt, zurueckSchliesst }, b) => {
      // jetzt stimmt die Tiefe des aktuellen Eintrags wieder mit den offenen Blättern überein
      assert.deepEqual(verlauf.state, { fkBlatt: 1, s: 'sitz' });
      zurueckSchliesst(b);
      assert.deepEqual(verlauf.gos, [-1, -1]); // kein weiteres go
      // ein neues Blatt bekommt wieder seinen Eintrag (nicht mehr „unterwegs“)
      const c = blatt('c');
      assert.deepEqual(verlauf.state, { fkBlatt: 1, s: 'sitz' });
      zurueckSchliesst(c);
    },
    ({ verlauf, blatt }) => {
      const b = blatt('b'); // noch unterwegs: bekommt (noch) keinen Eintrag
      assert.equal(verlauf.length, 2);
      return b;
    },
  );
});

test('Wächter: hängt der Verlauf über den offenen Blättern, wird der Eintrag zur Seite – Zurück schließt danach nur das neue Blatt', async () => {
  await mitVerschlucktemGo(({ verlauf, blatt, zurueckSchliesst }) => {
    assert.equal(verlauf.state, null); // Eintrag umgeschrieben: Tiefe 0 wie keine offenen Blätter
    zurueckSchliesst(blatt('b'));
  });
});

// WebKit (Safari/iPhone): ein history.go() vor dem `load` bricht das Laden des Dokuments ab – `load` und `pageshow` kommen nie,
// ein noch laufender Parser bleibt stehen. Der Rücksprung beim Start wartet deshalb auf `load`.
test('nachDemLaden: vor dem Laden erst beim Ereignis „load“ (einmal), danach sofort', () => {
  const hoerer = [];
  const fenster = { addEventListener: (art, fn, opt) => hoerer.push({ art, fn, opt }) };
  const dokument = { readyState: 'interactive' };
  const fn = mock.fn();
  nachDemLaden({ dokument, fenster }, fn);
  assert.equal(fn.mock.callCount(), 0);
  assert.equal(hoerer.length, 1);
  assert.equal(hoerer[0].art, 'load');
  assert.deepEqual(hoerer[0].opt, { once: true });
  hoerer[0].fn();
  assert.equal(fn.mock.callCount(), 1);
  // schon geladen: gleich, ohne Hörer
  const fertig = mock.fn();
  nachDemLaden({ dokument: { readyState: 'complete' }, fenster }, fertig);
  assert.equal(fertig.mock.callCount(), 1);
  assert.equal(hoerer.length, 1);
});
