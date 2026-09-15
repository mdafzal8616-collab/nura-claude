# NURA (Claude build) — Status

Last updated: 2026-09-15. Independent build, separate from Codex's NURA (see `CLAUDE.md` Section 0 and 14).

**Live:** https://mdafzal8616-collab.github.io/nura-claude/

## Implemented (built and tested this session)

- Nav shell: Home / Sunnah / AI Chat / Vault / More
- Home: add/complete/reschedule/delete tasks, 20-minute focus timer with pause/stop, honest completion check on timer end (asks yes/no, doesn't auto-mark done)
- Sunnah → Routine: 11 time-of-day sections, collapsible, tap-to-complete
- Sunnah → Akhlaq: 8 character actions, tap-to-complete
- Sunnah → Duas: 11 categories, search, favorites (persisted), category → list → detail navigation, copy/share — 6 duas verified against named citations (Bukhari 6306, 6369, Hisnul Muslim, Abu Dawud/Tirmidhi); remaining categories honestly empty pending verified content
- Sunnah → Quran: daily Arabic verse, fetched from Tanzil Project (verified, CC BY 3.0, attributed)
- Sunnah → Hadith & Quiz: one verified hadith (Bukhari 1 / Muslim 1907 / Nawawi40 1), multiple-choice quiz, one-time coin award (anti-farming: coins only awarded on first correct answer)
- AI Chat: scripted guided-support flow (5 situations), clearly labeled as not real AI
- Shield: manual 30-second in-app pause, reason capture, grounding text, route back to tasks — clearly labeled as prototype, no device-level anything
- **Vault: real AES-GCM 256 encryption (Web Crypto, PBKDF2 150k iterations)** — 4 sections (Hamdard/Private Reflection, Trigger & Struggle Notes, Career Audit, Personal Code/Principles), full entry CRUD, search, lock/unlock, change passphrase, forgot-passphrase erase flow. Verified genuinely encrypted at rest (inspected raw localStorage), verified session-only key (re-locks on every reload). Not independently security-audited — stated plainly in-app.
- More: profile name, coins display, JSON data export, delete-all-data, feature status list

## Not tested yet

- Real Android phone (Vivo Y19e / Y31 5G) — only tested in desktop/mobile-emulated browser so far

## Not built (planned, not disguised as done)

- Full Quran (114 surahs, search, translation, audio, offline)
- Duas: Morning, Evening, Salah, Protection, Travel, Daily Life categories still empty (structure ready, content not yet verified)
- Prayer time calculation (manual location/method/adjustments)
- Real on-device or cloud AI for Bhai
- Native Shield (app detection, overlays, blocking) — Android/iOS native work, not a website
- Vault biometric unlock, independent security audit
- Notifications
- Ads, subscriptions, coin redemption, owner dashboard — business terms undecided

## Blocking / needs owner input

- Hadith/Duas library expansion needs a named content reviewer (same open question as the sibling `nura-app` project)
