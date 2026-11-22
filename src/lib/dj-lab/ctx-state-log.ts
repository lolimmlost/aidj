/**
 * Rate limit for the Lab's AudioContext state log (#438).
 *
 * iOS fires `statechange` on every refused resume, so one state can repeat several
 * times a second: 869 "suspended" lines in one minute on an old iPhone, flooding the
 * Log tab and the server log. Every change is logged (another state, or the set's status
 * changing under it); the same one repeating at most once per window. The next line logged
 * says how many repeats were left out and of which state, since that line can be another one.
 */
export class CtxStateLog {
  private last: { key: string; at: number; folded: number } | null = null;

  constructor(private readonly windowMs = 30_000) {}

  /**
   * `null`: skip this event. Otherwise log it, with how many repeats of the last logged event
   * (`of`) were left out since it was logged.
   */
  next(key: string, now: number): { folded: number; of?: string } | null {
    const last = this.last;
    if (last && last.key === key && now - last.at < this.windowMs) {
      last.folded++;
      return null;
    }
    this.last = { key, at: now, folded: 0 };
    return last?.folded ? { folded: last.folded, of: last.key } : { folded: 0 };
  }
}
