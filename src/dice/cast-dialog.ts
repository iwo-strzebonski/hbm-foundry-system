/**
 * Comprehensive cast dialog. Replaces the old `askManaSpent` for spell-cast
 * actions on the character/NPC sheet. Returns null if cancelled.
 *
 * Inputs adapt to spell mode:
 *   - standard:    mana
 *   - sacred:      zeal (+ optional Hekate hybrid toggle if witch symbols set)
 *   - witch:       mana
 *   - blood:       mana + blood
 *
 * Plus GM bypass checkboxes for super/non-combat warnings.
 */

import type { CastOptions } from '../logic/spell-cast';

interface SpellForDialog {
  name: string;
  system: {
    castingMode: 'standard' | 'sacred' | 'witch' | 'blood';
    manaCost: number;
    bloodCost?: number;
    isSuperspell?: boolean;
    nonCombatOnly?: boolean;
    requiresGroupCast?: boolean;
    minCasters?: number;
    components?: { symbols?: string[] };
    variableSuccesses?: Array<{ label: string; successes: number }>;
  };
}

interface ActorForDialog {
  system: {
    attributes: {
      mana: { value: number; maxPerSpell: number };
      zeal: { value: number; max: number };
      blood?: { value: number; max: number };
    };
  };
}

export async function askCastOptions(spell: SpellForDialog, actor: ActorForDialog): Promise<CastOptions | null> {
  const mode = spell.system.castingMode ?? 'standard';
  const a = actor.system.attributes;
  const baseMana = Math.max(0, spell.system.manaCost ?? 0);
  const baseBlood = Math.max(0, spell.system.bloodCost ?? 0);
  const baseZeal = mode === 'sacred' ? 1 : 0;

  const showHekate = mode === 'sacred' && (spell.system.components?.symbols?.length ?? 0) > 0;
  const showSuper = !!spell.system.isSuperspell;
  const showNonCombat = !!spell.system.nonCombatOnly;
  const showGroup = !!spell.system.requiresGroupCast;

  const fields: string[] = [];

  if (mode === 'standard' || mode === 'witch' || mode === 'blood') {
    const max = a.mana.value;
    fields.push(`
      <div class="form-group">
        <label>${game.i18n.localize('HBM.spellCast.manaSpent')} (max ${max})</label>
        <input type="number" name="manaSpent" value="${baseMana}" min="${baseMana}" max="${max}" step="${baseMana > 0 ? baseMana : 1}"/>
        <small>${game.i18n.localize('HBM.resources.maxManaPerSpell')}: ${a.mana.maxPerSpell}</small>
      </div>`);
  }
  if (mode === 'sacred') {
    fields.push(`
      <div class="form-group">
        <label>${game.i18n.localize('HBM.spellCast.zealSpent')} (max ${a.zeal.value})</label>
        <input type="number" name="zealSpent" value="${baseZeal}" min="1" max="${a.zeal.value}"/>
      </div>`);
  }
  if (mode === 'blood' && a.blood) {
    const max = a.blood.value;
    fields.push(`
      <div class="form-group">
        <label>${game.i18n.localize('HBM.spellCast.bloodSpent')} (max ${max})</label>
        <input type="number" name="bloodSpent" value="${baseBlood}" min="${baseBlood}" max="${max}"/>
      </div>`);
  }
  if (showHekate) {
    fields.push(`
      <div class="form-group">
        <label><input type="checkbox" name="hekateMode"/> ${game.i18n.localize('HBM.spellCast.hekateMode')}</label>
      </div>`);
  }
  if (showSuper) {
    fields.push(`
      <div class="form-group warn">
        <label><input type="checkbox" name="bypassSuperspellWarning"/> ${game.i18n.localize('HBM.spellCast.bypassSuperspell')}</label>
      </div>`);
  }
  if (showNonCombat) {
    fields.push(`
      <div class="form-group warn">
        <label><input type="checkbox" name="bypassNonCombatBlock"/> ${game.i18n.localize('HBM.spellCast.bypassNonCombatBlock')}</label>
      </div>`);
  }
  if (showGroup) {
    // Try to populate from canvas tokens (excluding the caster).
    const canvasAny = (canvas as unknown as { tokens?: { placeables: Array<{ id: string; name: string; actor?: { id: string; name: string } }> } } | undefined);
    const tokens = canvasAny?.tokens?.placeables ?? [];
    const candidates = tokens
      .filter((t) => t.actor)
      .map((t) => ({ id: t.actor!.id, name: t.actor!.name }));
    if (candidates.length > 0) {
      const checkboxes = candidates.map((c) =>
        `<label class="caster-option"><input type="checkbox" name="groupCaster_${c.id}" value="${c.id}"/> ${c.name}</label>`
      ).join('');
      fields.push(`
        <div class="form-group group-casters">
          <label>${game.i18n.localize('HBM.spellCast.groupCastersFromCanvas')} (${game.i18n.localize('HBM.spell.minCasters')}: ${spell.system.minCasters ?? 1})</label>
          <div class="caster-list">${checkboxes}</div>
        </div>`);
    } else {
      fields.push(`
        <div class="form-group">
          <label>${game.i18n.localize('HBM.spellCast.groupCasters')} (${game.i18n.localize('HBM.spell.minCasters')}: ${spell.system.minCasters ?? 1})</label>
          <input type="text" name="groupCasters" placeholder="actorId1, actorId2"/>
        </div>`);
    }
  }

  // Variable-success picker (e.g. Przywołanie Istoty z Otchłani)
  const variants = spell.system.variableSuccesses ?? [];
  if (variants.length > 0) {
    const radios = variants.map((v, i) =>
      `<label class="variant-option"><input type="radio" name="variantIdx" value="${i}" ${i === 0 ? 'checked' : ''}/> ${v.label} <small>(${v.successes} sukcesów)</small></label>`
    ).join('');
    fields.push(`
      <div class="form-group variable-successes">
        <label>${game.i18n.localize('HBM.spellCast.variableSuccesses')}</label>
        <div class="variant-list">${radios}</div>
      </div>`);
  }

  return new Promise((resolve) => {
    new foundry.appv1.api.Dialog({
      title: `${game.i18n.localize('HBM.spell.cast')}: ${spell.name}`,
      content: `<form class="hbm-dialog cast-dialog">${fields.join('')}</form>`,
      buttons: {
        cast: {
          icon: '<i class="fas fa-hat-wizard"></i>',
          label: game.i18n.localize('HBM.spell.cast'),
          callback: (html: any) => {
            const form = (html?.jquery ? html[0] : html as HTMLElement).querySelector('form') as HTMLFormElement;
            const fd = new foundry.applications.ux.FormDataExtended(form).object as Record<string, unknown>;
            const opts: CastOptions = {};
            if (fd.manaSpent != null) {
              let spent = Number(fd.manaSpent) || baseMana;
              if (baseMana > 0) {
                const remainder = spent % baseMana;
                if (remainder !== 0) {
                  spent = Math.round(spent / baseMana) * baseMana;
                }
              }
              opts.manaSpent = Math.max(baseMana, spent);
            }
            if (fd.zealSpent != null) opts.zealSpent = Math.max(1, Number(fd.zealSpent) || 1);
            if (fd.bloodSpent != null) opts.bloodSpent = Math.max(baseBlood, Number(fd.bloodSpent) || baseBlood);
            if (fd.hekateMode) opts.hekateMode = 'witch';
            if (fd.bypassSuperspellWarning) opts.bypassSuperspellWarning = true;
            if (fd.bypassNonCombatBlock) opts.bypassNonCombatBlock = true;
            const groupRaw = String(fd.groupCasters ?? '').trim();
            if (groupRaw) opts.groupCasters = groupRaw.split(/[,\s]+/).filter(Boolean);
            // Collect checkbox-form group casters
            const checkedCasters: string[] = [];
            for (const key of Object.keys(fd)) {
              if (key.startsWith('groupCaster_') && fd[key]) {
                const id = String(fd[key]);
                if (id) checkedCasters.push(id);
              }
            }
            if (checkedCasters.length > 0) {
              opts.groupCasters = [...(opts.groupCasters ?? []), ...checkedCasters];
            }
            // Variable-success override
            if (variants.length > 0 && fd.variantIdx != null) {
              const idx = Number(fd.variantIdx);
              const variant = variants[idx];
              if (variant) opts.requiredOverride = variant.successes;
            }
            resolve(opts);
          },
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: game.i18n.localize('HBM.ui.cancel') ?? 'Anuluj',
          callback: () => resolve(null),
        },
      },
      default: 'cast',
      close: () => resolve(null),
    }).render(true);
  });
}
