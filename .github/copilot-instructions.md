# Swapyt DSS — AI Coding Agent Instructions

## Project Overview
**Swapyt DSS** (Paediatric Splenic Trauma — Decision Support System) is a **single-page clinical decision support web application** deployed on Firebase Hosting. It guides clinicians through a step-by-step flowchart for managing paediatric splenic trauma across NSW hospitals, from initial assessment through discharge.

**Key characteristic:** Data-driven UI driven by a `RULES` object that defines all steps, transitions, and popup content. The app is entirely client-side with **zero backend dependencies**.

## Architecture & Component Structure

### Core Files
- **`public/index.html`** (854 lines): Main decision tree application
  - Single `RULES` object contains entire app logic (`steps[]`, `popups{}`, `resources.stepExternal{}`)
  - 19 defined steps implementing a clinical flowchart (start → prepare → primary → secondary → CT criteria → grouping → inpatient/transfer/discharge)
  - Step state management via `state = { currentId, audit[], history[] }`
  - Bootstrap 5.3.3 for UI; no frameworks (vanilla JS only)
  
- **`public/transfer.html`** (206 lines): Standalone reference page for "Call for advice or discuss transfer"
  - Independent HTML file (not interactive like index.html)
  - Reusable modal system with Bootstrap
  - Linked from decision tree step transitions

- **`firebase.json`**: Firebase Hosting config
  - Public directory: `public/`
  - SPA rewrites: all routes → `index.html` (not used here, but configured)
  - Ignores: node_modules, .env, dotfiles

## Critical Patterns & Workflows

### 1. Decision Flow System
The app uses a **decision tree pattern** where each step can:
- **Render content** (instruction + description + buttons)
- **Link to external resources** via `stepExternal[stepId]`
- **Transition** to next step via `data-next` attribute on buttons
- **Track history** for back navigation (stored in `state.history[]`)

**Key decision points** (branches to different outcomes):
- Primary survey → Life-saving intervention (LSI) YES/NO → inpatient_icu or transfer
- CT scan → Availability YES/NO → ct_criteria or transfer
- Injury grouping (Group 1/2/3) → Local capacity YES/NO → inpatient or transfer

### 2. Popup/Modal System
- **Centralized content:** `RULES.resources.popups{}` maps keys to `{ title, body }`
- **Triggered by:** `<span class="popup-link" data-popup="KEY">text</span>` in step descriptions
- **Rendered in:** Reusable Bootstrap modal (#modalPopup)
- **Implementation:** Event listeners on `[data-popup]` elements; body HTML injected via `innerHTML`

**Important:** External links inside popup content are auto-enhanced with `target="_blank"`, `rel="noopener"`, tooltip, and icon.

### 3. Audit Trail / Pathway Log
- **Sidebar widget** tracks clinician navigation decisions
- **State management:** `state.audit[]` stores `{ stepId, title, label, ts }`
- **Rendered live** in sidebar-card (#audit-render) as user progresses
- **Reset button** clears history and returns to start

### 4. Styling & Theme
- **CSS variables** defined in `:root` for consistent colors (brand blue #0a66ff, dark ink #111827, etc.)
- **Bootstrap utilities** for layout (grid, flexbox, spacing)
- **Custom classes:** `.card-step`, `.decision-callout`, `.popup-link`, `.sr-only` for accessibility
- **Design pattern:** Card-based UI with bordered sections, consistent spacing, and callout boxes for warnings/decisions

## Development Workflows

### Local Development
```bash
# Start Firebase local server (requires firebase-cli)
firebase serve

# OR use Live Server extension (configured for port 5501)
# VS Code: Right-click index.html → "Open with Live Server"
```

### Deployment
```bash
# Prerequisites: firebase-cli installed, authenticated with Firebase project
firebase deploy --only hosting

# Project ID: swapyt-dst (from .firebaserc)
```

### No Build Step
This project has **no build tools** (no webpack, no npm scripts). Deployment is direct file upload to Firebase.

## Code Patterns to Preserve

### Adding New Steps
1. Add object to `RULES.steps[]` with properties: `id, title, instruction, description, buttons[]`
2. Set button `next` values to existing step IDs (or special: `__back__`, `__reset__`)
3. Add popup content to `RULES.resources.popups{}` if needed
4. Add external resource link to `RULES.resources.stepExternal[stepId]` if applicable
5. Wire buttons with `data-next` attribute in description (or use buttons[] array)

### Modifying Step Logic
- **Conditional rendering:** Embed decision callout HTML directly in `description` string
- **Button handlers:** Leverage existing `data-next` mechanism (no custom event handlers needed)
- **New step transitions:** Update `buttons[]` in previous steps

### Managing Popup Content
- Keep HTML strings in `RULES.resources.popups[key].body` for maintainability
- Avoid inline styles; use CSS classes instead
- Always wrap external links in proper semantic HTML (`<a href="..." target="_blank" rel="noopener">`)

## Common Customizations

### Color Theme
Edit `:root` CSS variables (`:root { --brand: #0a66ff; --ink: #111827; ... }`)

### Modal Styling
Bootstrap modal config in HTML; customize via `.modal-dialog` classes (modal-lg, modal-dialog-scrollable, etc.)

### External Resource Links
Add key → URL mapping to `RULES.resources.stepExternal[stepId]` and wire button via `data-step-link` attribute

### Audit Trail Display
Modify `renderAudit()` function output format or sidebar-card layout

## Important Notes for AI Agents

- **No state persistence:** Refreshing page resets session (audit trail, step position). Design new features with this in mind.
- **HTML injection risk:** All user-facing content (descriptions, popups) uses `innerHTML`. Be careful with untrusted input.
- **Mobile responsiveness:** Use Bootstrap grid (`col-lg-8`, `col-lg-4`) for layout; test on small screens.
- **Accessibility:** Maintain `.sr-only` spans for screen readers; external links have aria-labels.
- **Firebase config:** .firebaserc defines project ID; changing it requires re-authentication.

## External Resources Referenced
- [RCH Trauma Service Manual](https://www.rch.org.au/trauma-service/manual/)
- [APLS Algorithms](https://www.apls.org.au/)
- [NETS (Newborn & Paediatric Emergency Transport Service)](https://nswhealth.sharepoint.com/sites/SCHN-NETSINTRANET)
- [NSW Trauma System Guidelines](https://aci.health.nsw.gov.au/)

---

**Last updated:** February 5, 2026
