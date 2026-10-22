// Alles, was die Seite „Sparziele“ im Konto-Tab braucht, als einfache Daten (ohne DOM): Kopf (zurückgelegt, nötig pro Monat, frei,
// Stand), Karten der laufenden Ziele (Balken, Beträge, Monate, Status), „Frei verfügbar“, Verlauf pro Monat (Ersparnis und Aufteilung),
// abgeschlossene Ziele (Ausblenden, Löschen nur ohne Geld), Sperren und Warnungen; dazu Entwurf, Prüfung und Bedarf-Vorschau des Formulars.
// Gerechnet wird ausschließlich mit src/domain/sparziele.js (sparVerlauf); hier wird nur formatiert.
import { TEXT_ZIELE_GESPERRT, TEXT_ZIELE_NICHT_GELADEN, ZIEL_EMOJIS, sparVerlauf, startMonat, zielLoeschbar, zielPruefen } from '../../domain/sparziele.js';
import { betragText, centsAusText, deltaText, monatVor } from '../../domain/konto.js';
import { MONATE } from '../format-de.js';

/** 'JJJJ-MM' → „Oktober 2026“. */
export const monatText = (jm) => `${MONATE[Number(jm.slice(5, 7)) - 1]} ${jm.slice(0, 4)}`;

const monateText = (n) => (n === 1 ? '1 Monat' : `${n} Monate`);
const prozentText = (p) => `${String(p).replace('.', ',')} %`;

/** Namen der Symbole (für Vorlesen und Auswahl), in der Reihenfolge von ZIEL_EMOJIS; 👧 bekommt den Namen des Kindes. */
export const SYMBOL_NAMEN = Object.freeze(['Auto', 'Urlaub', 'Wohnen', 'Geschenk', 'Kind', 'Schmuck', 'Möbel', 'Ziel', 'Rumänien', 'Reise', 'Technik', 'Weihnachten']);

/** Farben der Balken (der Reihe nach je Ziel), als CSS-Variablen aus theme.css. */
const BALKEN_FARBEN = ['var(--serie-papa)', 'var(--urlaub)', 'var(--kita)', 'var(--abwesend)', 'var(--arzt)', 'var(--serie-mama)'];

function symbole(settings) {
  const kind = String(settings?.kindname ?? '').trim() || 'Kind';
  return ZIEL_EMOJIS.map((emoji, i) => ({ emoji, name: SYMBOL_NAMEN[i] === 'Kind' ? `Für ${kind}` : SYMBOL_NAMEN[i] }));
}

/** „bis Juli 2028“, „bis ca. Juli 2027 · vorläufig“, „bis 15. Aug. 2027“. */
export function zielBisText({ datum, vorlaeufig }) {
  const monat = monatText(datum.slice(0, 7));
  const text = datum.length === 10 ? `${Number(datum.slice(8, 10))}. ${MONATE[Number(datum.slice(5, 7)) - 1].slice(0, 3)}. ${datum.slice(0, 4)}` : monat;
  return vorlaeufig ? `bis ca. ${text} · vorläufig` : `bis ${text}`;
}

/** Fortschritt in Prozent, abgerundet auf eine Nachkommastelle (nie über 100 für die Breite). */
const prozent = (gespart, ziel) => Math.floor((Math.max(0, gespart) / ziel) * 1000) / 10;

function statusVon(z) {
  if (z.status === 'erreicht') return { text: '🎉 Ziel erreicht', art: 'fertig' };
  if (z.status === 'neu') return { text: `✓ neu – ab ${monatText(z.erstellt)} dabei`, art: 'neu' };
  if (z.status === 'hinter') return { text: `⚠ ${betragText(z.plan.rueckstand)} hinter Plan`, art: 'warn' };
  return { text: '✓ im Plan', art: 'ok' };
}

function zielKarte(z, i) {
  const p = prozent(z.gespart, z.zielCents);
  const status = statusVon(z);
  const stand = `${betragText(z.gespart)} von ${betragText(z.zielCents)} · ${prozentText(p)}`;
  const schluss = monatText(monatVor(z.datum, -1));
  const monate = z.faellig ? 'Zielmonat vorbei' : `Noch ${monateText(z.monateRest)}`;
  const proMonat = z.faellig ? `schließt im ${schluss}` : `${betragText(z.noetigProMonat)} / Monat`;
  return {
    id: z.id,
    name: z.name,
    titel: `${z.emoji} ${z.name}`,
    bis: zielBisText(z),
    vorlaeufig: z.vorlaeufig,
    hinweis: z.vorlaeufig ? 'Datum noch vorläufig (✎ ändern, sobald es fix ist)' : null,
    breite: Math.min(100, p),
    farbe: BALKEN_FARBEN[i % BALKEN_FARBEN.length],
    stand,
    offen: betragText(z.offen),
    monate,
    proMonat,
    status,
    beschriftung: `${z.name}, ${zielBisText(z)}: ${stand}, noch offen ${betragText(z.offen)}, ${monate}, ${proMonat}. ${status.text}`,
  };
}

const zeile = (text, cents, betrag = deltaText(cents)) => ({ text, cents, betrag });

/** Ein Monat im Verlauf: Ersparnis und ihre Aufteilung (Σ teile.cents = gespart), Abschlüsse, Verschiebungen aus Frei. */
function monatEintrag(m, name) {
  const abschluesse = m.abschluss.map((a) =>
    a.art === 'frei' ? zeile(`${name(a.ziel)} beendet – zurück zu Frei`, a.cents, `+${betragText(a.cents)} → Frei`) : zeile(`${name(a.ziel)} abgeschlossen (ausgegeben)`, a.cents, betragText(a.cents)),
  );
  const verschoben = m.verschoben.map((v) => zeile(`💜 → ${name(v.ziel)} (aus Frei verschoben${v.cents < v.gewuenscht ? `, gewünscht ${betragText(v.gewuenscht)}` : ''})`, v.cents));
  let teile = [];
  let hinweis = null;
  if (m.gespart !== null && m.gespart > 0) {
    const noetig = m.zuteilung.reduce((s, t) => s + t.noetig, 0);
    const anteilig = m.zuteilung.length > 0 && noetig > m.gespart;
    teile = m.zuteilung.filter((t) => t.cents !== 0 || t.noetig > 0).map((t) => zeile(anteilig ? name(t.ziel) : `${name(t.ziel)} (nötig ${betragText(t.noetig)})`, t.cents));
    if (m.frei.cents !== 0) teile.push(zeile(m.zuteilung.length > 0 ? '💜 Frei verfügbar (Rest)' : '💜 Frei verfügbar (kein laufendes Ziel)', m.frei.cents));
    if (anteilig) hinweis = `Weniger als nötig (${betragText(noetig)}) → anteilig nach Bedarf aufgeteilt.`;
  } else if (m.gespart !== null && m.gespart < 0) {
    teile = [zeile('💜 Frei verfügbar zuerst', m.frei.cents, m.frei.cents === 0 ? '−0 € (leer)' : deltaText(m.frei.cents))];
    teile.push(...m.zuteilung.filter((t) => t.cents !== 0).map((t) => zeile(`${name(t.ziel)} (anteilig)`, t.cents)));
    if (m.ungedeckt > 0) teile.push(zeile('Rest nicht gedeckt (Ziele schon leer)', -m.ungedeckt));
  }
  return {
    monat: m.monat,
    titel: monatText(m.monat),
    gespartCents: m.gespart,
    betrag: m.gespart === null ? 'noch kein Kontostand' : deltaText(m.gespart),
    art: m.gespart === null ? 'leer' : m.art,
    luecke: m.luecke > 0 ? `Nachgeholt: ${monateText(m.luecke)} ohne Kontostand von beiden – gerechnet seit ${monatText(m.basis)}.` : null,
    abschluesse,
    teile,
    hinweis,
    keineVeraenderung: m.gespart === 0,
    verschoben,
    freiDanach: `💜 Frei am Monatsende: ${betragText(m.frei.nachher)}`,
  };
}

/**
 * Die Seite „Sparziele“ am Tag `heute` → {
 *   zustand: 'ok' | 'nichtGeladen' (noch nie gelesen), gesperrt (Grund, warum nichts geändert werden kann, oder null),
 *   nichtGeladen (Meldung, wenn das letzte Lesen scheiterte – alter Stand bleibt sichtbar), unlesbar (Meldung) , warnungen,
 *   kopf: { zurueckgelegt, noetig, frei, stand }, ohneKontostand, leer, ziele (Karten der laufenden), frei: { betrag, cents,
 *   kannVerschieben, ziele: [{ id, text, offen }] }, verlauf (Monate, neueste zuerst), abgeschlossen, ausgeblendet (Zahl), symbole
 * }
 */
export function sparzieleModel(state, heute, { ausgeblendeteZeigen = false } = {}) {
  const zs = state.ziele ?? { daten: { v: 1, z: [], m: [] }, status: null, unlesbar: false, warnungen: [] };
  const daten = zs.daten ?? { v: 1, z: [], m: [] };
  const konto = state.konto;
  const v = sparVerlauf(daten, konto, heute);
  const lesbar = zs.status === 'geladen' || zs.status === 'gespeichert';
  const gesperrt = zs.unlesbar ? TEXT_ZIELE_GESPERRT : lesbar ? null : TEXT_ZIELE_NICHT_GELADEN;
  const nachId = new Map(v.ziele.map((z) => [z.id, z]));
  const name = (id) => {
    const z = nachId.get(id);
    return z ? `${z.emoji} ${z.name}` : 'Unbekanntes Ziel';
  };
  const laufend = v.ziele.filter((z) => !z.abgeschlossen);
  const monat = heute.slice(0, 7);
  const verschiebbar = laufend.filter((z) => z.erstellt <= monat && z.offen > 0 && !z.faellig);
  const fertig = v.ziele.filter((z) => z.abgeschlossen).sort((a, b) => (a.abgeschlossen.monat < b.abgeschlossen.monat ? 1 : a.abgeschlossen.monat > b.abgeschlossen.monat ? -1 : 0));
  return {
    zustand: zs.status === null && !zs.unlesbar ? 'nichtGeladen' : 'ok',
    gesperrt,
    nichtGeladen: zs.status === 'fehler' ? TEXT_ZIELE_NICHT_GELADEN : null,
    unlesbar: zs.unlesbar ? TEXT_ZIELE_GESPERRT : null,
    warnungen: zs.unlesbar || zs.status === 'fehler' ? [] : (zs.warnungen ?? []),
    kopf: {
      zurueckgelegt: betragText(v.summeZiele),
      noetig: betragText(v.noetigGesamt),
      frei: betragText(v.frei),
      stand: v.standMonat ? `Stand: Kontostand ${monatText(v.standMonat)} (beide)` : 'Stand: noch kein Kontostand von beiden',
    },
    ohneKontostand: v.standMonat === null,
    leer: (daten.z ?? []).length === 0,
    ziele: laufend.map(zielKarte),
    frei: {
      betrag: betragText(v.frei),
      cents: v.frei,
      kannVerschieben: !gesperrt && v.frei > 0 && verschiebbar.length > 0,
      ziele: verschiebbar.map((z) => ({ id: z.id, text: `${z.emoji} ${z.name} (offen ${betragText(z.offen)})`, offen: z.offen })),
    },
    verlauf: v.monate.map((m) => monatEintrag(m, name)),
    abgeschlossen: fertig
      .filter((z) => ausgeblendeteZeigen || !z.aus)
      .map((z) => ({
        id: z.id,
        name: z.name,
        titel: `${z.emoji} ${z.name}`,
        text: `${z.abgeschlossen.automatisch ? 'Nach dem Zieldatum abgeschlossen' : 'Beendet'} im ${monatText(z.abgeschlossen.monat)} · ${betragText(z.gespart)} ${z.abgeschlossen.art === 'frei' ? 'zurück zu Frei' : 'ausgegeben'}${z.status === 'erreicht' ? ' · 🎉 erreicht' : ''}`,
        aus: Boolean(z.aus),
        loeschbar: zielLoeschbar(daten, konto, heute, z.id),
      })),
    ausgeblendet: fertig.filter((z) => z.aus).length,
    symbole: symbole(state.settings),
  };
}

// ---------------------------------------------------------------- Formular

/** Entwurf des Formulars: neues Ziel (`ziel` = null: Datum fest, ein Jahr nach heute) oder ein vorhandenes. Beträge als Text. */
export function zielEntwurf(ziel, heute) {
  if (!ziel) {
    const in12 = monatVor(heute, -12);
    return { id: null, name: '', emoji: '🎯', art: 'fest', betrag: '', monat: in12.slice(5, 7), jahr: in12.slice(0, 4), tag: '' };
  }
  return {
    id: ziel.id,
    name: ziel.name,
    emoji: ziel.emoji,
    art: ziel.vorlaeufig ? 'vorlaeufig' : 'fest',
    betrag: betragText(ziel.zielCents).replace(' €', ''),
    monat: ziel.datum.slice(5, 7),
    jahr: ziel.datum.slice(0, 4),
    tag: ziel.datum.length === 10 ? String(Number(ziel.datum.slice(8, 10))) : '',
    erstellt: ziel.erstellt,
  };
}

/** Entwurf → { ziel: { id?, name, emoji, zielCents, datum, vorlaeufig }, fehler } (Prüfung der Domäne; `erstellt` nur zum Prüfen). */
export function entwurfZuZiel(e, heute) {
  const cents = centsAusText(String(e.betrag ?? ''));
  const datum = e.tag ? `${e.jahr}-${e.monat}-${String(e.tag).padStart(2, '0')}` : `${e.jahr}-${e.monat}`;
  const ziel = { ...(e.id ? { id: e.id } : {}), name: String(e.name ?? '').replace(/\s+/g, ' ').trim(), emoji: e.emoji, zielCents: cents ?? NaN, datum, vorlaeufig: e.art === 'vorlaeufig' };
  const fehler = zielPruefen({ ...ziel, ...(e.erstellt ? { erstellt: e.erstellt } : {}) }, { heute });
  return { ziel: fehler ? null : ziel, fehler };
}

/**
 * „Ab <Monat> → N Monate → X € pro Monat“ für den Entwurf, gerechnet mit sparVerlauf: ein neues Ziel beginnt im Startmonat (startMonat),
 * ein vorhandenes rechnet mit dem schon Gesparten. → { ab, monate, proMonat } | { erreicht: true } | null (Entwurf noch unvollständig).
 */
export function bedarfVorschau(e, { daten, konto, heute }) {
  const { ziel, fehler } = entwurfZuZiel({ ...e, name: e.name || 'Vorschau' }, heute);
  if (fehler) return null;
  const alt = e.id ? (daten?.z ?? []).find((z) => z.id === e.id) : null;
  const probe = alt
    ? { ...daten, z: daten.z.map((z) => (z.id === alt.id ? { ...alt, ...ziel } : z)) }
    : { v: 1, z: [{ ...ziel, id: 'vorschau', erstellt: startMonat(heute, konto) }], m: [] };
  const z = sparVerlauf(probe, konto, heute).ziele.find((x) => x.id === (alt ? alt.id : 'vorschau'));
  if (!z || z.abgeschlossen) return null;
  if (z.offen === 0) return { erreicht: true };
  if (z.faellig) return null;
  return { ab: monatText(monatVor(ziel.datum, z.monateRest - 1)), monate: monateText(z.monateRest), proMonat: `${betragText(z.noetigProMonat)} pro Monat` };
}
