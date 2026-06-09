// HbM Long Rest — invoke game.hbm.rest(actor, 'long') on selected token's actor.
const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (!actor) return ui.notifications.warn('Wybierz token postaci.');
if (!game.hbm?.rest) return ui.notifications.error('Brak game.hbm.rest — system niezainicjowany.');
const result = await game.hbm.rest(actor, 'long');
ui.notifications.info(`${actor.name}: długi odpoczynek — pełna regeneracja zasobów.`);
