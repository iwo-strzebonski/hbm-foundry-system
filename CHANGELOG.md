# Changelog - hbm-rpg-v3

All notable changes to the **HbM RPG v3** Foundry VTT system.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- English text "Cannot be unraveled" is now "Cannot be dispelled" on the spell cast card.

## [1.5.1] - 2026-10-22

### Added
- Weapons have wound kinds (`system.weapon.woundKinds`: `slashing` sieczne / `piercing` kłute / `blunt` obuchowe, several allowed, empty = unspecified), editable on the gear sheet as a multi-select. Matches Foundry Sync Brief §18.
- Gear parser reads `wound` (string, comma list or YAML list; Polish or English words) from vault weapon notes. Unknown values are dropped; nothing is guessed.
- Packs rebuilt from the current vault: Sztylet piercing+slashing, Bicz slashing, Laska blunt, bows and Włócznia piercing; generic one-/two-handed entries list all three (pick the real type per weapon).

### Changed
- `applyDamage` takes `woundKinds` (array) instead of a single kind; passive Krew applies when any is slashing or piercing. Blunt (and unarmed) never gives Krew.
- Vault sync of 2026-10-22 needs no further logic changes: runic armour wording, Zakazana Osłona retaliation, Rozerwanie Run artifact destruction and free Immediate Action for Kradzież Życia / Złożenie w Ofierze were already covered in 1.5.0 (spell, talent and discipline text arrives through the rebuilt packs).

### Notes
- Callers of `applyDamage` still need to pass the equipped weapon's `woundKinds`.
- Kości Losu use is now an Immediate Action that counts toward the limit (vault `Zużywanie Ładunków`); the system has no Fate-dice action code yet.

## [1.5.0] - 2026-10-20

Vault answers (Foundry Sync Brief §17): blood magic and Runiczny Pancerz.

### Changed
- **Runiczny Pancerz:** one hit of more than 5 damage (after the Runiczny Pancerz step) disables 1 point; hits no longer accumulate (`runicCounter` is unused). Disabled points return at the end of the fight (`deleteCombat`), on Długi Odpoczynek, or when restored (Akcja Natychmiastowa; Amulet Osłony 2 Many per point). `destroyRunicPoints` (Rozerwanie Run) lowers the maximum permanently.
- **Shield-breaking spells** (Przebicie Eteru, Boska Włócznia, Fala Energii, Tajemniczy Strumień, Strzała Pożądania, Ostatni Sąd): every 2 damage disable a point and damage counts ×2 against Magiczna Osłona. Szkarłatny Pocisk ignores Runiczny Pancerz and Magiczna Osłona but not Pancerz; Prawdziwa Dezintegracja ignores Pancerz and destroys shields / disables all Runiczny Pancerz (`SPELL_DAMAGE_PROFILES`, chat-card `data-profile`).
- **Blood magic rewritten to the vault:** Samookaleczenie (Test Magia (Walka Wręcz) T=2, lose HP = Sukcesy, 1 Krew per HP, once per round; Większe: 2 Krew per HP), Kradzież Życia / Większa (1 Zapał, arms the next attack, Krew per HP actually lost), Złożenie w Ofierze, Wielka Ofiara (once per day), Wchłanianie Krwi (min. 1 Krew, once per round). Removed the invented ×3 self-harm penalty and `floor(damage/4)` life steal.
- Passive Krew: Szacunek do Życia 1 per 4 HP, Krwisty Pojedynkowicz 1 per 2 HP (cutting/piercing, either side; callers pass `woundKind`/`sourceActor` to `applyDamage`); Rytualista Krwi starts a fight with 4 Krew; leftover Krew heals 2 HP each at the end of the fight.

### Added
- Actor attributes `bloodUsed.*` (per round) and `greatSacrificeUsed` (per day).

## [1.4.1] - 2026-10-20

### Added
- Runiczny Pancerz can be restored with Mana: `game.hbm.runicArmor.rechargeRunicArmor(actor, points, { partial })` – 2 Many per point, capped at the armor's maximum (Amulet Osłony, Akcja). Degradation (every 5 absorbed damage) is unchanged.

### Changed
- Money converter: NBP rates come from `src/logic/nbp.ts` – one range request per currency (first table from 1 June of the campaign year), latest published rate for future years or when no table is found, 4 s timeout, offline fallback EUR = `TRADE.eurRate` (4.36), USD = 4.00.

## [1.4.0] - 2026-10-20

Vault sync ("Foundry Sync Brief 2026-10-20").

### Changed
- Magic power levels III/IV: daily mana swapped to 24 / 21.
- Wyczerpanie Many: casting beyond the daily pool is allowed; the shortfall is borrowed (cumulative counter `manaBorrowed`, reset by Długi Odpoczynek) and a N d6 tier roll is posted.
- Over-limit overcast failure now rolls Kara za Nieudolność (N d6, tier 5-8 drains the pool by the base cost).
- Odetchnięcie limited to twice between Długie Odpoczynki (`breathersTaken`); Długi Odpoczynek resets counters.
- Oszołomiony applied automatically when one hit costs ≥ ½ max Żywotność; Koncentracja test 4:⌈⅓ lost⌉ reported; Oszołomiony/Przerażony expire at the end of the character's next turn.
- Przewrócony and Przerażony condition definitions rewritten; Magiczny Pocisk deals at least 1 after Pancerz.
- Armor-condition damage reduction rounds up.
- "Reakcja" relabelled "Akcja Natychmiastowa" (per-round counter `immediateActionsUsed` reset each round).
- Spell data recompiled from the vault (new costs, Aegis of Zeus slug `aegis-zeus`); spell `difficulty.successes` max raised to 30 (superspells); new `thaumaturgy` school.

### Added
- `src/logic/rules.ts`: pure helpers for the new rules (+ tests), `absorbBlood`, `drinkManaElixir`, trade constants.
- Migration 1.4.0.

## [Unreleased]

### Changed
- **Foundry v14 compatibility:** Migrated from deprecated `template.json` to `documentTypes` in `system.json`. The system now declares Actor and Item types directly in the manifest as required by Foundry v14+. `template.json` has been removed.
- Updated `compatibility.verified` to `"14"` to support Foundry VTT v14 build 363.

## [1.2.0] - 2026-04-30

Major mechanics + infrastructure release. Adds optional-rules sub-packs,
ActiveEffects integration, automated tests, full localization for the new
features, and a v1.2.0 world migration.

### Added
- **Talent sub-packs** for optional rules:
  - `talents-blood` - 5 talents from *Arcanum Sanguinis*
  - `talents-abyss` - 4 talents from *Klątwa Otchłani*
  - Each parsed talent is stamped with `flags['hbm-rpg-v3'].sourceModule`
    so future module-aware UIs can filter or annotate them. *Note:* Foundry
    has no native gating of compendium content by external modules; the flag
    is informational only. *Chwała Szkarłatnemu Kultowi* has no talent
    chapter and is therefore intentionally not split.
- **Macro pack `hbm-macros`** (7 macros, Polish labels):
  Rzut Puli d6, Test Atrybutu, Nałóż Przypadłość, Krótki/Długi Odpoczynek,
  Pomocnik Rzucania Grupowego, Doładuj Zapał.
- **ActiveEffects integration on Talent and Gear sheets.** Both item types
  now render an Effects fieldset with Add/Edit/Toggle/Delete actions backed
  by Foundry's built-in ActiveEffect document; `transfer:true` effects are
  auto-applied to actors when the item is granted.
- **Initiative override.** `CONFIG.Combat.initiative.formula = '2d6 + @attributes.initiative'`
  is registered in the `init` hook; characters use their derived initiative
  attribute, NPCs default to `2d6 + 0`.
- **Per-turn Zeal regeneration is configurable.** The combat-turn handler
  now reads `flags['hbm-rpg-v3'].zealRegenBonus` (default `0`) added to the
  base `+1` regen - talents can grant additional regen via an ActiveEffect
  with `mode: ADD` targeting that flag.
- **Long-rest cleanup.** `rest(actor, 'long')` now also deletes temporary
  ActiveEffects on the actor (those with finite duration or with the
  `flags['hbm-rpg-v3'].untilLongRest` marker), preserving transferred passives.
- **Migration `1.2.0`.** Backfills NPC `mana/zeal/blood` resources, sets
  default `zealRegenBonus = 0` on character actors, and best-effort attaches
  a `+1 zealRegenBonus` ActiveEffect to existing talents whose description
  mentions "+1 Zapał" or "regeneracja Zapału".
- **Localization.** Added `HBM.{rest, initiative, talentCategory, macro,
  activeEffect}` namespaces to both `lang/pl.json` and `lang/en.json`.
- **Vitest test harness** (`vitest.config.ts`, `tests/setup.ts`). 5 test
  files covering damage layers, rest mechanics, zeal-regen helper, talent
  parser, and the v1.2.0 migration - 18 tests, all passing.

### Notes on skipped items
- **Spell preparation** is intentionally not implemented - every spellcaster
  can cast any known spell directly (per design).
- **Module gating of sub-pack talents** is not enforced because Foundry does
  not provide a hook to hide compendium documents based on external module
  presence. The `sourceModule` flag is preserved for future opt-in filtering.

## [1.1.2] - 2026-04-30

Mechanics polish release. No content changes; focuses on the spell-cast UX, the
NPC sheet, and the cast dialog.

### Added
- **Rich spell-cast chat card** (`templates/chat/spell-cast.hbs`) with header
  badges (mode / school / circle / success or failure), a costs ledger, damage
  block, status-effect chips, save line, registered triggers, and a collapsible
  description.
- **Apply-status / apply-damage chat buttons.** Click handlers in
  `src/logic/chat-cards.ts` toggle status effects on selected/targeted tokens
  and pipe damage through `applyDamage()` with the correct `ignoreMagical*` /
  `ignorePhysicalArmor` flags pulled from the spell metadata.
- **NPC sheet can cast spells.** `actor/npc.hbs` now lists embedded spell items
  with a `✦ Rzuć` button; the sheet supports drag-drop of items from
  compendiums or other actors. NPC schema gained `mana`, `zeal`, `blood`
  resources (mirroring characters) so the cast pipeline runs unchanged.
- **Variable-success picker** in the cast dialog. When a spell defines
  `system.variableSuccesses[]` (e.g. *Przywołanie Istoty z Otchłani*), the
  dialog renders radio options and sets `opts.requiredOverride` from the
  selected variant.
- **Canvas-based group-cast UI.** When `system.requiresGroupCast` is set, the
  cast dialog now renders a checkbox list of canvas tokens (instead of the
  free-text actor-id field), so group casters can be picked visually.

### Changed
- `src/logic/spell-cast.ts` no longer posts separate damage / status messages -
  everything is consolidated into the new chat card via `renderTemplate`.
- `lang/{pl,en}.json` - added `HBM.spellCast.*` keys for the new card and
  dialog widgets.
- `styles/hbm.css` - styling for the spell-cast card and the new dialog
  widgets (caster checkbox list, variant radio list).

## [1.0.0] - 2026-04-29

First production release. Adds the full magic and resource model from books I–VIII
plus a build pipeline that generates compendium content from the source markdown
in `_books/`.

### Added

- **Spell schema**: full coverage of the spell-reference (`deity`, `bloodCost`,
  `components.symbols`, `requirements.{race,talent,discipline}`, `isSuperspell`,
  `requiresGroupCast`, `minCasters`, `nonCombatOnly`, `areaOfEffect.{shape,x,y,unit}`,
  `damageBase`, `damageType`, `ignoresArmor`, `statusEffects`, `saveAttribute`,
  `saveSkill`, `overcastOptions`, `triggers`, `sourceBook`, `castingTimeRounds`,
  `castingTimeMinutes`, `variableSuccesses`).
- **Compendium content** (152 docs / 11 packs):
  - `spells-general`, `spells-elements`, `spells-sacred`, `spells-academic`,
    `spells-superspells`, `spells-crimson` (93 spells total, blood/abyss packs
    reserved for AS / KO content).
  - `talents`, `talents-npc` (34 talents).
  - `races` (5 races), `disciplines`, `disciplines-forbidden` (20 disciplines).
- **Cast pipeline**: `validateCast()` gates resources/race/talent/discipline/deity
  /group/inCombat/superspell/witch-symbol; `castSpell()` dispatches
  standard / sacred / witch / blood / Hekate hybrid; `rollSpellDamage()` parses
  formula tokens; reactive triggers (`killWithWeapon`, `targetCastsSpell`,
  `damageTaken`, `turnStart`).
- **Cast dialog** with mana/zeal/blood inputs, group-caster picker, GM bypass
  checkboxes, validation feedback inline.
- **New mechanics modules**: `blood-magic`, `abyss-magic`, `brewing`, `rest`,
  `trade` - all exposed under `game.hbm.*`.
- **Actor schema**: `attributes.blood`, `attributes.elixirTolerance`,
  `attributes.insanity` with derived clamps and resource cards on the sheet.
- **Mental conditions**: paranoia, fobia, depresja, mania, schizofrenia
  (Klątwa Otchłani VIII).
- **Character sheet**: short-rest / long-rest header buttons; spells tab grouped
  by school with badges (`★ super`, `⛧ group`, `☮ noncombat`, `🔒 race-lock`)
  and source-book pip.
- **Compendium browser metadata**: per-pack `flags.hbm-rpg-v3.{category,sourceBook,
  forbidden}` and `packFolders` (Zaklęcia / Talenty / Rasy i Dziedziny).
- **Localization**: Polish (canonical) and English mirrors for all new
  namespaces (`spell`, `spellSchool`, `deity`, `sourceBook`, `aoeShape`,
  `damageType`, `triggerEvent`, `spellCast`, `bloodMagic`, `mentalCondition`).
- **Migration runner** for v0.2.0 worlds (`complexityLevel` →
  `components.symbols.length`, `targets` regex → `areaOfEffect`, `overcasting`
  text → `overcastOptions[0].description`).
- **Build pipeline**: `scripts/parsers/*` (book-walker, spell/talent/discipline/
  race parsers) + Zod validation + `scripts/build-packs.ts` (LevelDB via
  `@foundryvtt/foundryvtt-cli`). `bun run package` runs build → packs → zip.

### Deferred

- `gear-*`, `actors-*`, `roll-tables-*` packs - source books lack stat-block data.
- Adventures package (`hbm-rpg-v3-adventures`).
- Macro packs.
- Compendium browser premium-module integration.

## [0.6.1] - 2026-04-29

- Localization parity (`en.json` mirrors all `pl.json` namespaces).
- CSS polish: badges, source pip, blood-pool tint, school details groups,
  fieldset and array-row layouts.
- Compendium browser metadata + `packFolders`.

## [0.6.0] - 2026-04-29

- Spell item-sheet rewrite (8 fieldsets, conditional rendering).
- Cast dialog (`askCastOptions`) with mana/zeal/blood/Hekate/group/bypass.
- Character header: short-rest / long-rest buttons.
- Resources: blood pool, elixir tolerance, insanity (conditional).
- Spells tab grouped by school with badges.

## [0.5.0] - 2026-04-29

- New mechanics modules under `game.hbm.*`: blood-magic, abyss-magic, brewing,
  rest, trade. Actor schema gains `elixirTolerance`, `insanity`.

## [0.4.0] - 2026-04-29

- Phase 0 foundation: extended `constants`, `SpellData`, `CharacterData.attributes.blood`,
  migration runner, mental conditions.

## [0.3.x]

- Pre-1.0 baseline: data models, sheets, dice, conditions, basic cast
  (standard / sacred / witch), 4-layer damage model, race/class linking.
