# Foundry VTT System: Homebrew Magic RPG v3

A custom **Foundry Virtual Tabletop v13** system implementing *Homebrew Magic: Role Playing Game v3* - a Polish tabletop RPG with a **d6 success-pool (TS - Trudność:Sukcesy)** dice mechanic.

> **Internal identifiers are English; user-facing labels are Polish (canonical) with English fallback.** The locale files in [`lang/`](./lang/) hold the translations.

## Status

**v1.0.0 - first production release.** Full magic and resource model from books I–VIII, 152 compendium docs across 11 packs, automated build pipeline that parses `_books/*.md` directly. See [`CHANGELOG.md`](./CHANGELOG.md) for the full history.

A companion lore module ([`foundry-lore`](https://github.com/iwo-strzebonski/hbm-foundry-lore)) ships JournalEntry compendia for narrative chapters.

## What's implemented

- **Document types** - Actor: `character`, `npc`. Item: `spell`, `gear`, `ability`, `class`, `race`, `discipline`, `talent`.
- **TS d6 dice pool roller** (`HbmTSRoll`) - `1` auto-fail, `6` auto-success, configurable Threshold (T) and required Successes (Y), plus T-step / Y-step modifiers driven by Active Effects.
- **Derived stats** - `health.max = 3 × (body + mind + soul)`, `zeal.max = ceil(soul/2)`, initiative pool, mana table lookup (Magic Power Level 0–X), blood pool (`body + soul`), elixir tolerance cap (`body + 1`), insanity counter.
- **4-layer damage model** - Magical Armor (with runic counter) → Magical Shield → Physical Armor (DR + condition) → Health. `Apply Damage` dialog with bypass flags; auto-applies `Oszołomiony` on heavy HP loss.
- **Combat hooks** - Mana resets each round; Zeal +1 each turn; turns auto-skipped for Nieprzytomny / Obezwładniony; Podpalony ticks 1 environmental damage; Umierający prompts a Death Save.
- **Spell-cast workflow** - `validateCast()` gates on resources / race / talent / discipline / deity / group / inCombat / superspell / witch-symbol; dispatcher routes to standard / Sacred / Witch / Blood / Hekate hybrid; `rollSpellDamage()` parses formula tokens; reactive triggers (`killWithWeapon`, `targetCastsSpell`, `damageTaken`, `turnStart`).
- **Cast dialog** - mana / zeal / blood inputs, group-caster picker, Hekate toggle, GM bypass checkboxes (superspell, non-combat block), inline validation feedback.
- **Mechanics modules** (`game.hbm.*`) - `bloodMagic` (Self-Harm, Life Steal, talent integration), `abyssMagic` (Aspects vs Primal, Mistrz Losu penalty, `Dary Otchłani`, insanity gain), `brewing` (TS test + tolerance counter), `rest` (short / long), `trade` (founding company workflow, transactions, smuggling).
- **Status conditions (Active Effects)** - 15 physical conditions (Aneks A) plus 5 mental conditions from Klątwa Otchłani VIII (paranoja, fobia, depresja, mania, schizofrenia).
- **Sheets** - ApplicationV2 + Handlebars for every document type. Character sheet: short-rest / long-rest header buttons, conditional resource cards (blood pool, elixir tolerance, insanity), spells tab grouped by school with badges (`★ super`, `⛧ group`, `☮ noncombat`, `🔒 race-lock`) and source-book pip.
- **Compendia** (11 packs, 152 docs) - `spells-general`, `spells-elements`, `spells-sacred`, `spells-academic`, `spells-superspells`, `spells-crimson` (93 spells); `talents`, `talents-npc` (34 talents); `races` (5), `disciplines`, `disciplines-forbidden` (20). Each pack carries `flags.hbm-rpg-v3.{category, sourceBook}` for compendium-browser; `packFolders` group them in the sidebar.
- **Race / Class linking** - drag a Race or Class item onto a Character to auto-link `system.details.raceId` / `system.details.classIds[year]`. Feeds the Advancement panel (attribute / skill points available).
- **Migration runner** - `src/migrations/` upgrades v0.2.x worlds (`complexityLevel` → `components.symbols.length`, `targets` regex → `areaOfEffect`, `overcasting` text → `overcastOptions[0].description`).

## Project layout

```
src/foundry-system/
├── system.json          # Foundry system manifest (includes documentTypes since v14)
├── LICENSE.txt
├── lang/                # pl.json (canonical) + en.json
├── styles/hbm.css
├── templates/
│   ├── actor/           # character.hbs, npc.hbs
│   ├── item/            # per-type partials + dispatcher
│   └── chat/ts-roll.hbs
├── scripts/package.ts   # zip builder
├── src/
│   ├── hbm.ts           # entry point
│   ├── constants.ts
│   ├── data/            # DataModels
│   ├── dice/            # HbmTSRoll + macros
│   ├── sheets/
│   └── logic/           # combat, conditions, spell-cast
└── package.json + vite.config.ts + tsconfig.json
```

## Build & deploy

This system is built with **Vite + TypeScript**. Foundry runs in Docker on a remote host, so the workflow is **build → package → drop the zip into the container's `Data/systems/`**.

```sh
cd src/foundry-system
bun install               # one-time
bun run build             # compile TS to dist/
bun run build:packs       # parse _books/ → dist/packs/ (LevelDB)
bun run package           # → hbm-rpg-v3-v1.0.0.zip
```

To deploy to a Docker-hosted Foundry instance:

```sh
# Option A: extract into the volume-mounted Data folder
unzip -o hbm-rpg-v3-v0.3.x.zip -d /path/to/foundry-data/Data/systems/

# Option B: docker cp into a running container
docker cp hbm-rpg-v3-v0.3.x.zip foundry:/data/Data/systems/
docker exec foundry sh -c "cd /data/Data/systems && unzip -o hbm-rpg-v3-v0.3.x.zip"
docker restart foundry
```

Then in Foundry: **Game Systems → Install System → (system appears once it's in `Data/systems/`)** → create a world.

## Mechanic notes

### TS dice pool (d6)

```
Roll N d6  →  count successes  →  succeed if successes ≥ Y
  1            → forced failure (always)
  6            → forced success (always)
  >= T (2..6) → success
```

Default `T = 4`, `Y = 1`. The roll dialog accepts both per-roll for harder tasks (GM may demand `Y ≥ 2`).

### Magic Power Level table

| Level | Dice | Max/spell | Mana/round |
|------:|-----:|----------:|-----------:|
| 0  | 6 | 10 | 20 |
| I  | 4 | 6 | 12 |
| II | 4 | 5 | 10 |
| III | 3 | 5 | 7 |
| IV | 3 | 4 | 8 |
| V | 3 | 4 | 6 |
| VI | 2 | 3 | 6 |
| VII | 2 | 3 | 4 |
| VIII | 1 | 2 | 3 |
| IX | 1 | 1 | 2 |
| X | 0 | 1 | 1 |

## Out of scope (v1.0.0)

Deferred to follow-up versions:
- Gear / artifact / actor / roll-table compendia - source books lack stat-block data.
- Adventures package (`hbm-rpg-v3-adventures`).
- Character creation wizard, advancement automation (PD spending).
- Macro packs.
- Compendium browser premium-module integration (basic flag metadata only).

## Reference material

Game rules and content live in sibling folders of this repo:

- [`../../_books/`](../../_books/) - synced PDFs of the rulebooks (read-only)
- [`../../spells/`](../../spells/), [`../../creatures/`](../../creatures/), [`../../items/`](../../items/) - structured content
- [`../../rules/`](../../rules/), [`../../revisions/`](../../revisions/) - current and proposed mechanics

## Useful links

- [Foundry VTT System Development](https://foundryvtt.com/article/system-development/)
- [Foundry API v13](https://foundryvtt.com/api/)

## License

All Rights Reserved - see [LICENSE.txt](./LICENSE.txt).
