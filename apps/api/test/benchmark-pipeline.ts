/**
 * End-to-end benchmark: filename → parse → metadata fetch → final result
 *
 * Usage:
 *   npx tsx apps/api/test/benchmark-pipeline.ts
 *
 * Requires a running DB with settings (or uses defaults).
 * Set OPENROUTER_API_KEY env var to test the LLM resolver path.
 */

import { filenameToBasicMetadata } from "../src/services/books";
import { fetchMetadataWithFallback, MetadataResult } from "../src/services/metadata";

const FILENAMES = [
  // Anna's Archive format
  "Fourth Wing -- Rebecca Yarros -- The Empyrean #1, 2023.epub",
  "The Name of the Wind -- Patrick Rothfuss -- Kingkiller Chronicle, 1, 1, 2007.epub",
  "Project Hail Mary -- Andy Weir.epub",

  // z-lib format
  "Mistborn The Final Empire (Brandon Sanderson) (z-lib.org).epub",
  "The Hitchhiker's Guide to the Galaxy (Douglas Adams) (z-lib.org).epub",
  "Dune (Frank Herbert) (z-lib.org).epub",

  // libgen format
  "Brandon Sanderson - The Way of Kings - libgen.li.epub",
  "[Discworld 1] Terry Pratchett - The Colour of Magic - libgen.li.epub",

  // Series prefix
  "(The Stormlight Archive 2) Brandon Sanderson - Words of Radiance.epub",
  "[Wheel of Time 1] Robert Jordan - The Eye of the World.epub",

  // Standard formats
  "George Orwell - 1984.epub",
  "Ender's Game - Orson Scott Card.epub",
  "The Great Gatsby by F. Scott Fitzgerald.pdf",
  "Neuromancer - William Gibson.epub",
  "The Martian - Andy Weir.epub",

  // Tricky / messy filenames
  "A_Game_of_Thrones_George_R_R_Martin.epub",
  "harry potter and the philosophers stone.epub",
  "Piranesi_Susanna_Clarke_9781635575811.epub",
  "the-three-body-problem-cixin-liu.epub",
  "Hyperion Dan Simmons.epub",
];

interface BenchmarkRow {
  filename: string;
  parsed: { title: string; author: string | null; series: string | null };
  metadata: MetadataResult;
  durationMs: number;
}

const fmt = (value: string | null | undefined, maxLen = 40): string => {
  if (!value) return "—";
  return value.length > maxLen ? `${value.slice(0, maxLen - 1)}…` : value;
};

const padRight = (value: string, width: number): string =>
  value.length >= width ? value.slice(0, width) : value + " ".repeat(width - value.length);

const run = async (): Promise<void> => {
  console.log(`\nBenchmark: ${FILENAMES.length} filenames\n`);
  console.log("=".repeat(120));

  const rows: BenchmarkRow[] = [];

  for (const filename of FILENAMES) {
    const parsed = filenameToBasicMetadata(filename);

    const start = performance.now();
    let metadata: MetadataResult;
    try {
      metadata = await fetchMetadataWithFallback(parsed.title, parsed.author ?? undefined);
    } catch (err) {
      metadata = { source: "NONE" };
      console.error(`  [ERROR] ${filename}: ${err}`);
    }
    const durationMs = Math.round(performance.now() - start);

    rows.push({ filename, parsed, metadata, durationMs });

    // Print as we go
    const shortFile = fmt(filename, 55);
    console.log(`\n${shortFile}`);
    console.log(
      `  Parse:    title=${fmt(parsed.title, 35)}  author=${fmt(parsed.author, 25)}  series=${fmt(parsed.series, 25)}`
    );
    console.log(
      `  Metadata: title=${fmt(metadata.title, 35)}  author=${fmt(metadata.author, 25)}  series=${fmt(metadata.series, 25)}`
    );
    console.log(
      `            desc=${fmt(metadata.description, 50)}  cover=${metadata.coverPath ? "yes" : "no"}  source=${metadata.source}  ${durationMs}ms`
    );
  }

  // Summary table
  console.log("\n" + "=".repeat(120));
  console.log("\nSummary:\n");
  console.log(
    `${padRight("Filename", 45)} ${padRight("Parse→Title", 30)} ${padRight("Meta→Series", 25)} ${padRight("Source", 12)} Time`
  );
  console.log("-".repeat(120));

  let totalMs = 0;
  let gotSeries = 0;
  let gotDescription = 0;
  let gotCover = 0;

  for (const row of rows) {
    totalMs += row.durationMs;
    if (row.metadata.series) gotSeries++;
    if (row.metadata.description) gotDescription++;
    if (row.metadata.coverPath) gotCover++;

    console.log(
      `${padRight(fmt(row.filename, 43), 45)} ${padRight(fmt(row.parsed.title, 28), 30)} ${padRight(fmt(row.metadata.series, 23), 25)} ${padRight(row.metadata.source, 12)} ${row.durationMs}ms`
    );
  }

  console.log("-".repeat(120));
  console.log(
    `\nTotal: ${rows.length} books | Series: ${gotSeries}/${rows.length} | Description: ${gotDescription}/${rows.length} | Cover: ${gotCover}/${rows.length} | Time: ${totalMs}ms (avg ${Math.round(totalMs / rows.length)}ms)\n`
  );
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
