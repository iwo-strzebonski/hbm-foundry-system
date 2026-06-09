import * as fs from 'fs';

function checkBOM(filePath: string) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    console.log(`[BOM DETECTED] File starts with UTF-8 BOM: ${filePath}`);
    return true;
  } else {
    console.log(`[CLEAN] No BOM detected: ${filePath} (starts with bytes: ${Array.from(buffer.slice(0, 5)).map(b => '0x' + b.toString(16).toUpperCase()).join(', ')})`);
    return false;
  }
}

checkBOM('./templates/actor/character.hbs');
checkBOM('./templates/actor/npc.hbs');
