import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const systemRoot = resolve(import.meta.dirname, '..');
const packsSrcDir = resolve(systemRoot, 'packs-src');
const outDir = resolve(systemRoot, 'lang', 'compendium', 'en');

// Load en.json for racesList and talentsList
const enJsonPath = resolve(systemRoot, 'lang', 'en.json');
const enJson = JSON.parse(readFileSync(enJsonPath, 'utf8'));
const racesList = enJson.HBM?.racesList ?? {};
const talentsList = enJson.HBM?.talentsList ?? {};

const nameTranslations: Record<string, string> = {
  // Spells
  "magiczny-pocisk": "Magic Missile",
  "magiczna-tarcza": "Magic Shield",
  "poblask": "Gleam",
  "telekineza": "Telekinesis",
  "przeskok": "Blink",
  "teleportacja": "Teleport",
  "przebicie-eteru": "Ether Pierce",
  "fala-energii": "Energy Wave",
  "przeblysk-prawdy": "Glimpse of Truth",
  "szybka-mysl": "Quick Thought",
  "latanie": "Flight",
  "powietrzna-fala": "Air Wave",
  "wyczucie-zagrozenia": "Danger Sense",
  "celnosc": "Accuracy",
  "szybki-jak-wiatr": "Swift as Wind",
  "tworzenie-i-kontrolowanie-wody": "Create and Control Water",
  "lodowa-podloga": "Ice Floor",
  "ukojenie": "Solace",
  "gradobicie": "Hailstorm",
  "mistyczna-mgla": "Mystic Fog",
  "podpalenie": "Ignite",
  "wzniecanie-ognia": "Kindle",
  "ognista-powloka": "Fire Cloak",
  "kula-ognia": "Fireball",
  "gorejaca-skora": "Burning Skin",
  "skalista-tarcza": "Stone Shield",
  "ruchome-piaski": "Quicksand",
  "trzesienie-ziemi": "Earthquake",
  "zwirowa-zbroja": "Gravel Armor",
  "skalista-pulapka": "Stone Trap",
  "eteryczny-przewodnik": "Ether Guide",
  "labirynt-umyslu": "Mind Labyrinth",
  "madrosc-salomona": "Wisdom of Solomon",
  "magiczna-odpornosc": "Magic Resistance",
  "magiczne-kajdany": "Magic Shackles",
  "magnetyzm": "Magnetism",
  "negacja": "Negation",
  "niewidzialnosc": "Invisibility",
  "ozywienie-szkieletu": "Animate Skeleton",
  "przemiana-w-olow": "Transmutation to Lead",
  "rozmawianie-ze-zmarlymi": "Speak with Dead",
  "rozsypanie": "Shatter",
  "uzdrowienie-chorych": "Heal Sick",
  "woal-snow": "Veil of Dreams",
  "zloto-glupcow": "Fool's Gold",
  "zwierciadlany-wizerunek": "Mirror Image",
  "blogoslawienstwo-zasiewow": "Blessing of Sowing",
  "blyskawice-lancuchowe": "Chain Lightning",
  "boska-celnosc": "Divine Accuracy",
  "boska-sprawiedliwosc": "Divine Justice",
  "boska-wlocznia": "Divine Spear",
  "chmara-insektow": "Swarm of Insects",
  "cykl-por-roku": "Cycle of Seasons",
  "egida": "Aegis",
  "gniew-matki-ziemi": "Wrath of Mother Earth",
  "grom-z-nieba": "Thunderbolt",
  "klatwa-hekate": "Curse of Hekate",
  "kradziez-many": "Mana Drain",
  "leczacy-dotyk": "Healing Touch",
  "magiczne-przyspieszenie": "Magic Haste",
  "moc-ziemi": "Earth Power",
  "modlitwa-o-opieke": "Prayer for Protection",
  "obecnosc-krola-bogow": "Presence of the King of Gods",
  "piekno-bogini": "Beauty of the Goddess",
  "plomien-namietnosci": "Flame of Passion",
  "pomost": "Bridge",
  "pozadanie-zmyslow": "Desire of Senses",
  "promien-harmonii": "Ray of Harmony",
  "przebudzenie": "Awakening",
  "przyspieszone-zniwa": "Accelerated Harvest",
  "sad-ostateczny": "Last Judgment",
  "strzala-kupidyna": "Cupid's Arrow",
  "strzala-pozadania": "Arrow of Desire",
  "swieta-stal": "Holy Steel",
  "tajemne-poznanie": "Arcane Cognition",
  "tesknota-serca": "Heart Longing",
  "urok-niewinnosci": "Charm of Innocence",
  "uswiecenie": "Sanctification",
  "wiez-serc": "Bond of Hearts",
  "wyladowanie-elektrostatyczne": "Electrostatic Discharge",
  "wzmocnienie-magii": "Magic Empowerment",
  "neutralizacja": "Neutralization",
  "pierwotna-kula": "Primal Ball",
  "tajemniczy-strumien": "Mysterious Stream",
  "zakazana-oslona": "Forbidden Shield",
  "klatwa-szkarlatu": "Crimson Curse",
  "szkarlatna-sprawiedliwosc": "Crimson Justice",
  "szkarlatne-plomienie": "Crimson Flames",
  "szkarlatny-pocisk": "Crimson Bolt",
  "szkarlatny-sztylet": "Crimson Dagger",
  "superzaklecie-requiem": "Superspell Requiem",
  "dar-otchlani": "Gift of the Abyss",
  "metamagia": "Metamagic",
  "swobodny-przeplyw-magii": "Free Flow of Magic",
  
  // Disciplines
  "alchemytransmutation": "Alchemy - Transmutation",
  "alchemybrewing": "Alchemy - Brewing of Elixirs",
  "botany": "Botany",
  "elementsair": "Elemental Magic - Air",
  "elementswater": "Elemental Magic - Water",
  "elementsfire": "Elemental Magic - Fire",
  "elementsearth": "Elemental Magic - Earth",
  "artifice": "Crafting of Artifacts",
  "golemancy": "Golemancy",
  "runes": "Runic Magic",
  "manasourcemage": "Sources of Power",
  "illusion": "Magic of Illusion",
  "sacred": "Sacred Magic",
  "sacredexorcism": "Sacred Magic - Exorcisms",
  "witch": "Witch Magic",
  "necromancy": "Necromancy",
  "blood": "Blood Magic",
  "wildwitch": "Wild Witch Magic",
};

const folderNameTranslations: Record<string, string> = {
  "Amor (Eros)": "Cupid (Eros)",
  "Zeus (Jowisz)": "Zeus (Jupiter)",
  "Afrodyta (Wenus)": "Aphrodite (Venus)",
  "Hekate": "Hecate",
  "Demeter (Ceres)": "Demeter (Ceres)",
  "Modlitwy Ogólne": "General Prayers",
  "Bóg (Jedyny)": "God (The One)",
  "Artemida (Diana)": "Artemis (Diana)",
  "Magia Żywiołów": "Elemental Magic",
  "Magia Powietrza": "Air Magic",
  "Magia Wody": "Water Magic",
  "Magia Ognia": "Fire Magic",
  "Magia Ziemi": "Earth Magic",
  "Alchemia": "Alchemy",
  "Alchemia - Transmutacja": "Alchemy - Transmutation",
  "Alchemia - Warzenie Eliksirów": "Alchemy - Brewing of Elixirs",
  "Rzemiosło Artefaktów": "Crafting of Artifacts",
  "Golemancja": "Golemancy",
  "Magia Runiczna": "Runic Magic",
  "Magia Iluzji": "Magic of Illusion",
  "Wiedźmia Magia": "Witch Magic",
  "Nekromancja": "Necromancy",
  "Botanika": "Botany",
  "Magia Aspektów": "Aspect Magic",
  "Pierwotna Magia": "Primal Magic",
  "Superzaklęcia": "Superspells",
  "Magia Otchłani": "Abyss Magic",
  "Magia Sakralna": "Sacred Magic"
};

// Descriptions translation helper
function translateDescription(desc: string): string {
  if (!desc) return '';
  return desc
    .replace(/\* \*\*Punkty Pancerza:\*\*/g, '* **Armor Points:**')
    .replace(/\* \*\*Pancerz:\*\*/g, '* **Armor:**')
    .replace(/\* \*\*Wymagania:\*\*/g, '* **Requirements:**')
    .replace(/\* \*\*Cechy:\*\*/g, '* **Traits:**')
    .replace(/\* \*\*Cena:\*\*/g, '* **Price:**')
    .replace(/\* \*\*Obrażenia:\*\*/g, '* **Damage:**')
    .replace(/\* \*\*Zasięg:\*\*/g, '* **Range:**')
    .replace(/Ciało/g, 'Body')
    .replace(/Umysł/g, 'Mind')
    .replace(/Dusza/g, 'Soul')
    .replace(/Magia/g, 'Magic')
    .replace(/Subtelny/g, 'Subtle')
    .replace(/Hałaśliwy/g, 'Noisy')
    .replace(/Tarcza, gdy jest używana, podnosi Obronę właściciela o jeden stopień/g, 'A shield, when used, increases the owner\'s Defense by one step.');
}

function titleCase(slug: string): string {
  return slug
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Main logic
if (!existsSync(outDir)) {
  mkdirSync(outDir, { recursive: true });
}

const packs = readdirSync(packsSrcDir);
for (const pack of packs) {
  const packPath = join(packsSrcDir, pack);
  const files = readdirSync(packPath).filter(f => f.endsWith('.json'));
  
  const translations: Record<string, any> = {};
  
  for (const file of files) {
    const filePath = join(packPath, file);
    const content = JSON.parse(readFileSync(filePath, 'utf8'));
    
    const polishName = content.name;
    const slug = content.flags?.['hbm-rpg-v3']?.slug ?? file.replace('.json', '');
    
    let englishName = '';
    
    if (file.startsWith('_folder-')) {
      englishName = folderNameTranslations[polishName] ?? polishName;
    } else if (racesList[slug]) {
      englishName = racesList[slug];
    } else if (talentsList[slug]) {
      englishName = talentsList[slug];
    } else if (nameTranslations[slug]) {
      englishName = nameTranslations[slug];
    } else if (nameTranslations[slug.toLowerCase().replace(/[^a-z0-9]/g, '')]) {
      englishName = nameTranslations[slug.toLowerCase().replace(/[^a-z0-9]/g, '')];
    } else {
      englishName = titleCase(slug);
    }
    
    const description = content.system?.description ?? '';
    const englishDesc = translateDescription(description);
    
    translations[polishName] = {
      name: englishName,
    };
    
    if (englishDesc) {
      translations[polishName].description = englishDesc;
    }
  }
  
  const packLabels: Record<string, string> = {
    "spells-general": "Spells - General",
    "spells-sacred": "Spells - Sacred",
    "spells-academic": "Academic Disciplines",
    "spells-blood": "Blood Magic",
    "spells-crimson": "Crimson Cult Magic",
    "spells-eldritch": "Spells - Eldritch",
    "talents": "Talents",
    "talents-blood": "Talents - Blood Magic",
    "talents-eldritch": "Talents - Curse of the Eldritch",
    "talents-npc": "Talents (NPC)",
    "races": "Races",
    "disciplines": "Magic Disciplines",
    "disciplines-forbidden": "Forbidden Disciplines",
    "hbm-macros": "HbM Macros",
    "items-weapons": "Weapons",
    "items-armor": "Armor",
    "items-gear": "Equipment (Other)"
  };

  const output = {
    label: packLabels[pack] ?? titleCase(pack),
    entries: translations
  };
  
  const outPath = join(outDir, `${pack}.json`);
  writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n', 'utf8');
  console.log(`Generated Babele translation for ${pack} -> ${outPath}`);
}

console.log('Babele translation generation complete!');
