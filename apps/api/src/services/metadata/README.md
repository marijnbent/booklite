# Metadata Service Layout

- `index.ts`: public entrypoint for the metadata service
- `service.ts`: orchestration and final merge flow
- `settings.ts`: provider/app setting resolution
- `scoring.ts`: candidate scoring, strong-match rules, and cover ranking
- `llmResolver.ts`: OpenRouter-assisted metadata reconciliation
- `text.ts`: shared text/HTML/url helpers
- `series.ts`: generic series parsing helpers
- `providers/`: provider-specific fetch and parse logic, including `bol.ts`

Provider modules should only return normalized `MetadataResult` objects. Cross-provider ranking and merge rules belong in `scoring.ts` and `service.ts`, not inside individual providers.
