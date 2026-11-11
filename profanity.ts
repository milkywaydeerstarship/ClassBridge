// Lightweight, multilingual-aware profanity and vulgarity filter.
// Censors offensive words with asterisks while maintaining sentence structure.

const BAD_WORDS = [
  // English common profanities & slurs
  "fuck", "fucking", "fucked", "fucker", "fuckers", "motherfucker", "shit", "shitty", "bullshit",
  "bitch", "bitches", "bitching", "ass", "asshole", "assholes", "bastard", "dick", "dicks",
  "pussy", "cunt", "cunts", "cock", "cocksucker", "slut", "sluts", "whore", "whores",
  "nigger", "nigga", "faggot", "fag", "retard", "retarded", "prick", "twat", "wanker",

  // Spanish common vulgarities
  "puta", "puto", "mierda", "coño", "cabron", "cabrón", "pendejo", "pendejos", "chinga",
  "chingar", "culero", "verga", "pinche", "maricon", "maricón", "joder", "gilipollas",

  // French
  "merde", "putain", "connard", "salope", "chier", "enculé", "bâtard",

  // German
  "scheiße", "scheisse", "arschloch", "schlampe", "hurensohn", "fick", "ficken",

  // Portuguese
  "porra", "caralho", "merda", "puta", "foda", "foder", "filho da puta",

  // Italian
  "cazzo", "merda", "stronzo", "troia", "vaffanculo", "puttana"
];

// Build regex matching word boundaries
const ESCAPED = BAD_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
const PROFANITY_REGEX = new RegExp(`\\b(${ESCAPED.join("|")})\\b`, "gi");

/**
 * Replaces recognized profanities with asterisks (e.g. "f***" or "****")
 */
export function filterProfanity(text: string): { cleanText: string; hasProfanity: boolean } {
  if (!text) return { cleanText: "", hasProfanity: false };

  let hasProfanity = false;
  const cleanText = text.replace(PROFANITY_REGEX, (match) => {
    hasProfanity = true;
    if (match.length <= 2) return "*".repeat(match.length);
    return match[0] + "*".repeat(match.length - 2) + match[match.length - 1];
  });

  return { cleanText, hasProfanity };
}
