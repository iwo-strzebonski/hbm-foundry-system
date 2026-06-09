// HbM Attribute Check — pick attribute on selected token's actor, roll d6 pool.
const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (!actor) return ui.notifications.warn('Wybierz token postaci.');
const attrs = ['body', 'mind', 'soul', 'magic'];
const labels = { body: 'Ciało', mind: 'Umysł', soul: 'Dusza', magic: 'Magia' };
const opts = attrs.map((a) => `<option value="${a}">${labels[a]} (${actor.system.attributes[a]?.value ?? 0})</option>`).join('');
const result = await Dialog.prompt({
    title: `Test atrybutu — ${actor.name}`,
    content: `
        <form>
            <div class="form-group">
                <label>Atrybut:</label>
                <select name="attr">${opts}</select>
            </div>
            <div class="form-group">
                <label>Próg sukcesu (TS):</label>
                <input type="number" name="threshold" value="4" min="2" max="6"/>
            </div>
        </form>
    `,
    label: 'Rzuć',
    callback: (html) => {
        const fd = new foundry.applications.ux.FormDataExtended(html.querySelector('form')).object;
        return { attr: String(fd.attr), threshold: Number(fd.threshold) };
    },
});
if (!result) return;
const pool = actor.system.attributes[result.attr]?.value ?? 1;
const roll = await new Roll(`${pool}d6cs>=${result.threshold}`).evaluate();
await roll.toMessage({ flavor: `${actor.name} — test ${labels[result.attr]} (TS ${result.threshold})`, speaker: ChatMessage.getSpeaker({ actor }) });
