import crypto from "crypto";

const WORDS = "kade-stall-print-drop-inkwell-collab-atelier".split("-");

// Temp passwords handed to newly onboarded vendors -- memorable enough to
// read off a screen and relay by phone/message, random enough not to guess.
export function genTempPassword(): string {
  const pick = () => WORDS[crypto.randomInt(WORDS.length)];
  return `${pick()}-${pick()}-${crypto.randomInt(1000, 9999)}!`;
}
