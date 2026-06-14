import { rollSkill, rollAttribute, rollInitiative } from '../dice/macros';
import { askRollParams } from '../dice/roll-dialog';
import { askApplyDamage } from '../dice/damage-dialog';
import { askCastOptions } from '../dice/cast-dialog';
import { applyDamage } from '../logic/damage';
import { castSpell } from '../logic/spell-cast';
import { HbmTSRoll } from '../dice/ts-roll';
import { ATTRIBUTES, AttributeKey, SKILL_KEYS, TS_DEFAULT_REQUIRED, TS_DEFAULT_THRESHOLD, getMagicPowerEntry } from '../constants';

const { ActorSheetV2 } = foundry.applications.sheets as unknown as {
  ActorSheetV2: typeof foundry.applications.sheets.ActorSheetV2;
};
const { HandlebarsApplicationMixin } = foundry.applications.api as unknown as {
  HandlebarsApplicationMixin: <T extends abstract new (...args: any[]) => any>(base: T) => T;
};

export class NpcSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static override DEFAULT_OPTIONS = {
    classes: ['hbm', 'sheet', 'npc'],
    position: { width: 640, height: 720 },
    window: { resizable: true, title: 'HBM.actor.npc' },
    actions: {
      rollSkill: NpcSheet._onRollSkill,
      rollAttribute: NpcSheet._onRollAttribute,
      rollInitiative: NpcSheet._onRollInitiative,
      rollNpcAttack: NpcSheet._onRollNpcAttack,
      applyDamage: NpcSheet._onApplyDamage,
      castSpell: NpcSheet._onCastSpell,
      deleteItem: NpcSheet._onDeleteItem,
      editItem: NpcSheet._onEditItem,
      actorEffectCreate: NpcSheet._onActorEffectCreate,
      actorEffectToggle: NpcSheet._onActorEffectToggle,
      actorEffectEdit: NpcSheet._onActorEffectEdit,
      actorEffectDelete: NpcSheet._onActorEffectDelete,
      addArrayEntry: NpcSheet._onAddArrayEntry,
      removeArrayEntry: NpcSheet._onRemoveArrayEntry,
      editImage: NpcSheet._onEditImage,
      recalculateMoney: NpcSheet._onRecalculateMoney,
    },
    form: { submitOnChange: true, closeOnSubmit: false },
  };

  static override PARTS = {
    main: { template: 'systems/hbm-rpg-v3/templates/actor/npc.hbs' },
  };

  override async _prepareContext(options: unknown) {
    const ctx = (await super._prepareContext(options)) as Record<string, unknown>;
    const actor = (this as unknown as { actor: { system: any; items: any[] } }).actor;
    const spells = actor.items.filter((it: any) => it.type === 'spell')
      .sort((a: any, b: any) => (a.system?.circle ?? 0) - (b.system?.circle ?? 0) || a.name.localeCompare(b.name, 'pl'));
    const actorEffects = [...((actor as any).effects ?? [])].map((ef: any) => ({
      id: ef.id,
      name: ef.name,
      icon: ef.icon ?? 'icons/svg/aura.svg',
      disabled: ef.disabled ?? false,
      isTransferred: !!ef.origin,
      originName: ef.origin ? (actor.items.find((it: any) => ef.origin?.endsWith(it.id))?.name ?? ef.origin) : '',
      changes: ef.changes ?? [],
    }));

    const sys = actor.system;
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

    return { ...ctx, system: actor.system, attributes, skills, spells, actorEffects };
  }

  override _onRender(context: unknown, options: unknown) {
    super._onRender(context, options);
    const html = (this as unknown as { element: HTMLElement }).element;
    html.addEventListener('dragover', (ev) => { ev.preventDefault(); });
    html.addEventListener('drop', (ev) => this._handleDrop(ev as DragEvent));
  }

  private async _handleDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    const data = (foundry.applications as any).ux.TextEditor.implementation.getDragEventData(event);
    if (!data || data['type'] !== 'Item') return;
    const item = await fromUuid<any>(data['uuid'] as string);
    if (!item) return;
    const actor = (this as unknown as { actor: any }).actor;
    // Deduplicate by source slug
    const sourceSlug: string | undefined = item.flags?.['hbm-rpg-v3']?.slug;
    const existing = actor.items.find((it: any) => {
      if (it.id === item.id) return true;
      if (item.type === 'talent' && item.system?.multiSelect) return false;
      if (sourceSlug && it.flags?.['hbm-rpg-v3']?.slug === sourceSlug) return true;
      return false;
    });
    if (existing) {
      ui?.notifications?.warn(game.i18n.format('HBM.ui.itemAlreadyOwned', { name: item.name }));
      return;
    }

    if (item.type === 'talent' && item.system?.multiSelect) {
      const match = item.name.match(/\((Dziedzina|Bóstwo|Zmysł|Atrybut|Umiejętność)\)$/i);
      if (match) {
        const paramType = match[1];
        const title = game.i18n.localize('HBM.ui.selectTalentParamTitle') || 'Wybierz parametr talentu';
        const labelText = game.i18n.format('HBM.ui.selectTalentParamDesc', { param: paramType }) || `Wprowadź wartość dla parametru (${paramType}):`;

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

  static async _onRollSkill(this: NpcSheet, _event: PointerEvent, target: HTMLElement) {
    const skillKey = target.dataset.skill;
    if (!skillKey) return;
    const actor = (this as unknown as { actor: any }).actor;

    // Determine default pool so the dialog can show it
    const skill = actor.system.skills?.[skillKey];
    const attrKey = (skill?.defaultAttribute ?? 'body') as AttributeKey;
    const attr = actor.system.attributes[attrKey];
    const attrVal = (attrKey === 'magic' && attr)
      ? ((attr as any).dicePool ?? getMagicPowerEntry((attr as any).actual ?? attr.value ?? 0).dicePool)
      : (attr?.value ?? 0);
    const pool = attrVal + (skill?.value ?? 0);

    const params = await askRollParams({
      pool,
      flavor: game.i18n.format('HBM.roll.rollSkill', { skill: game.i18n.localize(`HBM.skills.${skillKey}`) })
    });
    if (!params) return;

    await rollSkill(actor, skillKey, {
      threshold: params.threshold,
      required: params.required,
      modifier: params.modifier,
      flavor: params.flavor,
    });
  }

  static async _onRollAttribute(this: NpcSheet, _event: PointerEvent, target: HTMLElement) {
    const attr = target.dataset.attribute as AttributeKey | undefined;
    if (!attr) return;
    const actor = (this as unknown as { actor: any }).actor;
    const a = actor.system.attributes[attr];
    const pool = (attr === 'magic' && a)
      ? ((a as any).dicePool ?? getMagicPowerEntry((a as any).actual ?? a.value ?? 0).dicePool)
      : (a?.value ?? 0);
    const params = await askRollParams({
      pool,
      flavor: game.i18n.format('HBM.roll.rollAttribute', { attribute: game.i18n.localize(`HBM.attributes.${attr}`) }),
    });
    if (!params) return;
    await rollAttribute(actor, attr, {
      threshold: params.threshold,
      required: params.required,
      modifier: params.modifier,
    });
  }

  static async _onRollInitiative(this: NpcSheet, _event: PointerEvent, _target: HTMLElement) {
    const actor = (this as unknown as { actor: any }).actor;
    await rollInitiative(actor);
  }

  static async _onRollNpcAttack(this: NpcSheet, _event: PointerEvent, target: HTMLElement) {
    const idx = Number(target.dataset.index);
    if (Number.isNaN(idx)) return;
    const actor = (this as unknown as { actor: any }).actor;
    const attack = actor.system.combat?.attacks?.[idx];
    if (!attack) return;
    const params = await askRollParams({
      pool: Math.max(0, Number(attack.bonus) || 0),
      flavor: attack.name,
    });
    if (!params) return;
    const flavor = `${attack.name}${attack.damage ? ` - ${attack.damage}` : ''}`;
    const roll = HbmTSRoll.fromParams({
      pool: params.pool,
      threshold: params.threshold ?? TS_DEFAULT_THRESHOLD,
      required: params.required ?? TS_DEFAULT_REQUIRED,
      flavor,
    });
    await roll.evaluate();
    await roll.toMessage({ flavor, speaker: ChatMessage.getSpeaker({ actor }) });
  }

  static async _onApplyDamage(this: NpcSheet, _event: PointerEvent, _target: HTMLElement) {
    const actor = (this as unknown as { actor: any }).actor;
    const params = await askApplyDamage(actor);
    if (!params) return;
    await applyDamage(actor, params);
  }

  static async _onCastSpell(this: NpcSheet, _event: PointerEvent, target: HTMLElement) {
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

  static async _onDeleteItem(this: NpcSheet, _event: PointerEvent, target: HTMLElement) {
    const itemId = target.dataset.itemId;
    if (!itemId) return;
    const actor = (this as unknown as { actor: any }).actor;
    const item = actor.items.get(itemId);
    if (!item) return;
    await item.delete();
  }

  static async _onEditItem(this: NpcSheet, _event: PointerEvent, target: HTMLElement) {
    const itemId = target.dataset.itemId;
    if (!itemId) return;
    const actor = (this as unknown as { actor: any }).actor;
    const item = actor.items.get(itemId);
    if (!item) return;
    item.sheet?.render(true);
  }

  static async _onAddArrayEntry(this: NpcSheet, _event: PointerEvent, target: HTMLElement) {
    const path = target.dataset.path;
    if (!path) return;
    const actor = (this as unknown as { actor: any }).actor;
    const current = (foundry.utils.getProperty(actor, path) ?? []) as unknown[];
    const template = target.dataset.template;
    const entry = template ? JSON.parse(template) : '';
    await actor.update({ [path]: [...current, entry] });
  }

  static async _onRemoveArrayEntry(this: NpcSheet, _event: PointerEvent, target: HTMLElement) {
    const path = target.dataset.path;
    const idx = Number(target.dataset.index);
    if (!path || Number.isNaN(idx)) return;
    const actor = (this as unknown as { actor: any }).actor;
    const current = ([...(foundry.utils.getProperty(actor, path) ?? [])] as unknown[]);
    current.splice(idx, 1);
    await actor.update({ [path]: current });
  }

  static async _onActorEffectCreate(this: NpcSheet) {
    const actor = (this as unknown as { actor: any }).actor;
    const created = await actor.createEmbeddedDocuments('ActiveEffect', [{
      name: game.i18n.localize('HBM.activeEffect.newEffect'),
      icon: 'icons/svg/aura.svg',
      disabled: false,
      changes: [],
    }]);
    created[0]?.sheet?.render(true);
  }

  static async _onActorEffectToggle(this: NpcSheet, _event: PointerEvent, target: HTMLElement) {
    const id = target.dataset.effectId;
    if (!id) return;
    const actor = (this as unknown as { actor: any }).actor;
    const effect = actor.effects.get(id);
    if (!effect) return;
    await effect.update({ disabled: !effect.disabled });
  }

  static async _onActorEffectEdit(this: NpcSheet, _event: PointerEvent, target: HTMLElement) {
    const id = target.dataset.effectId;
    if (!id) return;
    const actor = (this as unknown as { actor: any }).actor;
    actor.effects.get(id)?.sheet?.render(true);
  }

  static async _onActorEffectDelete(this: NpcSheet, _event: PointerEvent, target: HTMLElement) {
    const id = target.dataset.effectId;
    if (!id) return;
    const actor = (this as unknown as { actor: any }).actor;
    await actor.deleteEmbeddedDocuments('ActiveEffect', [id]);
  }

  static async _onEditImage(this: NpcSheet, event: PointerEvent, target: HTMLElement) {
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

  static async _onRecalculateMoney(this: NpcSheet, event: PointerEvent, target: HTMLElement) {
    const actor = (this as unknown as { actor: any }).actor;
    const pln = actor.system.details?.money ?? 0;
    const currentYear = actor.system.details?.currentYear ?? 2026;

    let eurRate = 4.35;
    let usdRate = 4.00;
    let rateSource = "Domyślne przeliczniki (brak połączenia lub rok poza zakresem API NBP)";
    let isLive = false;

    const currentRealYear = new Date().getFullYear();

    // Helper function to fetch rate from NBP
    const fetchNBP = async (currency: string, year: number): Promise<{ rate: number; date: string } | null> => {
      if (year >= 2002 && year <= currentRealYear) {
        // Try first 7 days of June to find a working business day (NBP doesn't publish on weekends)
        for (let day = 1; day <= 7; day++) {
          const dateString = `${year}-06-${String(day).padStart(2, '0')}`;
          try {
            const response = await fetch(`https://api.nbp.pl/api/exchangerates/rates/a/${currency}/${dateString}/?format=json`);
            if (response.ok) {
              const data = await response.json();
              const rate = data?.rates?.[0]?.mid;
              if (typeof rate === 'number') {
                return { rate, date: dateString };
              }
            }
          } catch (e) {
            // Ignore and try next
          }
        }
      }

      // Fallback to latest rate
      try {
        const response = await fetch(`https://api.nbp.pl/api/exchangerates/rates/a/${currency}/?format=json`);
        if (response.ok) {
          const data = await response.json();
          const rate = data?.rates?.[0]?.mid;
          const date = data?.rates?.[0]?.effectiveDate || "";
          if (typeof rate === 'number') {
            return { rate, date };
          }
        }
      } catch (e) {
        // Ignore
      }
      return null;
    };

    // Fetch rates in parallel
    const [eurData, usdData] = await Promise.all([
      fetchNBP("eur", currentYear),
      fetchNBP("usd", currentYear)
    ]);

    if (eurData && usdData) {
      eurRate = eurData.rate;
      usdRate = usdData.rate;
      rateSource = `Pobrane z NBP (EUR z ${eurData.date}, USD z ${usdData.date})`;
      isLive = true;
    } else if (eurData) {
      eurRate = eurData.rate;
      rateSource = `Częściowo pobrane z NBP (EUR z ${eurData.date})`;
      isLive = true;
    } else if (usdData) {
      usdRate = usdData.rate;
      rateSource = `Częściowo pobrane z NBP (USD z ${usdData.date})`;
      isLive = true;
    }

    // Conversion rates
    const eur = (pln / eurRate).toFixed(2);
    const th = (pln / eurRate).toFixed(2); // 1:1 with EUR
    const usd = (pln / usdRate).toFixed(2);
    const fc = (pln / 2.0).toFixed(2); // 2 PLN = 1 Credit
    const st = (pln / 240).toFixed(2);
    const zk = (pln / 2880).toFixed(2);
    const pl = (pln / 34560).toFixed(2);

    const content = `
      <div class="hbm money-converter" style="padding: 10px; font-family: 'Signika', sans-serif;">
        <p><strong>Bieżąca gotówka:</strong> ${pln} PLN (Rok kampanii: ${currentYear})</p>
        <p style="font-size: 0.8rem; color: ${isLive ? '#2a7a3e' : '#888'}; margin-top: -5px;">
          <em>Kursy: ${rateSource}</em><br/>
          (1 EUR = ${eurRate.toFixed(4)} PLN, 1 USD = ${usdRate.toFixed(4)} PLN)
        </p>
        <hr style="border-top: 1px dashed var(--hbm-border, #ccc); margin: 10px 0;" />
        <h4 style="margin: 5px 0;">Waluty Ziemskie i Międzyświatowe</h4>
        <ul style="list-style: none; padding: 0; margin: 5px 0; display: flex; flex-direction: column; gap: 4px;">
          <li><strong>FC (Kredyt Federacji Sol-3):</strong> ${fc} Credits <small style="color: #666;">(Waluta Federacji Sol-3, stały kurs 2 PLN = 1 Credit)</small></li>
          <li><strong>EUR (Euro):</strong> ${eur} €</li>
          <li><strong>USD (Dolar):</strong> ${usd} $</li>
          <li><strong>Thrakka (TH):</strong> ${th} TH <small style="color: #666;">(krasnoludzka waluta rozliczeniowa, 1:1 z EUR)</small></li>
        </ul>
        <hr style="border-top: 1px dashed var(--hbm-border, #ccc); margin: 10px 0;" />
        <h4 style="margin: 5px 0;">Krasnoludzkie Monety Klanowe (System Dwunastkowy)</h4>
        <ul style="list-style: none; padding: 0; margin: 5px 0; display: flex; flex-direction: column; gap: 4px;">
          <li><strong>ST (Srebrny Talent):</strong> ${st} ST <small style="color: #666;">(1 ST = 240 PLN / 55 TH)</small></li>
          <li><strong>ZK (Złota Korona):</strong> ${zk} ZK <small style="color: #666;">(1 ZK = 2880 PLN / 660 TH)</small></li>
          <li><strong>PL (Platynowy Lingot):</strong> ${pl} PL <small style="color: #666;">(1 PL = 34560 PLN / 7920 TH)</small></li>
        </ul>
      </div>
    `;

    await (foundry.applications.api as any).DialogV2.prompt({
      window: { title: game.i18n.localize('HBM.ui.moneyConverterTitle') },
      content: content,
      rejectClose: false,
    });
  }
}
