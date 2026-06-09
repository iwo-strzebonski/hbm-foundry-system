/**
 * Homebrew Magic: RPG v3 — Foundry VTT system entry point.
 *
 * All internal identifiers are English. Polish is reserved for user-facing
 * labels supplied via `lang/pl.json` (the canonical localisation).
 */

declare const __SYSTEM_ID__: string;
declare const Babele: any;

import { HbmTSRoll } from './dice/ts-roll';
import { CharacterData } from './data/actor-character';
import { NpcData } from './data/actor-npc';
import { SpellData } from './data/item-spell';
import { GearData } from './data/item-gear';
import { AbilityData } from './data/item-ability';
import { ClassData } from './data/item-class';
import { RaceData } from './data/item-race';
import { DisciplineData } from './data/item-discipline';
import { TalentData } from './data/item-talent';
import { CharacterSheet } from './sheets/character-sheet';
import { NpcSheet } from './sheets/npc-sheet';
import { HbmItemSheet } from './sheets/item-sheet';
import { registerHbmConditions } from './logic/conditions';
import { registerCombatHooks } from './logic/combat';
import { registerMigrationSettings, runPendingMigrations } from './migrations';
import { registerTriggerHooks } from './logic/spell-triggers';
import { registerChatCardHooks } from './logic/chat-cards';
import { castSpell } from './logic/spell-cast';
import * as bloodMagic from './logic/blood-magic';
import * as abyssMagic from './logic/abyss-magic';
import * as brewing from './logic/brewing';
import { rest } from './logic/rest';
import * as trade from './logic/trade';

export const SYSTEM_ID = __SYSTEM_ID__;

Hooks.once('init', () => {
  console.log(`${SYSTEM_ID} | Initialising Homebrew Magic: RPG v3 system`);

  // Register Babele translation if active
  if (typeof Babele !== 'undefined') {
    Babele.get().register({
      module: SYSTEM_ID,
      lang: 'en',
      dir: 'lang/compendium/en'
    });
  }

  // Register custom roll
  CONFIG.Dice.rolls.unshift(HbmTSRoll as unknown as typeof Roll);

  // Register data models
  CONFIG.Actor.dataModels = {
    ...(CONFIG.Actor.dataModels ?? {}),
    character: CharacterData,
    npc: NpcData,
  } as Record<string, typeof foundry.abstract.TypeDataModel>;

  CONFIG.Item.dataModels = {
    ...(CONFIG.Item.dataModels ?? {}),
    spell: SpellData,
    gear: GearData,
    ability: AbilityData,
    class: ClassData,
    race: RaceData,
    discipline: DisciplineData,
    talent: TalentData,
  } as Record<string, typeof foundry.abstract.TypeDataModel>;

  // Register sheets
  foundry.documents.collections.Actors.unregisterSheet('core', foundry.appv1.sheets.ActorSheet);
  foundry.documents.collections.Actors.registerSheet(SYSTEM_ID, CharacterSheet, {
    types: ['character'],
    makeDefault: true,
    label: 'HBM.actor.character',
  });
  foundry.documents.collections.Actors.registerSheet(SYSTEM_ID, NpcSheet, {
    types: ['npc'],
    makeDefault: true,
    label: 'HBM.actor.npc',
  });

  foundry.documents.collections.Items.unregisterSheet('core', foundry.appv1.sheets.ItemSheet);
  foundry.documents.collections.Items.registerSheet(SYSTEM_ID, HbmItemSheet, {
    makeDefault: true,
    label: 'HBM.system.name',
  });

  registerHbmConditions();
  registerMigrationSettings();

  // Preload Handlebars partials so the first render is synchronous.
  (foundry.applications.handlebars as any).loadTemplates([
    // Shared item partials
    'systems/hbm-rpg-v3/templates/item/_dispatch.hbs',
    'systems/hbm-rpg-v3/templates/item/_effects.hbs',
    'systems/hbm-rpg-v3/templates/item/_unknown.hbs',
    'systems/hbm-rpg-v3/templates/item/header.hbs',
    // Item body partials (used via {{> (lookup this 'bodyPartial')}})
    'systems/hbm-rpg-v3/templates/item/talent.hbs',
    'systems/hbm-rpg-v3/templates/item/spell.hbs',
    'systems/hbm-rpg-v3/templates/item/gear.hbs',
    'systems/hbm-rpg-v3/templates/item/ability.hbs',
    'systems/hbm-rpg-v3/templates/item/class.hbs',
    'systems/hbm-rpg-v3/templates/item/race.hbs',
    'systems/hbm-rpg-v3/templates/item/discipline.hbs',
    // Actor partials
    'systems/hbm-rpg-v3/templates/actor/_actor-effects.hbs',
  ]);

  // Override default initiative formula to HbM's 2d6 + initiative attribute.
  CONFIG.Combat.initiative = {
    formula: '2d6 + @attributes.initiative',
    decimals: 2,
  };

  // Handlebars helpers used in templates
  Handlebars.registerHelper('eq',     (a: unknown, b: unknown) => a === b);
  Handlebars.registerHelper('gt',     (a: number, b: number) => a > b);
  Handlebars.registerHelper('lt',     (a: number, b: number) => a < b);
  Handlebars.registerHelper('or',     (...args: unknown[]) => (args.slice(0, -1) as unknown[]).some(Boolean));
  Handlebars.registerHelper('and',    (...args: unknown[]) => (args.slice(0, -1) as unknown[]).every(Boolean));
  Handlebars.registerHelper('concat', (...args: unknown[]) => (args.slice(0, -1) as string[]).join(''));
});

Hooks.once('ready', () => {
  registerCombatHooks();
  registerTriggerHooks();
  registerChatCardHooks();
  void runPendingMigrations();

  // Expose system API on game object for macros & external modules.
  (game as any).hbm = {
    castSpell,
    bloodMagic,
    abyssMagic,
    brewing,
    rest,
    trade,
  };

  console.log(`${SYSTEM_ID} | Ready`);
});
