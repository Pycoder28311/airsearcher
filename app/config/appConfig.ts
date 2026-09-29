/**
 * What the framework loads when the app starts. AirSearch has no login and
 * no generic data tables, so both are off; set one to true to load it again.
 */

/** Asks `/api/session` for the signed-in user (the navbar's account state). */
export const LOAD_SESSION = false;

/** Asks `/api/prisma-fields` for the table fields `DataForm` and `GridLayout` use. */
export const LOAD_PRISMA_FIELDS = false;
