import rulesJson from '../data/rules.v1.json';
import type { Rules, Step } from './types';

type AuditEntry = { stepId: string; question: string; statement: string; };

type State = {
  currentId: string;
  audit: AuditEntry[];
  history: string[];
  /** audit.length at the moment of each forward transition, parallel to history. */
  auditMarks: number[];
};

const RULES = rulesJson as Rules;
const $ = (s: string, r: ParentNode | Document = document) => r.querySelector(s);
const $$ = (s: string, r: ParentNode | Document = document) => Array.from(r.querySelectorAll(s));

const state: State = { currentId: 'start', audit: [], history: [], auditMarks: [] };

function iconConsultingSVG() {
  return `<svg class="step-link-icon" viewBox="0 0 16 16" width="38" height="38" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M8 1a5 5 0 0 0-5 5v1h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a6 6 0 1 1 12 0v6a2.5 2.5 0 0 1-2.5 2.5H9.366a1 1 0 0 1-.866.5h-1a1 1 0 1 1 0-2h1a1 1 0 0 1 .866.5H11.5A1.5 1.5 0 0 0 13 12h-1a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h1V6a5 5 0 0 0-5-5" fill="currentColor"/>
  </svg>`;
}

function stepById(id: string) {
  return RULES.steps.find((s) => s.id === id);
}

function enhanceExternalLinks(root: ParentNode | null) {
  if (!root) return;
  const anchors = root.querySelectorAll('a[href^="http"], a[target="_blank"]');
  anchors.forEach((a) => {
    if ((a as HTMLElement).dataset.enhanced === '1') return;
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener');
    if (!a.getAttribute('title')) a.setAttribute('title', 'Opens in a new tab');
    a.setAttribute('data-bs-toggle', 'tooltip');
    const sr = document.createElement('span');
    sr.className = 'sr-only';
    sr.textContent = ' (opens in a new tab, external link)';
    const sup = document.createElement('sup');
    sup.className = 'ext-indicator';
    sup.setAttribute('aria-hidden', 'true');
    sup.textContent = '↗';
    a.appendChild(sr);
    a.appendChild(sup);
    (a as HTMLElement).dataset.enhanced = '1';
  });

  const bootstrap = (window as any).bootstrap;
  if (bootstrap?.Tooltip) {
    [...root.querySelectorAll('a[data-bs-toggle="tooltip"]')].forEach((el) => {
      try {
        new bootstrap.Tooltip(el);
      } catch {
        // ignore tooltip init errors
      }
    });
  }
}

function decisionHTML(s: Step) {
  const d = s.decision;
  if (!d) return '';
  const qId = `decision-question-${s.id}`;
  const opts = d.options
    .map(
      (o, i) =>
        `<button class='btn ${i === 0 ? 'btn-primary' : 'btn-outline-primary'}' data-next='${o.next}' data-log='${escapeAttr(o.logStatement)}' aria-describedby='${qId}'>${o.label}</button>`
    )
    .join('');
  return `<div class='decision-callout mt-3'>
      <div class='d-flex align-items-center justify-content-between flex-wrap gap-2 mb-1'>
        <span class='title'>Decision point</span>${d.hint ? `<span class='hint'>${d.hint}</span>` : ''}
      </div>
      <div class='mb-2' id='${qId}'>${d.question}</div>
      <div class='d-flex gap-2 flex-wrap'>${opts}</div>
    </div>`;
}

function escapeAttr(v: string) {
  return v.replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function renderStep(focus = true) {
  const s = stepById(state.currentId) || stepById('start');
  if (!s) return;
  const extURL = RULES.resources.stepExternal[s.id];
  const hasURL = !!(extURL && typeof extURL === 'string' && extURL.trim() && extURL !== '#');
  const toolTip = hasURL ? 'Call for support or to request transfer' : 'No link available';
  const btnsData = [...(s.id !== 'start' ? [{ label: 'Back', next: '__back__' }] : []), ...(s.buttons || [])];
  const btnsHTML = btnsData
    .map((b) => `<button class="btn ${String(b.label).toLowerCase().includes('back') ? 'btn-outline-secondary' : 'btn-primary'} me-2" data-next="${b.next}">${b.label}</button>`)
    .join('');

  const furtherResourcesHTML = s.furtherResources?.length
    ? `<details class='further-resources mt-4'>
        <summary>Further resources</summary>
        <ul class='mb-0'>${s.furtherResources
          .map((r) => {
            if (r.popup) return `<li><span class="popup-link" data-popup="${r.popup}">${r.label}</span></li>`;
            if (r.url) return `<li><a href="${r.url}" target="_blank" rel="noopener">${r.label}</a></li>`;
            return `<li>${r.label}</li>`;
          })
          .join('')}</ul>
      </details>`
    : '';

  const stepContainer = $('#step-container');
  if (!stepContainer) return;

  stepContainer.innerHTML = `<div class='card-step p-3 p-md-4'>
        <div class='step-card-header mb-2'>
          <h2 class='h5 mb-0' tabindex='-1'>${s.title}</h2>
          <button class='step-link-btn' ${hasURL ? '' : 'disabled'} data-step-link='${hasURL ? extURL : ''}' aria-label='Open guidance for ${s.title}' data-bs-toggle='tooltip' data-bs-placement='left' title='${toolTip}'>${iconConsultingSVG()}</button>
        </div>
        <div class='alert alert-instruction mb-2'>${s.instruction}</div>
        ${s.description ? `<div class='mt-2'>${s.description}</div>` : ''}
        ${decisionHTML(s)}
        <div class='d-flex justify-content-end mt-4'>${btnsHTML}</div>
        ${furtherResourcesHTML}
      </div>`;

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rect = stepContainer.getBoundingClientRect();
  if (rect.top < 24) {
    window.scrollTo({
      top: window.scrollY + rect.top - 20,
      behavior: prefersReduced ? 'auto' : 'smooth',
    });
  }

  if (focus) {
    // preventScroll: the block above already positions the viewport; focus()'s
    // own default scroll-into-view would otherwise cancel that smooth scroll.
    (stepContainer.querySelector('h2, .card-step h5') as HTMLElement | null)?.focus({ preventScroll: true });
  }

  const tipBtn = $('#step-container .step-link-btn');
  const bootstrap = (window as any).bootstrap;
  if (tipBtn && bootstrap?.Tooltip) {
    new bootstrap.Tooltip(tipBtn);
  }
  if (hasURL && tipBtn) {
    tipBtn.addEventListener('click', () => {
      window.open(extURL, '_blank', 'noopener');
    });
  }

  $$('#step-container [data-next]').forEach((b) =>
    b.addEventListener('click', () => {
      const nxt = b.getAttribute('data-next');
      if (!nxt) return;
      if (nxt === '__reset__') {
        state.audit = [];
        state.history = [];
        state.auditMarks = [];
        state.currentId = 'start';
        renderStep();
        renderAudit();
        return;
      }
      if (nxt === '__back__') {
        rewindTo(state.history.length - 1);
        return;
      }
      const mark = state.audit.length;
      logStep(s, 'departure');
      const statement = b.getAttribute('data-log');
      if (statement) pushAudit(s.decision?.question || s.title, statement);
      state.history.push(state.currentId);
      state.auditMarks.push(mark);
      state.currentId = nxt;
      logStep(stepById(nxt), 'arrival');
      const last = state.audit[state.audit.length - 1];
      if (last) announce(last.statement);
      renderStep();
      renderAudit();
    })
  );

  $$('#step-container [data-popup]').forEach((el) =>
    el.addEventListener('click', () => openPopup(el.getAttribute('data-popup')))
  );
  enhanceExternalLinks(stepContainer);
}

function openPopup(key: string | null) {
  if (!key) return;
  const p = RULES.resources.popups[key];
  if (!p) return;
  const title = $('#modalTitle');
  const body = $('#modalBody');
  if (title) title.textContent = p.title;
  if (body) body.innerHTML = p.body;
  const modalEl = document.getElementById('modalPopup');
  const bootstrap = (window as any).bootstrap;
  if (bootstrap?.Modal && modalEl) {
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
  }
  setTimeout(() => enhanceExternalLinks(body), 0);
}

function pushAudit(question: string, statement: string) {
  state.audit.push({ stepId: state.currentId, question, statement });
  renderAudit();
}

function logStep(s: Step | undefined, when: 'arrival' | 'departure') {
  if (!s?.logStatement) return;
  if ((s.logOn ?? 'departure') !== when) return;
  state.audit.push({ stepId: s.id, question: '', statement: s.logStatement });
}

/** Undo transition `i` and everything after it. Keyed on position in
 * history/auditMarks, not on stepId, so a step visited twice (the
 * intervention_splenic <-> inpatient_icu cycle) rewinds the passage that was
 * actually selected, not whichever occurrence a stepId lookup happens to find. */
function rewindTo(i: number) {
  if (i < 0 || i >= state.history.length) return;
  const target = state.history[i];
  state.audit.length = state.auditMarks[i];
  state.history.length = i;
  state.auditMarks.length = i;
  state.currentId = target;
  announce(`Returned to ${stepById(target)?.title}`);
  renderStep();
  renderAudit();
}

/** Which transition (index into history/auditMarks) produced audit entry `j`. */
function transitionForEntry(j: number) {
  let i = -1;
  for (let k = 0; k < state.auditMarks.length; k++) {
    if (state.auditMarks[k] <= j) i = k;
    else break;
  }
  return i;
}

function announce(text: string) {
  const el = $('#sr-status');
  if (el) el.textContent = text;
}

function renderAudit() {
  const audit = $('#audit-render');
  if (audit) {
    audit.innerHTML = !state.audit.length
      ? "<p class='muted mb-0'>Your answers appear here as you work through the pathway. You can copy the summary into your notes at the end.</p>"
      : '<ol class="pathway-log list-unstyled mb-0" aria-label="Pathway log">' +
        state.audit
          .map((e, j) => {
            const i = transitionForEntry(j);
            const inner =
              `${e.question ? `<div class='muted'>${e.question}</div>` : ''}<div>${e.statement}</div>`;
            return i < 0
              ? `<li>${inner}</li>`
              : `<li><button type="button" class="log-entry" data-rewind="${i}">${inner}</button></li>`;
          })
          .join('') +
        '</ol>';
  }
  const empty = state.audit.length === 0;
  $$('#log-actions button').forEach((b) => ((b as HTMLButtonElement).disabled = empty));
}

function buildSummary() {
  const { version, lastReviewed, approvedBy } = RULES.meta;
  const lines = [
    'Paediatric splenic trauma pathway',
    `SWAPYT decision support ${version} · last reviewed ${lastReviewed} · ${approvedBy}`,
    '',
    ...state.audit.map((e) => `- ${e.statement}`),
    '',
    'Decision support only; does not replace clinical judgement.',
    'No patient identifiers recorded by this tool.'
  ];
  return lines.join('\n');
}

async function copySummary(btn: HTMLElement) {
  const text = buildSummary();
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  const label = btn.textContent;
  btn.textContent = 'Copied';
  announce('Summary copied to clipboard');
  window.setTimeout(() => { btn.textContent = label; }, 1500);
}

export function init() {
  try {
    renderStep(false);
  } catch (e) {
    const c = document.getElementById('step-container');
    if (c) {
      const msg = e instanceof Error ? e.message : String(e);
      c.innerHTML = `<div class='alert alert-danger'>Init error: ${msg}</div>`;
    }
  }
  renderAudit();

  const printMeta = $('#print-meta');
  if (printMeta) {
    const { version, lastReviewed, approvedBy } = RULES.meta;
    printMeta.textContent = `SWAPYT decision support ${version} · last reviewed ${lastReviewed} · ${approvedBy}`;
  }

  $('#btn-copy-log')?.addEventListener('click', (e) => copySummary(e.currentTarget as HTMLElement));
  $('#btn-print-log')?.addEventListener('click', () => window.print());

  // Selecting a log entry rewinds to it, discarding everything after — confirm
  // first via the existing Bootstrap modal rather than window.confirm.
  let pendingRewind: number | null = null;
  let rewindConfirmed = false;
  const modalConfirmEl = document.getElementById('modalConfirm');
  const bootstrapLib = (window as any).bootstrap;

  $('#audit-render')?.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest('[data-rewind]') as HTMLElement | null;
    if (!target) return;
    const i = Number(target.getAttribute('data-rewind'));
    if (Number.isNaN(i) || i < 0 || i >= state.history.length) return;
    pendingRewind = i;
    const removed = state.audit.length - state.auditMarks[i];
    const body = $('#modalConfirmBody');
    if (body) {
      body.textContent = `The ${removed} ${removed === 1 ? 'entry' : 'entries'} recorded after it will be removed from the log.`;
    }
    if (bootstrapLib?.Modal && modalConfirmEl) {
      bootstrapLib.Modal.getOrCreateInstance(modalConfirmEl).show();
    }
  });

  $('#modalConfirmAction')?.addEventListener('click', () => {
    rewindConfirmed = true;
    if (bootstrapLib?.Modal && modalConfirmEl) {
      bootstrapLib.Modal.getOrCreateInstance(modalConfirmEl).hide();
    }
  });

  modalConfirmEl?.addEventListener('hidden.bs.modal', () => {
    if (rewindConfirmed && pendingRewind !== null) rewindTo(pendingRewind);
    pendingRewind = null;
    rewindConfirmed = false;
  });

  const resetBtn = document.getElementById('btn-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      state.audit = [];
      state.history = [];
      state.auditMarks = [];
      state.currentId = 'start';
      renderStep();
      renderAudit();
    });
  }
}
