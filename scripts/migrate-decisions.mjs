/**
 * One-off migration: lift hand-written decision callouts out of step
 * description/instruction HTML into structured `decision` blocks.
 *
 *   node scripts/migrate-decisions.mjs            # dry run, prints a report
 *   node scripts/migrate-decisions.mjs --write    # rewrites data/rules.v1.json
 *
 * Safe to re-run: steps that already have a `decision` are skipped.
 * Delete this file once the migration is merged.
 */
import fs from 'node:fs/promises';

const WRITE = process.argv.includes('--write');
const rulesPath = new URL('../data/rules.v1.json', import.meta.url);

/**
 * Log statements, keyed `${stepId}:${next}`.
 * DRAFTED FOR CLINICAL REVIEW - these are the sentences that will land in a
 * clinician's note, and every one needs sign-off before this ships.
 */
const LOG_STATEMENTS = {
  'primary:lsi': 'Suspected abdominal injury with possible ongoing intra-abdominal haemorrhage',
  'primary:secondary': 'No suspicion of ongoing intra-abdominal haemorrhage',

  'lsi:intervention_splenic': 'Urgent intervention able to be provided locally',
  'lsi:transfer': 'Urgent intervention not able to be provided locally',

  'intervention_splenic:inpatient_icu': 'Local capacity and staff skill mix available for intensive care or HDU admission',
  'intervention_splenic:transfer': 'No local capacity or staff skill mix for intensive care or HDU admission',

  'provide_lsi:inpatient_icu': 'Local capacity available to admit (RCT, ATC or PTC)',
  'provide_lsi:transfer': 'No local capacity to admit (RCT, ATC or PTC)',

  'ct_criteria:ct_avail': 'Meets criteria for contrast-enhanced abdominal CT',
  'ct_criteria:transfer': 'Does not meet criteria for abdominal CT',

  'ct_avail:ct_scan': 'Safe access to CT available with necessary resources and personnel',
  'ct_avail:transfer': 'Safe access to CT not available locally',

  'ct_scan:lvl1': 'Group 1: AAST grade 1-3, no signs of bleeding, haemodynamically stable throughout',
  'ct_scan:lvl2': 'Group 2: AAST grade 4-5, resuscitation required, now haemodynamically stable',
  'ct_scan:lvl3': 'Group 3: requiring ongoing resuscitation, any AAST grade',
  'ct_scan:no_splenic_injury': 'Group 4: no splenic injury identified on CT',

  'lvl1:inpatient_ward': 'Local capacity, resources and personnel available to admit a child of this age',
  'lvl1:transfer': 'Local capacity, resources or personnel not available for a child of this age',

  'lvl2:inpatient_icu': 'Local capacity available to admit and manage the child',
  'lvl2:transfer': 'No local capacity to admit and manage the child',

  'lvl3:intervention_splenic': 'Local capacity available to admit and manage, including intervention if required',
  'lvl3:transfer': 'No local capacity to admit and manage, including intervention if required',

  'cap_lvl3:inpatient_icu': 'Local capacity and capability available to admit a child or young person of this age',
  'cap_lvl3:transfer': 'No local capacity or capability to admit a child or young person of this age',

  'inpatient_icu:intervention_splenic': 'Signs of ongoing bleeding; intervention available locally',
  'inpatient_icu:transfer': 'Signs of ongoing bleeding; intervention not available locally',
  'inpatient_icu:inpatient_ward': 'Remains stable; suitable for step-down to ward-based care'
};

/** Statements written to the log on arrival at an outcome step. */
const STEP_STATEMENTS = {
  inpatient_ward: 'Pathway supports ward-based care under a general or paediatric surgeon',
  inpatient_icu: 'Pathway supports admission to HDU or intensive care',
  transfer: 'Pathway indicates discussion with NETS (1300 362 500) for advice or transfer',
  discharge: 'Pathway supports discharge with after-care instructions',
  provide_lsi: 'Life-saving intervention provided'
};

/** Find a decision-callout block and its matching close tag by counting divs. */
function extractCallout(html) {
  const open = html.search(/<div\s+class=['"]decision-callout/);
  if (open === -1) return null;
  const tag = /<div\b|<\/div>/g;
  tag.lastIndex = open;
  let depth = 0;
  let m;
  while ((m = tag.exec(html))) {
    depth += m[0] === '</div>' ? -1 : 1;
    if (depth === 0) {
      return { start: open, end: m.index + m[0].length, block: html.slice(open, m.index + m[0].length) };
    }
  }
  return null;
}

const strip = (s) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

function parseCallout(block) {
  const hint = block.match(/class=['"]hint['"]\s*>([\s\S]*?)<\//);
  const question = block.match(/class=['"]mb-2['"]\s*>([\s\S]*?)<\/div>/);
  const options = [...block.matchAll(/<button[^>]*data-next=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/button>/g)]
    .map(([, next, label]) => ({ label: strip(label), next }));
  return {
    hint: hint ? strip(hint[1]) : undefined,
    question: question ? strip(question[1]) : '',
    options
  };
}

const rules = JSON.parse(await fs.readFile(rulesPath, 'utf8'));
const report = [];
const problems = [];

for (const step of rules.steps) {
  if (step.decision) continue;

  for (const field of ['description', 'instruction']) {
    const html = step[field];
    if (!html) continue;
    const found = extractCallout(html);
    if (!found) continue;

    const parsed = parseCallout(found.block);
    if (!parsed.question) problems.push(`${step.id}: callout has no question text`);
    if (parsed.options.length < 2) problems.push(`${step.id}: callout has fewer than 2 options`);

    const options = parsed.options.map((o) => {
      const key = `${step.id}:${o.next}`;
      const logStatement = LOG_STATEMENTS[key];
      if (!logStatement) problems.push(`missing LOG_STATEMENTS['${key}']`);
      return { label: o.label, next: o.next, logStatement: logStatement ?? '' };
    });

    step.decision = parsed.hint
      ? { question: parsed.question, hint: parsed.hint, options }
      : { question: parsed.question, options };

    step[field] = (html.slice(0, found.start) + html.slice(found.end)).replace(/\s+$/, '');

    report.push(`${step.id.padEnd(22)} ${field.padEnd(12)} ${options.length} options`);

    if (extractCallout(step[field])) problems.push(`${step.id}: more than one callout in ${field}`);
  }

  if (STEP_STATEMENTS[step.id] && !step.logStatement) step.logStatement = STEP_STATEMENTS[step.id];
}

console.log(`Migrated ${report.length} decision callouts:\n`);
for (const line of report) console.log('  ' + line);

if (problems.length) {
  console.error('\nProblems:');
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}

if (WRITE) {
  await fs.writeFile(rulesPath, JSON.stringify(rules, null, 2) + '\n');
  console.log('\ndata/rules.v1.json rewritten.');
} else {
  console.log('\nDry run. Re-run with --write to apply.');
}
