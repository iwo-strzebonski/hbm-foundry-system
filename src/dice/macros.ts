/**
 * Roll helpers — convenience wrappers around HbmTSRoll bound to actor data.
 */

import { HbmTSRoll } from './ts-roll';
import { collectRollModifiers, RollBlockedError } from './effect-mods';
import { ATTRIBUTES, AttributeKey, SKILLS, SKILL_TAGS, TS_DEFAULT_REQUIRED, TS_DEFAULT_THRESHOLD } from '../constants';

export interface SkillRollOptions {
  /** Override the skill's default attribute (GM allows another for a specific roll). */
  attributeOverride?: AttributeKey;
  threshold?: number;
  required?: number;
  modifier?: number;
  flavor?: string;
  speaker?: ChatMessage.SpeakerData;
}

export interface ActorLike {
  name: string;
  system: {
    attributes: Record<AttributeKey, { value: number } | { value: number; dicePool?: number }>;
    skills?: Record<string, { value: number; defaultAttribute: AttributeKey }>;
  };
}

function getAttributeValue(actor: ActorLike, key: AttributeKey): number {
  const a = actor.system.attributes[key];
  return a?.value ?? 0;
}

export async function rollSkill(
  actor: ActorLike,
  skillKey: string,
  opts: SkillRollOptions = {},
): Promise<HbmTSRoll> {
  const skill = actor.system.skills?.[skillKey];
  if (!skill) throw new Error(`Unknown skill: ${skillKey}`);
  const attrKey = opts.attributeOverride ?? skill.defaultAttribute ?? SKILLS[skillKey] ?? 'mind';
  if (!ATTRIBUTES.includes(attrKey)) throw new Error(`Invalid attribute: ${String(attrKey)}`);

  const tags = SKILL_TAGS[skillKey] ?? [];
  const mods = collectRollModifiers(actor, tags);
  if (mods.blockedBy) {
    const msg = game.i18n.format('HBM.roll.blocked', { reason: mods.blockedBy.conditionLabel });
    (ui as any).notifications?.warn(msg);
    throw new RollBlockedError(mods.blockedBy.conditionLabel, mods.blockedBy.tag);
  }

  const pool = getAttributeValue(actor, attrKey) + (skill.value ?? 0);

  const flavor = opts.flavor ??
    game.i18n.format('HBM.roll.rollSkill', { skill: game.i18n.localize(`HBM.skills.${skillKey}`) });

  const roll = HbmTSRoll.fromParams({
    pool,
    threshold: opts.threshold ?? TS_DEFAULT_THRESHOLD,
    required: opts.required ?? TS_DEFAULT_REQUIRED,
    modifier: opts.modifier ?? 0,
    thresholdSteps: mods.thresholdSteps,
    requiredSteps: mods.requiredSteps,
    flavor,
  });
  await roll.evaluate();
  await roll.toMessage({ flavor, speaker: opts.speaker });
  return roll;
}

export async function rollAttribute(
  actor: ActorLike,
  attrKey: AttributeKey,
  opts: Omit<SkillRollOptions, 'attributeOverride'> = {},
): Promise<HbmTSRoll> {
  const flavor = opts.flavor ??
    game.i18n.format('HBM.roll.rollAttribute', { attribute: game.i18n.localize(`HBM.attributes.${attrKey}`) });

  const mods = collectRollModifiers(actor, []);

  const roll = HbmTSRoll.fromParams({
    pool: getAttributeValue(actor, attrKey),
    threshold: opts.threshold ?? TS_DEFAULT_THRESHOLD,
    required: opts.required ?? TS_DEFAULT_REQUIRED,
    modifier: opts.modifier ?? 0,
    thresholdSteps: mods.thresholdSteps,
    requiredSteps: mods.requiredSteps,
    flavor,
  });
  await roll.evaluate();
  await roll.toMessage({ flavor, speaker: opts.speaker });
  return roll;
}

export async function rollInitiative(actor: ActorLike): Promise<any> {
  const mind = getAttributeValue(actor, 'mind');
  const reflex = actor.system.skills?.reflex?.value ?? 0;
  const perception = actor.system.skills?.perception?.value ?? 0;
  const mod = mind + reflex + perception;
  const flavor = game.i18n.localize('HBM.resources.initiative');
  
  const roll = new Roll('2d6 + @mod', { mod });
  await roll.evaluate();
  await roll.toMessage({
    flavor,
    speaker: ChatMessage.getSpeaker({ actor: actor as any }),
  });
  return roll;
}
