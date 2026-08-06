# Cloudflare R2 Bucket: Accessing the Underlying Alignment/Reference Data

This repo's viewer (`index.html` + `reports/`) never stores the actual sequencing data
-- every igv-reports HTML file streams its tracks live, via HTTP range requests, from a
public Cloudflare R2 bucket. This document is for anyone who wants to access that
underlying CRAM/reference data directly (e.g. in a script, notebook, or with `samtools`),
rather than through the viewer.

## Bucket

- **Name**: `mtb-geneconv`
- **Public base URL**: `https://pub-4ffd5d52d77a41f7b1f7021fbd09c3d2.r2.dev`
- This is Cloudflare's r2.dev "public development URL" -- convenient, but Cloudflare's
  own docs describe it as not intended for production traffic (informal rate limiting,
  no uptime guarantee). It's what's in use today; a custom domain may replace it later
  (see the main `README.md`'s R2-dependency note).
- Publicly readable (no credentials needed), CORS-enabled for cross-origin range
  requests (`Access-Control-Allow-Origin: *`), and supports HTTP `Range` requests --
  the same access pattern both igv.js (in-browser) and `samtools` (CLI, if htslib was
  built with libcurl support) use for random access into a remote CRAM.

## Layout

```
mtb-geneconv/
  reference/H37Rv/
    GCF_000195955.2_ASM19595v2_genomic.fasta(.fai)   # H37Rv reference, shared
    GCF_000195955.2_ASM19595v2_genomic.GenesOnly.gff  # H37Rv gene annotation, shared
  samples/{cohort}/{sample}/
    {sample}.LR.AlnToH37Rv.primary_only.cram(.crai)     # full-depth LR alignment
    {sample}.LR.AlnToH37Rv.Subsample100x.cram(.crai)     # 100X-capped LR alignment (what the viewer uses)
    {sample}.mm2.AsmToH37Rv.asm10.cram(.crai)             # assembly-vs-H37Rv alignment
```

`{cohort}` is `Mtb151` (151 samples) or `TBP22CI` (22 samples). All CRAM files require
the shared H37Rv reference fasta to decode (reference-based compression) -- pass it
explicitly (e.g. `samtools`'s `--reference` flag) when reading a CRAM remotely, since
htslib can't always resolve the reference path embedded in a CRAM's header across
machines.

**Why two LR alignment versions per sample**: the full-depth CRAM has every read; the
100X-capped one has reads removed (via [rasusa](https://github.com/mbhall88/rasusa),
coverage-based, not random) only for samples that exceed 100X, specifically so the
viewer's in-browser CRAM decoding stays fast even for a handful of very high-depth
outliers. Samples already under 100X are byte-for-byte unaffected by the cap. The viewer
in this repo only ever uses the 100X-capped version; the full-depth CRAM is available
for anyone who wants every read.

## The file catalog (`r2_catalog/`)

Rather than re-deriving URLs from the layout above, `r2_catalog/r2_file_catalog.tsv`
and `r2_catalog/r2_file_catalog.json` are a full, pre-built snapshot of every file in the
bucket (1,041 objects: 173 samples x 6 files + 3 shared reference files), each with its
URL, size, and last-modified timestamp. `r2_catalog/load_r2_file_catalog.py` is a small
Python starting point for looking things up by sample/cohort/file type:

```python
from load_r2_file_catalog import load_catalog, reference_url, sample_url, all_samples

catalog = load_catalog()
reference_url(catalog, "reference_fasta")
sample_url(catalog, "Mtb151", "TB3113", "lr_100x_cram")
all_samples(catalog, "TBP22CI")
```

`file_type` values: `reference_fasta(_fai)`, `reference_genes_gff`,
`lr_full_depth_cram(.crai)`, `lr_100x_cram(.crai)`, `asm_cram(.crai)`.

This catalog is a point-in-time snapshot, not live -- if files are added or changed in
the bucket, regenerate it (`aws s3 ls --recursive` against the bucket with any
S3-compatible client, pointed at R2's endpoint
`https://<account_id>.r2.cloudflarestorage.com` with `region=auto`; no real AWS account
needed, R2 just speaks the S3 API).

## Example: reading a remote region directly with `samtools`

```bash
samtools view -c \
  --reference https://pub-4ffd5d52d77a41f7b1f7021fbd09c3d2.r2.dev/reference/H37Rv/GCF_000195955.2_ASM19595v2_genomic.fasta \
  https://pub-4ffd5d52d77a41f7b1f7021fbd09c3d2.r2.dev/samples/Mtb151/S0085-01/S0085-01.LR.AlnToH37Rv.Subsample100x.cram \
  NC_000962.3:103000-104000
```

This fetches only the byte ranges needed for that one region -- not the whole file --
the same way the browser does when you open a report in this repo's viewer. Verified
working as of this writing (requires `htslib`/`samtools` built with libcurl support,
`libcurl=yes` in `samtools --version`'s HTSlib feature list).

**Known quirk, unresolved**: this exact `samtools` CLI access pattern fails with
`retrieval of region #N failed` for at least one sample (`TB3113`) specifically, even
though the same CRAM loads and renders correctly in-browser via igv.js in this repo's
viewer, and the file itself is confirmed byte-identical to the local copy (same MD5).
Root cause not identified -- not a data integrity problem, but something specific to
`samtools`' remote-access code path for this file. If you hit this on a sample, try a
different sample first before assuming the data itself is broken.
