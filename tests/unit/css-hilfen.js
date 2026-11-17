// Hilfen für Tests, die Klassisch (themes/klassisch/*.css) lesen: die Dateien stehen in index.html in der Reihenfolge der Kaskade.
import { readFileSync } from 'node:fs';

const wurzel = new URL('../../', import.meta.url);

/** Die href-Werte `themes/klassisch/*.css` aus index.html, in der Reihenfolge der Einbindung. */
export function klassischDateien() {
  const html = readFileSync(new URL('index.html', wurzel), 'utf8');
  return [...html.matchAll(/href="(themes\/klassisch\/[^"]+\.css)"/g)].map((m) => m[1]);
}

/** Der Inhalt aller Klassisch-Dateien hintereinander (Zeilenenden als \n). */
export function klassischCss() {
  return klassischDateien()
    .map((datei) => readFileSync(new URL(datei, wurzel), 'utf8').replace(/\r\n/g, '\n'))
    .join('');
}
