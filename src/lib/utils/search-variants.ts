/**
 * Alternate spellings of a search query, for artists whose names mix digits
 * and words ("2Pac", "twenty one pilots", "21 Savage", "The 1975").
 *
 * Navidrome's search matches literal tokens, so "two pac" and "21 pilots"
 * find nothing even though the artists are in the library. The search page
 * runs these variants as extra searches and matches artists against them.
 */

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function numberToWords(n: number): string {
  if (n < 20) return ONES[n];
  const t = TENS[Math.floor(n / 10)];
  return n % 10 ? `${t} ${ONES[n % 10]}` : t;
}

/** "two pac" → "2 pac", "twenty one pilots" / "twenty-one pilots" → "21 pilots". */
export function wordsToDigits(q: string): string {
  const tokens = q.toLowerCase().split(/\s+|-(?=[a-z])/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const tens = TENS.indexOf(tokens[i]);
    if (tens >= 2) {
      const ones = ONES.indexOf(tokens[i + 1] ?? '');
      if (ones >= 1 && ones <= 9) {
        out.push(String(tens * 10 + ones));
        i++;
      } else out.push(String(tens * 10));
      continue;
    }
    const ones = ONES.indexOf(tokens[i]);
    out.push(ones >= 0 ? String(ones) : tokens[i]);
  }
  return out.join(' ');
}

/** "21 pilots" → "twenty one pilots", "2pac" → "two pac" (numbers 0–99 only). */
export function digitsToWords(q: string): string {
  return q
    .toLowerCase()
    .replace(/\d+/g, (d) => {
      const n = Number(d);
      return n <= 99 && String(n) === d ? ` ${numberToWords(n)} ` : d;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/** Joins a digit to the word after it: "2 pac" → "2pac" (how 2Pac is tagged). */
function glueDigits(q: string): string {
  return q.replace(/(\d+)\s+(?=\p{L})/gu, '$1');
}

/**
 * The query's alternate spellings, excluding the query itself. Empty unless
 * the query contains a digit or a number word, so ordinary searches don't
 * fan out into extra requests.
 */
export function searchVariants(query: string): string[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!q) return [];
  const digits = wordsToDigits(q);
  if (!/\d/.test(q) && digits === q) return [];
  const variants = new Set([digits, glueDigits(digits), digitsToWords(q)]);
  variants.delete(q);
  return [...variants].filter(Boolean).slice(0, 3);
}

/** Lowercase, no spaces or punctuation: "2 Pac" and "2Pac" both → "2pac". */
export function compactName(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').normalize('NFC').replace(/[^\p{L}\p{N}\p{M}]+/gu, '');
}
