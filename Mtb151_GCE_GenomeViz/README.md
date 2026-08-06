# Mtb151 Gene Conversion Event — Genome Browser Explorer

A static, no-build-step web page for interactively exploring gene conversion (GC)
events detected across 151 *Mycobacterium tuberculosis* genomes: a searchable
table of all events (one row per event) wired to an integrated
[Gosling.js](https://gosling-lang.org/) genome browser and a per-event details
panel.

This directory is self-contained and ready to either run standalone or be
linked into a larger site (e.g. a manuscript landing page) — see
"Integrating into a larger site" below.

## Paper

> "Gene conversion is a key driver of diversity hotspots in *Mycobacterium
> tuberculosis* antigens and virulence-associated loci"
> bioRxiv: https://doi.org/10.64898/2026.02.26.708061
> Manuscript/analysis repo: https://github.com/maxgmarin/mtb-geneconv-manuscript

## Running locally

No build step, no dependencies to install. From this directory:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Deploying

This is a plain static site (`index.html` + `app.js` + `styles.css`, one
`data/` folder). It can be served as-is from GitHub Pages, S3, Netlify, or any
static host — just publish this whole directory. No build/bundle step is
required; the browser resolves everything at load time (see "How it works").

## File structure

```
index.html      Page structure: intro text, events table, Gosling panel, side info panel
app.js          All application logic (data loading, table, Gosling spec, interactions)
styles.css      All styling
data/           Local TSV copies (currently unused fallback -- see below)
```

There is no build tooling (no `package.json`, no bundler) by design — this is
meant to stay a drop-in static page.

## How it works

- **No framework.** Plain HTML/CSS/vanilla JS. The only "framework" involved is
  [Gosling.js](https://gosling-lang.org/), a declarative grammar for genome
  browser visualizations (built on [HiGlass](http://higlass.io/)).
- **No bundler.** `app.js` is loaded as an ES module (`<script type="module">`
  in `index.html`) and imports Gosling directly from a CDN:
  ```js
  import { embed as goslingEmbed } from "https://esm.sh/gosling.js";
  ```
  [esm.sh](https://esm.sh/) resolves and bundles Gosling's peer dependencies
  (React, PixiJS, HiGlass) into browser-compatible ES modules on the fly. This
  was necessary because gosling.js's own npm `dist` build has bare (unresolved)
  imports that a plain `<script>` tag / browser can't load directly — esm.sh's
  URL resolves them for us. There is no plain UMD global (`window.gosling`) in
  current gosling.js releases; it must be `import`ed.
- **Data loading.** On page load, `app.js` fetches the main events TSV
  (`DATA_URLS.eventsTsv`), parses it client-side (`parseTsv()` — naive
  tab-split, no library), and renders the top table. Separately, the Gosling
  spec (`makeGoslingSpec()`) declares `csv` data sources for each track, which
  Gosling fetches and parses itself.
- **Interactions** (see `app.js`):
  - Typing in the search box filters the table (`filterRows()`), matching
    across `EventID`, node IDs, lineage, overlapping genes, and coordinates.
  - Clicking a table row (`selectEvent()`) zooms the Gosling view to that
    event's coordinates (±3kb padding) via `gosApi.zoomTo(trackId, position,
    padding, durationMs)`, and populates the right-hand info panel
    (`renderEventInfoPanel()`).
  - Clicking an event block *inside* the Gosling recombination-events track
    (`onGoslingTrackClick()`, wired via `gosApi.subscribe("click", ...)`)
    selects and highlights the matching table row and updates the info panel,
    without re-triggering a zoom (you're already looking at that region).
  - "Reset view" zooms out to the full H37Rv genome.

### Gosling API gotchas worth knowing (learned the hard way)

These aren't documented clearly in Gosling's own docs and cost real debugging
time — worth preserving for whoever edits this next:

- `embed(container, spec)` resolves directly to the API object — **not**
  `{ api }`. (`const api = await embed(...)`, not `const { api } = ...`.)
- `api.zoomTo(id, position, padding, durationMs)`'s `id` argument is a
  **track** id (any track that shares the view's `linkingId` works), *not* a
  view id. Passing a view id (e.g. from `api.getViews()[0].id`) silently fails
  validation ("Chromosome name ... is not valid") because `zoomTo` internally
  calls `getTrack(id)`, not `getView(id)`.
- Several per-mark style properties must be nested under a `style: {...}`
  object, not set as top-level keys on the mark — this includes `dy` (text
  offset), `align` (triangle mark alignment), and `linePattern` (rule mark
  arrow ticks). Setting them top-level doesn't error; Gosling just silently
  ignores them (console shows an AJV schema warning if you look).
- Click event hit-testing is enabled per-mark via a top-level `mouseEvents: {
  click: true }` property — **not** `experimental: { mouseEvents: true }`
  (that's from an older Gosling/Streamlit-wrapper API and no longer works).
  `api.subscribe("click", callback)` is registered *globally* per event type
  (there's no per-track subscribe filtering); the callback must check
  `payload.id` itself to know which track fired.
- A `rule`/`triangle` mark's clickable/hoverable area is only as tall as the
  mark itself (a few px). For genes, we added an invisible `rect` mark
  (`hoverTarget` in `app.js`) spanning the gene's full row height so tooltips
  work anywhere over the gene, not just exactly on the thin arrow line.
- Track `title` alignment: `style: { titleAlign: "left" | "middle" | "right" }`.
- Tooltip rows support a custom display label via `alt` (falls back to the
  raw field name): `{ field: "Top_KmerMatch_HomologGeneIDs", type: "nominal",
  alt: "Paralog Gene IDs with Seq Match" }`.

## Data sources

All five tracks currently load live from the public manuscript GitHub repo
([maxgmarin/mtb-geneconv-manuscript](https://github.com/maxgmarin/mtb-geneconv-manuscript),
`main` branch) via `raw.githubusercontent.com` URLs, hardcoded in
`DATA_URLS` at the top of `app.js`:

| `DATA_URLS` key | Source table | Used for |
|---|---|---|
| `eventsTsv` | `Results/Gubbins_Results.Mtb151.MapToParalogs.Event-To-HmRegion-Comparison-V3/GubbinsEvents.WiParalogMapping.V1.tsv` | Main events table (top of page) **and** the "Individual Recombination Events" Gosling track — one row per detected GC event (N=324) |
| `geneTsv` | `References/201027_H37rv_AnnotatedGenes_And_IntergenicRegions/H37Rv_GenomeAnnotations.Genes.WiCtrAndLen.tsv` | "H37Rv Genes" track |
| `homologyTsv` | `Results/H37Rv.HomologyMap.k19w19.ProcessedData.V2/RvHmMap.k19w19.Aln.NoOverlap.Clustered.tsv` | "H37Rv Homology Map" track (within-genome paralog links) |
| `nucDivTsv` | `Results/NucDivStats.Mtb151/Mtb151.NucDiv.Per1kb.H37RvCoords.AllWindows.tsv` | "Nucleotide Diversity" track |
| `gcPerKbTsv` | `Results/Gubbins_Results.Mtb151_Dataset.v321_ExtSearch_SW_MS4_mpileup_SNVs_10AmbThresh/Gubbins.H37Rv.EventsPer1kb.tsv` | "Detected GC Events (Per 1kb window)" track |

`data/` contains local copies of (mostly) the same tables, from an earlier
iteration of this page before it was pointed at the public repo. **They are
no longer fetched** — the local-path lines are present in `DATA_URLS` but
commented out, kept deliberately as a fallback/reference rather than deleted.
To switch back to local files (e.g. for offline development, or if the GitHub
repo's paths change), uncomment those lines and comment out the remote ones.

Note some of these tables use different column names for logically-equivalent
values (documented inline in `app.js` next to `DATA_URLS`, and each
non-obvious re-mapping is called out with a comment right at the Gosling
field encoding that uses it):

- Homology identity-proportion column: local file called it `Prop_Match`;
  the current remote file calls it `SeqID` (same 0–1 scale).
- Nucleotide diversity column: local file had `NucDiv` (per-bp scale); the
  remote file only has `NucDiv_kb` (per-kb-window scale, ~1000x larger) — the
  y-axis domain was rescaled from `[0, 0.02]` to `[0, 20]` accordingly.

If the upstream repo's file paths or column names change, the fix is:
refetch the header row (`curl -s <raw-url> | head -1`) and compare against the
`chromosomeField` / `genomicFields` / `x` / `xe` / `y` / `tooltip` field names
used in the corresponding track object in `makeGoslingSpec()`.

## Known limitations / not implemented

- **Phylogeny view**: there is no tree/phylogeny visualization on this page.
  An earlier prototype (Streamlit-based, elsewhere in this project's history)
  embedded a separate tree-viewer library (`peartree`) via iframe +
  `postMessage`; that approach wasn't ported here. If a phylogeny view is
  wanted later, it would need its own component — nothing here currently
  reads a Newick/tree file.
- **Duplicate on-canvas EventID label removed**: an earlier version drew the
  EventID text twice per event block (once centered on the rect, once offset
  below); the centered copy was removed on request, leaving only the
  offset-below label (`recombEventsLabels` in `app.js`).
- No automated tests. Verification has been manual, via a local dev server
  + browser inspection.

## Integrating into a larger site

This page is designed to be handed off as a self-contained unit: copy this
whole directory as a subdirectory of a larger static site (or deploy it
separately and just link/iframe to it). It has no dependency on anything
outside this folder except the CDN (`esm.sh`) and the live GitHub raw-content
URLs for data.

Two integration patterns:
1. **Link out**: place this directory at some path in the larger site (e.g.
   `/gc-events/`) and link to it from a "core results" or "interactive
   figures" section of the manuscript page.
2. **Iframe embed**: `<iframe src="/gc-events/index.html">` from within a
   larger page. If doing this, note the Gosling visualization has a fixed
   internal width (`width: 1100` on each track, `min-width: 1200px` on
   `#goslingContainer` in `styles.css`) — the iframe (or its containing page)
   needs to be at least that wide, or the user will need to scroll
   horizontally inside the iframe.

The intro text block at the top of `index.html` (paper title, bioRxiv badge,
GitHub repo link) can be trimmed or removed if the surrounding site already
provides that context.
