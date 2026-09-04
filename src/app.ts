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

function stepById(id: string) {
  return RULES.steps.find((s) => s.id === id);
}

function formatReviewDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * The header's Beta pill shows until meta.approvedBy names a real endorsing
 * body (a clinical network, college or committee) rather than the programme
 * that produced the tool. Revisit this check if that value's meaning changes.
 */
function isEndorsed(approvedBy: string) {
  return /network|college|committee/i.test(approvedBy);
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

/** Popup triggers are plain <span data-popup>, not natively focusable — make
 * them reachable and operable by keyboard, matching the mouse click handler. */
function enhancePopupTriggers(root: ParentNode | null) {
  if (!root) return;
  root.querySelectorAll('[data-popup]').forEach((el) => {
    if ((el as HTMLElement).dataset.kbdEnhanced === '1') return;
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
    if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
    el.addEventListener('keydown', (e) => {
      const ev = e as KeyboardEvent;
      if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar') {
        ev.preventDefault();
        (el as HTMLElement).click();
      }
    });
    (el as HTMLElement).dataset.kbdEnhanced = '1';
  });
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
  const btnsData = [...(s.id !== 'start' ? [{ label: 'Back', next: '__back__' }] : []), ...(s.buttons || [])];
  const btnsHTML = btnsData
    .map((b) => `<button class="btn ${String(b.label).toLowerCase().includes('back') ? 'btn-outline-secondary' : 'btn-primary'} me-2" data-next="${b.next}">${b.label}</button>`)
    .join('');
  // With actionsLeft content, the row shares space with it (space-between)
  // instead of pushing the buttons alone to the right (justify-content-end).
  const actionsRowClass = s.actionsLeft
    ? 'd-flex align-items-center justify-content-between gap-3 flex-wrap section-divider start-action-row'
    : 'd-flex justify-content-end mt-4';
  const actionsRowHTML = `<div class='${actionsRowClass}'>
      ${s.actionsLeft ? `<div class='d-flex align-items-center gap-3 flex-wrap start-popup-links'>${s.actionsLeft}</div>` : ''}
      ${btnsHTML}
    </div>`;

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

  // Reset is the most destructive control in the app; there is nothing to
  // reset until the clinician has actually moved past the home screen.
  const reset = $('#btn-reset') as HTMLElement | null;
  if (reset) reset.style.display = state.history.length ? '' : 'none';

  stepContainer.innerHTML = `<div class='card-step p-3 p-md-4' tabindex='-1'>
        ${s.title ? `<h2 class='h5 mb-2' tabindex='-1'>${s.title}</h2>` : ''}
        <div class='alert alert-instruction mb-2'>${s.instruction}</div>
        ${s.description ? `<div class='mt-2'>${s.description}</div>` : ''}
        ${decisionHTML(s)}
        ${actionsRowHTML}
        ${furtherResourcesHTML}
        ${s.footer ? `<div class='mt-3'>${s.footer}</div>` : ''}
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
    // Falls back to the card itself for steps with no heading (start).
    const focusTarget = (stepContainer.querySelector('h2') as HTMLElement | null)
      ?? (stepContainer.querySelector('.card-step') as HTMLElement | null);
    focusTarget?.focus({ preventScroll: true });
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
  enhancePopupTriggers(stepContainer);
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
  if (!audit) return;
  // Hide the actions row (rather than disable it) before the early return, so
  // an empty log never shows a pair of greyed-out controls — the empty-state
  // text below already says what the panel is for.
  const empty = state.audit.length === 0;
  const actions = $('#log-actions') as HTMLElement | null;
  // #log-actions carries Bootstrap's .d-flex utility (display: flex
  // !important) — a plain inline style can't beat that, so hide with the
  // same priority and let removeProperty fall back to .d-flex when shown.
  if (actions) {
    if (empty) actions.style.setProperty('display', 'none', 'important');
    else actions.style.removeProperty('display');
  }
  if (empty) {
    audit.innerHTML = "<p class='muted mb-0'>Your answers appear here as you work through the pathway. You can copy the summary into your notes at the end.</p>";
    return;
  }
  audit.innerHTML = '<ol class="pathway-log list-unstyled mb-0" aria-label="Pathway log">' +
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

  const provenance = $('#provenance-line');
  if (provenance) {
    const { version, lastReviewed, approvedBy } = RULES.meta;
    provenance.textContent = `Decision support system · ${version} · reviewed ${formatReviewDate(lastReviewed)} · ${approvedBy}`;
  }
  const betaPill = $('#beta-pill') as HTMLElement | null;
  if (betaPill) betaPill.style.display = isEndorsed(RULES.meta.approvedBy) ? 'none' : '';

  $('#btn-support')?.addEventListener('click', () => {
    const extURL = RULES.resources.stepExternal[state.currentId];
    if (extURL && typeof extURL === 'string' && extURL.trim() && extURL !== '#') {
      window.open(extURL, '_blank', 'noopener');
    }
  });

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
