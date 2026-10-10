// Menü-Karte für „Mehr“: Zeilen mit eigenem, kurz animiertem Symbol. Eine Zeile klappt ihre Einstellungen darunter auf
// (immer nur eine offen) oder führt auf eine andere Seite (›). Die Animationen stehen in theme.css (`anim-…`).
import { h } from './dom.js';
import { farbe } from './components.js';

let offen = null; // id der aufgeklappten Zeile: überlebt das Neuzeichnen der Seite (z. B. nach dem Speichern)

const SCHRITT_MS = 110; // Abstand zwischen den Symbolen beim Betreten der Seite
const START_MS = 150;

const ruhig = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/** Spielt die Animation eines Symbols (erneut) ab. */
function spiele(symbol, verzoegerungMs = 0) {
  symbol.style.setProperty('--verzoegerung', `${verzoegerungMs}ms`);
  symbol.classList.remove('spielt');
  void symbol.offsetWidth; // erzwingt den Neustart der CSS-Animation
  symbol.classList.add('spielt');
}

function setzeOffen(eintrag, auf) {
  eintrag.classList.toggle('offen', auf);
  eintrag.querySelector('.menue-zeile').setAttribute('aria-expanded', String(auf));
  const tafel = eintrag.querySelector('.menue-inhalt');
  tafel.hidden = !auf;
  tafel.classList.toggle('aufgehend', auf);
}

/** Holt die Zeile ins Bild, falls sie (samt Inhalt) oben herausragt oder unter der Tab-Leiste verschwindet. */
function insBild(eintrag) {
  const grenze = document.querySelector('.tabs')?.getBoundingClientRect().top ?? globalThis.innerHeight;
  const r = eintrag.getBoundingClientRect();
  if (r.top < 0 || r.bottom > grenze) eintrag.scrollIntoView({ block: 'start', behavior: ruhig() ? 'auto' : 'smooth' });
}

/**
 * `eintraege`: [{ id, emoji, animation, farbe, titel, text, status?, inhalt? | beiKlick? }].
 * Mit `inhalt` (Knoten oder Liste) klappt die Zeile auf; mit `beiKlick` führt sie weiter. `status` ist ein zusätzlicher Knoten unter dem Text.
 * `startIndex` (Zahl) spielt die Symbole beim Aufbau nacheinander ab, beginnend mit diesem Platz; `null` = keine Animation.
 */
export function menue({ eintraege, startIndex = null }) {
  const karte = h('article', { class: 'karte menue' });

  for (const [i, e] of eintraege.entries()) {
    const klappt = e.inhalt != null;
    const istOffen = klappt && offen === e.id;
    const symbol = h('span', { class: `menue-symbol anim-${e.animation}` }, e.emoji);
    if (startIndex !== null) spiele(symbol, START_MS + (startIndex + i) * SCHRITT_MS);

    const zeile = h(
      'button',
      {
        class: 'menue-zeile',
        type: 'button',
        'aria-expanded': klappt ? String(istOffen) : null,
        'aria-controls': klappt ? `menue-${e.id}` : null,
        onClick: () => {
          spiele(symbol);
          if (!klappt) {
            e.beiKlick();
            return;
          }
          offen = offen === e.id ? null : e.id;
          for (const anderer of karte.querySelectorAll('.menue-eintrag.klappt')) setzeOffen(anderer, anderer.dataset.id === offen);
          if (offen === e.id) insBild(eintrag);
        },
      },
      h('span', { class: 'menue-kachel', 'aria-hidden': 'true' }, symbol),
      h('span', { class: 'menue-text' }, h('b', {}, e.titel), e.text ? h('small', {}, e.text) : null, e.status ?? null),
      h('span', { class: 'menue-pfeil', 'aria-hidden': 'true' }, '›'), // aufklappbare Zeilen drehen ihn (theme.css)
    );

    const eintrag = h(
      'div',
      { class: `menue-eintrag ${klappt ? 'klappt' : ''} ${istOffen ? 'offen' : ''}`.trim(), 'data-id': e.id, style: farbe(e.farbe) },
      zeile,
      klappt ? h('div', { class: 'menue-inhalt', id: `menue-${e.id}`, hidden: !istOffen }, e.inhalt) : null,
    );
    karte.append(eintrag);
  }
  return karte;
}
