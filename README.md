# mtb-geneconv-dataviz

A static, GitHub-Pages-hostable hub site linking to several interactive visualizations
of the data and results from the paper *Gene conversion is a key driver of diversity
hotspots in M. tuberculosis antigens and virulence-associated loci*
([bioRxiv](https://www.biorxiv.org/content/10.64898/2026.02.26.708061v2)).

**Live site**: (not yet published -- see "Publishing to GitHub Pages" below)

## What's here

```
mtb-geneconv-dataviz/
  index.html                  # landing page: intro + table of contents
  NucDivHotspots_Viewer/      # per-sample igv-reports viewer, 37 NucDiv hotspot windows
  MtbParalogRegions_Viewer/   # per-sample igv-reports viewer, ~200 paralogous regions
  Mtb151_GCE_GenomeViz/       # gene conversion event table + Gosling.js genome browser
  r2_catalog/                 # snapshot of every file in the shared R2 bucket, as
                              # TSV + JSON, plus a small Python loader
  R2_BUCKET_ACCESS.md         # bucket location, layout, and how to access the data
                              # directly (used by both igv-reports viewer sub-pages)
  LICENSE                     # MIT (covers this repo's code, not the underlying data)
  .nojekyll                   # tells GitHub Pages to serve files as-is, no Jekyll build
  .gitignore
```

No build step, no server-side code -- every sub-page is a plain static site.

## The sub-pages

### NucDivHotspots_Viewer

A copy of the standalone [MtbGC-NucDivHotspots-Viewer](https://github.com/maxgmarin/MtbGC-NucDivHotspots-Viewer)
repo's site: a sample table (search + lineage/tech filters) plus an iframe that loads a
per-sample igv-reports HTML, letting a reviewer step through all 37 nucleotide-diversity
hotspot windows (H37Rv coordinates) for any of the 151 Mtb151 samples. Each report
streams its H37Rv gene annotation, assembly-vs-H37Rv alignment (full depth), and
long-read-vs-H37Rv alignment (100X-capped) tracks live from Cloudflare R2 via HTTP range
requests -- `--no-embed` igv-reports output, ~17KB/report rather than the ~230MB/report
an embedded (`--standalone`) version would produce. See that repo's own README for the
full rationale; this copy is otherwise unmodified.

### MtbParalogRegions_Viewer

Same table + iframe pattern as above, but keyed on the ~200 paralogous regions (PRs) in
the H37Rv genome instead of the 37 NucDiv hotspots. Each report adds a fourth track (the
H37Rv self-to-self minimap2 homology map alignment, `k=w=19`) alongside the same three
tracks as the NucDiv viewer -- so a reviewer can see, at any PR, which other genome
region(s) that sequence is homologous to, right next to the gene annotation, assembly
alignment, and long-read alignment. `samples_data.js` is identical to the NucDiv
viewer's (same 151 samples, same metadata, same `reports/{sample}.html` convention) --
only `reports/`'s contents and `index.html`'s header text differ.

### Mtb151_GCE_GenomeViz

A table of all detected gene conversion events (one row per event, N=324) plus an
integrated genome browser built with [Gosling.js](https://gosling-lang.org/), showing
nucleotide diversity, gene conversion events, and paralogous-region homology across the
whole Mtb genome. Selecting a table row moves the browser to that region; clicking an
event block in the browser selects its row. All data is fetched live from the public
[mtb-geneconv-manuscript](https://github.com/maxgmarin/mtb-geneconv-manuscript) GitHub
repo -- this sub-page has no dependency on the Cloudflare R2 bucket used by the two
igv-reports viewers above. Functionality/data-loading logic is unmodified from the
original; only `styles.css` was edited, to match this site's font/color scheme.

## Regenerating / extending

- **NucDivHotspots_Viewer**: pull updates from the source
  [MtbGC-NucDivHotspots-Viewer](https://github.com/maxgmarin/MtbGC-NucDivHotspots-Viewer)
  repo (`index.html`, `samples_data.js`, `reports/`), then re-apply the `../index.html`
  breadcrumb link and the `../README.md` link fixes in `index.html`.
- **MtbParalogRegions_Viewer**: copy the updated
  `{sample}.ParalogousRegions_LRandAsmAlnToH37Rv_igvreport.Public.Subsample100x.html`
  files (produced by the internal Snakemake pipeline, not part of this repo) into
  `reports/{sample}.html`. `samples_data.js` only needs regenerating if the sample set
  or metadata changes -- otherwise it's identical to the NucDiv viewer's.
- **Mtb151_GCE_GenomeViz**: see its own `README.md` -- this sub-page is maintained
  independently and copied in wholesale.

## Standing dependency: Cloudflare R2

`NucDivHotspots_Viewer` and `MtbParalogRegions_Viewer` both depend on the
`mtb-geneconv` R2 bucket staying up and publicly readable indefinitely -- see
**[R2_BUCKET_ACCESS.md](R2_BUCKET_ACCESS.md)** for its exact location, layout, and how
to read the underlying CRAM/reference data directly. `Mtb151_GCE_GenomeViz` has no such
dependency (its data is served from GitHub directly).

## Publishing to GitHub Pages

1. Create an empty public repository on GitHub (public is required for free-tier
   Pages).
2. From this directory: `git remote add origin <your-repo-url>` then
   `git push -u origin main`.
3. In the repo's Settings -> Pages, set Source to "Deploy from a branch", branch
   `main`, folder `/ (root)`.
4. The site will be live at `https://<your-username>.github.io/<repo-name>/` within a
   few minutes.

## License

Code and documentation in this repo are MIT-licensed (see `LICENSE`). This does not
cover the underlying sequencing data (hosted on Cloudflare R2, governed by the
manuscript's data-release terms) or the `Mtb151_GCE_GenomeViz` sub-page's own data
sources (see its README).
