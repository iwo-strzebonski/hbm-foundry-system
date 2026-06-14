// HbM Refill Zeal - bumps zeal by 1 on selected token's actor (debug helper).
const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (!actor) return ui.notifications.warn('Wybierz token postaci.');
const cur = actor.system.attributes?.zeal?.value ?? 0;
const max = actor.system.attributes?.zeal?.max ?? 0;
const next = Math.min(max, cur + 1);
await actor.update({ 'system.attributes.zeal.value': next });
ui.notifications.info(`${actor.name}: Zapał ${cur} → ${next}/${max}.`);
