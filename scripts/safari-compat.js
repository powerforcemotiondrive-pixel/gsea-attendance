const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, '..', 'output.css');

if (!fs.existsSync(cssPath)) {
  console.error('output.css not found!');
  process.exit(1);
}

let css = fs.readFileSync(cssPath, 'utf8');
console.log('Original output.css size:', css.length, 'bytes');

function extractBlock(src, pattern) {
  const match = src.match(pattern);
  if (!match) return null;
  const startIdx = match.index;
  const openIdx = src.indexOf('{', startIdx);
  if (openIdx === -1) return null;
  let depth = 1;
  let i = openIdx + 1;
  while (i < src.length && depth > 0) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
    i++;
  }
  if (depth === 0) {
    return {
      full: src.substring(startIdx, i),
      inner: src.substring(openIdx + 1, i - 1),
      start: startIdx,
      end: i
    };
  }
  return null;
}

function unwrapLayer(src, layerName) {
  const pattern = new RegExp('@layer\\s+' + layerName + '\\s*\\{');
  const match = src.match(pattern);
  if (!match) return src;
  const startIdx = match.index;
  const openIdx = src.indexOf('{', startIdx);
  if (openIdx === -1) return src;
  let depth = 1;
  let i = openIdx + 1;
  while (i < src.length && depth > 0) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
    i++;
  }
  if (depth === 0) {
    const inner = src.substring(openIdx + 1, i - 1);
    return src.substring(0, startIdx) + inner + src.substring(i);
  }
  return src;
}

function hexToRgba(hex, alpha) {
  let clean = hex.replace('#', '').trim();
  if (clean.length === 3) clean = clean.split('').map(c => c + c).join('');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// 1. Extract variable fallback block from @layer properties so --tw-* variables are guaranteed
const propBlock = extractBlock(css, /@layer\s+properties\s*\{/);
let extractedDefaults = '';
if (propBlock) {
  const defBlock = extractBlock(propBlock.inner, /\*,\s*::before,\s*::after,\s*::backdrop\s*\{/);
  if (defBlock) {
    extractedDefaults = defBlock.full;
  }
  css = css.substring(0, propBlock.start) + css.substring(propBlock.end);
}

// 2. Remove @property declarations completely (Safari < 16.4 cannot parse @property syntax)
css = css.replace(/@property\s+[^{]+\{[\s\S]*?\}\s*/g, '');

// 3. Remove @layer header declarations
css = css.replace(/@layer\s+properties;\s*/g, '');
css = css.replace(/@layer\s+theme,\s*base,\s*components,\s*utilities;\s*/g, '');
css = css.replace(/@layer\s+components;\s*/g, '');

// 4. Unwrap theme, base, utilities layers into standard universal CSS
css = unwrapLayer(css, 'theme');
css = unwrapLayer(css, 'base');
css = unwrapLayer(css, 'utilities');

// 5. Prepend the unconditional --tw-* defaults
if (extractedDefaults) {
  css = extractedDefaults + '\n\n' + css;
}

// 6. Remove all nested @supports (color: color-mix...) blocks
while (true) {
  const supBlock = extractBlock(css, /@supports\s*\(color:\s*color-mix\(in\s*lab,\s*red,\s*red\)\)\s*\{/);
  if (!supBlock) break;
  css = css.substring(0, supBlock.start) + css.substring(supBlock.end);
}

// 7. Replace all color-mix calls with valid standard rgba
css = css.replace(/color-mix\(in\s+(?:srgb|oklab),\s*(var\(--color-white\)|#fff|#ffffff|white)\s+([0-9.]+)%,\s*transparent\)/gi, (m, c, pct) => {
  return `rgba(255, 255, 255, ${(parseFloat(pct) / 100).toFixed(2)})`;
});
css = css.replace(/color-mix\(in\s+(?:srgb|oklab),\s*(var\(--color-black\)|#000|#000000|black)\s+([0-9.]+)%,\s*transparent\)/gi, (m, c, pct) => {
  return `rgba(0, 0, 0, ${(parseFloat(pct) / 100).toFixed(2)})`;
});
css = css.replace(/color-mix\(in\s+(?:srgb|oklab),\s*currentcolor\s+([0-9.]+)%,\s*transparent\)/gi, (m, pct) => {
  return `rgba(100, 116, 139, ${(parseFloat(pct) / 100).toFixed(2)})`;
});
css = css.replace(/color-mix\(in\s+(?:srgb|oklab),\s*(#[0-9a-fA-F]{3,8})\s+([0-9.]+)%,\s*transparent\)/gi, (m, hex, pct) => {
  return hexToRgba(hex, (parseFloat(pct) / 100).toFixed(2));
});

// 8. Replace legacy oklab / oklch color values with standard hex/rgba
css = css.replace(/oklab\(96\.8182%\s+-\.0067105\s+\.00762272\s*\/\s*\.8\)/g, 'rgba(242, 246, 239, 0.8)');
css = css.replace(/oklab\(96\.8182%\s+-\.0067105\s+\.00762272\s*\/\s*\.6\)/g, 'rgba(242, 246, 239, 0.6)');
css = css.replace(/oklab\(53\.8732%\s+\.0176892\s+\.0953679\s*\/\s*\.4\)/g, 'rgba(140, 103, 33, 0.4)');
css = css.replace(/oklch\([^)]+\)/g, '#34d399');

// 9. Convert CSS Media Queries Level 4 range syntax into standard min-width/max-width (Safari < 16.4)
css = css.replace(/@media\s*\(\s*width\s*>=\s*([^)]+)\)/g, '@media (min-width: $1)');
css = css.replace(/@media\s*\(\s*width\s*<=\s*([^)]+)\)/g, '@media (max-width: $1)');

// 10. Safari desktop button appearance fix (prevents native Aqua button chrome)
css = css.replace(/appearance:\s*button;/g, '-webkit-appearance: none; appearance: none;');

// 11. Vendor prefix for backdrop-filter (Safari requires -webkit-backdrop-filter)
css = css.replace(/backdrop-filter:\s*([^;]+);/g, '-webkit-backdrop-filter: $1; backdrop-filter: $1;');

// Validate brace balance
let braces = 0;
for (let char of css) {
  if (char === '{') braces++;
  if (char === '}') braces--;
}

if (braces !== 0) {
  console.error(`FATAL: Unbalanced braces detected in processed CSS! Balance: ${braces}`);
  process.exit(1);
}

fs.writeFileSync(cssPath, css, 'utf8');

console.log('Processed output.css for Safari compatibility successfully.');
console.log('Sanitized output.css size:', css.length, 'bytes');
console.log('Safari compatibility audit:', {
  bracesBalance: braces,
  colorMix: (css.match(/color-mix\(/g) || []).length,
  oklab: (css.match(/oklab\(/g) || []).length,
  oklch: (css.match(/oklch\(/g) || []).length,
  property: (css.match(/@property/g) || []).length,
  layer: (css.match(/@layer/g) || []).length,
  mediaRange: (css.match(/@media\s*\(\s*width/g) || []).length,
  invalidRgba: (css.match(/rgba\(#[^)]+\)/g) || []).length
});

