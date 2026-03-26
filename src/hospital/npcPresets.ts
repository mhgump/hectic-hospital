import type { Diagnosis } from "./types";

export interface NpcPreset {
  /** Unique preset key */
  presetId: string;
  name: string;
  age: number;
  personality: NpcPersonality;
  appearance: NpcAppearance;
  dangerous: boolean;
  /** Weighted diagnosis pool — null means random */
  diagnosisPool: Diagnosis[];
  /** Dialogue flavor lines */
  greetings: string[];
  replies: string[];
}

export interface NpcPersonality {
  /** One-line personality summary for dialogue generation */
  trait: string;
  patience: number;     // 0–1 base patience
  politeness: number;   // 0–1 how nice they are in dialogue
  suspicion: number;    // 0–1 how suspicious they seem
}

export interface NpcAppearance {
  /** Pre-generated portrait image path (relative to public/) */
  portraitPath: string;
  /** Fallback color for the placeholder circle */
  portraitColor: string;
  /** Initial letter for placeholder */
  initial: string;
}

export const NPC_PRESETS: NpcPreset[] = [
  // ── 1. Margaret Chen — anxious elderly woman ─────────────────────────────
  {
    presetId: "margaret",
    name: "Margaret Chen",
    age: 72,
    dangerous: false,
    personality: {
      trait: "anxious elderly woman who worries about everything",
      patience: 0.95,
      politeness: 0.9,
      suspicion: 0.0,
    },
    appearance: {
      portraitPath: "/assets/portraits/margaret.png",
      portraitColor: "#A8D5BA",
      initial: "M",
    },
    diagnosisPool: ["flu", "headache", "mystery_rash"],
    greetings: [
      "Oh dear, I'm so sorry to bother you. I've been feeling just awful since Tuesday...",
      "Hello, dear. My daughter made me come in. She says I look pale — do I look pale to you?",
      "I hope this won't take too long. My cat needs feeding by 5 o'clock, you see...",
    ],
    replies: [
      "Oh my, is that so? That sounds rather serious, doesn't it?",
      "You're very kind. My late husband was a doctor, you know. He'd know what to do.",
      "I do hope you can help me, dear. I'm trying not to worry but it's rather difficult.",
      "That's what my daughter said too. She worries almost as much as I do!",
    ],
  },

  // ── 2. Jake "The Tank" Morrison — tough construction worker ──────────────
  {
    presetId: "jake",
    name: "Jake Morrison",
    age: 34,
    dangerous: false,
    personality: {
      trait: "tough impatient construction worker who insists he's fine",
      patience: 0.5,
      politeness: 0.3,
      suspicion: 0.0,
    },
    appearance: {
      portraitPath: "/assets/portraits/jake.png",
      portraitColor: "#D4A056",
      initial: "J",
    },
    diagnosisPool: ["broken_bone", "headache"],
    greetings: [
      "Look, I don't even need to be here. My foreman MADE me come in. It's just a scratch.",
      "I've had worse on the job site. Can we speed this up? I'm losing pay every minute.",
      "*holding his clearly injured arm* It's fine. I barely feel it. Just wrap it up and I'll go.",
    ],
    replies: [
      "Yeah yeah, I know. Just give me some tape and I'll be out of your hair.",
      "Seriously? That long? I've got a foundation pour at 3 PM!",
      "My buddy had the same thing, he just walked it off. Can I do that?",
      "*winces* That? No, that doesn't hurt. ...Ok maybe a little.",
    ],
  },

  // ── 3. Priya Sharma — dramatic hypochondriac ────────────────────────────
  {
    presetId: "priya",
    name: "Priya Sharma",
    age: 28,
    dangerous: false,
    personality: {
      trait: "dramatic hypochondriac who googled her symptoms and thinks she's dying",
      patience: 0.65,
      politeness: 0.6,
      suspicion: 0.0,
    },
    appearance: {
      portraitPath: "/assets/portraits/priya.png",
      portraitColor: "#E8A0D0",
      initial: "P",
    },
    diagnosisPool: ["flu", "food_poisoning", "mystery_rash", "headache"],
    greetings: [
      "OK so I looked it up and WebMD says it could be TWELVE different things and three of them are fatal!",
      "I've been tracking my symptoms in an app and the graph is NOT looking good. *shows phone*",
      "Please help me, I posted in a health forum and they said I should come to the ER IMMEDIATELY.",
    ],
    replies: [
      "But what if it's the SERIOUS version? My cousin's friend had the same thing and—",
      "I already rated this hospital 3 stars on Google. Don't make me change it to 2.",
      "Can you check again? I feel like the symptoms have EVOLVED since I sat down.",
      "I'm going to need a FULL panel. Blood work, MRI, the works. I have a podcast about this.",
    ],
  },

  // ── 4. Viktor Kozlov — suspicious dangerous character ────────────────────
  {
    presetId: "viktor",
    name: "Viktor Kozlov",
    age: 45,
    dangerous: true,
    personality: {
      trait: "nervous and evasive man who won't explain how he got injured",
      patience: 0.4,
      politeness: 0.2,
      suspicion: 0.95,
    },
    appearance: {
      portraitPath: "/assets/portraits/viktor.png",
      portraitColor: "#8B4444",
      initial: "V",
    },
    diagnosisPool: ["broken_bone", "mystery_rash"],
    greetings: [
      "*looks around nervously* No names. Just... fix this and I'll go. Cash only.",
      "Don't write anything down. I wasn't here. You understand?",
      "*blood seeping through makeshift bandage* It's nothing. An accident. Don't ask what kind.",
    ],
    replies: [
      "That's not your concern. Just do your job, doctor.",
      "*phone buzzes* I need to take this— actually no. Just hurry up.",
      "Why do you need my ID? Can't you just... treat me?",
      "The less you know, the better. For both of us.",
    ],
  },

  // ── 5. Eddy Kowalski — cheerful food poisoning regular ──────────────────
  {
    presetId: "eddy",
    name: "Eddy Kowalski",
    age: 52,
    dangerous: false,
    personality: {
      trait: "cheerful regular who keeps coming back with food poisoning from bad restaurants",
      patience: 0.85,
      politeness: 0.8,
      suspicion: 0.0,
    },
    appearance: {
      portraitPath: "/assets/portraits/eddy.png",
      portraitColor: "#7BC47F",
      initial: "E",
    },
    diagnosisPool: ["food_poisoning", "flu"],
    greetings: [
      "Hey doc! It's me again! You'll never BELIEVE what I ate this time. *laughs, then groans*",
      "So there's this new sushi place that opened next to the gas station— yes I know, I KNOW.",
      "Remember me? Third time this month! I brought donuts for the nurses. ...I can't eat them though.",
    ],
    replies: [
      "In my defense, the Yelp reviews were MOSTLY positive.",
      "My wife says I have an iron stomach. Well, iron rusts too apparently! *laughs*",
      "You know what, put me on a frequent flyer plan. I'll be back.",
      "The food was actually delicious! For about 20 minutes. Then... well, you know.",
    ],
  },
];

/** Pick a random preset. If `forceDangerous` is true, always picks a dangerous one. */
export function pickRandomPreset(forceDangerous?: boolean): NpcPreset {
  if (forceDangerous) {
    const dangerous = NPC_PRESETS.filter((p) => p.dangerous);
    return dangerous[Math.floor(Math.random() * dangerous.length)]!;
  }
  return NPC_PRESETS[Math.floor(Math.random() * NPC_PRESETS.length)]!;
}
