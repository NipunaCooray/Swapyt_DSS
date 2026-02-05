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

export interface StepButton {
  label: string;
  next: RuleId;
}

export interface Step {
  id: RuleId;
  title: string;
  instruction: string;
  description?: string;
  buttons?: StepButton[];
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
