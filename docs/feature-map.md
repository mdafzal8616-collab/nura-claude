# NURA feature map (Clean V1 restructure, 2026-09-21)

> **Superseded 2026-09-22**: navigation is now 3 tabs — **Life · Library · Hamdard**. Today→Life (same `home` view). Deen, Dunya and Progress below are no longer tabs; every screen they name is unchanged and still reachable, now through **Library** (search + Pray/Read/Learn/Focus/Sleep/Recover/Save groups) instead. See `docs/decisions.md`, 2026-09-22 entry, for the current structure and the Companion Engine additions (Day Rescue, energy check-in, learned session length). This file is kept for the reasoning behind the Deen/Dunya grouping choices below, which still hold — only the top-level nav around them changed.

Five tabs: **Today · Deen · Dunya · Progress · Hamdard**. Profile and settings sit behind the avatar in every header. Nothing below was deleted with user data; only entry points moved.

| Old feature / screen | New home | Action | Reason |
|---|---|---|---|
| Home (day timeline, Next Salah, salah flow, progress ring) | **Today** | KEEP, add Top priorities + Quick log | It already answered "what now?"; priorities and quick capture make the next step explicit |
| Home "Today's Progress" pop-up / weekly report modal | **Progress** tab (Today · Week · Patterns) | MOVE (modal removed) | One place for reports instead of a pop-up |
| Home 7-day graph, static journey art | – | REMOVED earlier | Fake/decorative |
| Sunnah tab (Routine, Akhlaq, Duas, Quran, Hadith & Quiz) | **Deen** | RENAME + REGROUP | Four areas instead of five sub-tabs |
| – Prayer times, Next Salah, weekly Salah | Deen → **Salah** (new panel) | NEW (reuses existing stores) | Salah had no home of its own |
| – Quran (all 114 surahs) | Deen → **Qur'an** | KEEP | unchanged |
| – Routine (Sunnah sections), Akhlaq, Duas | Deen → **Practice** (Sunnah · Akhlaq · Duas chips) + "Sunnah Today" | MERGE under one tab | Same purpose: daily practice |
| – Hadith & Quiz | Deen → **Learn** (+ Save, "Apply today", summary) | RENAME + extend | Read → Save → Learn → Apply |
| Duniya tab (Today card, Quick Actions, 10 Life Areas) | **Dunya**: 4 groups | RESTRUCTURE | Removed the duplicate quick-action grid and the redundant "Today" card |
| – Study & Focus, Plan My Day, Productivity | Dunya → **Focus & Study** | MOVE | |
| – Sleep, Fitness | Dunya → **Health & Energy** | MOVE | |
| – Phone Control, Habits & Discipline, Recovery, Mental Wellbeing | Dunya → **Discipline & Mind** | MOVE | Recovery's second entry (inside Habits) removed: one feature, one place |
| – Career & Skills, Money Habits, Personal Growth | Dunya → **Future & Skills** | MOVE | |
| AI Chat ("Bhai") | **Hamdard** | RENAME | Same scripted support, one name |
| Vault (private reflections) | Hamdard → "Private reflections" | MOVE (no longer a section) | Reached from Hamdard only |
| More tab | Profile (avatar) | REMOVE tab | Profile, prayer times, priorities, data controls live behind the avatar |
| "Today's Coins" card | – | REMOVED from UI (data kept) | Gamification with no practical use |
| What NURA Knows About Me | Profile → **How NURA Understands Me** | RENAME + controls | Data used, permissions, guidance level, delete learned data |
| Feature Status list | Profile | KEEP | Honest status |
| Shield modal | inside Hamdard/Recovery only | KEEP (not on Today) | Was never on Today; stays contextual |

## New in this restructure
- Onboarding: name → one Deen priority → one Dunya priority → prayer times (each optional to skip, saved at once, resumes, never repeats).
- Today: 3 priorities (Deen / Dunya / optional personal), Quick log (Salah, Qur'an, Hadith, study, workout, sleep, money, urge, mood, habit).
- Event model (`nc_events`, `NuraEvents`): typed, timestamped events mirrored from every progress record plus direct sleep/urge/recovery events. Input for the Personal Pattern Engine (not built yet).
- Guidance level preference (`guidanceLevel`) stored for the future recommendation system.

## Not built yet (marked honestly)
- Pattern calculations, Personal Pattern Map, recommendations (Phase 3).
- Android usage signals / interventions (Phase 4, needs explicit permission).
- Hamdard context integration / predictive help (Phase 5); Hamdard is still scripted.
- Daily-life Sunnah entries (need verified sources), Qur'an translation permissions, Qur'an audio.
