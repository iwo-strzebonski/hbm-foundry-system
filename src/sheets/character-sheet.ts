/**
 * Character sheet - Foundry v13 ApplicationV2 + Handlebars.
 * Features: tabs, roll-dialogs, drag-and-drop item creation.
 */

import { rollSkill, rollAttribute, rollInitiative } from '../dice/macros';
import { castSpell } from '../logic/spell-cast';
import { askRollParams } from '../dice/roll-dialog';
import { askCastOptions } from '../dice/cast-dialog';
import { askApplyDamage } from '../dice/damage-dialog';
import { applyDamage } from '../logic/damage';
import { rest } from '../logic/rest';
import { ATTRIBUTES, AttributeKey, SKILL_KEYS, getMagicPowerEntry } from '../constants';

const { ActorSheetV2 } = foundry.applications.sheets as unknown as {
  ActorSheetV2: typeof foundry.applications.sheets.ActorSheetV2;
};
const { HandlebarsApplicationMixin } = foundry.applications.api as unknown as {
  HandlebarsApplicationMixin: <T extends abstract new (...args: any[]) => any>(base: T) => T;
};

export class CharacterSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static override DEFAULT_OPTIONS = {
    classes: ['hbm', 'sheet', 'character'],
    position: { width: 760, height: 720 },
    window: { resizable: true, title: 'HBM.actor.character' },
    actions: {
      rollSkill: CharacterSheet._onRollSkill,
      rollAttribute: CharacterSheet._onRollAttribute,
      rollInitiative: CharacterSheet._onRollInitiative,
      castSpell: CharacterSheet._onCastSpell,
      deleteItem: CharacterSheet._onDeleteItem,
      editItem: CharacterSheet._onEditItem,
      applyDamage: CharacterSheet._onApplyDamage,
      takeBreather: CharacterSheet._onTakeBreather,
      shortRest: CharacterSheet._onShortRest,
      longRest: CharacterSheet._onLongRest,
      actorEffectCreate: CharacterSheet._onActorEffectCreate,
      actorEffectToggle: CharacterSheet._onActorEffectToggle,
      actorEffectEdit: CharacterSheet._onActorEffectEdit,
      actorEffectDelete: CharacterSheet._onActorEffectDelete,
      addArrayEntry: CharacterSheet._onAddArrayEntry,
      removeArrayEntry: CharacterSheet._onRemoveArrayEntry,
      editImage: CharacterSheet._onEditImage,
      toggleEquipped: CharacterSheet._onToggleEquipped,
      recalculateMoney: CharacterSheet._onRecalculateMoney,
    },
    form: {
      submitOnChange: true,
      closeOnSubmit: false,
    },
  };

  static override PARTS = {
    main: { template: 'systems/hbm-rpg-v3/templates/actor/character.hbs' },
  };

  /** Active tab per group - persists across re-renders. */
  tabGroups: Record<string, string> = { primary: 'stats' };

  override async _prepareContext(options: unknown) {
    const ctx = (await super._prepareContext(options)) as Record<string, unknown>;
    const actor = (this as unknown as { actor: { system: unknown; items: any[] } }).actor;
    const spells = actor.items.filter((it: any) => it.type === 'spell');
    const gear = actor.items.filter((it: any) => it.type === 'gear');
    const abilities = actor.items.filter((it: any) => it.type === 'ability');
    const talents = actor.items.filter((it: any) => it.type === 'talent');

    // Group spells by school for sheet display
    const spellsBySchool = new Map<string, any[]>();
    for (const sp of spells) {
      const s = sp.system?.school || 'standard';
      if (!spellsBySchool.has(s)) spellsBySchool.set(s, []);
      spellsBySchool.get(s)!.push(sp);
    }
    const spellSchoolGroups = [...spellsBySchool.entries()]
      .map(([school, items]) => ({
        school,
        label: game.i18n.localize(`HBM.spellSchool.${school}`),
        items: items.sort((a: any, b: any) => (a.system?.circle ?? 0) - (b.system?.circle ?? 0)),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pl'));

    const sys = actor.system as any;
    const hasBloodMagic = sys?.details?.discipline === 'Magia Krwi' || sys?.details?.discipline === 'Blood Magic';
    const elixirCap = (sys?.attributes?.body?.value ?? 0) + 1;

    const actorEffects = [...((actor as any).effects ?? [])].map((ef: any) => ({
      id: ef.id,
      name: ef.name,
      icon: ef.icon ?? 'icons/svg/aura.svg',
      disabled: ef.disabled ?? false,
      isTransferred: !!ef.origin,
      originName: ef.origin ? (actor.items.find((it: any) => ef.origin?.endsWith(it.id))?.name ?? ef.origin) : '',
      changes: ef.changes ?? [],
    }));

    // Pre-map attributes and skills to prevent lookup context issues in Handlebars
    const attributes = ATTRIBUTES.map(key => {
      const attrObj = sys.attributes?.[key];
      const actualVal = attrObj?.actual !== undefined ? attrObj.actual : (attrObj?.value ?? 0);
      const labels = ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
      const actualLabel = labels[Math.max(0, Math.min(10, actualVal))] || String(actualVal);
      return {
        key,
        value: attrObj?.value ?? 0,
        actual: actualVal,
        actualLabel,
        label: game.i18n.localize(`HBM.attributes.${key}`)
      };
    });

    const skills = SKILL_KEYS.map(key => ({
      key,
      value: sys.skills?.[key]?.value ?? 0,
      label: game.i18n.localize(`HBM.skills.${key}`)
    }));

    const races = ['czlowiek', 'elf', 'lamia', 'feles', 'aniol'].map(key => ({
      key,
      label: game.i18n.localize(`HBM.racesList.${key}`)
    }));

    const disciplines = [
      'alchemyTransmutation', 'alchemyBrewing', 'botany',
      'elementsAir', 'elementsWater', 'elementsFire', 'elementsEarth',
      'artifice', 'golemancy', 'runes', 'manaSourceMage',
      'illusion', 'sacred', 'sacredExorcism', 'witch', 'necromancy', 'blood',
      'crimson', 'abyssAspects', 'abyssPrimal', 'eldritch'
    ].map(key => ({
      key,
      label: game.i18n.localize(`HBM.spellSchool.${key}`)
    }));

    // Filter gear categories for tabular sheet display
    const weapons = gear.filter((it: any) => it.system?.category === 'weapon');
    const armors = gear.filter((it: any) => it.system?.category === 'armor');
    const equipment = gear.filter((it: any) => it.system?.category === 'equipment');

    // Localized talents list no longer needed (dropdown removed - drag from compendium)

    return {
      ...ctx,
      system: actor.system,
      attributes,
      skills,
      races,
      disciplines,
      tabGroups: this.tabGroups,
      attributeKeys: ATTRIBUTES,
      skillKeys: SKILL_KEYS,
      spells,
      spellSchoolGroups,
      hasBloodMagic,
      elixirCap,
      gear,
      weapons,
      armors,
      equipment,
      abilities,
      talents,
      actorEffects,
      tabs: this._prepareTabs(),
    };
  }

  /** Build tab metadata for the template. */
  private _prepareTabs() {
    const active = this.tabGroups['primary'] ?? 'stats';
    return ['stats', 'actions', 'skills', 'spells', 'talents', 'inventory', 'effects', 'biography'].map((id) => ({
      id,
      label: `HBM.ui.tabs.${id}`,
      active: active === id,
      cssClass: active === id ? 'active' : '',
    }));
  }

  override _onRender(context: unknown, options: unknown) {
    super._onRender(context, options);
    const html = this.element;

    // Tab navigation
    html.querySelectorAll<HTMLElement>('.tabs .tab-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        if (!tab) return;
        this.tabGroups['primary'] = tab;
        // Update active state without full re-render
        html.querySelectorAll('.tabs .tab-item').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        html.querySelectorAll<HTMLElement>('.tab-panel').forEach((p) => {
          p.classList.toggle('active', p.dataset.tab === tab);
        });
      });
    });

    // Drag-and-drop: accept items dragged from compendium / sidebar
    const body = html.querySelector<HTMLElement>('.sheet-body');
    if (body) {
      body.addEventListener('dragover', (ev) => { ev.preventDefault(); });
      body.addEventListener('drop', (ev) => this._handleDrop(ev));
    }
  }

  private async _handleDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation(); // prevent ActorSheetV2 base from also handling this
    const data = (foundry.applications as any).ux.TextEditor.implementation.getDragEventData(event);
    if (!data || data['type'] !== 'Item') return;
    const item = await fromUuid<any>(data['uuid'] as string);
    if (!item) return;
    const actor = (this as unknown as { actor: any }).actor;
    const uuid = data['uuid'] as string;

    // Auto-link Race / Class items by UUID - do NOT create embedded copies.
    if (item.type === 'race') {
      await actor.update({ 'system.details.raceId': uuid });
      return;
    } else if (item.type === 'class') {
      const year = Math.max(1, Math.min(4, Number(item.system?.year ?? 1)));
      const ids = [...((actor.system as any).details?.classIds ?? [])];
      ids[year - 1] = uuid;
      await actor.update({ 'system.details.classIds': ids });
      return;
    }

    // Talents may always be added multiple times (each rank/copy is a distinct embedded item).
    // All other types: deduplicate by source slug or by matching the exact same document id.
    if (item.type !== 'talent') {
      const sourceSlug: string | undefined = item.flags?.['hbm-rpg-v3']?.slug;
      const existing = actor.items.find((it: any) => {
        if (it.id === item.id) return true; // same document
        if (sourceSlug && it.flags?.['hbm-rpg-v3']?.slug === sourceSlug) return true;
        return false;
      });
      if (existing) {
        ui?.notifications?.warn(game.i18n.format('HBM.ui.itemAlreadyOwned', { name: item.name }));
        return;
      }
    }

    if (item.type === 'talent' && item.system?.multiSelect) {
      const match = item.name.match(/(Dziedzina|B\u00f3stwo|Zmys\u0142|Atrybut|Umiej\u0119tno\u015b\u0107)/i);
      if (match) {
        const paramType = match[1];
        const title = game.i18n.localize('HBM.ui.selectTalentParamTitle') || 'Wybierz parametr talentu';
        const labelText = game.i18n.format('HBM.ui.selectTalentParamDesc', { param: paramType }) || `Wprowad\u017a warto\u015b\u0107 dla parametru (${paramType}):`;

        let specified: string | null = null;
        await (foundry.applications.api as any).DialogV2.wait({
          title,
          content: `
            <div class="hbm-talent-dialog" style="padding:10px;">
              <p>${labelText}</p>
              <input id="hbm-talent-param-input" type="text" placeholder="${paramType}" style="width:100%; margin-bottom:10px;" />
            </div>`,
          buttons: [
            {
              type: 'button', action: 'confirm',
              label: game.i18n.localize('HBM.ui.confirm') || 'Potwierd\u017a',
              default: true,
              callback: (_ev: Event, _btn: any, dialog: any) => {
                const val = (dialog.element.querySelector('#hbm-talent-param-input') as HTMLInputElement)?.value?.trim();
                specified = val || null;
              },
            },
            { type: 'button', action: 'cancel', label: game.i18n.localize('HBM.ui.cancel') || 'Anuluj' },
          ],
          rejectClose: false,
        });

        if (specified) {
          const obj = item.toObject();
          obj.name = item.name.replace(/\([^)]+\)$/, `(${specified})`);
          await actor.createEmbeddedDocuments('Item', [obj]);
          return;
        } else {
          return; // cancel
        }
      }
    }

    await actor.createEmbeddedDocuments('Item', [item.toObject()]);
  }

  // ─── Actions ─────────────────────────────────────────────────────────────

  static async _onRollSkill(this: CharacterSheet, _event: PointerEvent, target: HTMLElement) {
    const skillKey = target.dataset.skill;
    if (!skillKey) return;
    const actor = (this as unknown as { actor: any }).actor;

    // Determine default pool so the dialog can show it
    const skill = actor.system.skills?.[skillKey];
    const attrKey = (skill?.defaultAttribute ?? 'body') as AttributeKey;
    const attr = actor.system.attributes[attrKey];
    const attrVal = (attrKey === 'magic' && attr)
      ? (attr.dicePool ?? getMagicPowerEntry(attr.actual ?? attr.value ?? 0).dicePool)
      : (attr?.value ?? 0);
    const pool = attrVal + (skill?.value ?? 0);

    const params = await askRollParams({ pool, flavor: game.i18n.format('HBM.roll.rollSkill', { skill: game.i18n.localize(`HBM.skills.${skillKey}`) }) });
    if (!params) return;

    await rollSkill(actor, skillKey, {
      threshold: params.threshold,
      required: params.required,
      modifier: params.modifier,
      flavor: params.flavor,
    });
  }

  static async _onRollAttribute(this: CharacterSheet, _event: PointerEvent, target: HTMLElement) {
    const attr = target.dataset.attribute as AttributeKey | undefined;
    if (!attr) return;
    const actor = (this as unknown as { actor: any }).actor;

    const a = actor.system.attributes[attr];
    const pool = (attr === 'magic' && a)
      ? (a.dicePool ?? getMagicPowerEntry(a.actual ?? a.value ?? 0).dicePool)
      : (a?.value ?? 0);
    const params = await askRollParams({ pool, flavor: game.i18n.format('HBM.roll.rollAttribute', { attribute: game.i18n.localize(`HBM.attributes.${attr}`) }) });
    if (!params) return;

    await rollAttribute(actor, attr, {
      threshold: params.threshold,
      required: params.required,
      modifier: params.modifier,
    });
  }

  static async _onCastSpell(this: CharacterSheet, _event: PointerEvent, target: HTMLElement) {
    const itemId = target.dataset.itemId;
    if (!itemId) return;
    const actor = (this as unknown as { actor: any }).actor;
    const spell = actor.items.get(itemId);
    if (!spell || spell.type !== 'spell') return;

    const opts = await askCastOptions(spell, actor);
    if (!opts) return;
    opts.speaker = ChatMessage.getSpeaker({ actor });

    await castSpell(actor, spell, opts);
  }

  static async _onDeleteItem(this: CharacterSheet, _event: PointerEvent, target: HTMLElement) {
    const itemId = target.dataset.itemId;
    if (!itemId) return;
    const actor = (this as unknown as { actor: any }).actor;
    const item = actor.items.get(itemId);
    if (!item) return;
    await item.delete();
  }

  static async _onEditItem(this: CharacterSheet, _event: PointerEvent, target: HTMLElement) {
    const itemId = target.dataset.itemId;
    if (!itemId) return;
    const actor = (this as unknown as { actor: any }).actor;
    const item = actor.items.get(itemId);
    if (!item) return;
    item.sheet?.render(true);
  }

  static async _onRollInitiative(this: CharacterSheet, _event: PointerEvent, _target: HTMLElement) {
    const actor = (this as unknown as { actor: any }).actor;
    await rollInitiative(actor);
  }

  static async _onApplyDamage(this: CharacterSheet, _event: PointerEvent, _target: HTMLElement) {
    const actor = (this as unknown as { actor: any }).actor;
    const params = await askApplyDamage(actor);
    if (!params) return;
    await applyDamage(actor, params);
  }

  static async _onTakeBreather(this: CharacterSheet, _event: PointerEvent, _target: HTMLElement) {
    const actor = (this as unknown as { actor: any }).actor;
    const r = await rest(actor, 'breather');
    await ChatMessage.create({
      content: `<strong>${actor.name}</strong> - Chwila Wytchnienia: +${r.hpRestored} ŻYW · +${r.manaRestored} MN`,
      speaker: ChatMessage.getSpeaker({ actor }),
    });
  }

  static async _onShortRest(this: CharacterSheet, _event: PointerEvent, _target: HTMLElement) {
    const actor = (this as unknown as { actor: any }).actor;
    const r = await rest(actor, 'short');
    await ChatMessage.create({
      content: `<strong>${actor.name}</strong> - Krótki Odpoczynek: +${r.hpRestored} ŻYW · +${r.manaRestored} MN${r.toleranceRecovered ? `, −${r.toleranceRecovered} tolerancja` : ''}`,
      speaker: ChatMessage.getSpeaker({ actor }),
    });
  }

  static async _onLongRest(this: CharacterSheet, _event: PointerEvent, _target: HTMLElement) {
    const actor = (this as unknown as { actor: any }).actor;
    const r = await rest(actor, 'long');
    await ChatMessage.create({
      content: `<strong>${actor.name}</strong> - Długi Odpoczynek: +${r.hpRestored} ŻYW · +${r.manaRestored} MN · +${r.zealRestored} ZP · +${r.bloodRestored} krew · −${r.toleranceRecovered} tolerancja`,
      speaker: ChatMessage.getSpeaker({ actor }),
    });
  }

  static async _onActorEffectCreate(this: CharacterSheet) {
    const actor = (this as unknown as { actor: any }).actor;
    const created = await actor.createEmbeddedDocuments('ActiveEffect', [{
      name: game.i18n.localize('HBM.activeEffect.newEffect'),
      icon: 'icons/svg/aura.svg',
      disabled: false,
      changes: [],
    }]);
    created[0]?.sheet?.render(true);
  }

  static async _onActorEffectToggle(this: CharacterSheet, _event: PointerEvent, target: HTMLElement) {
    const id = target.dataset.effectId;
    if (!id) return;
    const actor = (this as unknown as { actor: any }).actor;
    const effect = actor.effects.get(id);
    if (!effect) return;
    await effect.update({ disabled: !effect.disabled });
  }

  static async _onActorEffectEdit(this: CharacterSheet, _event: PointerEvent, target: HTMLElement) {
    const id = target.dataset.effectId;
    if (!id) return;
    const actor = (this as unknown as { actor: any }).actor;
    actor.effects.get(id)?.sheet?.render(true);
  }

  static async _onActorEffectDelete(this: CharacterSheet, _event: PointerEvent, target: HTMLElement) {
    const id = target.dataset.effectId;
    if (!id) return;
    const actor = (this as unknown as { actor: any }).actor;
    await actor.deleteEmbeddedDocuments('ActiveEffect', [id]);
  }

  static async _onAddArrayEntry(this: CharacterSheet, _event: PointerEvent, target: HTMLElement) {
    const path = target.dataset.path;
    if (!path) return;
    const actor = (this as unknown as { actor: any }).actor;
    const current = (foundry.utils.getProperty(actor, path) ?? []) as unknown[];
    const template = target.dataset.template;
    const entry = template ? JSON.parse(template) : '';
    await actor.update({ [path]: [...current, entry] });
  }

  static async _onRemoveArrayEntry(this: CharacterSheet, _event: PointerEvent, target: HTMLElement) {
    const path = target.dataset.path;
    const idx = Number(target.dataset.index);
    if (!path || Number.isNaN(idx)) return;
    const actor = (this as unknown as { actor: any }).actor;
    const current = ([...(foundry.utils.getProperty(actor, path) ?? [])] as unknown[]);
    current.splice(idx, 1);
    await actor.update({ [path]: current });
  }


  static async _onEditImage(this: CharacterSheet, event: PointerEvent, target: HTMLElement) {

    const actor = (this as unknown as { actor: any }).actor;
    const current = actor.img;
    const fp = new FilePicker({
      type: "image",
      current: current,
      callback: (path: string) => {
        actor.update({ img: path });
      },
      top: this.position.top + 40,
      left: this.position.left + 10
    });
    return fp.browse();
  }

  static async _onToggleEquipped(this: CharacterSheet, _event: PointerEvent, target: HTMLElement) {
    const itemId = target.dataset.itemId;
    if (!itemId) return;
    const actor = (this as unknown as { actor: any }).actor;
    const item = actor.items.get(itemId);
    if (!item) return;
    await item.update({ 'system.equipped': !item.system.equipped });
  }

  static async _onRecalculateMoney(this: CharacterSheet, _event: PointerEvent, _target: HTMLElement) {
    const actor = (this as unknown as { actor: any }).actor;
    const pln = actor.system.details?.money ?? 0;
    const currentYear = actor.system.details?.currentYear ?? 2026;
    const currentRealYear = new Date().getFullYear();

    const fetchNBP = async (currency: string, year: number): Promise<{ rate: number; date: string } | null> => {
      if (year >= 2002 && year <= currentRealYear) {
        for (let day = 1; day <= 7; day++) {
          const d = `${year}-06-${String(day).padStart(2, '0')}`;
          try {
            const res = await fetch(`https://api.nbp.pl/api/exchangerates/rates/a/${currency}/${d}/?format=json`);
            if (res.ok) { const data = await res.json(); const r = data?.rates?.[0]?.mid; if (typeof r === 'number') return { rate: r, date: d }; }
          } catch (_) { /* ignore */ }
        }
      }
      try {
        const res = await fetch(`https://api.nbp.pl/api/exchangerates/rates/a/${currency}/?format=json`);
        if (res.ok) { const data = await res.json(); const r = data?.rates?.[0]?.mid; const dt = data?.rates?.[0]?.effectiveDate || ''; if (typeof r === 'number') return { rate: r, date: dt }; }
      } catch (_) { /* ignore */ }
      return null;
    };

    const [eurData, usdData] = await Promise.all([fetchNBP('eur', currentYear), fetchNBP('usd', currentYear)]);
    const eurRate = eurData?.rate ?? 4.35;
    const usdRate = usdData?.rate ?? 4.00;
    const rateDate = eurData?.date ?? usdData?.date ?? 'default';
    const isLive = !!(eurData || usdData);

    const CURRENCIES: Record<string, { label: string; toPln: number; note: string }> = {
      PLN: { label: 'PLN (Złoty)', toPln: 1, note: '' },
      EUR: { label: 'EUR (Euro)', toPln: eurRate, note: `NBP ${rateDate}` },
      USD: { label: 'USD (Dolar)', toPln: usdRate, note: `NBP ${rateDate}` },
      TH: { label: 'TH (Thrakka)', toPln: eurRate, note: '1:1 z EUR' },
      FC: { label: 'FC (Kredyt Federacji Sol-3)', toPln: 2.0, note: 'stały kurs 2 PLN = 1 FC' },
      ST: { label: 'ST (Srebrny Talent)', toPln: 240, note: '1 ST = 240 PLN' },
      ZK: { label: 'ZK (Złota Korona)', toPln: 2880, note: '1 ZK = 12 ST' },
      PL: { label: 'PL (Platynowy Lingot)', toPln: 34560, note: '1 PL = 12 ZK' },
    };
    const currKeys = Object.keys(CURRENCIES);
    const optHtml = (sel: string) => currKeys.map(k =>
      `<option value="${k}"${k === sel ? ' selected' : ''}>${CURRENCIES[k].label}</option>`
    ).join('');
    const ratesRows = currKeys.map(k => {
      const c = CURRENCIES[k];
      const fromPln = k === 'PLN' ? '1.0000' : (1 / c.toPln).toPrecision(4);
      return `<tr><td>${c.label}</td><td style="text-align:right;font-family:monospace;">${c.toPln === 1 ? '1.0000' : c.toPln.toFixed(4)}</td><td style="text-align:right;font-family:monospace;">${fromPln}</td><td style="color:#777;font-size:0.75rem;">${c.note}</td></tr>`;
    }).join('');
    const ratesJson = JSON.stringify(Object.fromEntries(currKeys.map(k => [k, CURRENCIES[k].toPln])));

    const content = `
      <div class="hbm money-converter" style="padding:10px;font-family:'Signika',sans-serif;display:flex;flex-direction:column;gap:12px;">
        <p style="margin:0;font-size:0.78rem;color:${isLive ? '#2a7a3e' : '#888'};">
          <em>📡 ${isLive ? `Kursy z NBP (${rateDate})` : 'Domyślne kursy (brak połączenia z NBP)'}</em>
        </p>
        <div style="background:var(--hbm-card-bg,#1a1a2e);border:1px solid var(--hbm-border,#333);border-radius:6px;padding:8px 12px;">
          <span style="font-weight:bold;">Gotówka aktora:</span>
          <span style="font-family:monospace;font-size:1.1rem;margin-left:6px;">${pln} PLN</span>
          <small style="color:#888;margin-left:6px;">(Rok kampanii: ${currentYear})</small>
        </div>
        <div style="background:var(--hbm-card-bg,#1a1a2e);border:1px solid var(--hbm-accent,#6060c0);border-radius:6px;padding:10px 12px;display:flex;flex-direction:column;gap:8px;">
          <strong style="font-size:0.9rem;">Kalkulator</strong>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <input id="hbm-conv-left" type="number" value="1" min="0" step="any"
              style="width:6.5rem;font-size:1rem;text-align:right;padding:3px 6px;background:transparent;color:var(--hbm-fg,#eee);border:1px solid var(--hbm-border,#555);border-radius:4px;"
              oninput="(function(v){var r=window._hbmRates;var lk=document.getElementById('hbm-sf').value;var rk=document.getElementById('hbm-st').value;var res=v*r[lk]/r[rk];document.getElementById('hbm-conv-right').value=isFinite(res)?res.toFixed(4):'';})(this.value)" />
            <select id="hbm-sf" style="flex:1;min-width:8rem;"
              onchange="(function(){var v=parseFloat(document.getElementById('hbm-conv-left').value)||0;var r=window._hbmRates;var lk=this.value;var rk=document.getElementById('hbm-st').value;var res=v*r[lk]/r[rk];document.getElementById('hbm-conv-right').value=isFinite(res)?res.toFixed(4):'';}).call(this)">
              ${optHtml('PLN')}
            </select>
            <span style="font-size:1.2rem;color:var(--hbm-accent,#8080ff);">⇄</span>
            <input id="hbm-conv-right" type="number" value="" min="0" step="any"
              style="width:6.5rem;font-size:1rem;text-align:right;padding:3px 6px;background:transparent;color:var(--hbm-fg,#eee);border:1px solid var(--hbm-border,#555);border-radius:4px;"
              oninput="(function(v){var r=window._hbmRates;var lk=document.getElementById('hbm-sf').value;var rk=document.getElementById('hbm-st').value;var res=v*r[rk]/r[lk];document.getElementById('hbm-conv-left').value=isFinite(res)?res.toFixed(4):'';}).call(this)" />
            <select id="hbm-st" style="flex:1;min-width:8rem;"
              onchange="(function(){var v=parseFloat(document.getElementById('hbm-conv-right').value)||0;var r=window._hbmRates;var lk=document.getElementById('hbm-sf').value;var rk=this.value;var res=v*r[rk]/r[lk];document.getElementById('hbm-conv-left').value=isFinite(res)?res.toFixed(4):'';}).call(this)">
              ${optHtml('EUR')}
            </select>
          </div>
        </div>
        <details>
          <summary style="cursor:pointer;font-size:0.85rem;color:var(--hbm-accent-dim,#999);">▸ Tabela kursów wymiany</summary>
          <table style="width:100%;border-collapse:collapse;font-size:0.8rem;margin-top:8px;">
            <thead><tr style="border-bottom:1px solid var(--hbm-border,#555);">
              <th style="text-align:left;">Waluta</th><th style="text-align:right;">Kurs (PLN)</th><th style="text-align:right;">1 PLN =</th><th>Uwaga</th>
            </tr></thead>
            <tbody>${ratesRows}</tbody>
          </table>
        </details>
      </div>
      <script>window._hbmRates=${ratesJson};</script>`;

    await (foundry.applications.api as any).DialogV2.prompt({
      window: { title: game.i18n.localize('HBM.ui.moneyConverterTitle') },
      content,
      rejectClose: false,
    });
  }
}


