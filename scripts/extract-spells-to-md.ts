import { resolve, dirname } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { parseSpells } from './parsers/spell-parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const systemRoot = resolve(__dirname, '..');
const repoRoot = resolve(systemRoot, '..', '..');
const spellsOutDir = resolve(repoRoot, 'ObsidianNotes', 'spells');

async function run() {
  const ctx = {
    repoRoot,
    strict: false,
    idOverrides: JSON.parse(readFileSync(resolve(__dirname, 'parsers', '_id-overrides.json'), 'utf8')),
    labelMappings: JSON.parse(readFileSync(resolve(__dirname, 'parsers', '_label-mappings.json'), 'utf8')),
  };

  const allDocs = await parseSpells(ctx);
  console.log(`Parsed ${allDocs.length} spells.`);

  let created = 0;

  for (const doc of allDocs) {
    if (doc.subType !== 'spell') continue;
    
    const sys = doc.system as any;
    
    // Determine directory structure
    let category = 'academic';
    let subcategory = sys.school;

    if (sys.isSuperspell) {
      category = 'general';
      subcategory = 'superspells';
    } else if (sys.castingMode === 'sacred') {
      category = 'sacred';
      subcategory = sys.deity || 'common-prayers';
      if (subcategory === 'common') subcategory = 'common-prayers';
    } else if (sys.school === 'abyss' || sys.school === 'abyssAspects' || sys.school === 'abyssPrimal' || sys.school === 'eldritch' || sys.school === 'eldritchAspects' || sys.school === 'eldritchPrimal' || sys.sourceBook === 'klatwa-otchlani') {
      category = 'eldritch';
      subcategory = '';
      sys.school = 'eldritch';
    } else if (sys.school === 'crimson' || sys.sourceBook === 'crimson-cult') {
      category = 'crimson';
      subcategory = '';
      sys.school = 'crimson';
    } else if (sys.castingMode === 'blood' || sys.school === 'blood') {
      category = 'blood';
      subcategory = '';
    } else if (sys.school === 'general') {
      category = 'general';
      subcategory = '';
    } else {
      // academic mappings
      const academicMappings: Record<string, string> = {
        'elementsAir': 'air-magic',
        'elementsWater': 'water-magic',
        'elementsFire': 'fire-magic',
        'elementsEarth': 'earth-magic',
        'alchemyTransmutation': 'alchemy-transmutation',
        'alchemyBrewing': 'alchemy-brewing',
        'artifice': 'artifice',
        'golemancy': 'golemancy',
        'runes': 'rune-magic',
        'illusion': 'illusion-magic',
        'witch': 'witch-magic',
        'necromancy': 'necromancy',
        'botany': 'botany',
        'general': 'general-magic',
        'manaSourceMage': 'mana-source-mage',
        'wildWitch': 'wild-witch-magic'
      };
      subcategory = academicMappings[sys.school] || sys.school;
    }

    let spellName = doc.name;
    if (spellName === 'Superzaklęcie - Requiem') spellName = 'Requiem';

    // Sanitize filename to english kebab-case
    const baseSlug = spellName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const englishSlug = ctx.idOverrides[baseSlug] ?? baseSlug;
    const sanitizedName = englishSlug;
    
    let targetDir = resolve(spellsOutDir, category);
    if (subcategory) {
      targetDir = resolve(targetDir, subcategory);
    }
    
    mkdirSync(targetDir, { recursive: true });

    // Build Frontmatter
    const frontmatter = {
      tags: ['spell', category, subcategory].filter(Boolean),
      ...sys
    };

    const yamlStr = yaml.dump(frontmatter, { skipInvalid: true, noRefs: true });
    
    const mdContent = `---
${yamlStr}---
# ${spellName}

${doc.description}
`;

    const filePath = resolve(targetDir, `${sanitizedName}.md`);
    writeFileSync(filePath, mdContent, 'utf8');
    created++;
  }

  console.log(`Successfully extracted ${created} spells to ObsidianNotes/spells.`);
}

run().catch(console.error);
