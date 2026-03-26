import { Action } from "./actions";

export type KeyBinding = {
  action: Action;
  codes: string[];
};

// Touch/pointer are primary. Keyboard is fallback for desktop.
export const defaultKeyBindings: KeyBinding[] = [
  { action: Action.Pause, codes: ["Escape"] },
  { action: Action.Release, codes: ["KeyR"] },
  { action: Action.DebugToggle, codes: ["KeyZ"] },
  { action: Action.InspectorToggle, codes: ["KeyX"] },
];



