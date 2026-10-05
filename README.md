# bfc-estimate — Lumber Quote & Project Estimator

Estimate a lumber quote straight from a cut list. Every line shows **net
board feet** (the finished part), **gross board feet** (with waste), the
**charged board feet** your dealer will actually bill (billing profile
rounding), and the price from your species price list — then the whole
project rolls up with markup, tax, delivery, fees and discount into a clean,
shareable quote.

Companion guide: [Lumber Cost Calculator](https://boardfootcalc.net/lumber-cost-calculator/) ·
See also [Hardwood Lumber Thickness Guide](https://boardfootcalc.net/hardwood-lumber-thickness-guide/)
and [Board Foot Formula Explained](https://boardfootcalc.net/board-foot-formula-explained/).

## Features

- **Cut list → quote** — one CSV of parts becomes a full material estimate.
- **Net / Gross / Charged BF per line** — waste factor uplift, then the
  dealer's billing profile (all 8 profiles from the shared engine, e.g.
  `whole-bf-per-piece`, `tenth-bf-per-piece`, `nominal-quarter`,
  `whole-foot-length`).
- **Species price list** — resolve $/BF by species and thickness; fall back
  across thickness quarters when needed.
- **Markup & totals** — markup percent, tax rate (with tax-included price
  support — never double-taxed), delivery, fees, discount.
- **Scenario comparison** — compare your default price list against an
  alternate supplier's in one command.
- **Project document** — one JSON file holds items, prices and settings;
  regenerates any time.
- **Exports** — shareable HTML quote, CSV quote (lines + totals), full JSON.

## Install

```bash
git clone <your-repo-url> bfc-estimate
cd bfc-estimate
npm install
npm run build
npm test
```

## Quick start

```bash
npm run demo
# creates ./demo/{project.json, quote.html, quote.csv, quote.json}
```

Or:

```bash
# 1. Create a project, embedding a price list
bfc-estimate init --project sideboard.json --name "Walnut Sideboard" --price-list prices.csv

# 2. Import the material list
bfc-estimate import --project sideboard.json --materials cutlist.csv

# 3. Estimate
bfc-estimate estimate --project sideboard.json --billing tenth-bf-per-piece --waste 0.15 --markup 40

# 4. Final quote with tax & delivery
bfc-estimate quote --project sideboard.json --customer "Acme" --tax-rate 8.5 --delivery 45 --fees 20

# 5. Export
bfc-estimate report --project sideboard.json --html quote.html --csv quote.csv --json quote.json

# Compare an alternate supplier's price list
bfc-estimate scenario --project sideboard.json --price-list alt-prices.csv --name "Dealer B"
```

## CLI reference

```
bfc-estimate init --project <file> [--name <n>] [--customer <c>] [--price-list <file>]
bfc-estimate import --materials <cutlist.csv|xlsx> --project <file> [--replace]
bfc-estimate estimate --project <file> [--waste 0.15] [--billing <profile>] [--markup 40] [--json <out>] [--csv <out>]
bfc-estimate quote --project <file> [--customer <c>] [--tax-rate 8.5] [--tax-included] [--delivery <n>] [--fees <n>] [--discount <n>] [--out <file>]
bfc-estimate scenario --project <file> --price-list <file> [--name <n>]
bfc-estimate report --project <file> [--html <out.html>] [--csv <out.csv>] [--json <out.json>]
bfc-estimate demo
```

## Input formats

**Material list CSV** — headers matched by synonym:

| Part ID | Part Name | Quantity | Species | Grade | Thickness | Width | Length |
|---|---|---|---|---|---|---|---|
| T1 | Top | 1 | Black Walnut | FAS | 8/4 | 24 | 48 |
| S1 | Side | 2 | Black Walnut | FAS | 8/4 | 18 | 30 |

**Price list CSV**:

| Species | Thickness | $/BF |
|---|---|---|
| Black Walnut | 8/4 | 13.5 |
| Hard Maple | 4/4 | 8.75 |

## How the numbers work

For every line:

```
netBF      = thickness × width × length / 144 × quantity
grossBF    = netBF × (1 + wasteFactor)              # material you must buy
chargedBF  = grossBF re-billed through the billing profile   # what you pay for
lineCost   = chargedBF × $/BF
costWithMarkup = lineCost × (1 + markupPct)
```

Project total = subtotal + tax + delivery + fees − discount (tax-included
prices are never taxed a second time).

## Engine

Frozen copy of the shared
[BoardFootCalc Desktop Lumber Calculation Engine](https://boardfootcalc.net/) in `src/core/`
— board feet, billing profiles, waste factors, pricing modes and tax handling
are identical across all five tools and the
[online calculators](https://boardfootcalc.net/lumber-cost-calculator/).

## Tests

```bash
npm test   # estimate math, billing profiles, quote totals, imports
```

## License

MIT. Quotes are planning estimates — confirm current pricing and rounding
with your supplier before committing.
