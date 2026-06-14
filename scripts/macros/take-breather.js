// HbM Take a Breather - invoke game.hbm.rest(actor, 'breather') on selected token's actor.
const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (!actor) return ui.notifications.warn('Wybierz token postaci.');
if (!game.hbm?.rest) return ui.notifications.error('Brak game.hbm.rest - system niezainicjowany.');
const result = await game.hbm.rest(actor, 'breather');
ui.notifications.info(`${actor.name}: chwila wytchnienia - przywrócono ${result?.hpRestored ?? 0} PW i ${result?.manaRestored ?? 0} Many.`);
