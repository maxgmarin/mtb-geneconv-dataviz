# Starting point for looking up R2-hosted CRAM/reference URLs in Python notebooks.
# Catalog files (r2_file_catalog.tsv / .json) are a snapshot of the mtb-geneconv R2
# bucket's contents as of generation time -- regenerate via `aws s3 ls --recursive`
# against the bucket if files are added/changed (see NucFlag_Testing/IgvReportsStaticSite/
# README.md "R2 upload" for bucket/credential setup).
#
# file_type values: reference_fasta, reference_fasta_fai, reference_genes_gff,
# lr_full_depth_cram(.crai), lr_100x_cram(.crai), asm_cram(.crai).
# cohort values: Mtb151, TBP22CI.

import json
from pathlib import Path

CATALOG_JSON = Path(__file__).parent / "r2_file_catalog.json"


def load_catalog(path=CATALOG_JSON):
    with open(path) as f:
        return json.load(f)


def reference_url(catalog, file_type):
    """e.g. reference_url(catalog, "reference_fasta")"""
    return catalog["reference"][file_type]["url"]


def sample_url(catalog, cohort, sample, file_type):
    """e.g. sample_url(catalog, "Mtb151", "TB3113", "lr_100x_cram")"""
    return catalog["samples"][cohort][sample][file_type]["url"]


def all_samples(catalog, cohort):
    return sorted(catalog["samples"][cohort].keys())


if __name__ == "__main__":
    catalog = load_catalog()
    print("H37Rv reference fasta:", reference_url(catalog, "reference_fasta"))
    print("TB3113 100X-capped LR CRAM:", sample_url(catalog, "Mtb151", "TB3113", "lr_100x_cram"))
    print("Mtb151 sample count:", len(all_samples(catalog, "Mtb151")))
    print("TBP22CI sample count:", len(all_samples(catalog, "TBP22CI")))
