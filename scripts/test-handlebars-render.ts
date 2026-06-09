import { Window } from 'happy-dom';
import * as fs from 'fs';
import Handlebars from 'handlebars';

const window = new Window();

// Mock Handlebars helpers used in templates
Handlebars.registerHelper('eq',     (a: any, b: any) => a === b);
Handlebars.registerHelper('gt',     (a: number, b: number) => a > b);
Handlebars.registerHelper('lt',     (a: number, b: number) => a < b);
Handlebars.registerHelper('or',     (...args: any[]) => (args.slice(0, -1) as any[]).some(Boolean));
Handlebars.registerHelper('and',    (...args: any[]) => (args.slice(0, -1) as any[]).every(Boolean));
Handlebars.registerHelper('concat', (...args: any[]) => (args.slice(0, -1) as string[]).join(''));
Handlebars.registerHelper('localize', (key: string) => `[localized:${key}]`);

// Register the actor effects partial as an empty template for testing
Handlebars.registerPartial('systems/hbm-rpg-v3/templates/actor/_actor-effects.hbs', '<fieldset class="mock-effects"></fieldset>');

function testRender(filePath: string) {
  console.log(`\n--- Rendering Handlebars template: ${filePath} ---`);
  const templateSource = fs.readFileSync(filePath, 'utf8');
  const template = Handlebars.compile(templateSource);
  
  // Mock context simulating what CharacterSheet / NpcSheet returns
  const context = {
    document: { name: 'Test Character', img: 'icons/svg/mystery-man.svg' },
    system: {
      details: { year: 1, race: 'czlowiek', discipline: 'alchemyTransmutation', customEquipment: 'Test gear' },
      attributes: {
        body: { value: 3 },
        mind: { value: 3 },
        soul: { value: 3 },
        magic: { value: 1 },
        health: { value: 10, max: 10 },
        mana: { value: 10, max: 10, maxPerSpell: 3 },
        zeal: { value: 0, max: 5 },
        insanity: 0,
        magicalArmor: { value: 0, max: 0, runicCounter: 0 },
        magicalShield: { value: 0 },
        physicalArmor: { value: 0, max: 5 },
        initiative: 3,
      },
      skills: {
        athletics: { value: 1 },
        melee: { value: 2 },
      },
      combat: {
        attacks: [
          { name: 'Miecz', bonus: 2, damage: '2d6', description: 'Zwykły miecz' }
        ],
        specialAbilities: [],
        reactions: [],
        legendaryActions: []
      },
      lore: { description: 'Test lore description' }
    },
    races: [{ key: 'czlowiek', label: 'Człowiek' }],
    disciplines: [{ key: 'alchemyTransmutation', label: 'Transmutacja' }],
    attributes: [
      { key: 'body', value: 3, label: 'Budowa' },
      { key: 'mind', value: 3, label: 'Umysł' },
      { key: 'soul', value: 3, label: 'Dusza' },
      { key: 'magic', value: 1, label: 'Magia' }
    ],
    skills: [
      { key: 'athletics', value: 1, label: 'Atletyka' },
      { key: 'melee', value: 2, label: 'Walka wręcz' }
    ],
    tabGroups: { primary: 'stats' },
    tabs: [
      { id: 'stats', label: 'Statystyki', active: true, cssClass: 'active' },
      { id: 'actions', label: 'Akcje', active: false, cssClass: '' },
      { id: 'skills', label: 'Umiejętności', active: false, cssClass: '' },
      { id: 'spells', label: 'Zaklęcia', active: false, cssClass: '' },
      { id: 'talents', label: 'Talenty', active: false, cssClass: '' },
      { id: 'inventory', label: 'Ekwipunek', active: false, cssClass: '' },
      { id: 'effects', label: 'Efekty', active: false, cssClass: '' },
      { id: 'biography', label: 'Biografia', active: false, cssClass: '' }
    ],
    spells: [],
    spellSchoolGroups: [],
    hasBloodMagic: false,
    elixirCap: 4,
    gear: [],
    abilities: [],
    talents: [],
    actorEffects: []
  };

  const renderedHtml = template(context);
  
  const parser = new window.DOMParser();
  const doc = parser.parseFromString(renderedHtml, 'text/html');
  const body = doc.body;
  
  const children = Array.from(body.childNodes).filter(node => {
    // Filter out whitespace-only text nodes
    if (node.nodeType === 3 && !node.textContent.trim()) return false;
    return true;
  });
  
  console.log(`Rendered children count: ${children.length}`);
  children.forEach((node, i) => {
    console.log(`Child ${i}: type=${node.nodeType} (${node.nodeName}), textLength=${node.textContent.trim().length}`);
    if (children.length > 1) {
      console.log(`OuterHTML snippet:`, (node as any).outerHTML || node.textContent.slice(0, 100));
    }
  });
}

testRender('./templates/actor/character.hbs');
testRender('./templates/actor/npc.hbs');
