/**
 * Shared parser types — what each parser emits before being handed off
 * to the pack builder.
 *
 * Every parsed document has a stable id (slug) and a sourceBook ref so
 * we can deduplicate, lint, and re-link references later.
 */

export type SourceBookId =
  | 'podrecznik-gry'
  | 'ksiega-magii'
  | 'bestiariusz'
  | 'przewodnik'
  | 'arcanum-sanguinis'
  | 'crimson-cult'
  | 'klatwa-otchlani'
  | 'zlote-stal-magia';

export interface ParsedDoc {
  /** Compendium-stable slug (kebab-case). */
  id: string;
  /** Display name (Polish, as in book). */
  name: string;
  /** Foundry document type — `Item` or `Actor`. */
  documentType: 'Item' | 'Actor';
  /** Foundry sub-type for the data model (e.g. `spell`, `talent`). */
  subType: string;
  /** Pack id this doc belongs to (e.g. `spells-general`). */
  pack: string;
  /** Source book + chapter for traceability. */
  source: { book: SourceBookId; chapter?: string; line?: number };
  /** The `system.*` payload that will be written into the pack. */
  system: Record<string, unknown>;
  /** Optional rich-text description (markdown → HTML). */
  description?: string;
  /** Optional extra flags merged into `flags['hbm-rpg-v3']`. */
  flags?: Record<string, unknown>;
  /** Non-fatal parser warnings (missing fields, ambiguous values, etc.). */
  warnings?: string[];
}

export interface ParserContext {
  /** Absolute path to repository root (so parsers can resolve `_books/`). */
  repoRoot: string;
  /** Strict mode aborts on first warning; default `false`. */
  strict?: boolean;
  /** ID overrides loaded from `_id-overrides.json`. */
  idOverrides: Record<string, string>;
  /** Label → constant mapping (Polish UI label → English internal id). */
  labelMappings: {
    schools: Record<string, string>;
    disciplines: Record<string, string>;
    deities: Record<string, string>;
    symbols: Record<string, string>;
    attributes: Record<string, string>;
    skills: Record<string, string>;
  };
}

export type ParserFn = (ctx: ParserContext) => Promise<ParsedDoc[]>;
