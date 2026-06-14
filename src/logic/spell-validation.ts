/**
 * Pre-cast validation gates. Runs before any resource deduction or roll.
 * Returns structured ValidationResult; caller decides whether to block,
 * warn, or proceed with bypass flags.
 */

import type { CastableActor, SpellLike, CastOptions } from './spell-cast';

export interface ValidationIssue {
  code: string;
  message: string;
  i18nKey?: string;
  i18nArgs?: Record<string, unknown>;
}

export interface ValidationResult {
  errors: ValidationIssue[];   // hard blocks
  warnings: ValidationIssue[]; // soft, may be bypassed
  ok: boolean;                  // errors.length === 0
}

function getActorRaceId(actor: CastableActor): string {
  // Prefer embedded race item; fall back to details.raceId / details.race.
  const raceItem = (actor as any).items?.find?.((i: any) => i.type === 'race');
  if (raceItem) {
    return String(raceItem.system?.raceId ?? raceItem.system?.id ?? raceItem.name ?? '').toLowerCase();
  }
  const d = (actor as any).system?.details ?? {};
  return String(d.raceId ?? d.race ?? '').toLowerCase();
}

function actorHasTalent(actor: CastableActor, talentId: string): boolean {
  const id = talentId.toLowerCase();
  const items = (actor as any).items as Iterable<any> | undefined;
  if (!items) return false;
  for (const it of items) {
    if (it.type !== 'talent') continue;
    const t = String(it.system?.talentId ?? it.system?.id ?? it.name ?? '').toLowerCase();
    if (t === id) return true;
  }
  return false;
}

function matchDiscipline(disciplineId: string, targetId: string): boolean {
  const d1 = disciplineId.toLowerCase().trim();
  const d2 = targetId.toLowerCase().trim();
  if (d1 === d2) return true;

  const mappings: Record<string, string[]> = {
    crimson: ['crimson', 'magia szkarłatu', 'magia szkarłatnego kultu', 'crimson magic', 'crimson cult magic'],
    abyssaspects: ['abyssaspects', 'magia aspektów', 'aspects', 'aspect magic', 'abyss - aspects', 'magia otchłani - aspekty'],
    abyssprimal: ['abyssprimal', 'magia otchłani', 'primal', 'eldritch', 'eldritch magic', 'abyss - primal', 'magia otchłani - pierwotna magia', 'pierwotna magia'],
    witch: ['witch', 'wiedźmia magia', 'witch magic', 'dzika wiedźmia magia', 'wildwitch'],
    blood: ['blood', 'magia krwi', 'blood magic'],
  };

  let key1: string | null = null;
  let key2: string | null = null;

  for (const [k, aliases] of Object.entries(mappings)) {
    if (k === d1 || aliases.includes(d1)) key1 = k;
    if (k === d2 || aliases.includes(d2)) key2 = k;
  }

  if (key1 && key2 && key1 === key2) return true;
  return false;
}

function actorHasDiscipline(actor: CastableActor, disciplineId: string): boolean {
  const items = (actor as any).items as Iterable<any> | undefined;
  if (items) {
    for (const it of items) {
      if (it.type !== 'discipline') continue;
      const d = String(it.system?.disciplineId ?? it.system?.id ?? it.name ?? '');
      if (matchDiscipline(d, disciplineId)) return true;
    }
  }
  const detail = String((actor as any).system?.details?.discipline ?? '');
  return matchDiscipline(detail, disciplineId);
}

function actorIsInCombat(actor: CastableActor): boolean {
  const combat = (game as any).combat;
  if (!combat?.started) return false;
  return Boolean(combat.combatants?.find?.((c: any) => c.actorId === actor.id));
}

export function validateCast(actor: CastableActor, spell: SpellLike, opts: CastOptions = {}): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  const sys = spell.system as any;
  const a = (actor as any).system?.attributes ?? {};
  const mode = sys.castingMode ?? 'standard';

  // Resource gates
  const baseMana = Math.max(0, Number(sys.manaCost ?? 0));
  const manaSpent = Math.max(baseMana, Math.floor(opts.manaSpent ?? baseMana));
  const bloodSpent = Math.max(0, Math.floor(opts.bloodSpent ?? Number(sys.bloodCost ?? 0)));

  if (mode === 'standard' || mode === 'witch' || (mode === 'sacred' && opts.hekateMode === 'witch')) {
    if (manaSpent > Number(a.mana?.value ?? 0)) {
      errors.push({ code: 'no-mana', message: 'Not enough mana', i18nKey: 'HBM.spellCast.notEnoughMana' });
    }
  }
  if (opts.castAsPrayer) {
    if (1 > Number(a.zeal?.value ?? 0)) {
      errors.push({ code: 'no-zeal', message: 'Not enough zeal', i18nKey: 'HBM.spellCast.notEnoughZeal' });
    }
  } else if (mode === 'sacred' && opts.hekateMode !== 'witch') {
    const zealNeeded = Math.max(1, opts.zealSpent ?? 1);
    if (zealNeeded > Number(a.zeal?.value ?? 0)) {
      errors.push({ code: 'no-zeal', message: 'Not enough zeal', i18nKey: 'HBM.spellCast.notEnoughZeal' });
    }
  }
  if (mode === 'blood') {
    if (bloodSpent > Number(a.blood?.value ?? 0)) {
      errors.push({ code: 'no-blood', message: 'Not enough blood', i18nKey: 'HBM.spellCast.notEnoughBlood' });
    }
  }

  // Race gate
  const raceReq: string[] = Array.isArray(sys.requirements?.race) ? sys.requirements.race : [];
  if (raceReq.length > 0) {
    const actorRace = getActorRaceId(actor);
    const ok = raceReq.some((r) => r.toLowerCase() === actorRace);
    if (!ok) {
      const translatedRaces = raceReq.map(r => {
        const key = r.toLowerCase();
        return game.i18n.has(`HBM.racesList.${key}`) ? game.i18n.localize(`HBM.racesList.${key}`) : r;
      }).join(', ');
      errors.push({
        code: 'race-locked', message: `Spell requires race: ${raceReq.join(', ')}`,
        i18nKey: 'HBM.spellCast.raceLocked', i18nArgs: { races: translatedRaces },
      });
    }
  }

  // Talent gate
  const talentReq: string[] = Array.isArray(sys.requirements?.talent) ? sys.requirements.talent : [];
  for (const t of talentReq) {
    if (!actorHasTalent(actor, t)) {
      errors.push({
        code: 'talent-missing', message: `Missing required talent: ${t}`,
        i18nKey: 'HBM.spellCast.talentMissing', i18nArgs: { talent: t },
      });
    }
  }

  // Discipline gate (any-of)
  const discReq: string[] = Array.isArray(sys.requirements?.discipline) ? sys.requirements.discipline : [];
  if (discReq.length > 0) {
    const hasEldritchMagic = actorHasDiscipline(actor, 'abyssPrimal');
    const hasAspectMagic = actorHasDiscipline(actor, 'abyssAspects');
    const hasWitchMagic = actorHasDiscipline(actor, 'witch');

    // Is the spell an Eldritch Spell?
    const isEldritchSpell = discReq.some((d) => matchDiscipline(d, 'abyssPrimal')) ||
                            matchDiscipline(sys.school ?? '', 'abyssPrimal') ||
                            matchDiscipline(sys.discipline ?? '', 'abyssPrimal');

    let bypassDisc = false;
    if (hasEldritchMagic) {
      bypassDisc = true; // Eldritch Magic allows casting ANY spells
    } else if ((hasWitchMagic || hasAspectMagic) && !isEldritchSpell) {
      bypassDisc = true; // Witch/Aspect Magic allows casting any spells EXCEPT Eldritch spells
    }

    const ok = bypassDisc || discReq.some((d) => actorHasDiscipline(actor, d));
    if (!ok) {
      const translatedDisciplines = discReq.map(d => {
        return game.i18n.has(`HBM.spellSchool.${d}`) ? game.i18n.localize(`HBM.spellSchool.${d}`) : d;
      }).join(', ');
      errors.push({
        code: 'discipline-missing', message: `Requires one of disciplines: ${discReq.join(', ')}`,
        i18nKey: 'HBM.spellCast.disciplineMissing', i18nArgs: { disciplines: translatedDisciplines },
      });
    }
  }

  // Deity gate (sacred + non-common)
  const deity = String(sys.deity ?? '').trim();
  if ((sys.school === 'sacred' || mode === 'sacred') && deity && deity !== 'common') {
    const actorDeity = String((actor as any).system?.details?.deity ?? '').trim();
    if (actorDeity && actorDeity !== deity) {
      warnings.push({
        code: 'deity-mismatch',
        message: `Spell deity (${deity}) differs from devoted deity (${actorDeity})`,
        i18nKey: 'HBM.spellCast.deityMismatch', i18nArgs: { spell: deity, actor: actorDeity },
      });
    }
  }

  // Group cast
  if (sys.requiresGroupCast) {
    const min = Math.max(1, Number(sys.minCasters ?? 1));
    const provided = (opts.groupCasters?.length ?? 0) + 1;
    if (provided < min) {
      errors.push({
        code: 'group-cast', message: `Requires ${min} co-casters; have ${provided}`,
        i18nKey: 'HBM.spellCast.groupCastRequired', i18nArgs: { min, provided },
      });
    }
  }

  // Witch symbol cap
  if (mode === 'witch' || opts.hekateMode === 'witch') {
    const required = Math.max(0, Number(sys.complexityLevel ?? sys.components?.symbols?.length ?? 0));
    const maxSymbols = Math.ceil(Number(a.magic?.value ?? 0) / 2);
    if (required > maxSymbols) {
      errors.push({
        code: 'witch-symbols', message: `Symbols ${required}/${maxSymbols}`,
        i18nKey: 'HBM.spellCast.witchSymbols', i18nArgs: { used: required, max: maxSymbols },
      });
    }
  }

  // Non-combat-only spells
  if (sys.nonCombatOnly && actorIsInCombat(actor) && !opts.bypassNonCombatBlock) {
    errors.push({
      code: 'non-combat', message: 'Spell cannot be cast in combat',
      i18nKey: 'HBM.spellCast.nonCombatOnly',
    });
  }

  // Superspell warning (non-blocking)
  if (sys.isSuperspell && actorIsInCombat(actor) && !opts.bypassSuperspellWarning) {
    warnings.push({
      code: 'superspell-combat',
      message: 'Casting superspell during combat is generally inadvisable',
      i18nKey: 'HBM.spellCast.superspellInCombat',
    });
  }

  return { errors, warnings, ok: errors.length === 0 };
}
