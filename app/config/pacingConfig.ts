/**
 * How the hidden browser paces its Google Flights searches.
 *
 * Every value here is yours to change: plain seconds, minutes, counts and
 * factors. Each run draws its waits at random from these ranges, so no two
 * runs keep the same rhythm. A change applies to the next run that starts.
 *
 * Slower and more uneven means fewer refusals from Google (its error 13),
 * and longer runs. The home page's time estimate follows these values.
 */
export const pacingConfig = {
  /** The normal wait before each search, in seconds. */
  gap: {
    minSeconds: 2,
    maxSeconds: 5,
    /**
     * How strongly the wait leans towards the short end: 1 spreads it evenly,
     * higher keeps most waits short with now and then a long one.
     */
    skew: 1.2,
  },

  /**
   * Each run's own pace: every normal wait is multiplied by a random factor in
   * this range. 1 and 1 keep the normal wait exactly within `gap`.
   */
  tempo: {
    min: 1,
    max: 1,
  },

  /** Short pauses, taking the place of some normal waits. */
  pause: {
    /** How many: one for every N searches, N drawn from this range per run. */
    everySearchesMin: 4,
    everySearchesMax: 10,
    minSeconds: 10,
    maxSeconds: 20,
  },

  /** Long breaks, like stepping away from the screen, in seconds. */
  longBreak: {
    /** false leaves them out; the values below then wait unused. */
    enabled: true,
    /** One after every N searches, N drawn anew from this range each time. */
    everySearchesMin: 15,
    everySearchesMax: 25,
    minSeconds: 20,
    maxSeconds: 40,
  },

  /** When Google refuses a search, it is tried again after this long, in seconds. */
  retry: {
    /**
     * Refusals in a row one search may get before the run stops: 3 means the
     * first try and two more. 1 stops at the first refusal.
     */
    refusalsBeforeStop: 3,
    minSeconds: 60,
    maxSeconds: 120,
  },
};
