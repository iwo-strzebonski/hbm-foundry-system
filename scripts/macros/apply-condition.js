// HbM Apply Condition — pick a status effect and toggle it on targeted/selected tokens.
const targets = game.user.targets.size > 0 ? Array.from(game.user.targets) : canvas.tokens.controlled;
if (targets.length === 0) return ui.notifications.warn('Zaznacz lub naceluj token(y).');
const effects = CONFIG.statusEffects.filter((e) => e.id?.startsWith('hbm.'));
const opts = effects.map((e) => `<option value="${e.id}">${game.i18n.localize(e.name ?? e.label ?? e.id)}</option>`).join('');
const result = await Dialog.prompt({
    title: 'Nałóż przypadłość',
    content: `<form><div class="form-group"><label>Przypadłość:</label><select name="effect">${opts}</select></div></form>`,
    label: 'Nałóż',
    callback: (html) => String(new foundry.applications.ux.FormDataExtended(html.querySelector('form')).object.effect),
});
if (!result) return;
for (const t of targets) {
    if (t.actor) await t.actor.toggleStatusEffect(result, { active: true });
}
ui.notifications.info(`Nałożono ${result} na ${targets.length} cel(e).`);
