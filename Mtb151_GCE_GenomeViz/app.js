// Mtb H37Rv Gene Conversion Event Explorer
// Data table pattern ported from MtbGC_DataVizAppDev/MtbGC_ResultsViz/try7-web/app.js
// Gosling spec ported from Marimo_MtbGC_Viz/notebooks/mtb_gc_viz.py (make_h37rv_gene_homology_spec)

// gosling.js dist is an ES module whose bare imports (react, pixi.js, higlass)
// the browser can't resolve directly; esm.sh resolves/bundles those for us.
import { embed as goslingEmbed } from "https://esm.sh/gosling.js";

const DATA_URLS = {
  // Local copies (commented out, not deleted -- kept for reference/fallback):
  // eventsTsv: "./data/GubbinsEvents.WiParalogMapping.V1.tsv",
  // geneTsv: "./data/H37Rv_GenomeAnnotations.Genes.WiCtrAndLen.tsv",
  // homologyTsv: "./data/H37rv.HmMap.k19w19.NoOverlap.No100SeqID.Processed.V2.tsv",
  // nucDivTsv: "./data/WGA.SNVs.NucDiv.1000bp.ALL.Anno.V2.tsv",
  // gcPerKbTsv: "./data/Gubbins.H37Rv.EventsPer1kb.tsv",

  // Public raw GitHub URLs (maxgmarin/mtb-geneconv-manuscript, main branch):
  eventsTsv: "https://raw.githubusercontent.com/maxgmarin/mtb-geneconv-manuscript/refs/heads/main/Results/Gubbins_Results.Mtb151.MapToParalogs.Event-To-HmRegion-Comparison-V3/GubbinsEvents.WiParalogMapping.V1.tsv",
  geneTsv: "https://raw.githubusercontent.com/maxgmarin/mtb-geneconv-manuscript/refs/heads/main/References/201027_H37rv_AnnotatedGenes_And_IntergenicRegions/H37Rv_GenomeAnnotations.Genes.WiCtrAndLen.tsv",
  // Note: this table's identity-proportion column is named "SeqID" (0-1 scale),
  // where the old local file called the same thing "Prop_Match" -- see the
  // homologyLinks dataTransform filter below, updated to match.
  homologyTsv: "https://raw.githubusercontent.com/maxgmarin/mtb-geneconv-manuscript/refs/heads/main/Results/H37Rv.HomologyMap.k19w19.ProcessedData.V2/RvHmMap.k19w19.Aln.NoOverlap.Clustered.tsv",
  // Note: this table only has "NucDiv_kb" (not "NucDiv") -- see nucDivBar/nucDivPoint below, updated to match.
  nucDivTsv: "https://raw.githubusercontent.com/maxgmarin/mtb-geneconv-manuscript/refs/heads/main/Results/NucDivStats.Mtb151/Mtb151.NucDiv.Per1kb.H37RvCoords.AllWindows.tsv",
  gcPerKbTsv: "https://raw.githubusercontent.com/maxgmarin/mtb-geneconv-manuscript/main/Results/Gubbins_Results.Mtb151_Dataset.v321_ExtSearch_SW_MS4_mpileup_SNVs_10AmbThresh/Gubbins.H37Rv.EventsPer1kb.tsv",
};

const ASSEMBLY = [["NC_000962.3", 4411532]];
const TRACK_ID = "track-1";
const GOSLING_ZOOM_TRACK_ID = "main";
const RECOMB_CLICK_TRACK_ID = "recomb-events-track";

const MycoB_GeneCats = [
  "conserved hypotheticals", "intermediary metabolism and respiration",
  "cell wall and cell processes", "lipid metabolism",
  "information pathways", "virulence, detoxification, adaptation",
  "regulatory proteins", "PE/PPE", "insertion seqs and phages",
  "stable RNAs", "unknown",
];
const MycoB_GeneCat_Colors = [
  "#FF9090", "#FF7423",
  "#0F9530", "#AF4F2A",
  "#EA1A24", "#A4DA84",
  "#C5A9CF", "#61368C", "#96C7DD",
  "#006DA8", "#757575",
];

const els = {
  status: document.getElementById("statusText"),
  search: document.getElementById("searchInput"),
  tbody: document.querySelector("#eventsTable tbody"),
  summary: document.getElementById("eventsSummary"),
  goslingContainer: document.getElementById("goslingContainer"),
  homeBtn: document.getElementById("homeBtn"),
  eventInfo: document.getElementById("eventInfo"),
};

// Columns shown in the side info panel for a selected event, in display order.
// Label is a friendlier version of the raw TSV column name.
const EVENT_INFO_FIELDS = [
  { key: "EventID", label: "Event ID" },
  { key: "seqname", label: "Chromosome" },
  { key: "start_1based", label: "Start (1-based)" },
  { key: "end_1based", label: "End (1-based)" },
  { key: "EventLen", label: "Event length (bp)" },
  { key: "Lineage", label: "Lineage" },
  { key: "Overlap_Genes", label: "Overlapping genes" },
  { key: "Overlap_Gene_RvIDs", label: "Overlapping Rv IDs" },
  { key: "Child_Node", label: "Child node" },
  { key: "Parent_Node", label: "Parent node" },
  { key: "snp_count", label: "SNP count" },
  { key: "NumHmTargets", label: "Homology map targets" },
  { key: "Overlap_HHRs", label: "Overlapping HHRs" },
  { key: "Top_KmerMatch_HomologGeneIDs", label: "Paralog Gene IDs with Seq Match" },
];

let state = {
  rows: [],
  filteredRows: [],
  selectedEventId: null,
  gosApi: null,
};

function parseTsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return [];
  const headers = lines[0].split("\t");
  return lines.slice(1).map((line) => {
    const vals = line.split("\t");
    const row = {};
    headers.forEach((h, i) => { row[h] = vals[i] ?? ""; });
    return row;
  });
}

async function loadEvents() {
  const resp = await fetch(DATA_URLS.eventsTsv);
  if (!resp.ok) throw new Error(`Could not load events TSV (${resp.status})`);
  const text = await resp.text();
  state.rows = parseTsv(text);
  state.filteredRows = state.rows.slice();
  state.selectedEventId = state.rows[0]?.EventID || null;
}

function filterRows(query) {
  const q = query.trim().toLowerCase();
  if (!q) return state.rows.slice();
  return state.rows.filter((r) => {
    const hay = [
      r.EventID, r.Child_Node, r.Parent_Node, r.Lineage,
      r.Overlap_Genes, r.Overlap_Gene_RvIDs, r.seqname,
      r.start_1based, r.end_1based,
    ].join("\t").toLowerCase();
    return hay.includes(q);
  });
}

function renderTable() {
  els.tbody.innerHTML = "";
  for (const r of state.filteredRows) {
    const tr = document.createElement("tr");
    if (r.EventID === state.selectedEventId) tr.dataset.active = "1";
    tr.innerHTML = `
      <td>${r.EventID || ""}</td>
      <td>${r.seqname || ""}</td>
      <td>${r.start_1based || ""}</td>
      <td>${r.end_1based || ""}</td>
      <td>${r.EventLen || ""}</td>
      <td>${r.Lineage || ""}</td>
      <td>${r.Overlap_Genes || ""}</td>
      <td>${r.Child_Node || ""}</td>
      <td>${r.Parent_Node || ""}</td>
    `;
    tr.addEventListener("click", () => selectEvent(r));
    els.tbody.appendChild(tr);
  }
  els.summary.textContent = `Showing ${state.filteredRows.length} of ${state.rows.length} events.`;
}

function renderEventInfoPanel(row) {
  if (!row) {
    els.eventInfo.innerHTML = `<p class="info-empty">Select an event row above to see its details here.</p>`;
    return;
  }
  const rowsHtml = EVENT_INFO_FIELDS.map(({ key, label }) => `
    <div class="info-row">
      <dt>${label}</dt>
      <dd>${row[key] || "—"}</dd>
    </div>
  `).join("");
  els.eventInfo.innerHTML = `<dl>${rowsHtml}</dl>`;
}

function selectEvent(row, { zoom = true } = {}) {
  if (!row) return;
  state.selectedEventId = row.EventID;
  renderTable();
  renderEventInfoPanel(row);

  if (zoom && state.gosApi) {
    const start = Math.max(1, parseInt(row.start_1based, 10) - 3000);
    const end = parseInt(row.end_1based, 10) + 3000;
    const pos = `${row.seqname}:${start}-${end}`;
    // zoomTo's first arg is a *track* id (any linked track works), not a view id --
    // "main" is the id assigned to the homology-links track below.
    state.gosApi.zoomTo(GOSLING_ZOOM_TRACK_ID, pos, 1500, 4000);
  }
}

// Scrolls a row into view within its own scrollable table container only --
// unlike Element.scrollIntoView(), this never touches the page's scroll
// position (scrollIntoView walks *all* scrollable ancestors, including the
// window, which yanks the whole page back up to the table).
function scrollRowIntoTableView(tr) {
  const container = tr?.closest(".table-wrap");
  if (!tr || !container) return;
  const rowTop = tr.offsetTop;
  const rowBottom = rowTop + tr.offsetHeight;
  if (rowTop < container.scrollTop) {
    container.scrollTop = rowTop;
  } else if (rowBottom > container.scrollTop + container.clientHeight) {
    container.scrollTop = rowBottom - container.clientHeight;
  }
}

// Clicking an event rect/label in the Gosling track selects the matching
// table row (and scrolls it into view), without re-triggering a zoom --
// the user just clicked that exact locus, so the view is already there.
function onGoslingTrackClick(_type, eventPayload) {
  // Gosling click payload shape: { id, genomicPosition, data: [rawRow, ...] }
  const trackId = eventPayload?.id;
  if (trackId !== RECOMB_CLICK_TRACK_ID && trackId !== `${RECOMB_CLICK_TRACK_ID}-labels`) return;
  const eventId = eventPayload?.data?.[0]?.EventID;
  if (!eventId) return;
  const row = state.rows.find((r) => r.EventID === eventId);
  if (!row) return;
  selectEvent(row, { zoom: false });
  scrollRowIntoTableView(els.tbody.querySelector(`tr[data-active="1"]`));
}

function makeGoslingSpec() {
  const geneData = {
    type: "csv",
    url: DATA_URLS.geneTsv,
    separator: "\t",
    chromosomeField: "Chrom",
    genomicFields: ["Start", "End"],
  };

  const tooltipCols = [
    { field: "Start", type: "genomic" },
    { field: "End", type: "genomic" },
    { field: "Strand", type: "nominal" },
    { field: "Symbol", type: "nominal" },
    { field: "Length", type: "quantitative" },
    { field: "Feature", type: "nominal" },
    { field: "Functional_Category", type: "nominal" },
  ];

  const baseEncoding = {
    row: { field: "Strand", type: "nominal", domain: ["+", "-"] },
    color: {
      field: "Functional_Category", type: "nominal",
      domain: MycoB_GeneCats, range: MycoB_GeneCat_Colors,
    },
    tooltip: tooltipCols,
  };

  const plusRange = {
    mark: "rule",
    style: { linePattern: { type: "triangleRight", size: 5 } },
    data: geneData,
    x: { field: "Start", type: "genomic" },
    xe: { field: "End", type: "genomic" },
    strokeWidth: { value: 3 },
    ...baseEncoding,
    dataTransform: [
      { type: "filter", field: "Feature", oneOf: ["CDS"] },
      { type: "filter", field: "Strand", oneOf: ["+"] },
    ],
    visibility: [{ operation: "LT", measure: "zoomLevel", target: "mark", threshold: 500000, transitionPadding: 100000 }],
  };

  const minusRange = {
    mark: "rule",
    style: { linePattern: { type: "triangleLeft", size: 5 } },
    data: geneData,
    x: { field: "Start", type: "genomic" },
    xe: { field: "End", type: "genomic" },
    strokeWidth: { value: 3 },
    ...baseEncoding,
    dataTransform: [
      { type: "filter", field: "Feature", oneOf: ["CDS"] },
      { type: "filter", field: "Strand", oneOf: ["-"] },
    ],
    visibility: [{ operation: "LT", measure: "zoomLevel", target: "mark", threshold: 500000, transitionPadding: 100000 }],
  };

  const plusHead = {
    mark: "triangleRight", style: { align: "left" },
    data: geneData,
    x: { field: "End", type: "genomic" },
    size: { value: 15 },
    ...baseEncoding,
    dataTransform: [
      { type: "filter", field: "Feature", oneOf: ["CDS"] },
      { type: "filter", field: "Strand", oneOf: ["+"] },
    ],
    visibility: [{ operation: "LT", measure: "zoomLevel", target: "mark", threshold: 500000, transitionPadding: 100000 }],
  };

  const minusHead = {
    mark: "triangleLeft", style: { align: "right" },
    data: geneData,
    x: { field: "Start", type: "genomic" },
    size: { value: 15 },
    ...baseEncoding,
    dataTransform: [
      { type: "filter", field: "Feature", oneOf: ["CDS"] },
      { type: "filter", field: "Strand", oneOf: ["-"] },
    ],
    visibility: [{ operation: "LT", measure: "zoomLevel", target: "mark", threshold: 500000, transitionPadding: 100000 }],
  };

  const labels = {
    mark: "text", style: { dy: -12 },
    data: geneData,
    x: { field: "Middle", type: "genomic" },
    text: { field: "Symbol", type: "nominal" },
    size: { value: 15 },
    ...baseEncoding,
    dataTransform: [{ type: "filter", field: "Feature", oneOf: ["CDS"] }],
    visibility: [
      { operation: "LT", measure: "zoomLevel", target: "mark", threshold: 50000, transitionPadding: 10000 },
      { operation: "LT", measure: "width", threshold: "|xe-x|", target: "mark", transitionPadding: 10 },
    ],
  };

  // Invisible rect spanning each gene's full body/row -- the visible rule/arrow
  // marks are only a few px tall, so without this, hovering anywhere on a gene
  // except directly on that thin line (or its text label) misses the tooltip.
  const hoverTarget = {
    mark: "rect",
    data: geneData,
    x: { field: "Start", type: "genomic" },
    xe: { field: "End", type: "genomic" },
    row: { field: "Strand", type: "nominal", domain: ["+", "-"] },
    size: { value: 20 },
    opacity: { value: 0 },
    tooltip: tooltipCols,
    dataTransform: [{ type: "filter", field: "Feature", oneOf: ["CDS"] }],
    visibility: [{ operation: "LT", measure: "zoomLevel", target: "mark", threshold: 500000, transitionPadding: 100000 }],
  };

  const geneAnnoOverlay = {
    alignment: "overlay",
    tracks: [hoverTarget, plusRange, minusRange, plusHead, minusHead, labels],
    title: "H37Rv Genes", height: 100, width: 1100, id: TRACK_ID,
    style: { titleAlign: "right" },
  };

  const homologyData = {
    type: "csv",
    url: DATA_URLS.homologyTsv,
    separator: "\t",
    chromosomeField: "Query_Name",
    genomicFields: ["Query_Start", "Query_End", "Target_Start", "Target_End"],
  };

  const homologyLinks = {
    mark: "withinLink",
    data: homologyData,
    x: { field: "Query_Start", type: "genomic" },
    xe: { field: "Query_End", type: "genomic" },
    x1: { field: "Target_Start", type: "genomic" },
    x1e: { field: "Target_End", type: "genomic" },
    stroke: { value: "#0072B2" }, color: { value: "#0072B2" },
    opacity: { value: 0.15 }, strokeWidth: { value: 1 },
    dataTransform: [{ type: "filter", field: "SeqID", inRange: [0, 0.99] }],
    title: "H37Rv Homology Map (No SeqID >99%)",
    height: 150, width: 1100, id: "main",
    style: { titleAlign: "right" },
  };

  const recombData = {
    type: "csv",
    url: DATA_URLS.eventsTsv,
    separator: "\t",
    chromosomeField: "seqname",
    genomicFields: ["start_1based", "end_1based"],
    sampleLength: 500,
  };

  const recombEventsTrack = {
    mark: "rect",
    data: recombData,
    row: { field: "pileuprow", type: "nominal" },
    x: { field: "start_1based", type: "genomic" },
    xe: { field: "end_1based", type: "genomic" },
    size: { value: 15 },
    tooltip: [
      { field: "EventID", type: "nominal" },
      { field: "EventLen", type: "quantitative" },
      { field: "snp_count", type: "quantitative" },
      { field: "Overlap_Genes", type: "nominal" },
      { field: "Child_Node", type: "nominal" },
      { field: "start_1based", type: "genomic" },
      { field: "end_1based", type: "genomic" },
      { field: "Top_KmerMatch_HomologGeneIDs", type: "nominal", alt: "Paralog Gene IDs with Seq Match" },
    ],
    strokeWidth: { value: 1 }, stroke: { value: "#800080" },
    color: { value: "#F419EF" }, opacity: { value: 1 },
    title: "Individual Recombination Events (Gubbins)", width: 1100,
    dataTransform: [{
      type: "displace", method: "pile",
      boundingBox: { startField: "start_1based", endField: "end_1based" },
      newField: "pileuprow",
    }],
    visibility: [{ operation: "LT", measure: "zoomLevel", target: "mark", threshold: 50000, transitionPadding: 10000 }],
    id: RECOMB_CLICK_TRACK_ID,
    mouseEvents: { click: true },
  };

  // EventID label text only appears once zoomed in past 2kb -- the rect mark
  // itself (and its tooltip/click behavior) keeps its own 50kb visibility threshold.
  const eventIdLabelVisibility = [
    { operation: "LT", measure: "zoomLevel", target: "mark", threshold: 2000, transitionPadding: 500 },
  ];

  const recombEventsLabels = {
    ...recombEventsTrack, mark: "text", style: { dy: 0 }, color: { value: "black" }, text: { field: "EventID", type: "nominal" },
    id: `${RECOMB_CLICK_TRACK_ID}-labels`,
    visibility: eventIdLabelVisibility,
  };

  const gcEventsOverlay = {
    alignment: "overlay",
    tracks: [recombEventsTrack, recombEventsLabels],
    title: "Individual Recombination Events (Gubbins)",
    height: 250, width: 1100, id: TRACK_ID,
    mouseEvents: { click: true },
    style: { titleAlign: "right" },
  };

  const nucDivData = {
    type: "csv", url: DATA_URLS.nucDivTsv, separator: "\t",
    chromosomeField: "Chrom", genomicFields: ["Start", "End"], sampleLength: 5000,
  };

  const nucDivBar = {
    mark: "bar", data: nucDivData,
    x: { field: "Start", type: "genomic" }, xe: { field: "End", type: "genomic" },
    y: { field: "NucDiv_kb", type: "quantitative", domain: [0, 20] },
    tooltip: [
      { field: "Middle", type: "genomic" }, { field: "Start", type: "genomic" },
      { field: "End", type: "genomic" }, { field: "NucDiv_kb", type: "quantitative" },
      { field: "OverlapGenes", type: "nominal" },
    ],
  };

  const nucDivPoint = {
    mark: "point", data: nucDivData,
    x: { field: "Middle", type: "genomic" },
    y: { field: "NucDiv_kb", type: "quantitative", domain: [0, 20] },
    size: { value: 4 },
    tooltip: nucDivBar.tooltip,
    visibility: [{ operation: "LT", measure: "zoomLevel", target: "mark", threshold: 10000, transitionPadding: 1000 }],
  };

  const nucDivOverlay = {
    alignment: "overlay", tracks: [nucDivBar, nucDivPoint],
    title: "Nucleotide Diversity (SNP/1kb)", height: 100, id: TRACK_ID,
    style: { titleAlign: "right" },
  };

  const gcPerKbData = {
    type: "csv", url: DATA_URLS.gcPerKbTsv, separator: "\t",
    chromosomeField: "Chrom", genomicFields: ["Start", "End"], sampleLength: 5000,
  };

  const gcCountBar = {
    mark: "bar", data: gcPerKbData,
    x: { field: "Start", type: "genomic" }, xe: { field: "End", type: "genomic" },
    y: { field: "pGCE_Count", type: "quantitative", domain: [0, 40] },
    tooltip: [
      { field: "Middle", type: "genomic" }, { field: "Start", type: "genomic" },
      { field: "End", type: "genomic" }, { field: "pGCE_Count", type: "quantitative" },
      { field: "Overlap_Genes", type: "nominal" },
    ],
    color: { value: "#800080" },
  };

  const gcCountPoint = {
    mark: "point", data: gcPerKbData,
    x: { field: "Middle", type: "genomic" },
    y: { field: "pGCE_Count", type: "quantitative", domain: [0, 40] },
    size: { value: 4 },
    tooltip: gcCountBar.tooltip,
    color: { value: "#800080" },
    visibility: [{ operation: "LT", measure: "zoomLevel", target: "mark", threshold: 10000, transitionPadding: 1000 }],
  };

  const gcCountOverlay = {
    alignment: "overlay", tracks: [gcCountBar, gcCountPoint],
    title: "Detected GC Events (Per 1kb window)", height: 100, id: TRACK_ID,
    style: { titleAlign: "right" },
  };

  return {
    tracks: [geneAnnoOverlay, nucDivOverlay, gcCountOverlay, gcEventsOverlay, homologyLinks],
    layout: "linear",
    linkingId: "main_linkid",
    assembly: ASSEMBLY,
    // Cap zoom-out just past the H37Rv genome boundaries, with a small margin
    // on each side so the full genome isn't flush against the view edges.
    zoomLimits: [-50000, ASSEMBLY[0][1] + 50000],
  };
}

async function initGosling() {
  const spec = makeGoslingSpec();
  state.gosApi = await goslingEmbed(els.goslingContainer, spec);
  // subscribe() is global per event type; onGoslingTrackClick filters by payload.id itself.
  state.gosApi.subscribe("click", onGoslingTrackClick);
}

function bind() {
  els.search.addEventListener("input", () => {
    state.filteredRows = filterRows(els.search.value);
    renderTable();
  });

  els.homeBtn.addEventListener("click", () => {
    if (state.gosApi) {
      state.gosApi.zoomTo(GOSLING_ZOOM_TRACK_ID, "NC_000962.3:1-4411532", 0, 4000);
    }
  });
}

async function main() {
  try {
    await loadEvents();
    bind();
    renderTable();
    els.status.textContent = "Loaded events, rendering genome browser...";
    await initGosling();
    els.status.textContent = "Ready";
  } catch (err) {
    els.status.textContent = `Error: ${err.message}`;
    console.error(err);
  }
}

main();
