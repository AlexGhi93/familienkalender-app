/**
 * Ein Speichern je Entwurf nur einmal gleichzeitig (Doppeltipp auf „Speichern“): läuft für `halter` schon eines, kommt `undefined`
 * zurück, ohne dass `lauf` startet. Sonst steht `halter.speichert` auf true, bis `lauf()` fertig ist (auch nach einem Wurf, der
 * weitergereicht wird). `halter` ist der Entwurf, der das Neuzeichnen überlebt – der Knopf liest `halter.speichert`.
 */
export async function einmal(halter, lauf) {
  if (halter.speichert) return undefined;
  halter.speichert = true;
  try {
    return await lauf();
  } finally {
    halter.speichert = false;
  }
}
