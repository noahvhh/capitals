# Capitals

A small, dark, offline-friendly web app for learning the world's capitals, with the flag and a locator map on every question. Plain HTML, CSS and JavaScript; no build step, no dependencies.

## Run it locally

Either:

- **Open `index.html`** straight from the folder (double-click). Everything works, except the offline cache, which needs a server.
- **Or serve the folder** (recommended, and what a phone on the same Wi-Fi can open):

  ```sh
  cd capitals-app
  python3 -m http.server 8000
  # then open http://localhost:8000 (or http://<your-computer's-IP>:8000 on your phone)
  ```

On iPhone, use Share → Add to Home Screen for a full-screen app that works offline after the first visit.

## Deploy (GitHub + Vercel)

Nothing has been pushed or deployed yet. When you're ready:

```sh
cd capitals-app
git init && git add . && git commit -m "Capitals app"
gh repo create noahvhh/capitals --public --source . --push   # or create it on github.com and push
```

Then in Vercel: **Add New → Project → Import** the `noahvhh/capitals` repo. Framework preset **Other**, no build command, output directory `.` (the repo root). `vercel.json` already sets caching headers for the service worker and font. Every push to `main` redeploys.

After changing any file, bump `VERSION` in `sw.js` so phones pick up the new version.

## Files

```
index.html             screens and SVG icon sprite
css/styles.css         all styling (tokens at the top)
data/countries.js      195 countries: iso2, name, capital, continent, hard, note, aka
data/map.js            generated world outlines, loaded after the home screen paints
js/storage.js          CA.store: settings + progress, versioned localStorage, export/import/reset
js/quiz.js             CA.quiz: pools, weighting, sessions (deck-agnostic)
js/decks/capitals.js   the capitals deck definition
js/config.js           which deck is active, review lengths
js/render.js           generic renderers for text / flag / map / image fields
js/map.js              SVG locator map (zoom, highlight, pulsing pin)
js/flag.js             emoji flags from ISO codes
js/speech.js           Web Speech API wrapper
js/shader.js           home-screen WebGL swirl
js/ui.js               screens, question flow, settings
sw.js                  offline cache
tools/build-map.mjs    regenerates data/map.js (optional, needs Node)
```

## How it works

- **Review mistakes** picks at random, weighted by a per-country miss score. Never seen = weight 1.0, always right = 0.2, missed = up to 3.0. Each miss adds 1 to the score and each correct answer halves it, so a missed country comes back often and then fades back to normal. The last 3 asked are never repeated straight away.
- **By continent** offers Easy, Hard and All, using the `hard` flag. **Mixed** quizzes any ticked continents. **Random** is every country, shuffled.
- **Ask for the** capital, the country, or both (chosen per question). When asking for the country, the flag and map stay hidden until you reveal, since they'd give it away; a setting turns that off.
- **Voice** (Settings) reads prompts and answers in en-GB at an adjustable speed. **Hands-free** reveals and moves on by itself and keeps the screen awake. iOS stops web pages when the phone is locked, so hands-free needs the screen on (it can be dimmed); no web app can keep talking with the screen fully off.
- **Keyboard**: Space reveals, → or Enter = Got it, ← = Missed, Esc ends the session.

## Progress and storage

Progress lives in `localStorage` under `capitals-app:v1`:

```js
{ version: 1, settings: {...}, decks: { capitals: { items: { FR: { r, w, s, t } } } } }
```

`r`/`w` are right/wrong counts, `s` the miss score, `t` last seen. To change the shape, bump `VERSION` in `js/storage.js` and add a function to `MIGRATIONS`; old data is found under the previous key and upgraded. Export and Import in Settings save and load this object as JSON.

To swap in a backend or account sync, give the store a different adapter before it starts. The UI doesn't change:

```js
CA.store.useAdapter({
  read: () => /* return the saved object or null */,
  write: (data) => /* save it */
});
```

## Adding a deck

A deck is data plus a description of how to show it. The quiz logic and UI only use these fields, so any deck can use every mode.

1. Put the items somewhere (`data/flags.js`, or reuse `CA_DATA.countries`). Each item needs a unique `id`.
2. Register the deck in `js/decks/<name>.js`:

   ```js
   CA.decks.flags = {
     id: 'flags',                          // progress is stored per deck id
     title: 'Flags',
     tagline: 'Name the country from its flag.',
     items: CA.decks.capitals.items,       // same countries, different question
     groupKey: 'continent',                // optional: enables continent tests and Mixed
     groups: CA.decks.capitals.groups,
     hardKey: null,                        // optional: field for Easy/Hard (null = All only)
     media: [],                            // shown above every prompt, e.g. { type: 'map', field: 'iso' }
     directions: [{
       id: 'forward', label: 'Flag → Country', short: 'Country',
       prompt: { type: 'flag', field: 'iso' },
       answer: { type: 'text', field: 'country', sub: 'aka' },
       speakPrompt: () => 'Which country?',
       speakAnswer: (it) => it.country
     }]
   };
   ```

   Field types: `text` (with optional `sub` and `note` fields), `flag` (ISO code), `map` (ISO code, optional `groupField`), `image` (URL field, optional `alt`).
3. Add its `<script>` tag in `index.html` after `js/decks/capitals.js`, set `deck: 'flags'` in `js/config.js`, and add the file to `FILES` in `sw.js`.

## Map and flag sources

- **Map**: Natural Earth (public domain) country outlines from the `world-atlas` package, 1:50m, with Tuvalu from 1:10m because it's missing at 50m. `tools/build-map.mjs` projects them to an equirectangular SVG cropped to 84°N–58°S and stores a path, pin point and bounding box per country (~107 KB gzipped). It's fetched after the home screen shows, so it doesn't slow the first load, and is then cached offline. Somaliland is drawn as part of Somalia and Northern Cyprus as part of Cyprus; Kosovo and Western Sahara are drawn as plain, unhighlighted land. If a country has no outline, the map shows the world with the continent name and a marker. To rebuild: `npm i world-atlas@2.0.2 topojson-client@3 d3-geo@3 i18n-iso-countries` then `node tools/build-map.mjs`.
- **Flags**: emoji built from the ISO code, so there are no files and no network. iPhone, Mac and Android show them; Windows has no flag emoji, so there the app shows the two-letter code in a frame.
- **Font**: Instrument Serif (SIL Open Font License) from `@fontsource/instrument-serif`, bundled as two small woff2 subsets.

## Data notes and uncertainties

The list is the 193 UN members plus the two observer states, Vatican City and Palestine (195 in total). Taiwan and Kosovo are not included. Continents follow the UN M49 regions, so Russia is Europe while Türkiye, Cyprus, Georgia, Armenia, Azerbaijan and Kazakhstan are Asia.

Where a capital is split, disputed or moving, the entry uses the commonly taught answer and shows a note after reveal:

- **South Africa**: Pretoria, noting Cape Town and Bloemfontein.
- **Bolivia**: Sucre (constitutional), noting La Paz as seat of government.
- **Israel**: Jerusalem, noting its disputed status. **Palestine**: East Jerusalem (proclaimed), noting Ramallah.
- **Netherlands** (The Hague), **Côte d'Ivoire** (Abidjan), **Benin** (Cotonou), **Sri Lanka** (Colombo), **Malaysia** (Putrajaya), **Eswatini** (Lobamba), **Tanzania** (Dar es Salaam), **Burundi** (Gitega since 2019), **Nauru** (no official capital; Yaren).
- Things that may have changed recently: **Indonesia** (Jakarta; Nusantara not yet official as far as I know), **Egypt** (New Administrative Capital), **Equatorial Guinea** (Ciudad de la Paz), **Sudan** (government largely in Port Sudan), **Yemen** (Aden).

The `hard` flag is a judgment call: capitals that aren't the best-known city (Ankara, Canberra, Ottawa), obscure ones (Ngerulmud, Palikir), and commonly confused pairs (the Baltics, Slovakia/Slovenia, Niger/Nigeria, Kingston/Kingstown). Edit the fifth column in `data/countries.js` to taste.

The map pin sits at the centre of each country's largest landmass, not on the capital; for Kiribati it's moved to the Gilbert Islands, near Tarawa.
