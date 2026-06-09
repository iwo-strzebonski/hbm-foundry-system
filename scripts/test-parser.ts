import { Window } from 'happy-dom';
import * as fs from 'fs';

const window = new Window();

function testFile(filePath: string) {
  console.log(`\n--- Testing file: ${filePath} ---`);
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Basic Handlebars comments and blocks stripping to leave clean HTML
  content = content.replace(/\{\{!--[\s\S]*?--\}\}/g, '');
  content = content.replace(/\{\{[\s\S]*?\}\}/g, '');
  
  const parser = new window.DOMParser();
  const doc = parser.parseFromString(content, 'text/html');
  const body = doc.body;
  
  const children = Array.from(body.childNodes).filter(node => {
    // Mimic the likely behavior of Foundry: filter out empty text nodes
    if (node.nodeType === 3 && !node.textContent.trim()) return false;
    return true;
  });
  
  console.log(`Parsed children count: ${children.length}`);
  children.forEach((node, i) => {
    console.log(`Child ${i}: type=${node.nodeType} (${node.nodeName}), textLength=${node.textContent.trim().length}`);
    if (children.length > 1) {
      console.log(`OuterHTML snippet:`, (node as any).outerHTML || node.textContent.slice(0, 100));
    }
  });
}

const characterPath = './templates/actor/character.hbs';
const npcPath = './templates/actor/npc.hbs';

testFile(characterPath);
testFile(npcPath);
