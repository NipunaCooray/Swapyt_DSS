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

if (!validate(rules)) {
  console.error('rules.v1.json failed schema validation');
  console.error(validate.errors);
  process.exit(1);
}

const stepIds = new Set(rules.steps.map((s) => s.id));
const errors = [];
const warnings = [];

/** Words that mean a statement is describing the interaction, not a finding. */
const UI_VOICE = /\b(click(ed)?|button|tap(ped)?|select(ed)?|answered|step \d|this tool|the app)\b/i;
/** Verbs reserved for conclusions the tool asserts rather than findings. */
const TOOL_VOICE = /^(Pathway (supports|indicates)|Recommended:)/;

for (const step of rules.steps) {
  const html = `${step.description ?? ''}${step.instruction ?? ''}`;

  // Decision points must live in data, not in hand-written markup.
  if (/data-next=/.test(html)) {
    errors.push(`${step.id}: data-next found in HTML. Decision points belong in step.decision.`);
  }
  if (/decision-callout/.test(html)) {
    errors.push(`${step.id}: decision-callout markup found in HTML. Remove it; the renderer builds it from step.decision.`);
  }

  for (const btn of step.buttons ?? []) {
    if (!btn.next.startsWith('__') && !stepIds.has(btn.next)) {
      errors.push(`${step.id} -> ${btn.next}: button target does not exist`);
    }
  }

  const seen = new Set();
  for (const opt of step.decision?.options ?? []) {
    const where = `${step.id} -> ${opt.next}`;
    if (!opt.next.startsWith('__') && !stepIds.has(opt.next)) {
      errors.push(`${where}: decision target does not exist`);
    }
    if (!opt.logStatement?.trim()) {
      errors.push(`${where}: logStatement is empty`);
    } else {
      if (UI_VOICE.test(opt.logStatement)) {
        errors.push(`${where}: logStatement describes the interaction, not a finding — "${opt.logStatement}"`);
      }
      if (TOOL_VOICE.test(opt.logStatement)) {
        errors.push(`${where}: "Pathway supports/indicates" is reserved for step.logStatement — an option records what the clinician found`);
      }
      if (/\.$/.test(opt.logStatement)) {
        warnings.push(`${where}: logStatement ends with a full stop; entries are assembled as list items`);
      }
      if (seen.has(opt.logStatement)) {
        errors.push(`${step.id}: two options share the logStatement "${opt.logStatement}"`);
      }
      seen.add(opt.logStatement);
    }
  }

  // Terminal steps assert an outcome, so they need something to say.
  const onward = [...(step.buttons ?? []), ...(step.decision?.options ?? [])]
    .filter((x) => !x.next.startsWith('__'));
  if (onward.length === 0 && !step.logStatement) {
    warnings.push(`${step.id}: terminal step with no logStatement — nothing is recorded on arrival`);
  }
  if (step.logStatement && !TOOL_VOICE.test(step.logStatement) && !/^[A-Z]/.test(step.logStatement)) {
    warnings.push(`${step.id}: step logStatement should start with a capital`);
  }
}

// Unreachable steps.
const reachable = new Set(['start']);
let grew = true;
while (grew) {
  grew = false;
  for (const step of rules.steps) {
    if (!reachable.has(step.id)) continue;
    for (const t of [...(step.buttons ?? []), ...(step.decision?.options ?? [])]) {
      if (!t.next.startsWith('__') && !reachable.has(t.next)) {
        reachable.add(t.next);
        grew = true;
      }
    }
  }
}
for (const step of rules.steps) {
  if (!reachable.has(step.id)) warnings.push(`${step.id}: unreachable from start`);
}

for (const w of warnings) console.warn(`warning  ${w}`);

if (errors.length) {
  console.error('\nrules.v1.json validation failed:');
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}

console.log(`rules.v1.json validation passed (${warnings.length} warning${warnings.length === 1 ? '' : 's'})`);
