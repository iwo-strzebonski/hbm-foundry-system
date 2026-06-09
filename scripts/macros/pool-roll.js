// HbM Pool Roll — prompts for pool size and threshold, then rolls a d6 pool.
const result = await Dialog.prompt({
    title: 'Rzut puli d6',
    content: `
        <form>
            <div class="form-group">
                <label>Pula (liczba kości):</label>
                <input type="number" name="pool" value="3" min="1" max="20"/>
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
        return { pool: Number(fd.pool), threshold: Number(fd.threshold) };
    },
});
if (!result) return;
const formula = `${result.pool}d6cs>=${result.threshold}`;
const roll = await new Roll(formula).evaluate();
await roll.toMessage({ flavor: `Pula d6 (TS ${result.threshold})` });
