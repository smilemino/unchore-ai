// Google sign-in keys — named UNCHORE_GOOGLE_* (owner 2026-09-30: «these are Unchore's keys, put Unchore in the name»).
export const googleClientId = () => process.env.UNCHORE_GOOGLE_CLIENT_ID ?? "";
export const googleClientSecret = () => process.env.UNCHORE_GOOGLE_CLIENT_SECRET ?? "";
export const googleOn = () => Boolean(googleClientId());
