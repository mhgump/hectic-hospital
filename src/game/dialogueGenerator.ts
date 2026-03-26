import type { Patient, Diagnosis } from "../hospital/types";

export interface DialogueGenerator {
  generateGreeting(patient: Patient): string;
  generateReply(patient: Patient, playerText: string): string;
}

const COMPLAINT: Record<Diagnosis, string[]> = {
  flu: [
    "I've been sneezing non-stop for three days...",
    "My nose is a waterfall and my head feels like it's full of cotton.",
    "I think I caught something terrible. Everything aches.",
  ],
  broken_bone: [
    "I fell off my bike and my arm is definitely not supposed to bend this way.",
    "There was a crunch. I heard a crunch. That's bad, right?",
    "Please don't touch it — just LOOK at how swollen it is!",
  ],
  food_poisoning: [
    "I ate something from that new place downtown and... I won't go into details.",
    "My stomach has been staging a revolt since last night.",
    "I think the shrimp was bad. Very, very bad.",
  ],
  headache: [
    "It feels like someone is playing drums inside my skull.",
    "The light hurts. The sound hurts. Everything hurts.",
    "I've taken every painkiller I own and nothing works.",
  ],
  mystery_rash: [
    "Look at this rash — it appeared overnight and it's SPREADING.",
    "I woke up covered in spots. Is this contagious?!",
    "Something is very wrong with my skin and nobody can tell me what.",
  ],
};

const DANGEROUS_LINES = [
  "*The patient's eyes dart around nervously.* I need help... but don't ask too many questions.",
  "*You notice something suspicious under their coat.* Just... patch me up and let me go, ok?",
  "I don't want to be here. I SHOULDN'T be here. Just treat me fast.",
  "*They keep glancing at the exits.* Look, I'll pay double if you don't write my name down.",
];

const REPLY_TEMPLATES = [
  "I hear you, but please — can you just focus on helping me?",
  "That's... not really what I wanted to hear right now.",
  "Ok, ok. But what about my {diagnosis}? That's why I'm here!",
  "You're the doctor, not me. Just tell me what to do.",
  "Fine. But I've been waiting forever already.",
  "*sighs* Look, I just want to feel better.",
];

const DANGEROUS_REPLIES = [
  "You don't need to know that. Just treat me.",
  "*shifts uncomfortably* Can we move this along?",
  "Why are you asking so many questions? Just do your job!",
  "I said I don't want trouble. Are you going to help me or not?",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export const templateGenerator: DialogueGenerator = {
  generateGreeting(patient: Patient): string {
    if (patient.dangerous) {
      return pick(DANGEROUS_LINES);
    }
    const diagnosis = patient.diagnosis ?? "flu";
    return pick(COMPLAINT[diagnosis]);
  },

  generateReply(patient: Patient, _playerText: string): string {
    if (patient.dangerous) {
      return pick(DANGEROUS_REPLIES);
    }
    const line = pick(REPLY_TEMPLATES);
    return line.replace("{diagnosis}", patient.diagnosis ?? "condition");
  },
};
