// HbM Group Cast Helper - sum mana of controlled token actors (potential co-casters).
const tokens = canvas.tokens.controlled;
if (tokens.length < 2) return ui.notifications.warn('Zaznacz co najmniej 2 tokeny współrzucających.');
const lines = [];
let totalMana = 0;
let totalPool = 0;
for (const t of tokens) {
    const a = t.actor;
    if (!a) continue;
    const mana = a.system.attributes?.mana?.value ?? 0;
    const magic = a.system.attributes?.magic?.value ?? 0;
    totalMana += mana;
    totalPool += magic;
    lines.push(`<li><strong>${a.name}</strong> - Mana ${mana}, Magia ${magic}</li>`);
}
const html = `
    <div class="hbm-group-cast">
        <p>Współrzucający (${tokens.length}):</p>
        <ul>${lines.join('')}</ul>
        <p><strong>Łączna mana: ${totalMana}</strong></p>
        <p><strong>Łączna pula d6: ${totalPool}</strong></p>
    </div>
`;
await ChatMessage.create({ content: html, speaker: ChatMessage.getSpeaker() });
