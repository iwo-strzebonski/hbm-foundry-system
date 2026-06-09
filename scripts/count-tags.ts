import * as fs from 'fs';

function analyzeTags(filePath: string) {
  console.log(`\n--- Analyzing tags for: ${filePath} ---`);
  const content = fs.readFileSync(filePath, 'utf8');
  
  // A regex to find HTML tags (opening, closing, self-closing) across newlines
  const tagRegex = /<(\/?[a-zA-Z0-9\-]+)(?:\s+[^>]*?)?>/gs;
  
  const stack: { tag: string; line: number; index: number }[] = [];
  
  // Helper to find line number from string index
  const getLineNumber = (index: number) => {
    return content.slice(0, index).split('\n').length;
  };
  
  const selfClosingTags = new Set([
    'img', 'input', 'br', 'hr', 'meta', 'link'
  ]);
  
  // Clean Handlebars comments first as they might contain html
  let cleanedContent = content.replace(/\{\{!--[\s\S]*?--\}\}/g, '');
  
  // Clean Handlebars blocks, but be careful of block helpers containing tags.
  // Actually, we can replace all {{...}} with space to preserve index positions
  cleanedContent = cleanedContent.replace(/\{\{[\s\S]*?\}\}/g, (match) => {
    return ' '.repeat(match.length);
  });
  
  let match;
  let hasErrors = false;
  
  while ((match = tagRegex.exec(cleanedContent)) !== null) {
    const tag = match[1];
    const isClosing = tag.startsWith('/');
    const tagName = isClosing ? tag.slice(1).toLowerCase() : tag.toLowerCase();
    const line = getLineNumber(match.index);
    
    if (selfClosingTags.has(tagName) || match[0].endsWith('/>')) {
      continue;
    }
    
    if (!isClosing) {
      stack.push({ tag: tagName, line, index: match.index });
    } else {
      if (stack.length === 0) {
        console.log(`[Error] Extra closing tag </${tagName}> on line ${line}`);
        hasErrors = true;
      } else {
        const last = stack.pop()!;
        if (last.tag !== tagName) {
          console.log(`[Mismatch] Expected </${last.tag}> (opened on line ${last.line}), but found </${tagName}> on line ${line}`);
          hasErrors = true;
          // Push back last to try to recover
          stack.push(last);
        }
      }
    }
  }
  
  if (stack.length > 0) {
    console.log(`[Error] Unclosed tags at end of file:`);
    stack.forEach(item => {
      console.log(`  - <${item.tag}> opened on line ${item.line}`);
    });
    hasErrors = true;
  }
  
  if (!hasErrors) {
    console.log(`[Success] All non-self-closing tags are perfectly balanced!`);
  }
}

analyzeTags('./templates/actor/character.hbs');
analyzeTags('./templates/actor/npc.hbs');
