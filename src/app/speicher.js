// Der lokale Speicher dieses Telefons (localStorage). Einziger Ort in src/ (neben dem klassischen Skript theme-init.js), der
// `globalThis.localStorage` berührt; calendar/ und ui/ dürfen ihn als Ausnahme von der Schichtenregel importieren.

/** localStorage dieses Telefons; null, wenn schon der Zugriff wirft (Browser blockiert alle Website-Daten). */
export function standardSpeicher() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
