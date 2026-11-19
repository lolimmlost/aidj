/**
 * Rate limit for the Lab's AudioContext state log (#438).
 *
 * iOS fires `statechange` on every refused resume, so one state can repeat several
 * times a second: 869 "suspended" lines in one minute on an old iPhone, flooding the
 * Log tab and the server log. Every change is logged (another state, or the set's status
 * changing under it); the same one repeating at most once per window, reporting how many
 * repeats were folded into it.
 */
export class CtxStateLog {
  private last: { key: string; at: number; folded: number } | null = null;

  constructor(private readonly windowMs = 30_000) {}

  /** `null`: skip this event. A number: log it, with that many repeats folded since the last logged one. */
  next(key: string, now: number): number | null {
    const last = this.last;
    if (last && last.key === key && now - last.at < this.windowMs) {
      last.folded++;
      return null;
    }
    const folded = last?.folded ?? 0;
    this.last = { key, at: now, folded: 0 };
    return folded;
  }
}
