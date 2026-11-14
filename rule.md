# Hackathon rules (codexhack)

Event details + official scoring rubric: [CONTEXT.md](CONTEXT.md) (wins on any conflict).

## Context

- **Challenge:** a mobile app where **AI is essential** to the user outcome, not a bolted-on chatbot.
- **Team of 4:** I am the only coder (with the agent); 3 teammates handle research, user evidence and the pitch. Build capacity = one developer → keep scope tiny.
- **Build 11:00 → 16:00** (tools down, absolute). 5-minute pitch from 16:15. Judges score **evidence, not slides**.
- **Idea:** smart wardrobe & daily outfit app (`idea/`) · **Theme:** everyday life
- **Stack:** Expo (React Native, TypeScript) + Supabase (Postgres, Storage, Edge Functions calling the OpenAI SDK). No LangChain.
- **Demo phone:** iPhone only, Windows only, free accounts → ship with `eas update`, open in **Expo Go** (never from laptop Metro). Rehearse force close → reopen early. Open risk: confirm with organizers that Expo Go counts as "the app"; if a teammate has Android or a Mac, switch to an installed build.
- Blank field blocks a decision → ask once, then proceed under a stated assumption.

## Scoring → what it means for us

1. **Real-phone AI demo (40, all or nothing):** force close → reopen the **installed app on a real phone** → main AI flow runs **live**. Browser, emulator, video, Expo Go on laptop Metro = 0.
2. **Real user problem (35):** named user + pain + **evidence** + AI helps directly.
3. **Market (25):** concrete path to first users + global expansion; real users = bonus.

Priority when short on time: 1 > 2 > 3.

## Hard rules

- Pre-event work is allowed, but README must list **built before 14/11 vs. built today**.
- AI calls are **real and live** at demo time. Never fake the core; mock only the periphery and mark it with a `ponytail:` comment + README note.
- **AI API key never ships in the app** (incl. `EXPO_PUBLIC_*`). App → our backend → AI API. Secrets in backend env / `.env` (gitignored) + `.env.example`.
- Only use code, data, media we have the right to use.
- **No git** (`add`/`commit`/`push`/worktrees), subagents included. At checkpoints, suggest a commit message.
- **No co-author or AI attribution** anywhere: no `Co-Authored-By:` trailers, no "Generated with Claude Code" lines in commit messages, PR descriptions, README or code comments.

## Timeline

| Time | Goal |
|---|---|
| < 11:00 | Accounts, CLIs, API keys, demo phone ready to install builds, install pipeline rehearsed |
| 11:45 | **Skeleton on the real phone:** installed app → deployed backend → AI → result |
| 12:45 | Core AI slice works on the phone and survives close → reopen |
| 15:00 | **Scope freeze** — fixes, polish, evidence, pitch only |
| 15:45 | Final build on demo phone, rehearse demo ×2, cold-start check, submit by 16:00 |

**Skeleton is done when:** app opens without the laptop dev server · round trip works · force close → reopen still works · works on mobile data · backend logs readable · rebuild/reinstall is one known command.

## How to work

- **Research first:** read the request, this file, and touched files; check current docs (Context7/official), not memory. Report findings + risks before acting.
- **Do exactly what was asked**, nothing more. Spotted something else → propose, don't do.
- **One direction:** list alternatives in one line each, recommend one, name its main risk. Big changes (feature, stack, cut) need my OK.
- **Reuse before writing:** skip if not needed for demo → existing code → platform/stdlib → installed dep → known library/API → minimum code.
- **Simple code:** clear names, fewest files, no unrequested abstractions, match existing style.
- **Stuck ~15 min** with no progress → stop and report options.
- **Subagents:** delegate only parallel or wide-reading work; pick model by difficulty (haiku: lookup/mechanical · sonnet: clear implementation · opus: hard debugging/review · fable: hardest/ambiguous). Brief them fully, verify their output.

## Done = verified on the real phone

- Done only when the demo path works **in the installed app on the demo phone**, including close → reopen. Simulator/localhost is a dev check, not done.
- Report what you ran and saw. If you can't touch the phone, tell me exactly what to check.
- Expect flaky Wi-Fi and slow AI: loading state, clear error + retry, hotspot ready.
- Tests only for tricky core logic.

## Submission

- README: what it does, user, build/install + backend run commands, env vars, mocks, before/today split, how Codex was used.
- Pitch 5 min: live demo with close → reopen (~2 min) · user + pain + evidence · first users + global path · what was built today.

## Environment

- Scratch files: gitignored `.scratch/` or system temp; delete what you created; never delete what you didn't.
- dshell container only: use `/home/dacthinh/.tmp` instead of `/tmp`; pytest `--basetemp=/home/dacthinh/.tmp/pytest -p no:cacheprovider`.

<!-- CODEGRAPH_START -->
## CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the repo root), reach for it BEFORE grep/find or reading files when you need to understand or locate code:

- **MCP tool** (when available): `codegraph_explore` answers most code questions in one call. If it's listed but deferred, load it by name via tool search.
- **Shell** (always works): `codegraph explore "<symbol names or question>"`.

If there is no `.codegraph/` directory, skip CodeGraph entirely — indexing is the user's decision.
<!-- CODEGRAPH_END -->
