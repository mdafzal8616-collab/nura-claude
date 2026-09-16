# Decisions Log

Record decisions here as they're made, newest first.

## 2026-09-16 — First real Quran translation added (Al-Baqarah 2:285–286)

The "last two verses of Al-Baqarah" item now shows an actual English translation alongside the Arabic, not a placeholder. Pulled directly from Quran Foundation's public API (api.quran.com, no key needed, confirmed CORS-open, confirmed same 6,236-verse count as Tanzil) — Saheeh International translation, a widely used and respected English rendering. Fetched via curl and hardcoded into this one item (not yet a live API integration for the whole app); clearly attributed to both the Arabic source (Tanzil) and the translation source (Saheeh International / api.quran.com) separately, so it's clear which part comes from where.

This is the first real translation anywhere in the app — the Ayat al-Kursi items (Before Sleep, Morning/Evening Adhkar, after-salah dhikr) still say "translation not yet added" and are natural next candidates using the same process.

Tested: translation displays correctly under the Arabic and transliteration, correct attribution shown, no regressions to any other Sunnah tab or nav destination, zero console errors.

## 2026-09-16 — Source and hadith added to "Recite the last two verses of Al-Baqarah" (Before Sleep)

Added an expandable "Source" panel to this Routine item, same pattern as the other dhikr items: (1) the hadith on its virtue — "Whoever recites the last two verses of Surat al-Baqarah on a night, they will be sufficient for him" (Sahih al-Bukhari 5009, Sahih Muslim 807, narrated by Abu Mas'ud), and (2) the actual verse text, Al-Baqarah 2:285–286, pulled directly from the already-verified Tanzil file (not re-typed) since the item is specifically about reciting them.

Tested: expands correctly showing both the hadith and the verse text with correct sources, checkbox still works independently, no regressions elsewhere, zero console errors.

## 2026-09-16 — Customizable focus timer duration

Home's focus timer was fixed at 20 minutes. Added a duration picker (chips for 5/10/15/20/25/30/45/60 min, plus a custom number input for 1-180 min) shown above the clock. Choice persists (`nc_focus_duration`) and is used for every future session until changed. Locked (chips and custom input disabled, with a toast if someone tries anyway) while a session is running or paused, to avoid corrupting an in-progress timer — only changeable when the timer is at Ready/full duration.

Tested: default 20 min correct on first load, preset selection updates clock/button/storage together, custom input works and correctly shows no preset as falsely active, both are disabled mid-session and stay at the chosen duration through pause/resume/stop, the chosen duration persists across a real reload, no regressions to any other screen, zero console errors.

## 2026-09-16 — Hadith & Quiz: continuous "Next lesson" flow + 4 more lessons (8 total)

Per feedback: after answering a quiz, a "Next lesson →" button now appears below the feedback so lessons chain together instead of requiring Back → pick next item each time. On the last lesson it shows "Back to lessons" instead of looping or dead-ending.

Added 4 more verified lessons: "Wanting for Others What You Want for Yourself" (Bukhari 13, Muslim 45), "Small and Steady Beats Big and Occasional" (Bukhari 6464), "Gentleness Is Not Optional" (Sahih Muslim 2592), "What Real Richness Is" (Bukhari 6446, Muslim 1051) — 8 lessons total now, each independently verified, none overlapping with hadith already used in Akhlaq/Duas citations.

Tested: full chain-through of all 8 lessons via Next, correct/wrong answers both handled properly (confirmed by testing a case where the same click sequence produced one wrong answer — no coins awarded for that lesson, checkmark still shown as completed), "Back to lessons" on the last one returns to the list, checkmarks and coin total (70, matching 7 correct × 10) persist across a real reload, no regressions, zero console errors.

## 2026-09-16 — Hadith & Quiz expanded to 4 lessons

Converted the single hardcoded hadith into a browsable list (Sunnah → Hadith now shows a list of lessons, tap one for the full lesson + quiz, back button returns to the list; completed lessons show a checkmark). Added 3 new lessons, each verified before use: "The Believer's Affair Is All Good" (Sahih Muslim 2999 — gratitude in ease, patience in hardship), "The Company You Keep" (Bukhari 2101/5534, Muslim 2628 — the musk-seller/blacksmith comparison), "Faith Includes the Small Things" (Sahih Muslim 35 — faith's branches, from the declaration of belief down to clearing harm off a road).

Tested: all 4 lessons list and open correctly, each shows correct Arabic/text/explanation/quiz, answering awards coins once only (re-clicking an answered quiz does not re-award — confirmed directly), back navigation works, completed-lesson checkmarks and coin total both persist across a real reload, no regressions to Routine/Akhlaq/Duas/Quran/Vault/Home, zero console errors.

## 2026-09-16 — Daily-life dua batch (8 new, verified)

Md Afzal asked for "24 hours life duas" / "a2z duas" — a full Hisnul Muslim-style compilation (~268 duas). Flagged honestly that verifying every one properly (the same process used throughout) isn't realistic in one pass, and did a solid batch of the most common daily situations instead: entering/leaving the bathroom (Bukhari 142/Muslim 375; Abu Dawud 30), wearing new clothes (Abu Dawud/Tirmidhi, hasan), entering home (Abu Dawud 5096), calming anger (Bukhari/Muslim, agreed upon), the sneezing exchange (sneezer/listener/reply, Sahih al-Bukhari), seeing something pleasing (Ibn Majah, Hisn al-Muslim 218), and a second Stress/Anxiety entry for general distress (Bukhari/Muslim, narrated by Ibn ‘Abbas). Daily Life category went from 1 dua to 8; Stress/Anxiety from 1 to 2.

This is still not the full ~268-dua compilation — more can be added the same way (bathroom-adjacent etiquette, weather duas, illness/visiting the sick, marketplace, marriage, etc.) whenever wanted. Tested: all 8 render and expand correctly in the Daily Life category, sneezing's 3-part exchange displays correctly, everything persists across reload, no regressions, zero console errors.

## 2026-09-16 — All remaining Duas categories filled

The 6 categories that were "structure ready, pending verified content" now each have a real, cited dua: Morning (Asbahna..., Sahih Muslim 2723 — same content already used in Routine's Morning Adhkar, cross-referenced not duplicated effort), Evening (Amsayna..., same hadith), Salah (dua after hearing the adhan, Sahih al-Bukhari 614), Protection (seeking refuge in Allah's perfect words, Sahih Muslim 2708a), Travel (the setting-out dua, Sahih Muslim 1342, itself echoing Qur'an 43:13-14), Daily Life (leaving home, Sunan Abi Dawud 5095 / Tirmidhi 3426, graded hasan by at-Tirmidhi — noted as such). All 11 Duas categories now show real content; none read "Pending" anymore.

Tested: category grid shows correct counts for all 11, each new category's detail view renders Arabic/transliteration/meaning/source correctly, search finds the new content, everything persists across a real reload, no regressions to Routine/Akhlaq/Quran/Hadith/Vault/AI Chat/Home, zero console errors.

## 2026-09-16 — Hadith citations added to Akhlaq, plus 3 new self-improvement items

Same expandable "Source" pattern as the Routine dhikr work: all 8 existing Akhlaq items now have a real citation (Arabic, transliteration, meaning, hadith reference) instead of being a bare label. Added 3 new items for self-improvement, each also cited: "Seek a little knowledge today" and "Help someone today" (both from the same hadith, Sahih Muslim 2699a — noted honestly as the same source rather than presented as two separate ahadith), "Aim for good character, not just correct actions" (Bukhari 3559), "Make sure your neighbor is safe from your harm" (Sahih Muslim 46). 11 items total now.

Citations verified via web search against sunnah.com/named hadith numbers before use: Bukhari 6136/6475 & Muslim 47 (speak good or silent), Bukhari 6540 & Muslim 1016 (charity even half a date), Muslim 2699a (helping others / seeking knowledge), Bukhari 6114 & Muslim 2609 (anger), Tirmidhi 1956 (smiling is charity, graded hasan gharib by at-Tirmidhi — noted as such, not claimed sahih), Abu Dawud 4811 (gratitude), Bukhari 6474 (guarding the tongue), Abu Dawud 2149 (lowering the gaze — cited without an authenticity-grading claim, since one wasn't independently confirmed), Bukhari 3559 (character), Muslim 46 (neighbor's safety).

Tested: all 11 render, citations expand/collapse correctly with real content, checkbox works independently of expand state, state and completion persist across a real reload, no regressions to Routine/Duas/Quran/Hadith/Vault/Home, zero console errors.

## 2026-09-16 — Hadith citations added to after-salah, morning, and evening dhikr in Routine

Enriched Routine items with real, cited dhikr content (expandable "Source" panel under each item, Arabic + transliteration + meaning + citation) rather than just a bare label:
- "Dhikr after salah" added to all 5 prayer sections (Fajr, Dhuhr, Asr, Maghrib, Isha) — a 3-part set: "Allahumma antas-salam..." (Sahih Muslim 592), the 33/33/33 tasbih + completion phrase (Sahih Muslim 597a), and reciting Ayat al-Kursi after each prayer (An-Nasa'i, Al-Kubra 9848, graded sahih by An-Nasa'i and Ibn Hibban).
- Morning Adhkar's "Morning dhikr" enriched with "Asbahna wa asbahal mulku lillah..." (Sahih Muslim 2723); Evening Adhkar's "Evening dhikr" with its "Amsayna..." counterpart (same hadith, evening wording — not a separately-verified citation, noted honestly as such rather than invented).
- Ayat al-Kursi items (Before Sleep, Morning Adhkar, Evening Adhkar, and inside the after-salah set) use the verse text pulled directly from the already-verified Tanzil file (2:255), not re-typed from memory. No translation of the full verse is included yet — same known gap as the Quran module generally.

All content cross-checked via web search against named hadith numbers before use, same process as the earlier Duas/Hadith verification. Tested: expand/collapse per item, checkbox still works independently of the expand state, state persists across re-render and a real page reload, all 5 prayer sections show the new item, no regressions to Akhlaq/Duas/Quran/Hadith/Home, zero console errors.

Not yet done (next, per the user's own ordering): hadith under each Akhlaq item + more self-improvement items; remaining Duas categories; more Hadith & Quiz lessons; fuller Quran section.

## 2026-09-15 — Vault module built (real encryption)

Full feature: 4 sections (Hamdard/Private Reflection, Trigger & Struggle Notes, Career Audit, My Personal Code/Principles), create/open/edit/delete entries, search across decrypted entries, entry previews with date/time, proper empty states, working back navigation, lock/unlock, change passphrase, clear vault, forgot-passphrase (erase-and-restart, since recovery is genuinely impossible by design).

Encryption is real, not simulated: AES-GCM 256 via the browser's native Web Crypto SubtleCrypto API, key derived from the passphrase with PBKDF2 (150,000 iterations, SHA-256). The passphrase is never stored; the derived key lives only in memory for the unlocked session and is gone on lock or reload — verified directly (confirmed Vault re-locks itself on every page reload and correctly rejects a wrong passphrase). Verified entries are genuinely encrypted at rest by inspecting raw localStorage content directly (no plaintext present). Vault settings screen states plainly this has not been independently security-audited — no "military-grade" or "100% secure" language anywhere.

Two real bugs were found during testing and fixed before shipping:
1. Changing the passphrase re-encrypted entries as brand-new records instead of replacing the originals, leaving the old entries (still encrypted under the old key) orphaned in storage.
2. That orphaned data then caused the *next* unlock attempt to fail and misreport "Incorrect passphrase" even when the passphrase was correct, because one entry's decryption failure was short-circuiting the whole unlock. Fixed by isolating the passphrase-check failure from individual entry-decrypt failures, and by clearing old ciphertext (sequentially, not in parallel, to avoid a read-modify-write race) before re-encrypting under the new key.

Tested end-to-end: setup, wrong-passphrase rejection, correct unlock, create/edit/delete entries, decrypted data survives a real page reload requiring the passphrase again, search, change-passphrase (old passphrase correctly stops working, new one correctly works, data intact, no duplication), forgot-passphrase erase flow, and no regressions to Home/Sunnah/Duas/AI Chat/More.

## 2026-09-15 — Duas module built (Sunnah → Duas)

Full feature: 11 categories, search, favorites (persisted), category → list → detail navigation, large-Arabic detail view, copy/share. Content: 6 duas verified against named citations before use (cross-checked via search against sunnah.com/standard hadith numbering, not generated from memory) — Sayyidul Istighfar (Bukhari 6306), anxiety/sorrow dua (Bukhari 6369), waking-up and before-sleep duas (Hisnul Muslim), before/after eating (Abu Dawud/Tirmidhi). Remaining 7 categories (Morning, Evening, Salah, Protection, Travel, Daily Life) intentionally left empty with an honest "pending verified content" state — structure is ready, content was not rushed. Tested: category grid, list, detail, Arabic rendering, favorite toggle + persistence, search (text and favorites-only), copy button (no crash; real clipboard write untestable headless but error-handled), no regressions to Home/Sunnah other tabs/More.

## 2026-09-15 — Project started: independent Claude build, separate from Codex's NURA

Md Afzal gave a full master prompt establishing this as an independent build of NURA, separate from an existing, more advanced Codex-built version (elsewhere on this machine, not read or copied from). Full original prompt text preserved below verbatim for exact wording (CLAUDE.md summarizes it but defers to this on any conflict).

First build scope agreed: nav shell (Home/Sunnah/AI Chat/Vault/More), Home task list + focus timer with honest completion check, Sunnah routine sections + one Hadith lesson/quiz, AI Chat and Vault as clearly-labeled prototype placeholders, Shield as a manual in-app pause demo only.

Hadith sourcing decision: no reviewer is named and no hadith database exists in this project, so rather than invent or guess at less-common hadith, the first lesson uses exactly one hadith so universally known that misquoting risk is effectively zero — "Actions are judged by intentions" (Sahih al-Bukhari 1 / Sahih Muslim 1907), standard published translation, clearly sourced. Expanding the hadith library beyond this stays blocked on naming a reviewer, same open question as the sibling `nura-app` project.

---

### Full original master prompt (verbatim, as given 2026-09-15)

> NURA — Claude Code master prompt
>
> Copy everything below into Claude Code. This is the owner's product brief, not a claim that the requested features are already implemented.
>
> ---
>
> You are building YOUR OWN INDEPENDENT VERSION of NURA for me. Act as a practical product developer and an honest thinking partner. Explain things in simple English. Do not promise perfection or spend hours pursuing an unproven dependency without showing me the blocker.
>
> ## 1. Two separate builds — important
>
> Codex is continuing one NURA app. You, Claude Code, must build a separate NURA app from the same product vision. These are independent versions, not two agents working on one repository.
>
> - Use a new folder, repository, deployment and app-data namespace, such as `nura-claude` and `nura-claude-v1-*`.
> - Do not edit, replace, connect to, deploy over or automatically merge the Codex version. Do not use its hosting credentials or project identity.
> - Do not assume you can read Codex's conversation, files, tools or current app. Use this prompt and whatever I explicitly provide. If I provide reference code, copy it into your own project before modifying it; do not alter the original.
> - Do not set up shared databases, automatic synchronization or communication between the two builds. I may compare them later. Integration requires a later explicit request.
> - You may improve the implementation and design, but do not silently remove confirmed product requirements. Separate "first release" from "planned later."
>
> ## 2. The product
>
> Name: **NURA**. Tagline: **Your Daily Companion & Habit Space.**
>
> NURA is a **Deen + Dunya daily companion** for young Muslims. Islam is its foundation, but it must not become only a Quran, Salah or religious-content library. The user has one connected life: faith, studies, work, health, habits, family, emotions and purpose affect each other.
>
> The audience is mainly Gen Z, both boys and girls. Initial testing is in India, with a worldwide Muslim audience as the longer-term vision. Do not assume everyone has an expensive phone, fast internet or the same religious practice. The app interface must be in English; authentic Arabic religious text can appear with English meaning and optional transliteration.
>
> Support areas include prayer and connection with Allah, unwanted pornography use and masturbation, smoking/vaping, excessive phone/social-media use, gaming, procrastination, studying, career, sleep, fitness, eating habits, anger, stress, confidence, discipline, loneliness, relationships, time management and lack of purpose. These are connected goals, not an instruction to claim the app can medically treat every problem.
>
> ## 3. How NURA helps
>
> Use this pattern: **understand what happened → offer a realistic next action → give relevant Islamic support when useful → help the user act → follow up with permission.** Do not force a religious lecture into every response.
>
> Example: "I wasted my day." Ask what still matters today, help choose one task, start a 20-minute focus session, and ask afterwards whether it was actually completed. Do not mark work done merely because a timer ended.
>
> Example: "I feel like smoking." Offer a short delay, changing location and an alternative action; let the person record the trigger and check whether the urge changed. Explain when professional cessation support would help. Do not pretend a breathing timer is a complete cessation programme.
>
> Example: "I am getting an urge to watch pornography." Offer immediate practical choices such as putting down the phone, leaving the triggering situation, starting the optional pause, opening a chosen goal or contacting a trusted support person. Do not shame or diagnose the person. Never claim NURA secretly knows what they watched.
>
> Be calm, respectful, direct and useful. No guilt machine, fake "truth score," humiliation, invented diagnosis, religious threats or emotional dependency on the AI. Support users' chosen values without making unsupported claims about sexual health. Do not label every sexual feeling or behaviour an addiction. Provide age-appropriate safeguards and routes to qualified help when needed.
>
> ## 4. Navigation and design
>
> Use five main navigation destinations: **Home / Sunnah / AI Chat / Vault / More.**
>
> - Profile must be easy to find through a header avatar and/or More.
> - Do not restore the rejected Home/Habits/large-plus/Bhai/Profile navigation.
> - Do not duplicate Hamdard in several places. Hamdard is the private-reflection idea within Vault, not several repeated tabs.
> - Do not make "Reset" a main tab or constantly show a Reset button. A useful recovery flow may help someone resume or reschedule; it must not erase missed work or pretend a tap completes it.
> - No creator feed, reels feed, public social network or endless scrolling. NURA should help users leave the app and do real things.
> - Make it comfortable for Gen-Z boys AND girls, without gender stereotypes. Use clean typography, generous touch targets, clear icons with labels, strong contrast and accessible text sizes.
> - A calm midnight/dark background with mint or green accents and a light evergreen alternative are reference directions, not proven preferences. Do not slavishly copy old orange Aethel screenshots, gold-heavy posters or generated image mistakes.
> - Keep screens understandable on budget Android phones and desktop. Show loading, empty, error, offline and permission-denied states. Avoid clutter, repeated cards, decorative dashboards and excessive animations.
>
> ## 5. Home — practical daily action
>
> Show the next useful action, today's real tasks, relevant prayer information and a small progress summary. Include creating/editing tasks, dates and optional times, realistic daily habits, study/career/health goals, a focus timer, pause/stop and an honest completion check. Allow rescheduling without destroying history. Make unfinished work easy to find again.
>
> Progress should reflect recorded actions, not guessed behaviour or a score of someone's faith. Useful weekly summaries should explain one pattern and one next step, not create impressive-looking but unsupported statistics.
>
> ## 6. Sunnah — a usable day, not a giant checklist
>
> Inside Sunnah, provide clear sections for **Routine / Akhlaq / Duas / Quran**, with Hadith learning and Quiz visibly accessible from Sunnah and a Home shortcut.
>
> Routine should support waking, Fajr and relevant remembrance, morning adhkar, Ishraq/Duha when applicable, Dhuhr, Asr, evening remembrance, Maghrib, Isha, bedtime and Friday practices. Organize by time/context, let users select manageable practices, and distinguish obligatory worship, Sunnah, optional practices and personal goals. Do not make every user complete sixty items per day.
>
> Each religious practice needs a reliable source and appropriate wording. Do not copy fixed dhikr counts, promised benefits or rulings from mockups without verification. Allow legitimate differences in practice, including prayer calculation method and Asr convention. Do not issue unsupported rulings about exemptions; practice-aware options should be private and reviewed.
>
> Prayer times should support manual city/location entry, time zone, calculation method and adjustments. Explain that users should compare with their local mosque. Location must not be requested unnecessarily. No promise of accurate background prayer alarms until actual device testing.
>
> Akhlaq covers practical character actions: kindness, honesty, respect, service, cleanliness, family responsibilities and helping others. Do not turn these into public piety rankings.
>
> Duas need Arabic text, English meaning, source, clear context, optional transliteration and useful bookmarks. Quran's goal includes all 114 surahs, search, readable Arabic, licensed translations, bookmarks, reading progress and eventual offline text/audio. Prove content access, accuracy and licensing before building a huge integration. An external Quran link is not an offline Quran reader.
>
> ## 7. Hadith learning, quizzes and rewards
>
> Provide short sourced Hadith lessons, an understandable explanation, a multiple-choice question, feedback explaining the answer, and a practical action. This is an important feature, not something to omit.
>
> Award learning coins/points transparently; prevent repeat-answer farming. Coin redemption, monetary value and partnerships are UNDECIDED. Do not invent cash rewards, spiritual reward amounts, purchases or guaranteed earnings. Prefer meaningful learning over pressure, gambling-like mechanics or addictive loops.
>
> ## 8. AI Chat — Bhai
>
> Bhai is the approachable companion inside AI Chat, with an optional avatar. It should help with Deen AND Dunya, remember only what the user permits, offer small action plans and connect useful suggestions to app actions.
>
> The intended direction is **on-device/local AI for sensitive personal interactions**. Cloud AI must not silently receive journal entries, chats, urges, photos or other private data. Do not confuse local storage with local inference. If a device cannot run an adequate model, provide clearly labelled guided support rather than secretly switching to cloud processing.
>
> Test a small model on the actual budget phone. Measure download size, compatibility, response time, memory, heat, battery, English answer quality, offline operation and failure recovery. Never claim ChatGPT-level performance from a tiny model. Curated replies are not an LLM. Model choice and successful device support remain undecided.
>
> Religious quotations must come from reviewed sources, not generated memory. Bhai is not a mufti, doctor or therapist. Voice input/output is a retained future option; do not add microphone access or cloud transcription without disclosure and consent.
>
> ## 9. Shield — a feature, not the entire app
>
> Shield supports unwanted habits and distraction. Its design may include a voluntary 30-second pause, a personal reason to stop, a short grounding action, a route back to a goal, and access to support.
>
> The optional reminder photo must be genuinely optional, easy to remove and stored privately. Do not default to a family photo or use it to humiliate the user. Words or a neutral image must work too. Never automatically tell family or friends about a user's behaviour.
>
> Separate these technically different things:
>
> 1. A manual pause INSIDE NURA, which a website can demonstrate.
> 2. Detecting a selected Android app/session with explicit permission.
> 3. Estimating reel transitions using an app-specific, tested method. A scroll event is not proof of a watched reel.
> 4. A permitted screen overlay or system restriction. An overlay may not pause underlying audio/video.
> 5. Blocking known adult domains, which does not identify every post inside encrypted social feeds.
>
> A normal web link cannot monitor and control Instagram or YouTube across the phone. Never market universal porn detection, exact reel counts or unbreakable blocking without evidence. Android and iOS require separate native implementations and policy review.
>
> For the first Android proof: one selected app, one explicit user-selected rule, one intervention, visible stop controls, clear permission disclosure, cleanup on exit/lock/revocation and no interference with emergency calls. Keep AI out of accessibility control. Avoid raw screen text/screenshots, hidden surveillance and unnecessary permissions.
>
> Evaluate real reliability before expanding. If counting fails, offer an honest session timer rather than a fake counter. If local AI fails, keep labelled guided support. Do not ask users to root, unlock bootloaders or disable security protections.
>
> ## 10. Vault / Hamdard and privacy
>
> Retain private reflection, trigger/struggle notes, career audit and a personal code/principles. Users need clear storage explanations, lock/unlock, export, deletion and recovery limitations. Encryption must actually be implemented and tested; a padlock or "AES active" label proves nothing.
>
> Separate encrypted Vault content from ordinary planner records. Do not claim all data is encrypted when only journals are. Explain what happens if a passphrase is lost, browser storage is cleared or a phone is replaced. Consider optional biometric access later; do not fake it.
>
> No ads or third-party tracking inside private conversations, urges or journals. Avoid exporting intimate fields into analytics or crash logs. Do not promise "100% private" or "nothing ever leaves the device" without auditing hosting, backups, transfers, model calls and SDKs. HTTPS protects transport; it does not automatically create cross-device sync or complete privacy.
>
> ## 11. More, profile and notifications
>
> More includes profile, appearance, prayer settings, reminders, privacy, data export/delete, reports/history, clear feature status, support and future subscription/book access. Keep navigation simple.
>
> Notifications are optional and category-controlled, with quiet hours, restrained frequency and neutral lock-screen wording. No private behaviour exposed on a lock screen. No shame, deceptive urgency or nagging. Scheduled phone notifications need platform-specific implementation and real background/reboot/time-zone tests. An open-browser notification demo is not a reliable native alarm.
>
> ## 12. Owner needs and business model
>
> I want NURA to help users AND become a sustainable business.
>
> - Limited ads are the intended main revenue source, not an already working or guaranteed income stream.
> - Subscriptions are an additional idea. Prices, exact premium benefits and usage limits are not finalized.
> - Licensed books from Islamic authors/influencers may be sold for an agreed commission or included under a negotiated subscription licence. Promotion partnerships are possible. Get explicit rights; never upload someone's book without permission.
> - A creator/social-content feed is specifically excluded even though book partnerships remain possible.
> - A proposed tiny ad shown for 2-3 seconds is NOT a settled, policy-approved ad format. Verify network/store policies and unit economics. Do not interrupt prayer, Quran reading, private support, Vault or an urgent-help flow. No ads disguised as notifications or app buttons.
> - Coin spending/redemption, prices, commission rates, ad provider and legal/commercial agreements remain pending. Do not fabricate them or implement billing without agreement.
>
> Owner controls should eventually support authenticated, bounded remote configuration: enabling approved features, content versions, announcements, ad limits, subscription offers, rollout and emergency disabling of broken features. Include validation, audit history and rollback. Separate admin access from the user app. No hardcoded admin passwords or client-side API secrets. Owner controls must not read journals, silently enable tracking, override user consent or remotely command phones.
>
> ## 13. Research — use evidence honestly
>
> A first survey produced 31 submissions, not 31 verified unique people. Some submissions contain identifiers and repeated identifiers disagree on age/gender. It is not fully anonymous. Small subgroup results do not establish what all boys or girls need. Ask girls/women directly instead of inventing their needs.
>
> Corrected directional findings: small daily plans were selected in 16/31 submissions. Too many ads were selected in 14/28 answers to the question about reasons to quit; three did not answer that question. These support testing simple planning and restrained ads, not claims of product-market fit. Do not infer rates of pornography, smoking or other sensitive problems from this survey. If I provide the corrected report, preserve each question's denominator and missing answers. Do not publish raw responses.
>
> Validate usability with actual people: can they find the next action, start and finish a real task, find Sunnah/Bhai, and return voluntarily? Measure useful actions and voluntary return, not just time spent in the app. Do not assume an attractive screenshot proves a useful product.
>
> ## 14. Reference status of Codex's separate version
>
> This is context only, NOT work completed by your Claude version:
>
> - A plain HTML/CSS/JavaScript prototype currently has tasks/habits, a focus timer, honest completion/rescheduling, seven-day summaries, profile and themes.
> - Sunnah includes starter routines, counters, six sourced lesson/quizzes, five starter dua/remembrance summaries and 114 external Quran links. Full reviewed offline Quran/audio is unfinished.
> - Local prayer calculations use the bundled Adhan library, with manual alternatives and settings.
> - Bhai is written/keyword-routed guided support, not a real local or cloud LLM.
> - Shield is a manual in-app pause, not native monitoring or blocking.
> - Vault uses passphrase-based AES-GCM with encrypted export/import; ordinary planner data is not encrypted. No independent security audit, biometric unlock or cloud sync.
> - Planner backup/restore and reminders exist, but reminders are best-effort while open.
> - Eighteen core/regression automated checks and two LAN-preview server checks passed. That is NOT phone testing or proof of native AI/Shield.
> - No completed native APK, successful on-device AI benchmark, live payments, ad integration or owner dashboard has been established.
> - The LAN preview worked on the PC but phone access was blocked by explicit Windows Firewall rules for the serving runtime. Repeating local-IP links is not the desired long-term workflow. The owner requested stable hosted HTTPS access. Do not claim a hosted version is live unless you verify its deployment result.
>
> ## 15. Current hardware and practical limits
>
> First test phone: Vivo Y19e, Android 15 / Funtouch OS 15, 4 GB physical RAM plus 4 GB extended memory, 64 GB total storage. The owner chose this phone for testing. A Vivo Y31 5G is also available: Snapdragon 4 Gen 2, 6 GB physical plus 6 GB extended memory, 128 GB storage. Extended memory is NOT additional physical RAM.
>
> The PC has an Intel i5-6500T and 8 GB RAM, Windows 10 Pro 22H2. Keep development lightweight; do not assume a heavy emulator will run well or that Windows security updates are current. Do not recommend buying hardware before testing a small proof.
>
> ## 16. Your first deliverable and workflow
>
> My immediate requirement is a normal HTTPS link that opens your independent version on both phone and PC, without the developer PC staying on, matching Wi-Fi, USB debugging, firewall changes or an expiring local tunnel. Do not promise that hosting includes unlimited usage or costs nothing; verify the chosen provider. Ask before paid plans, subscriptions, purchases or changing public/private access. If hosting requires my account or login, tell me the exact short step, not hours of speculative setup.
>
> Begin with a responsive, useful web prototype with working navigation, one real daily-task/focus flow, a small reviewed learning flow and honestly labelled guided support/Shield demo. Keep every other confirmed feature visible in the backlog, not disguised as complete. Native cross-app Shield and on-device AI require later separate proofs; a website deployment does not implement them.
>
> Before each substantial feature, briefly tell me: what you will build, what it needs from me, likely costs/permissions, its real limitations and how you will prove it works. Ask only questions that genuinely block progress. Do not make me answer five questions before every small action.
>
> Use the simplest maintainable implementation that fits the need. Preserve user data and working features. Use dummy data for testing. Never publish secrets, survey answers, journal exports or personal screenshots in the repository or deployment. Verify source/API access and licence before spending hours building an integration. Set a short proof-of-concept time limit and stop or change approach when the prerequisite fails.
>
> For each delivery, distinguish **implemented / tested / not tested / blocked / planned**. Provide the actual working URL when deployment succeeds; never invent a URL. A phone screenshot is useful visual feedback, not proof of native permissions or model performance. Check mobile layout, navigation, error handling, data persistence, accessibility and unsupported feature messages.
>
> Start by stating what you understand, where your separate project will live, the smallest first build and any genuinely blocking requirement. Then build YOUR NURA version without modifying or connecting to Codex's NURA.
