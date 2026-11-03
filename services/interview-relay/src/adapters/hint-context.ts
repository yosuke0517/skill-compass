import { Buffer } from "node:buffer";
import { hintInstruction, type Turn } from "../shared.js";

// Conservatively bound the entire prompt in UTF-8 bytes, not only character count.
export function boundedContext(turns: Turn[]) {
  const copy = turns.slice(-6).map((t) => ({ ...t, text: t.text.slice(-500) }));
  const input = () => ({ latestUtterance: copy.at(-1) ?? null, immediatelyPrecedingUtterance: copy.at(-2) ?? null, olderContext: copy.slice(0, -2) });
  while (Buffer.byteLength(hintInstruction + JSON.stringify(input()), "utf8") > 1800 && copy.length) {
    if (copy.length > 1) copy.shift();
    else copy[0].text = copy[0].text.slice(20);
  }
  return input();
}
