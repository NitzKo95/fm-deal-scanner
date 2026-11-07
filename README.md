# FM Deal Scanner

Reads MapleStory Classic World player shops off your screen and flags listings under their usual price.

**Use it:** https://barelimelech94.github.io/fm-deal-scanner/ (Chrome on a computer)

1. Press **Start capture** and share the MapleStory window.
2. Load market prices once: on [meso.watch](https://meso.watch), once your world's price table has loaded, save the page
   (⌘S) as **Webpage, Complete** and pick that .html file under **Prices and backup**.
3. Open shops in the game. Listings show up within a second; deals chime and land in **Deals this session**.
4. **Pop out overlay** keeps a small always-on-top window over the game.

Hover an item in a shop and its stats are read from the tooltip: points above or below the item's base, and
used upgrade slots, move its usual price up or down (tune how much under **Rules**). This needs a usual price
for the item, from the tracker or your own sightings.

Every item gets its picture, and its name is matched, whether or not a tracker page is loaded: the game's own
item list fills in for items the tracker doesn't list.

### Appraisal

When someone asks "how much for all?", the **Appraisal** panel adds up a pile of items. Type or paste item names
with a count (`Cape INT Scroll: Lesser x3`), and it totals them from the loaded market prices. Type a price on any
line to use your own for that line, skip a line you're keeping, and set an **Offer** percentage for taking everything.
**Copy quote** puts a one-line total on the clipboard for the game's chat; **Copy full list** gives every line.

It reads prices in a mode, and the shop scanner's is only one of them:

- **Cheap** (the shop scanner): your typed price, else the lower of the market price and your own sightings, so only
  real bargains stand out.
- **Fair** (appraisal): your typed price, else the market's typical price.
- **Greedy** (appraisal): your typed price, else the higher of the market's typical price and the upper quarter of your
  own sightings.

Items with a rough price (fewer than 5 sales, or copies that sell very differently) are counted and marked; items with
no price are left out of the total and flagged. The modes live in one table in `src/pricing/evaluate.ts`, so a better
rule for one is a change to one entry.

Everything stays in your browser. Nothing you see or set is sent anywhere; the only outside requests are the
item pictures from [maplestory.io](https://maplestory.io).

### Moving from the single-file scanner

In the old `FM_Deal_Scanner.html`, press **Export**. On the site, press **Import** and pick that file. Your
sightings, typed prices, buy-under prices and marked area come along.

## How it works

Each check takes the newest frame of the share and:

1. **Finds the shop list** by color. List cells are one blue-gray (the selected row orange) at any window size.
   The right edge most cell-colored runs end at is the list's edge; the rows stacked along it, and the columns
   to their left until the icons, are the list. A patch of that color without text in it is scenery.
   `src/vision/locateShop.ts`
2. **Finds a hover tooltip** by the orange bullets that start its stat lines: a vertical column of evenly
   spaced dots. The frame is examined at 1.5 pixels per game pixel (known from the list's width), since the
   bullets are only 3 game pixels across. `src/vision/findTooltip.ts`
3. **Reads the text** with [tesseract.js](https://github.com/naptha/tesseract.js), in a worker, on a crop made
   for it: list text gray from the brightest channel (so the orange row reads like the others), tooltip text
   inverted. `src/vision/preprocess.ts`, `src/scan/scanner.ts`
4. **Parses** "N for X mesos" lines and their names, catching the reader's usual mistakes: letters for digits,
   hidden digits (a wide gap inside a price), sold rows (grey text). `src/listing/parseListing.ts`,
   `src/tooltip/parseTooltip.ts`
5. **Matches** names to your price book's and the tracker's items, then to every item in the game, allowing a
   misread letter or two in long names but never guessing between two items. `src/market/matching.ts`
6. **Judges** each listing against its usual price: your typed price, else the lower of the market price and
   your own sightings. `src/pricing/evaluate.ts`
7. **Confirms** a listing only when two of the last three reads agree, so a frame caught mid-scroll can't invent
   a deal. `src/shop/session.ts`

Everything up to the browser glue is plain TypeScript with no DOM, so it is tested directly.

## Development

```sh
npm install
npm run dev        # http://localhost:5173/fm-deal-scanner/
npm test           # unit tests
npm run bench      # accuracy benchmark: screenshots through the whole scanner, real text reader
npm run test:e2e   # the built site in Chromium: shop reading at 9 sizes, tooltips, data import, layout
npm run build      # dist/, served under /fm-deal-scanner/
npm run items      # public/items.json: every item's id by name, from maplestory.io (CI runs it before building)
```

The test screenshots are in `tests/fixtures/img`. `npm run record-ocr -- <image>` records what the text reader
makes of one, for the parser tests in `tests/fixtures/ocr`.

Every push to `main` runs all of the above in GitHub Actions and publishes `dist/` to GitHub Pages.

## Credits

Item pictures and names: [maplestory.io](https://maplestory.io) (MapleStory Classic World data). Text reading:
[tesseract.js](https://github.com/naptha/tesseract.js). Not affiliated with Nexon.
