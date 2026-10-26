// Alles, was die Seite „Sparziele“ im Konto-Tab braucht, als einfache Daten (ohne DOM): Kopf (zurückgelegt, nötig pro Monat, frei,
// Stand), Karten der laufenden Ziele (Balken, Beträge, Monate, Status), „Frei verfügbar“, Verlauf pro Monat (Ersparnis und Aufteilung),
// abgeschlossene Ziele (Ausblenden, Löschen nur ohne Geld), Sperren und Warnungen; dazu Entwurf, Prüfung und Bedarf-Vorschau des Formulars.
// Gerechnet wird ausschließlich mit src/domain/sparziele.js (sparVerlauf); hier wird nur formatiert.
import { TEXT_ZIELE_GESPERRT, TEXT_ZIELE_NICHT_GELADEN, ZIEL_EMOJIS, sparVerlauf, startMonat, verschiebungLoeschen, zielLoeschArt, zielLoeschen, zielLoeschbar, zielPruefen, zielSchluss } from '../../domain/sparziele.js';
import { betragText, centsAusText, deltaText, monatVor } from '../../domain/konto.js';
import { isValidDate } from '../../domain/dates.js';
import { MONATE, monatText } from '../format-de.js';

export { monatText };

const monateText = (n) => (n === 1 ? '1 Monat' : `${n} Monate`);
const prozentText = (p) => `${String(p).replace('.', ',')} %`;

/** Namen der Symbole (für Vorlesen und Auswahl), in der Reihenfolge von ZIEL_EMOJIS; 👧 bekommt den Namen des Kindes. */
export const SYMBOL_NAMEN = Object.freeze(['Auto', 'Urlaub', 'Wohnen', 'Geschenk', 'Kind', 'Schmuck', 'Möbel', 'Ziel', 'Rumänien', 'Reise', 'Technik', 'Weihnachten']);

/** Farben der Balken (der Reihe nach je Ziel), als CSS-Variablen aus theme.css. */
const BALKEN_FARBEN = ['var(--serie-papa)', 'var(--urlaub)', 'var(--kita)', 'var(--abwesend)', 'var(--arzt)', 'var(--serie-mama)'];

/** Die Symbole zur Auswahl: [{ emoji, name }]. */
export function zielSymbole(settings) {
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

function zielKarte(z, i, heute) {
  const p = prozent(z.gespart, z.zielCents);
  const status = statusVon(z);
  const stand = `${betragText(z.gespart)} von ${betragText(z.zielCents)} · ${prozentText(p)}`;
  const schluss = monatText(zielSchluss(z).monat);
  const monate = z.faellig ? 'Zielmonat vorbei' : `Noch ${monateText(z.monateRest)}`;
  const proMonat = z.faellig ? `schließt im ${schluss}` : `${betragText(z.noetigProMonat)} / Monat`;
  return {
    id: z.id,
    name: z.name,
    titel: `${z.emoji} ${z.name}`,
    bis: zielBisText(z),
    vorlaeufig: z.vorlaeufig,
    hinweis: !z.vorlaeufig ? null : z.datum.slice(0, 7) <= heute.slice(0, 7) ? `schließt am 1. ${schluss} – Datum verschoben? ✎ ändern` : 'Datum noch vorläufig (✎ ändern, sobald es fix ist)',
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

/**
 * Ein Monat im Verlauf: Ersparnis und ihre Aufteilung (Σ teile.cents = gespart), Abschlüsse, Verschiebungen aus Frei. Wurde in dem
 * Monat ein Ausgleich verteilt (Ziel „ausgegeben“: die Zahlung steckt schon im Kontostand), steht je Ziel eine Zeile „… bezahlt (aus dem
 * Ziel)“ mit −Betrag; verteilt wird gespart + Ausgleich.
 */
function monatEintrag(m, name, rueckgaengigMoeglich, geloescht) {
  const abschluesse = m.abschluss.map((a) => {
    if (geloescht(a.ziel)) return zeile(`🗑️ ${geloescht(a.ziel)} gelöscht – ${betragText(a.cents)} zurück zu „Frei“`, a.cents, `+${betragText(a.cents)} → Frei`);
    return a.art === 'frei' ? zeile(`${name(a.ziel)} beendet – zurück zu Frei`, a.cents, `+${betragText(a.cents)} → Frei`) : zeile(`${name(a.ziel)} abgeschlossen (ausgegeben)`, a.cents, betragText(a.cents));
  });
  // Jede Verschiebung mit ihrer Kennung; „Rückgängig“ nur im laufenden Monat und zu einem noch laufenden Ziel (siehe domain verschiebungLoeschen)
  const verschoben = m.verschoben.map((v) => ({
    ...zeile(`💜 → ${name(v.ziel)} (aus Frei verschoben${v.cents < v.gewuenscht ? `, gewünscht ${betragText(v.gewuenscht)}` : ''})`, v.cents),
    id: v.id,
    rueckgaengig: rueckgaengigMoeglich(v.ziel, m.monat),
  }));
  let teile = [];
  let hinweis = null;
  const ausgleich = m.ausgleich ?? 0;
  const verteilt = m.gespart === null ? null : m.gespart + ausgleich;
  const bezahlt = (m.ausgleichVon ?? []).map((a) => zeile(`${name(a.ziel)} bezahlt (aus dem Ziel)`, -a.cents));
  if (verteilt !== null && verteilt > 0) {
    const noetig = m.zuteilung.reduce((s, t) => s + t.noetig, 0);
    const anteilig = m.anteilig; // aus der Rechnung: Plus-Monat mit weniger als nötig
    teile = m.zuteilung.filter((t) => t.cents !== 0 || t.noetig > 0).map((t) => zeile(anteilig ? name(t.ziel) : `${name(t.ziel)} (nötig ${betragText(t.noetig)})`, t.cents));
    if (m.frei.cents !== 0) teile.push(zeile(m.zuteilung.length > 0 ? '💜 Frei verfügbar (Rest)' : '💜 Frei verfügbar (kein laufendes Ziel)', m.frei.cents));
    if (anteilig) hinweis = `Weniger als nötig (${betragText(noetig)}) → anteilig nach Bedarf aufgeteilt.`;
  } else if (verteilt !== null && verteilt < 0) {
    teile = [zeile('💜 Frei verfügbar zuerst', m.frei.cents, m.frei.cents === 0 ? '−0 € (leer)' : deltaText(m.frei.cents))];
    teile.push(...m.zuteilung.filter((t) => t.cents !== 0).map((t) => zeile(`${name(t.ziel)} (anteilig)`, t.cents)));
    if (m.ungedeckt > 0) teile.push(zeile('Rest nicht gedeckt (Ziele schon leer)', -m.ungedeckt));
  }
  teile = [...bezahlt, ...teile];
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
    keineVeraenderung: m.gespart === 0 && ausgleich === 0,
    ausgleich: ausgleich > 0 ? `Ausgleich: ${betragText(ausgleich)} wurden aus Zielen bezahlt – das steckt schon im Kontostand und wird hier wieder mit verteilt.` : null,
    verschoben,
    freiDanach: `💜 Frei am Monatsende: ${betragText(m.frei.nachher)}`,
  };
}

/** Warum sich die Sparziele gerade nicht ändern lassen (unlesbar / nicht gelesen) oder null (wie die Sperre im Store). */
export function zieleSperre(zs) {
  if (zs?.unlesbar) return TEXT_ZIELE_GESPERRT;
  return zs?.status === 'geladen' || zs?.status === 'gespeichert' ? null : TEXT_ZIELE_NICHT_GELADEN;
}

/**
 * Die Seite „Sparziele“ am Tag `heute` → {
 *   zustand: 'ok' | 'nichtGeladen' (noch nie gelesen), gesperrt (Grund, warum nichts geändert werden kann, oder null),
 *   nichtGeladen (Meldung, wenn das letzte Lesen scheiterte – alter Stand bleibt sichtbar), unlesbar (Meldung) , warnungen,
 *   kopf: { zurueckgelegt, zurueckgelegtCents, noetig, frei, stand }, ohneKontostand, leer, ziele (Karten der laufenden), frei: { betrag, cents,
 *   kannVerschieben, ziele: [{ id, text, offen }] }, verlauf (Monate, neueste zuerst), abgeschlossen, ausgeblendet (Zahl), symbole
 * }
 */
export function sparzieleModel(state, heute, { ausgeblendeteZeigen = false } = {}) {
  const zs = state.ziele ?? { daten: { v: 1, z: [], m: [] }, status: null, unlesbar: false, warnungen: [] };
  const daten = zs.daten ?? { v: 1, z: [], m: [] };
  const konto = state.konto;
  const v = sparVerlauf(daten, konto, heute);
  const gesperrt = zieleSperre(zs);
  const nachId = new Map(v.ziele.map((z) => [z.id, z]));
  const name = (id) => {
    const z = nachId.get(id);
    return z ? `${z.emoji} ${z.name}` : 'Unbekanntes Ziel';
  };
  const laufend = v.ziele.filter((z) => !z.abgeschlossen);
  const monat = heute.slice(0, 7);
  const verschiebbar = laufend.filter((z) => z.erstellt <= monat && z.offen > 0 && !z.faellig);
  // „gelöscht“ abgeschlossene Ziele erscheinen nirgends mehr als Ziel – nur als Zeile im Monat des Löschens
  const fertig = v.ziele.filter((z) => z.abgeschlossen && !z.geloescht).sort((a, b) => (a.abgeschlossen.monat < b.abgeschlossen.monat ? 1 : a.abgeschlossen.monat > b.abgeschlossen.monat ? -1 : 0));
  return {
    zustand: zs.status === null && !zs.unlesbar ? 'nichtGeladen' : 'ok',
    gesperrt,
    nichtGeladen: zs.status === 'fehler' ? TEXT_ZIELE_NICHT_GELADEN : null,
    unlesbar: zs.unlesbar ? TEXT_ZIELE_GESPERRT : null,
    warnungen: zs.unlesbar || zs.status === 'fehler' ? [] : (zs.warnungen ?? []),
    kopf: {
      zurueckgelegt: betragText(v.summeZiele),
      zurueckgelegtCents: v.summeZiele, // für das Hochzählen in Glas/Bento (ui/bewegung.js)
      noetig: betragText(v.noetigGesamt),
      frei: betragText(v.frei),
      stand: v.standMonat ? `Stand: Kontostand ${monatText(v.standMonat)} (beide)` : 'Stand: noch kein Kontostand von beiden',
    },
    ohneKontostand: v.standMonat === null,
    leer: (daten.z ?? []).every((z) => z.geloescht), // „gelöschte“ Ziele zählen nicht
    ziele: laufend.map((z, i) => zielKarte(z, i, heute)),
    frei: {
      betrag: betragText(v.frei),
      cents: v.frei,
      kannVerschieben: !gesperrt && v.frei > 0 && verschiebbar.length > 0,
      ziele: verschiebbar.map((z) => ({ id: z.id, titel: `${z.emoji} ${z.name}`, text: `${z.emoji} ${z.name} (offen ${betragText(z.offen)})`, offen: z.offen })),
    },
    verlauf: v.monate.map((m) => monatEintrag(m, name, (id, monatV) => !gesperrt && monatV >= monat && Boolean(nachId.get(id)) && !nachId.get(id).abgeschlossen, (id) => (nachId.get(id)?.geloescht ? nachId.get(id).name : null))),
    abgeschlossen: fertig
      .filter((z) => ausgeblendeteZeigen || !z.aus)
      .map((z) => ({
        id: z.id,
        name: z.name,
        titel: `${z.emoji} ${z.name}`,
        text: `${z.abgeschlossen.automatisch ? 'Nach dem Zieldatum abgeschlossen' : 'Beendet'} im ${monatText(z.abgeschlossen.monat)} · ${betragText(z.gespart)} ${z.abgeschlossen.art === 'frei' ? 'zurück zu Frei' : 'ausgegeben'}${z.status === 'erreicht' ? ' · 🎉 erreicht' : ''}`,
        aus: Boolean(z.aus),
        loeschbar: zielLoeschbar(daten, konto, heute, z.id),
        automatisch: z.abgeschlossen.automatisch,
        // nur automatisch abgeschlossen (Zielmonat vorbei, nie von Hand beendet): mit neuem Datum wieder öffnen oder doch zurück zu Frei
        kannAendern: z.abgeschlossen.automatisch && !gesperrt,
        kannZurueckZuFrei: z.abgeschlossen.automatisch && z.abgeschlossen.art === 'ausgegeben' && !gesperrt,
      })),
    ausgeblendet: fertig.filter((z) => z.aus).length,
    symbole: zielSymbole(state.settings),
  };
}

/**
 * Rückfrage vor dem Löschen des Ziels `id` am Tag `heute` → { titel, text, ja, knopf } oder null (nicht löschbar / unbekannt). Ein
 * laufendes Ziel mit Geld wird „gelöscht“ abgeschlossen: die Rückfrage nennt die tatsächliche Wirkung aus einer Probe-Rechnung (vorher /
 * nachher) – am Monatsletzten mit eingetragenem Kontostand wird der Anteil dieses Monats neu verteilt.
 */
export function zielLoeschFrage(state, heute, id) {
  const daten = state.ziele?.daten ?? { v: 1, z: [], m: [] };
  const art = zielLoeschArt(daten, state.konto, heute, id);
  const vorher = art ? sparVerlauf(daten, state.konto, heute) : null;
  const z = vorher?.ziele.find((x) => x.id === id);
  if (!z) return null;
  if (art === 'weg' && z.abgeschlossen) return { titel: 'Endgültig löschen?', text: `„${z.name}“ hat nie Geld bekommen und wird endgültig gelöscht.`, ja: 'Endgültig löschen', knopf: 'Endgültig löschen' };
  const frage = (text) => ({ titel: 'Sparziel löschen?', text, ja: 'Löschen', knopf: 'Löschen' });
  if (art === 'weg') return frage(`„${z.name}“ hat noch kein Geld bekommen und wird gelöscht.`);
  // Probe-Rechnung (wie bei verschiebungFrage): was ändert sich wirklich an „Frei“ und an den anderen laufenden Zielen?
  const nachher = sparVerlauf(zielLoeschen(daten, id, { heute, konto: state.konto }), state.konto, heute);
  const frei = nachher.frei - vorher.frei;
  const andere = vorher.ziele
    .filter((x) => x.id !== id && !x.abgeschlossen)
    .reduce((n, x) => n + (nachher.ziele.find((y) => y.id === x.id)?.gespart ?? 0) - x.gespart, 0);
  if (frei === 0 && andere === 0) return frage(`„${z.name}“ wird gelöscht.`);
  if (andere === 0) return frage(`„${z.name}“ wird gelöscht. Das bisher zugeteilte Geld (${betragText(frei)}) geht zu „Frei verfügbar“ – von dort kannst du es einem anderen Ziel geben.`);
  return frage(`„${z.name}“ wird gelöscht. „Frei verfügbar“ ${frei >= 0 ? 'steigt' : 'sinkt'} dadurch um ${betragText(Math.abs(frei))}, die anderen Ziele bekommen zusammen ${betragText(andere)} (der Anteil dieses Monats wird neu verteilt) – von „Frei“ kannst du es einem anderen Ziel geben.`);
}

/**
 * Rückfrage-Text für „Verschiebung rückgängig“ (Kennung `id`) am Tag `heute`: die TATSÄCHLICHE Wirkung aus einer Probe-Rechnung (vorher /
 * nachher mit der Domäne) – wie viel „Frei“ dadurch steigt und wie viel das Ziel danach weniger hat (eine ältere Verschiebung wirkt
 * weniger als ihr Nennbetrag: ohne sie bekam das Ziel in den Monaten danach mehr aus der Ersparnis). Nicht möglich → null.
 */
export function verschiebungFrage(state, heute, id) {
  const daten = state.ziele?.daten ?? { v: 1, z: [], m: [] };
  const v = (daten.m ?? []).find((x) => x.id === id);
  if (!v) return null;
  let ohne;
  try {
    ohne = verschiebungLoeschen(daten, id, { heute });
  } catch {
    return null;
  }
  const vorher = sparVerlauf(daten, state.konto, heute);
  const nachher = sparVerlauf(ohne, state.konto, heute);
  const gespart = (verlauf, zielId) => verlauf.ziele.find((z) => z.id === zielId)?.gespart ?? 0;
  const frei = nachher.frei - vorher.frei;
  const ziel = vorher.ziele.find((z) => z.id === v.ziel);
  const weniger = gespart(vorher, v.ziel) - gespart(nachher, v.ziel);
  const andere = vorher.ziele.filter((z) => z.id !== v.ziel && !z.abgeschlossen).reduce((n, z) => n + gespart(nachher, z.id) - z.gespart, 0);
  if (frei === 0 && weniger === 0 && andere === 0) return 'An „Frei verfügbar“ und den Zielen ändert sich dadurch nichts.';
  const name = ziel ? ziel.name : 'Unbekanntes Ziel'; // ohne Symbol: „„🚗“ bricht sonst nach dem Anführungszeichen um
  const teile = [`„Frei verfügbar“ ${frei >= 0 ? 'steigt' : 'sinkt'} dadurch um ${betragText(Math.abs(frei))}`];
  if (weniger !== 0) teile.push(`„${name}“ hat danach ${betragText(Math.abs(weniger))} ${weniger > 0 ? 'weniger' : 'mehr'}`);
  if (andere !== 0) teile.push(`die anderen Ziele zusammen ${deltaText(andere)}`);
  return `${teile.join('; ')}.`;
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

/**
 * Entwurf → { ziel: { id?, name, emoji, zielCents, datum, vorlaeufig }, fehler } (Prüfung der Domäne). Geprüft wird gegen den ersten
 * Sparmonat: bei einem vorhandenen Ziel sein `erstellt`, bei einem neuen – wenn `konto` da ist – startMonat(heute, konto), so meldet
 * das Formular schon vor dem Speichern, wenn das Zieldatum davor liegt.
 */
export function entwurfZuZiel(e, heute, { konto } = {}) {
  const cents = centsAusText(String(e.betrag ?? ''));
  const datum = e.tag ? `${e.jahr}-${e.monat}-${String(e.tag).padStart(2, '0')}` : `${e.jahr}-${e.monat}`;
  const ziel = { ...(e.id ? { id: e.id } : {}), name: String(e.name ?? '').replace(/\s+/g, ' ').trim(), emoji: e.emoji, zielCents: cents ?? NaN, datum, vorlaeufig: e.art === 'vorlaeufig' };
  if (e.tag && !isValidDate(datum)) return { ziel: null, fehler: `Den ${Number(e.tag)}. gibt es im ${monatText(`${e.jahr}-${e.monat}`)} nicht.` };
  const erstellt = e.erstellt ?? (!e.id && konto ? startMonat(heute, konto) : undefined);
  const fehler = zielPruefen({ ...ziel, ...(erstellt ? { erstellt } : {}) }, { heute });
  return { ziel: fehler ? null : ziel, fehler };
}

/**
 * „Ab <Monat> → N Monate → X € pro Monat“ für den Entwurf, gerechnet mit sparVerlauf (auch „ab“ kommt aus der Rechnung): ein neues Ziel
 * beginnt im Startmonat (startMonat), ein vorhandenes rechnet mit dem schon Gesparten. → { ab, monate, proMonat } | { erreicht: true }
 * | { fehler } (Betrag oder Datum passen nicht) | null (noch kein Betrag eingegeben).
 */
export function bedarfVorschau(e, { daten, konto, heute }) {
  if (String(e.betrag ?? '').trim() === '') return null;
  const { ziel, fehler } = entwurfZuZiel({ ...e, name: String(e.name ?? '').trim() || 'Vorschau' }, heute, { konto });
  if (fehler) return { fehler };
  const alt = e.id ? (daten?.z ?? []).find((z) => z.id === e.id) : null;
  const probe = alt
    ? { ...daten, z: daten.z.map((z) => (z.id === alt.id ? { ...alt, ...ziel } : z)) }
    : { v: 1, z: [{ ...ziel, id: 'vorschau', erstellt: startMonat(heute, konto) }], m: [] };
  const z = sparVerlauf(probe, konto, heute).ziele.find((x) => x.id === (alt ? alt.id : 'vorschau'));
  if (!z || z.abgeschlossen) return null;
  if (z.offen === 0) return { erreicht: true };
  if (z.faellig) return null;
  return { ab: monatText(z.ab), monate: monateText(z.monateRest), proMonat: `${betragText(z.noetigProMonat)} pro Monat` };
}
