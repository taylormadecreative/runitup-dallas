# App Review Reply (paste into App Store Connect)

Re: Submission dd588492-59eb-495c-b821-253dc2834e60 — Guideline 2.1(a)

Hi Review Team,

Thank you for the detailed feedback. You're right — Apple and Google sign-in were failing on the previous build.

**Root cause:** The prior build used a web-based OAuth redirect that did not reliably return to the app. On iOS this meant the browser opened but the session never exchanged back into the app.

**Fix in this build:**
- Apple Sign-In is now implemented as **native Sign in with Apple** using the Authentication Services framework (via `@capgo/capacitor-social-login`). The identity token is exchanged with our backend (Supabase) for a session.
- Google Sign-In is now implemented using the **native Google Sign-In SDK** for iOS, also exchanging an ID token with our backend.
- The `Sign in with Apple` capability has been added to the App ID and entitlements.
- A custom URL scheme (`com.runitupdallas.app`) has been registered as a deep-link fallback.

We've tested both flows on a physical iPhone running iOS 26.4 and confirmed successful sign-in, account creation, and return visits with both providers. Email/password sign-in also continues to work.

Thank you for your time reviewing this resubmission.

Nelson Taylor
Run It UP! Dallas
