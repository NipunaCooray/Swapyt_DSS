import rulesJson from '../data/rules.v1.json';
import type { Rules, Step } from './types';

type AuditEntry = { stepId: string; question: string; statement: string; };

type State = {
  currentId: string;
  audit: AuditEntry[];
  history: string[];
};

const RULES = rulesJson as Rules;
const $ = (s: string, r: ParentNode | Document = document) => r.querySelector(s);
const $$ = (s: string, r: ParentNode | Document = document) => Array.from(r.querySelectorAll(s));

const state: State = { currentId: 'start', audit: [], history: [] };

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
  const opts = d.options
    .map(
      (o, i) =>
        `<button class='btn ${i === 0 ? 'btn-primary' : 'btn-outline-primary'}' data-next='${o.next}' data-log='${escapeAttr(o.logStatement)}'>${o.label}</button>`
    )
    .join('');
  return `<div class='decision-callout mt-3'>
      <div class='d-flex align-items-center justify-content-between flex-wrap gap-2 mb-1'>
        <span class='title'>Decision point</span>${d.hint ? `<span class='hint'>${d.hint}</span>` : ''}
      </div>
      <div class='mb-2'>${d.question}</div>
      <div class='d-flex gap-2 flex-wrap'>${opts}</div>
    </div>`;
}

function escapeAttr(v: string) {
  return v.replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function renderStep() {
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
          <h2 class='h5 mb-0'>${s.title}</h2>
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
        state.currentId = 'start';
        renderStep();
        renderAudit();
        return;
      }
      if (nxt === '__back__') {
        const prev = state.history.pop();
        state.currentId = prev || 'start';
        renderStep();
        renderAudit();
        return;
      }
      logStep(s, 'departure');
      const statement = b.getAttribute('data-log');
      if (statement) pushAudit(s.decision?.question || s.title, statement);
      state.history.push(state.currentId);
      state.currentId = nxt;
      logStep(stepById(nxt), 'arrival');
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

function renderAudit() {
  const audit = $('#audit-render');
  if (!audit) return;
  if (!state.audit.length) {
    audit.innerHTML =
      "<p class='muted mb-0'>Your answers appear here as you work through the pathway. You can copy the summary into your notes at the end.</p>";
    return;
  }
  audit.innerHTML =
    '<ol class="pathway-log list-unstyled mb-0">' +
    state.audit
      .map(
        (e) =>
          `<li>${e.question ? `<div class='muted'>${e.question}</div>` : ''}<div>${e.statement}</div></li>`
      )
      .join('') +
    '</ol>';
}

export function init() {
  try {
    renderStep();
  } catch (e) {
    const c = document.getElementById('step-container');
    if (c) {
      const msg = e instanceof Error ? e.message : String(e);
      c.innerHTML = `<div class='alert alert-danger'>Init error: ${msg}</div>`;
    }
  }
  renderAudit();

  const resetBtn = document.getElementById('btn-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      state.audit = [];
      state.history = [];
      state.currentId = 'start';
      renderStep();
      renderAudit();
    });
  }
}
