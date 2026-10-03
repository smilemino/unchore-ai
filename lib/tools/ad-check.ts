// Soul «ad-lint» (2026-09-28, rules from the product-shorts pipeline) + English equivalents. Warns only; the member decides.
const RULES: Array<[string, RegExp, string]> = [
  ["Health or cure claim", /(좋아진다|좋아져|개선(된|돼|한다)|회복(된|돼)|치료|낫는|낫습|완치|재생(된|돼)|미백\s*효과|주름이?\s*(펴|사라)|통증이?\s*(사라|없어)|\bcures?\b|\bheals?\b|\btreats?\b|reverses? (aging|wrinkles)|eliminates? (pain|wrinkles)|clinically proven)/gi,
    "Health-effect claims for foods and cosmetics are restricted in most countries (Korea: MFDS; US: FTC/FDA). Describe ingredients or «helps with» instead."],
  ["Exaggeration", /(세계\s*최초|국내\s*최초|100\s*%|백프로|완벽(하게|한)|무조건|보장(합니다|해)|기적|world'?s first|\bguaranteed?\b|\bmiracle\b|\bperfect\b|\bbest ever\b)/gi,
    "Unprovable superlatives break advertising law (Korea: 표시광고법; US: FTC). Use a fact you can show."],
  ["Discount-rate claim", /(\d+\s*%\s*(할인|세일|싸)|\d+\s*%\s*off\b)/gi, "A stated discount must match a real former price for a real period. Safer: «cheaper than …»."],
  ["Income wording", /(돈\s*버는|수익|부업|재테크|make money|passive income|earn \$?\d|side hustle|get rich)/gi,
    "Money and income words trip ad-platform filters, and income claims are regulated for direct selling."],
  ["Deadline in a long-running ad", /(오늘만|내일까지|이번\s*주까지|마감\s*임박|선착순|today only|ends tomorrow|last chance|while supplies last)/gi,
    "Ads that run for days shouldn't carry a date or deadline."],
];

export function adCheck(text: string): string {
  const plain = text.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ");
  const out: string[] = [];
  for (const [rule, re, hint] of RULES) for (const m of plain.matchAll(re)) out.push(`⚠ ${rule}: «${m[0]}» — ${hint}`);
  return out.length ? `${out.length} warning(s) (not blocking):\n${out.join("\n")}` : "No warnings.";
}
