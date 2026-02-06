import rulesJson from '../data/rules.v1.json';
import type { Rules } from './types';

type AuditEntry = {
  stepId: string;
  title: string;
  label: string;
  ts: number;
};

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
  return `<svg class="step-link-icon" viewBox="0 0 16 16" width="32" height="32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
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
    a.addEventListener('click', () => {
      const step = stepById(state.currentId);
      if (step) pushAudit(step.title, 'Opened external link: ' + ((a as HTMLElement).innerText || 'link'));
    });
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

function renderStep() {
  const s = stepById(state.currentId) || stepById('start');
  if (!s) return;
  const extURL = RULES.resources.stepExternal[s.id];
  const hasURL = !!(extURL && typeof extURL === 'string' && extURL.trim() && extURL !== '#');
  const toolTip = hasURL ? 'Open help page' : 'No link available';
  const btnsData = [...(s.id !== 'start' ? [{ label: 'Back', next: '__back__' }] : []), ...(s.buttons || [])];
  const btnsHTML = btnsData
    .map((b) => `<button class="btn ${String(b.label).toLowerCase().includes('back') ? 'btn-outline-secondary' : 'btn-primary'} me-2" data-next="${b.next}">${b.label}</button>`)
    .join('');

  const stepContainer = $('#step-container');
  if (!stepContainer) return;

  stepContainer.innerHTML = `<div class='card-step p-3 p-md-4'>
        <div class='step-card-header mb-2'>
          <h2 class='h5 mb-0'>${s.title}</h2>
          <button class='step-link-btn' ${hasURL ? '' : 'disabled'} data-step-link='${hasURL ? extURL : ''}' aria-label='Open guidance for ${s.title}' data-bs-toggle='tooltip' data-bs-placement='left' title='${toolTip}'>${iconConsultingSVG()}</button>
        </div>
        <div class='alert alert-instruction mb-2'>${s.instruction}</div>
        ${s.description ? `<div class='mt-2'>${s.description}</div>` : ''}
        <div class='d-flex justify-content-end mt-4'>${btnsHTML}</div>
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
      pushAudit(s.title, 'Opened guidance');
      window.open(extURL, '_blank', 'noopener');
    });
  }

  $$('#step-container [data-next]').forEach((b) =>
    b.addEventListener('click', () => {
      const nxt = b.getAttribute('data-next');
      const label = b.textContent || '';
      if (!nxt) return;
      if (nxt === '__reset__') {
        pushAudit(s.title, label);
        state.audit = [];
        state.history = [];
        state.currentId = 'start';
        renderStep();
        renderAudit();
        return;
      }
      if (nxt === '__back__') {
        pushAudit(s.title, 'Back');
        const prev = state.history.pop();
        state.currentId = prev || 'start';
        renderStep();
        renderAudit();
        return;
      }
      pushAudit(s.title, label);
      state.history.push(state.currentId);
      state.currentId = nxt;
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

function pushAudit(t: string, l: string) {
  state.audit.push({ stepId: state.currentId, title: t, label: l, ts: Date.now() });
  renderAudit();
}

function renderAudit() {
  const audit = $('#audit-render');
  if (!audit) return;
  audit.innerHTML =
    state.audit
      .map((e) => `<div>${e.title} – <span class='muted'>${e.label}</span></div>`)
      .join('') || '<div class="muted">Started · Session initialised</div>';
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
