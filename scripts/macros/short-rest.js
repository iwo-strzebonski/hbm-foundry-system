// HbM Short Rest — invoke game.hbm.rest(actor, 'short') on selected token's actor.
const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (!actor) return ui.notifications.warn('Wybierz token postaci.');
if (!game.hbm?.rest) return ui.notifications.error('Brak game.hbm.rest — system niezainicjowany.');
const result = await game.hbm.rest(actor, 'short');
ui.notifications.info(`${actor.name}: krótki odpoczynek — przywrócono ${result?.healed ?? 0} PW.`);
