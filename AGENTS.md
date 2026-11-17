# Agent Instructions

Static PWA, vanilla ES modules, no build step, no framework. Identifiers and UI text are German. `package.json` exists for tests only.

## Commands
| Task | Command |
|------|---------|
| All unit tests | `npm test` |
| One unit file | `node --test tests/unit/<name>.test.js` |
| One unit test | `node --test --test-name-pattern="<text>" tests/unit/<name>.test.js` |
| One e2e spec, Classic only | `npx playwright test tests/e2e/<name>.spec.js --project=telefon-chromium` |
| Full e2e, three looks (about 4 min) | `npm run test:e2e` |
| Pixel check of the Classic look | `npm run test:visuell` |
| Contrast and tap-target check | `npm run test:kontrast` |
| Duplicate check (new clones fail) | `npm run test:duplikate` |
| Worker tests | `cd login-dienst && npm test` |
| Manual look | `node tests/server.mjs` → http://127.0.0.1:8141/ |

## External References
| Need | File |
|------|------|
| Test setup, flags, CI behaviour | `tests/README.md` |
| Who owns which file | `OWNERS.md` |
| Duplicate-check baseline | `tests/duplikate-basis.json` |
| Login worker deploy | `login-dienst/README.md` |

## Layers (checked by `tests/unit/ebenen.test.js`)
- `src/domain/` — pure rules. Imports only `src/domain/`. No DOM, no `localStorage`, no network, no `Date.now()` without an injected clock.
- `src/app/` — store, adapters' callers, `views/*-model.js` (state → plain data for a screen). No DOM, no `src/ui/`.
- `src/ui/` — DOM only. No business rules; compute in a `*-model.js` and unit-test it there.
- `src/calendar/`, `src/push/` — Google and push adapters. Import only `src/domain/`, each other and `src/app/speicher.js` (the one allowed exception).
- Store slices in `src/app/store/*.js` import only their siblings `src/app/store/kern.js` and `src/app/store/geteilt.js`; `src/app/store.js` is the facade.
- A unit test must never need a DOM. Logic that needs a test goes below `src/ui/`.

## Key Conventions
- Build DOM with `h()` / `fuelle()` from `src/ui/dom.js`. Never `innerHTML`, never HTML strings: calendar text is untrusted.
- Sheets: `blatt()` / `bestaetigen()` from `src/ui/components.js`. Do not query `.blatt-huelle` from the document.
- Form helpers (`feld`, `auswahl`, `textFeld`, `erledigt`, `sicher`) come from `src/ui/formular.js`; swipe from `src/ui/wischen.js`; clipboard from `src/ui/zwischenablage.js`; take-along field from `src/ui/mitnehmen-feld.js`. Do not re-declare them.
- Shared primitives (`pad2`, `istObjekt`, `sauber`, validators) come from `src/domain/gemeinsam.js` and `src/domain/dates.js`. Grep before adding a helper.
- Store methods called from the UI return `{ ok, fehler?, gemeldet?, wartet?, rueckgaengig? }` and never throw for network errors. The UI keeps the form open unless `ok` or `wartet`.
- A save handler wraps its write in `einmal()` (`src/app/einmal.js`) and disables its button meanwhile. The draft lives in `ui` state, not in the DOM.
- A new page is one entry in `src/ui/seiten.js`; the shell and `src/app/seiten-besuch.js` do the rest.
- Changes to shared calendar data are functions applied to the newest version (`aendere…(fn)`); `fn` must be idempotent and must throw a German message to reject.
- Text read from a hidden event that this version cannot parse locks the area ("unlesbar", `src/domain/unlesbar.js`). Never treat it as empty and never overwrite it. Only HTTP 404 means an empty part.
- Dates are `JJJJ-MM-TT` strings in Europe/Vienna; "today" is `store.heute()`. Money is integer cents.
- `localStorage` only through `src/app/speicher.js`; keys are `fk.<name>.v<n>`.
- CSP is `style-src 'self'`: no inline styles except through `h(..., { style: { '--var': value } })`; no external scripts.
- New CSS for the Classic look goes to `themes/klassisch/<area>.css`; Glass/Bento rules go to `themes/<area>.css` under `:root[data-aussehen="glas"]` / `="bento"`. Dark tokens exist twice (media query and `[data-theme="dark"]`): edit both.
- Tap targets ≥ 44 px, text ≥ 13 px, contrast ≥ 4.5:1 in all three looks, light and dark.
- UI text: German, informal plural ("ihr"). No personal names in code, tests, seed data or docs (the repo is public); use the neutral demo family.
- Bump `src/app/version.js`, `package.json` and `package-lock.json` together; only the integrator.
- Shared test fakes (clock, Google stub, swipe steps) live in `tests/unit/hilfen.js` and `tests/e2e/hilfen.js`; reuse them.

## Parallel Work
- One area per agent; edit only that area's files (map: `OWNERS.md`).
- Hub files are integrator-only: `src/shell.js`, `src/start.js`, `src/main.js`, `src/ui/seiten.js`, `src/app/store.js`, `src/app/store/kern.js`, `src/app/store/geteilt.js`, `src/app/hintergrund.js`, `src/app/seed.js`, `src/app/sicherung.js`, `src/app/version.js`, `src/app/demo-adapter.js`, `src/calendar/mapping.js`, `src/calendar/google-adapter.js`, `src/calendar/snapshot.js`, `src/push/plan.js`, `index.html`, `datenschutz.html`, `sw.js`, `themes/klassisch/basis.css`, `themes/glas.css`, `themes/bento.css`, `package.json`, `package-lock.json`, `.github/workflows/tests.yml`, `tests/unit/hilfen.js`, `tests/e2e/hilfen.js`, `tests/visuell/`.
- Need a hub change? Describe it in the hand-off (file, place, exact lines); do not edit the hub.
- Work in your own git worktree and branch (`agent/<area>-<topic>`). Never link `node_modules` into a worktree with a junction; run `npm ci` there.
- Do not move or rename files outside a task that says so.
- Before hand-off: `npm test` green, `npm run test:duplikate` green, the e2e specs of your area green in `telefon-chromium`, no new export without a user.
- A bug fix starts with a failing test in the area's test file.

## Do Not
- Add dependencies, a bundler or a framework.
- Add a method that deletes calendars or calendar-list entries (`src/calendar/api.js`).
- Put a token, e-mail address or calendar id into a URL, log, toast or test fixture.
- Commit `.internal/`, `.superpowers/`, `tests/visuell/__basis__/`, `test-results/`.

## Commit Attribution and Models
- AI commits end with the agent's `Co-Authored-By:` line, exactly as the agent's own attribution instructions give it.
- Dispatch sub-agents with an explicit model, the cheapest that can do the job; the user's global Claude instructions describe the tiers.
