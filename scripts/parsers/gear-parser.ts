import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join, extname, basename } from 'node:path';
import type { ParsedDoc, ParserContext, ParserFn } from './types';
import { slugify, parseList } from './helpers';

export const parseGear: ParserFn = async (ctx: ParserContext): Promise<ParsedDoc[]> => {
  const docs: ParsedDoc[] = [];
  const itemsDir = resolve(ctx.repoRoot, 'ObsidianNotes', 'items');

  if (!existsSync(itemsDir)) {
    console.warn(`[gear-parser] Directory not found: ${itemsDir}`);
    return docs;
  }

  const subdirs = [
    { name: 'weapons', pack: 'items-weapons', category: 'weapon' },
    { name: 'armor', pack: 'items-armor', category: 'armor' },
    { name: 'gear', pack: 'items-gear', category: 'equipment' },
  ];

  for (const dir of subdirs) {
    const fullDirPath = resolve(itemsDir, dir.name);
    if (!existsSync(fullDirPath)) continue;

    const files = readdirSync(fullDirPath).filter((f) => extname(f) === '.md');
    for (const file of files) {
      const filePath = join(fullDirPath, file);
      const raw = readFileSync(filePath, 'utf8');

      const { frontmatter, content } = extractMarkdown(raw);
      const name = basename(file, '.md').replace(/_/g, ' ');

      const doc = buildGearDoc(name, frontmatter, content, dir.category, dir.pack);
      docs.push(doc);
    }
  }

  return docs;
};

function extractMarkdown(raw: string): { frontmatter: Record<string, string>; content: string } {
  const fm: Record<string, string> = {};
  let content = raw;

  if (raw.startsWith('---')) {
    const endIdx = raw.indexOf('---', 3);
    if (endIdx > -1) {
      const fmText = raw.slice(3, endIdx).trim();
      content = raw.slice(endIdx + 3).trim();

      const lines = fmText.split('\n');
      for (const line of lines) {
        const colonIdx = line.indexOf(':');
        if (colonIdx > -1) {
          const key = line.slice(0, colonIdx).trim();
          let val = line.slice(colonIdx + 1).trim();
          if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
          if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
          fm[key] = val;
        }
      }
    }
  }
  return { frontmatter: fm, content };
}

function buildGearDoc(name: string, fm: Record<string, string>, content: string, category: string, pack: string): ParsedDoc {
  // Common properties
  const priceStr = fm.price || fm.cena || '0';
  const priceMatch = priceStr.match(/\d+/);
  const value = priceMatch ? parseInt(priceMatch[0], 10) : 0;
  
  const description = content
    .split('\n')
    .filter(l => !l.startsWith('# ') && !l.startsWith('* **Cena:**') && !l.startsWith('* **Obrażenia:**') && !l.startsWith('* **Cechy:**') && !l.startsWith('* **Pancerz:**'))
    .join('\n')
    .trim();

  // HTML format description by wrapping paragraphs if needed
  const htmlDescription = description ? `<p>${description.replace(/\n\n/g, '</p><p>')}</p>` : '';

  const system: any = {
    category,
    rarity: 'common',
    quantity: 1,
    weight: 0,
    value,
    equipped: false,
    damageReductionBonus: 0,
    description: htmlDescription,
    weapon: {
      damage: '',
      damageType: 'physical',
      properties: [],
    },
    armor: {
      damageReduction: 0,
      condition: 1,
      conditionMax: 1,
      armorType: 'light',
      stealthDisadvantage: false,
      strengthRequirement: 0,
    }
  };

  if (category === 'weapon') {
    system.weapon.damage = fm.damage || fm.obrazenia || '';
    if (fm.traits || fm.cechy) {
      system.weapon.properties = parseList(fm.traits || fm.cechy);
    }
  } else if (category === 'armor') {
    const isShield = name.toLowerCase().includes('tarcza') || name.toLowerCase().includes('shield');
    const drStr = fm.armorClass || fm.pancerz || fm.armor_points || (isShield ? '1' : '0');
    const drMatch = drStr.match(/\d+/);
    const dr = drMatch ? parseInt(drMatch[0], 10) : 0;
    system.armor.damageReduction = dr;
    
    const conditionStr = fm.wytrzymalosc || fm.condition || fm.durability;
    let cond = dr;
    if (conditionStr) {
      const condMatch = conditionStr.match(/\d+/);
      if (condMatch) {
        cond = parseInt(condMatch[0], 10);
      }
    }
    if (cond < 1) cond = 1;
    system.armor.condition = cond;
    system.armor.conditionMax = cond;

    if (isShield) {
      system.armor.armorType = 'shield';
    } else if (dr === 3) {
      system.armor.armorType = 'heavy';
    } else if (dr === 2) {
      system.armor.armorType = 'medium';
    } else {
      system.armor.armorType = 'light';
    }

    const traitsStr = fm.traits || fm.cechy || '';
    if (traitsStr.toLowerCase().includes('hałaśliwy') || traitsStr.toLowerCase().includes('noisy')) {
      system.armor.stealthDisadvantage = true;
    }

    const reqStr = fm.requirements || fm.wymagania || '';
    const reqMatch = reqStr.match(/(?:ciało|body)\s*>=\s*(\d+)/i);
    if (reqMatch) {
      system.armor.strengthRequirement = parseInt(reqMatch[1], 10);
    }
  }

  return {
    id: slugify(`gear-${name}`),
    name,
    documentType: 'Item',
    subType: 'gear',
    pack,
    source: { book: 'core-rules' },
    system,
  };
}
