export type RuleId = string;

export interface RuleMeta {
  version: string;
  lastReviewed: string;
  approvedBy: string;
}

export interface PopupContent {
  title: string;
  body: string;
}

/**
 * Navigation-only control (Start, Next, Back, End).
 * Deliberately has no logStatement: moving through the pathway is not a
 * clinical finding and must never appear in the pathway log.
 */
export interface StepButton {
  label: string;
  next: RuleId;
}

/**
 * One answer to a clinical decision point.
 *
 * `label` is what the clinician sees on the button.
 * `logStatement` is the sentence written to the pathway log - drafted as text
 * that could appear in a clinical note, not as a description of the
 * interaction. Findings are stated bare ("No contrast blush"); conclusions the
 * tool asserts begin "Pathway supports" / "Pathway indicates".
 */
export interface DecisionOption {
  label: string;
  next: RuleId;
  logStatement: string;
}

export interface Decision {
  /** Question shown above the options. */
  question: string;
  /** Short category shown top-right of the callout, e.g. "Local capacity". */
  hint?: string;
  options: DecisionOption[];
}

export interface FurtherResourceLink {
  label: string;
  url?: string;
  popup?: string;
}

export interface Step {
  id: RuleId;
  title: string;
  instruction: string;
  description?: string;
  /** Clinical decision point. Rendered from data - never hand-written in HTML. */
  decision?: Decision;
  /**
   * When `logStatement` is written to the pathway log.
   * "departure" (default) - statements about what the clinician did, written
   * when they leave the step via a forward transition.
   * "arrival" - conclusions the tool asserts, true the moment the step is
   * reached. Required for outcome steps, which a clinician may never leave.
   */
  logOn?: 'arrival' | 'departure';
  /** Written to the pathway log per `logOn`. Every step has one. */
  logStatement?: string;
  buttons?: StepButton[];
  furtherResources?: FurtherResourceLink[];
  /**
   * Raw HTML rendered last in the card, after buttons and further resources.
   * For standing notices that must stay below the primary action (e.g. a
   * disclaimer) — `description` renders before buttons, so it can't reach here.
   */
  footer?: string;
  /**
   * Raw HTML rendered to the left of the buttons, in the same row. When set,
   * the actions row switches from right-aligned to space-between so this
   * content and the buttons share one line instead of stacking.
   */
  actionsLeft?: string;
}

export interface RuleResources {
  stepExternal: Record<RuleId, string>;
  popups: Record<string, PopupContent>;
}

export interface Rules {
  meta: RuleMeta;
  resources: RuleResources;
  steps: Step[];
}
