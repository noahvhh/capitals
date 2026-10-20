# Capitals

A small, dark, offline-friendly web app for learning the world's capitals, with the flag and a locator map on every question. Plain HTML, CSS and JavaScript; no build step, no dependencies.

## Run it locally

Either:

- **Open `index.html`** straight from the folder (double-click). Everything works, except the offline cache, which needs a server.
- **Or serve the folder** (recommended, and what a phone on the same Wi-Fi can open):

  ```sh
  cd capitals
  python3 -m http.server 8000
  # then open http://localhost:8000 (or http://<your-computer's-IP>:8000 on your phone)
  ```

On iPhone, use Share → Add to Home Screen for a full-screen app that works offline after the first visit.

## Deploy (GitHub + Vercel)

The repo is `noahvhh/capitals`, imported into Vercel as a project with framework preset **Other**, no build command and output directory `.` (the repo root). It's live at https://capitals-ecru.vercel.app, and every push to `main` redeploys. `vercel.json` sets caching headers for the service worker and fonts.

The service worker fetches from the network first, so a new deploy shows up on the next load; the saved copy is only used offline or when the network takes more than 4 seconds. After changing any file, bump `VERSION` in `sw.js` too, so the offline copy is replaced in one go and any page still showing an older version reloads itself.

## Files

```
index.html             screens and SVG icon sprite
css/styles.css         all styling (tokens at the top)
data/countries.js      195 countries: iso2, name, capital, continent, hard, note, aka
data/map.js            generated world outlines, loaded after the home screen paints
js/storage.js          CA.store: settings + progress, versioned localStorage, export/import/reset
js/quiz.js             CA.quiz: pools, the review list, sessions (deck-agnostic)
js/decks/capitals.js   the capitals deck definition
js/config.js           which deck is active, review lengths
js/render.js           generic renderers for text / flag / map / image fields
js/map.js              canvas locator map (camera flights, highlight, pin for small countries)
js/flag.js             emoji flags from ISO codes
js/speech.js           Web Speech API wrapper
js/ui.js               screens, question flow, settings
sw.js                  offline cache
tools/build-map.mjs    regenerates data/map.js (optional, needs Node)
```

## How it works

- **Review mistakes** asks only countries you've missed, worst first, up to the review length in Settings, shuffled. Each country has a miss score: a miss adds 1 and a right answer halves it, and it stays on the review list while the score is 0.3 or more. So one miss takes two right answers to clear, two misses take three. The button shows how many are waiting and is off when there are none.
- **By continent** offers Easy, Hard and All, using the `hard` flag. **Mixed** quizzes any ticked continents. **Random** is every country, shuffled.
- **Ask for the** capital, the country, or both (chosen per question). When asking for the country, the flag and map stay hidden until you answer, since they'd give it away; a setting turns that off.
- **Answer by** (Settings) picking from 4 choices (the default) or with self-check (Reveal, then Got it or Missed). The wrong choices come from the same continent. After a pick the right one lights up and the next question comes by itself, sooner when you were right; tap a choice again to move on straight away.
- **Voice** (Settings) reads prompts and answers in en-GB at an adjustable speed. **Hands-free** reveals and moves on by itself and keeps the screen awake, so it always uses self-check. iOS stops web pages when the phone is locked, so hands-free needs the screen on (it can be dimmed); no web app can keep talking with the screen fully off.
- **Keyboard**: with choices, 1–4 picks and Space, Enter or → moves on. With self-check, Space reveals, → or Enter = Got it, ← = Missed. Esc ends the session.

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

- **Map**: Natural Earth (public domain) country outlines from the `world-atlas` package, 1:50m, with Tuvalu from 1:10m because it's missing at 50m. `tools/build-map.mjs` projects them to an equirectangular SVG cropped to 84°N–58°S and stores a path, pin point and bounding box per country (~107 KB gzipped). It's fetched after the home screen shows, so it doesn't slow the first load, and is then cached offline. Somaliland is drawn as part of Somalia and Northern Cyprus as part of Cyprus; Kosovo and Western Sahara are drawn as plain, unhighlighted land. If a country has no outline, the map shows the world with the continent name and a marker. `js/map.js` draws the outlines on a canvas, with simplified copies for zoomed-out views so every frame stays cheap, and moves between countries with a zoom-out, pan, zoom-in flight (van Wijk and Nuij's smooth zoom, as in `d3.interpolateZoom`). To rebuild: `npm i world-atlas@2.0.2 topojson-client@3 d3-geo@3 i18n-iso-countries` then `node tools/build-map.mjs`.
- **Flags**: emoji built from the ISO code, so there are no image files. iPhone and Mac use their own emoji; elsewhere (Windows has no flag emoji) the app uses `fonts/twemoji-country-flags.woff2` from [country-flag-emoji-polyfill](https://github.com/talkjs/country-flag-emoji-polyfill) 0.1.8, built from Twemoji graphics (CC-BY 4.0, © Twitter, Inc and other contributors).
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
