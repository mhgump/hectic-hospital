import type { Patient } from "../hospital/types";
import { NPC_PRESETS } from "../hospital/npcPresets";
import type { NpcPreset } from "../hospital/npcPresets";

export interface DialogueGenerator {
  generateGreeting(patient: Patient): string;
  generateReply(patient: Patient, playerText: string): string;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function getPreset(patient: Patient): NpcPreset | null {
  if (!patient.presetId) return null;
  return NPC_PRESETS.find((p) => p.presetId === patient.presetId) ?? null;
}

const GENERIC_GREETINGS = [
  "Ugh, I've been waiting forever. Can someone please help me?",
  "Hi... I'm not feeling so great. Can you take a look?",
  "Is anyone going to see me? I've been here for ages!",
];

const GENERIC_REPLIES = [
  "Ok... if you say so.",
  "Can we just get this over with?",
  "Fine, fine. Whatever you think is best.",
];

export const templateGenerator: DialogueGenerator = {
  generateGreeting(patient: Patient): string {
    const preset = getPreset(patient);
    if (preset && preset.greetings.length > 0) {
      return pick(preset.greetings);
    }
    return pick(GENERIC_GREETINGS);
  },

  generateReply(patient: Patient, _playerText: string): string {
    const preset = getPreset(patient);
    if (preset && preset.replies.length > 0) {
      return pick(preset.replies);
    }
    return pick(GENERIC_REPLIES);
  },
};
