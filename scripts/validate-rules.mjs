import fs from 'node:fs/promises';
import Ajv from 'ajv';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const addDraft2020 = require('ajv/dist/refs/json-schema-2020-12');

const rulesPath = new URL('../data/rules.v1.json', import.meta.url);
const schemaPath = new URL('../data/rules.schema.json', import.meta.url);

const [rulesRaw, schemaRaw] = await Promise.all([
  fs.readFile(rulesPath, 'utf8'),
  fs.readFile(schemaPath, 'utf8')
]);

const rules = JSON.parse(rulesRaw);
const schema = JSON.parse(schemaRaw);

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true, strict: false });
const addMeta = addDraft2020.default ?? addDraft2020;
addMeta.call(ajv, ajv.opts?.$data);
const validate = ajv.compile(schema);
const valid = validate(rules);

if (!valid) {
  console.error('rules.v1.json failed schema validation');
  console.error(validate.errors);
  process.exit(1);
}

// Graph integrity checks
const stepIds = new Set(rules.steps.map((s) => s.id));
const missing = [];
for (const step of rules.steps) {
  const buttons = step.buttons ?? [];
  for (const btn of buttons) {
    if (btn.next.startsWith('__')) continue;
    if (!stepIds.has(btn.next)) missing.push({ from: step.id, to: btn.next });
  }
  const html = `${step.description ?? ''}${step.instruction ?? ''}`;
  const matches = html.matchAll(/data-next=["']([^"']+)["']/g);
  for (const match of matches) {
    const target = match[1];
    if (target.startsWith('__')) continue;
    if (!stepIds.has(target)) missing.push({ from: step.id, to: target });
  }
}

if (missing.length) {
  console.error('rules.v1.json has invalid step transitions:');
  for (const m of missing) console.error(`  ${m.from} -> ${m.to}`);
  process.exit(1);
}

console.log('rules.v1.json validation passed');
