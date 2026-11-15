// Gemeinsame Helfer der Schichtplan-Tests (schichtplan.spec.js, schichtplan-tag.spec.js, schichtplan-arten.spec.js).

/** Die Zelle eines Tages im Monatsraster. */
export const zelle = (page, datum) => page.locator(`.sp-zelle[data-datum="${datum}"]`);
/** Der Streifen einer Person (papa | mama) in dieser Zelle. */
export const streifen = (page, datum, person) => zelle(page, datum).locator(`.sp-streifen.${person}`);
