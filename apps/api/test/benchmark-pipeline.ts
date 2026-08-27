/**
 * End-to-end benchmark: filename → parse → metadata fetch → final result
 *
 * Runs each filename twice: once without LLM, once with LLM resolver.
 *
 * Usage:
 *   OPENROUTER_API_KEY=... npx tsx apps/api/test/benchmark-pipeline.ts
 *   BOOKLITE_BENCHMARK_MODEL=... overrides Luna for this benchmark only.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { MetadataResult } from "../src/services/metadata";

const API_KEY = process.env.OPENROUTER_API_KEY?.trim();
const MODEL = process.env.BOOKLITE_BENCHMARK_MODEL ?? "openai/gpt-5.6-luna";

if (!API_KEY) {
  throw new Error("OPENROUTER_API_KEY is required");
}

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
  baseline: MetadataResult;
  baselineMs: number;
  llm: MetadataResult;
  llmMs: number;
}

let db: typeof import("../src/db/client").db;
let closeDatabase: typeof import("../src/db/client").closeDatabase;
let getSetting: typeof import("../src/db/client").getSetting;
let appSettings: typeof import("../src/db/schema").appSettings;
let filenameToBasicMetadata: typeof import("../src/services/books").filenameToBasicMetadata;
let fetchMetadataWithFallback: typeof import("../src/services/metadata").fetchMetadataWithFallback;

const fmt = (value: string | null | undefined, maxLen = 40): string => {
  if (!value) return "—";
  return value.length > maxLen ? `${value.slice(0, maxLen - 1)}…` : value;
};

const padRight = (value: string, width: number): string =>
  value.length >= width ? value.slice(0, width) : value + " ".repeat(width - value.length);

const upsert = async (key: string, value: unknown): Promise<void> => {
  await db
    .insert(appSettings)
    .values({ key, valueJson: JSON.stringify(value) })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { valueJson: JSON.stringify(value) },
    });
};

const setLlmEnabled = async (enabled: boolean): Promise<void> => {
  await upsert("metadata_openrouter_enabled", enabled);
  await upsert("metadata_openrouter_model", MODEL);
};

const fetchMeta = async (
  title: string,
  author?: string
): Promise<{ result: MetadataResult; ms: number }> => {
  const start = performance.now();
  let result: MetadataResult;
  try {
    result = await fetchMetadataWithFallback(title, author);
  } catch {
    result = { source: "NONE" };
  }
  return { result, ms: Math.round(performance.now() - start) };
};

const run = async (): Promise<void> => {
  const benchmarkRoot = fs.mkdtempSync(path.join(os.tmpdir(), "booklite-benchmark-"));
  const previousEnv = {
    appDataDir: process.env.APP_DATA_DIR,
    booksDir: process.env.BOOKS_DIR,
    jwtSecret: process.env.JWT_SECRET
  };
  process.env.APP_DATA_DIR = path.join(benchmarkRoot, "app-data");
  process.env.BOOKS_DIR = path.join(benchmarkRoot, "books");
  process.env.JWT_SECRET = process.env.JWT_SECRET || "booklite-benchmark-secret";

  const dbModule = await import("../src/db/client");
  const schemaModule = await import("../src/db/schema");
  const migrateModule = await import("../src/db/migrate");
  const booksModule = await import("../src/services/books");
  const metadataModule = await import("../src/services/metadata");
  db = dbModule.db;
  closeDatabase = dbModule.closeDatabase;
  getSetting = dbModule.getSetting;
  appSettings = schemaModule.appSettings;
  filenameToBasicMetadata = booksModule.filenameToBasicMetadata;
  fetchMetadataWithFallback = metadataModule.fetchMetadataWithFallback;
  migrateModule.prepareDatabase();

  const previousEnabled = await getSetting<boolean>("metadata_openrouter_enabled", false);
  const previousModel = await getSetting<string>("metadata_openrouter_model", MODEL);

  try {
  console.log(`\nBenchmark: ${FILENAMES.length} filenames`);
  console.log(`Model: ${MODEL}\n`);
  console.log("=".repeat(140));

  const rows: BenchmarkRow[] = [];

  for (const filename of FILENAMES) {
    const parsed = filenameToBasicMetadata(filename);
    const queryTitle = parsed.title;
    const queryAuthor = parsed.author ?? undefined;

    // --- Baseline (no LLM) ---
    await setLlmEnabled(false);
    const baseline = await fetchMeta(queryTitle, queryAuthor);

    // --- With LLM ---
    await setLlmEnabled(true);
    const llm = await fetchMeta(queryTitle, queryAuthor);

    rows.push({
      filename,
      parsed,
      baseline: baseline.result,
      baselineMs: baseline.ms,
      llm: llm.result,
      llmMs: llm.ms,
    });

    // Print per-book
    const shortFile = fmt(filename, 60);
    console.log(`\n${shortFile}`);
    console.log(
      `  Parse:    title=${fmt(queryTitle, 35)}  author=${fmt(parsed.author, 25)}  series=${fmt(parsed.series, 25)}`
    );
    console.log(
      `  Baseline: title=${fmt(baseline.result.title, 35)}  author=${fmt(baseline.result.author, 25)}  series=${fmt(baseline.result.series, 25)}  ${baseline.ms}ms`
    );
    console.log(
      `  LLM:      title=${fmt(llm.result.title, 35)}  author=${fmt(llm.result.author, 25)}  series=${fmt(llm.result.series, 25)}  ${llm.ms}ms`
    );

    // Highlight differences
    const diffs: string[] = [];
    if (llm.result.series !== baseline.result.series) {
      diffs.push(`series: "${baseline.result.series ?? "—"}" → "${llm.result.series ?? "—"}"`);
    }
    if (llm.result.title !== baseline.result.title) {
      diffs.push(`title: "${fmt(baseline.result.title, 30)}" → "${fmt(llm.result.title, 30)}"`);
    }
    if (llm.result.author !== baseline.result.author) {
      diffs.push(`author: "${baseline.result.author ?? "—"}" → "${llm.result.author ?? "—"}"`);
    }
    if ((llm.result.description ?? "") !== (baseline.result.description ?? "")) {
      diffs.push("description changed");
    }
    if ((llm.result.coverPath ?? "") !== (baseline.result.coverPath ?? "")) {
      diffs.push(`cover: ${baseline.result.coverPath ? "yes" : "no"} → ${llm.result.coverPath ? "yes" : "no"}`);
    }
    if (diffs.length > 0) {
      console.log(`  DIFF:     ${diffs.join(" | ")}`);
    } else {
      console.log(`  DIFF:     (identical)`);
    }
  }

  // --- Summary ---
  console.log("\n" + "=".repeat(140));
  console.log("\nComparison Summary:\n");
  console.log(
    `${padRight("Filename", 42)} ${padRight("Baseline Series", 28)} ${padRight("LLM Series", 28)} ${padRight("Baseline", 10)} ${padRight("LLM", 10)} Delta`
  );
  console.log("-".repeat(140));

  let baselineSeries = 0, llmSeries = 0;
  let baselineDesc = 0, llmDesc = 0;
  let baselineCover = 0, llmCover = 0;
  let baselineTotalMs = 0, llmTotalMs = 0;
  let improved = 0, regressed = 0;

  for (const row of rows) {
    baselineTotalMs += row.baselineMs;
    llmTotalMs += row.llmMs;
    if (row.baseline.series) baselineSeries++;
    if (row.llm.series) llmSeries++;
    if (row.baseline.description) baselineDesc++;
    if (row.llm.description) llmDesc++;
    if (row.baseline.coverPath) baselineCover++;
    if (row.llm.coverPath) llmCover++;

    const baseHasSeries = row.baseline.series ? 1 : 0;
    const llmHasSeries = row.llm.series ? 1 : 0;
    let delta = "";
    if (llmHasSeries > baseHasSeries) { delta = "+series"; improved++; }
    else if (llmHasSeries < baseHasSeries) { delta = "-series!"; regressed++; }
    else if (row.llm.series !== row.baseline.series) { delta = "~series"; }

    console.log(
      `${padRight(fmt(row.filename, 40), 42)} ${padRight(fmt(row.baseline.series, 26), 28)} ${padRight(fmt(row.llm.series, 26), 28)} ${padRight(row.baselineMs + "ms", 10)} ${padRight(row.llmMs + "ms", 10)} ${delta}`
    );
  }

  console.log("-".repeat(140));
  console.log(`
                    Baseline        LLM
  Series:           ${padRight(baselineSeries + "/" + rows.length, 16)}${llmSeries}/${rows.length}
  Description:      ${padRight(baselineDesc + "/" + rows.length, 16)}${llmDesc}/${rows.length}
  Cover:            ${padRight(baselineCover + "/" + rows.length, 16)}${llmCover}/${rows.length}
  Avg time:         ${padRight(Math.round(baselineTotalMs / rows.length) + "ms", 16)}${Math.round(llmTotalMs / rows.length)}ms
  Total time:       ${padRight(baselineTotalMs + "ms", 16)}${llmTotalMs}ms

  Series improved:  ${improved}
  Series regressed: ${regressed}
`);

  } finally {
    await upsert("metadata_openrouter_enabled", previousEnabled);
    await upsert("metadata_openrouter_model", previousModel);
    closeDatabase();
    fs.rmSync(benchmarkRoot, { recursive: true, force: true });

    if (previousEnv.appDataDir === undefined) delete process.env.APP_DATA_DIR;
    else process.env.APP_DATA_DIR = previousEnv.appDataDir;
    if (previousEnv.booksDir === undefined) delete process.env.BOOKS_DIR;
    else process.env.BOOKS_DIR = previousEnv.booksDir;
    if (previousEnv.jwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousEnv.jwtSecret;
  }
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
