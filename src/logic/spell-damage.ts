/**
 * Spell damage formula evaluator.
 *
 * Tokens recognised in `spell.damageBase`:
 *   magicalAbilities, devotion, soul, mind, body, magic
 *   magicalAbilities/2 (and similar /N or *N suffixes)
 *   1d6, 2d6, 1d3 etc. (Foundry dice notation)
 *   numeric literals
 * Operators: + - * /  (integer division for /N tokens; standard for dice)
 *
 * Returns a Foundry Roll ready to evaluate, or null when the spell has
 * no damageBase formula.
 */

import type { CastableActor } from './spell-cast';

export interface DamageContext {
  actor: CastableActor;
  spellName?: string;
}

const ATTR_TOKENS = new Set(['body', 'mind', 'soul', 'magic', 'magicalAbilities', 'devotion']);

function resolveToken(token: string, ctx: DamageContext): number {
  const a = (ctx.actor as any).system?.attributes ?? {};
  const s = (ctx.actor as any).system?.skills ?? {};
  switch (token) {
    case 'body': return Number(a.body?.value ?? 0);
    case 'mind': return Number(a.mind?.value ?? 0);
    case 'soul': return Number(a.soul?.value ?? 0);
    case 'magic': return Number(a.magic?.value ?? 0);
    case 'magicalAbilities': return Number(s.magicalAbilities?.value ?? 0);
    case 'devotion': return Number(s.devotion?.value ?? 0);
    default: return 0;
  }
}

/**
 * Substitutes attribute tokens with their numeric values, leaving dice
 * notation intact for Foundry to parse.
 */
export function buildDamageFormula(spellDamageBase: string, ctx: DamageContext): string | null {
  if (!spellDamageBase || !spellDamageBase.trim()) return null;

  let formula = spellDamageBase.trim();

  // Replace attribute tokens (with optional /N or *N suffix).
  // Match e.g. magicalAbilities, magicalAbilities/2, soul*3
  const tokenRe = /([a-zA-Z]+)(?:\s*([\/*])\s*(\d+))?/g;
  formula = formula.replace(tokenRe, (match, name: string, op: string | undefined, num: string | undefined) => {
    if (!ATTR_TOKENS.has(name)) {
      // Leave alone (likely dice notation like 1d6 - no, dice has digits before)
      return match;
    }
    let v = resolveToken(name, ctx);
    if (op && num) {
      const n = Number(num);
      if (op === '/') v = Math.ceil(v / n); // ceil per HbM rounding rules
      if (op === '*') v = v * n;
    }
    return String(v);
  });

  return formula;
}

export async function rollSpellDamage(spellDamageBase: string, ctx: DamageContext): Promise<Roll | null> {
  const formula = buildDamageFormula(spellDamageBase, ctx);
  if (!formula) return null;
  const roll = new Roll(formula, {});
  await roll.evaluate();
  return roll;
}
