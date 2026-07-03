---
title: "How I Made Opus 4.8 Act Like Fable 5 (64%→97%, Measured)"
subtitle: "An open-source Claude Code plugin that ports Fable's conduct layer to Opus — with A/B/C probe numbers"
slug: fable-mode-opus-claude-code
cover: https://raw.githubusercontent.com/jee599/fable-mode-kit/main/docs/hero-1000x420.png
tags: [ai, claude, developer-tools, open-source, productivity]
canonical: https://jidonglab.com/blog/fable-mode-opus-claude-code
enableToc: true
---

Fable 5 costs exactly twice what Opus 4.8 does — $10/$50 per million tokens against $5/$25, same vendor, same API shape. For months I paid the premium for one reason: Fable behaved better. It led with the answer, it finished the job, and it didn't quietly rewrite my files when I had only asked a question.

Then I read the two system prompts side by side, and most of the gap I cared about wasn't intelligence. It was a block of conduct text that gets injected into Fable and not into Opus. Text is portable. Weights are not.

So I ported the text. The result — three hooks and an output style, open-sourced at [github.com/jee599/fable-mode-kit](https://github.com/jee599/fable-mode-kit) — moved bare Opus from 64% to 97% on a conduct rubric, at 0.70× the cost of running Fable. Here's the whole thing, including the one task where it cost me *more* than Fable.

## The two scenes that made me build this

I asked bare Opus a diagnosis-only question: "why does this bug happen?" I wanted an explanation. What I got was a silently edited file and a confident verdict, with no test run behind it. It had changed code I never asked it to touch, then asserted the fix worked without executing a single line. That turn scored 6 out of 12.

The second scene was worse in a quieter way.

"Clean up the logs," I typed — deliberately vague. Bare Opus scanned the directory, described what it found, and then stopped to ask: "Which approach would you like?" No action taken. It handed the decision back to me and treated that hand-off as done. 5 out of 12.

Fable, given the same two prompts, does the boring correct thing. It diagnoses without touching the file, runs the test, and reports. For the cleanup it picks a non-destructive default — archive and gzip, defer only the irreversible delete — and actually executes. That is not a smarter model answering. That is a model told how to conduct itself.

## What actually differs between the two

Line the two system prompts up and the delta sorts into two piles. One is a conduct layer: lead with the outcome, complete the work you can safely complete, verify before you claim success, don't leak your own scaffolding into the answer. That pile is plain text in a prompt. The other pile is the weights — the raw reasoning the $10/$50 tier buys — and it does not move.

The bet: if enough of the behavior gap lives in the movable pile, I can rent Opus at half price and paste the conduct layer back on top.

## Three hooks and an output style

Claude Code exposes lifecycle [hooks](https://code.claude.com/docs) — shell scripts that fire at fixed points in a session. I used three, plus an output style that sets the baseline voice.

The first fires on `SessionStart`: it detects the model and decides, once, whether to engage. If the session is already Fable, or if `FABLE_MODE=0` is set, it exits and does nothing. The second fires on every `UserPromptSubmit` and re-injects the conduct norms so they never fall out of the context window. The third fires on `Stop`: it runs one self-audit over the finished turn and rewrites the user-facing answer.

```bash:hooks/fable-mode.sh
# SessionStart — decide once
[ "$FABLE_MODE" = "0" ] && exit 0            # kill switch
[ "$(detect_model)" = "opus-4.8" ] || exit 0 # only touch Opus

# UserPromptSubmit — re-assert the layer every turn (idempotent)
emit_context "$(cat conduct/norms.md)"

# Stop — one self-audit, then rewrite the reply the user sees
audit_last_turn && rewrite_final_answer      # never print the checklist
```

End to end:

```
 SessionStart ─┬─ FABLE_MODE=0 ──▶ exit, do nothing
               └─ Opus 4.8? ──no──▶ stay out of the way
                       │ yes
                       ▼
 UserPromptSubmit ──▶ re-inject conduct norms (idempotent)
                       │
                       ▼
 assistant runs the turn
                       │
 Stop ──▶ self-audit ──▶ rewrite user-facing answer
```

The `FABLE_MODE=0` kill switch matters more than it looks. Re-injecting a prompt every turn is intrusive, and some turns want raw Opus — a throwaway question, a scratch script. One environment variable turns the layer off without uninstalling anything.

## The numbers: 64% to 97%

I built three probes, each targeting a failure I had actually hit: a diagnosis-only request, an implementation where I never asked for verification, and a maximally ambiguous instruction. Each ran under three conditions, and a judge model scored six dimensions — leading with the conclusion, completeness, autonomy, verification, discipline, and not leaking its own scaffolding — for 36 points total.

![Measured conduct scores](https://raw.githubusercontent.com/jee599/fable-mode-kit/main/docs/scores-1200x675.png)
*Measured A/B/C probe scores — Source: jidonglab*

| Condition | Setup | Score |
|-----------|-------|-------|
| A | Opus 4.8, bare | 23/36 (64%) |
| B | Opus 4.8 + fable-mode | 35/36 (97%) |
| C | Fable 5 | 36/36 (100%) |

The two scenes above are where A bled points: the silent-edit diagnosis (6/12) and the ambiguous cleanup (5/12). Under the kit, both went to 12/12 — the diagnosis stayed diagnosis and ran the test, and the cleanup executed the archive-and-gzip default while deferring only the destructive delete.

Cost is where it gets honest. Opus + kit spent 1.41× the tokens Fable did on the same work — the re-injection and self-auditing are not free. But Opus bills at half Fable's rate, so 1.41 × 0.5 lands the blended cost at 0.70× of Fable.

On one probe, the arithmetic flipped. The ambiguous cleanup made the kit do the most extra work of any task — scan, choose a safe default, archive, gzip, then verify — and that verification tail burned enough tokens that this single task cost *more* than Fable did on the same prompt, even at half the per-token rate. The 0.70× is an average with a loser inside it. If your workload is mostly under-specified "just handle it" prompts, expect the gap to narrow.

## Two bugs I hit building it

Porting a system prompt into someone else's model surfaces failures you don't anticipate.

The first was identity contamination. I told the setup to "output only the word ok" as a smoke test, and Opus replied "Fable." The conduct layer had leaked into the model's sense of what it *was*. The fix was a single identity clause in the norms file pinning the model to its real name; re-measured, the same prompt now answers "I am Opus 4.8."

The second was a self-check leak. The `Stop` hook's audit checklist — the internal "did I lead with the answer, did I verify" scaffolding — was printing straight into the user-facing reply. The model was showing its homework instead of its answer. The fix was an explicit instruction in that hook: no meta-commentary, rewrite only the conclusion the user needs. Across the re-run, leaked checklists dropped to zero.

I mention both because a port that claims zero rough edges is a port nobody actually ran.

## What this doesn't fix

The 97% is a conduct score, not an intelligence score, from three tasks run once each. That is a probe, not a benchmark — n=1 per task, no error bars.

The layer moves how the model behaves; it does not move the weights. On entangled single-pass reasoning and long autonomous runs, third-party estimates put Fable ahead of Opus by roughly 5 to 11 points, and no injected prompt closes a weights gap. Treat that as a third-party estimate, not my measurement.

Where the reasoning gap actually bites, I correct for it outside the model. Reviews and audits get fanned out across several agents with an adversarial verification pass — 1 to 2.5× the single-agent work, but it catches what one pass misses. High-risk judgment gets gated behind multiple attempts plus a human sign-off. The kit buys back conduct cheaply; it does not pretend to buy back raw capability.

## Installing it

Two lines inside Claude Code:

```
/plugin marketplace add jee599/fable-mode-kit
/plugin install fable-mode@jidonglab
```

If you'd rather skip the plugin system, the repo ships an `install.sh` that drops the hooks and output style into place directly. Set `FABLE_MODE=0` any time you want plain Opus back. The probe harness ships with it too — swap in your own tasks and re-score.

> A model's behavior is a system prompt you can copy; its intelligence is a bill you still have to pay.

---

**Sources:**
- [GitHub: jee599/fable-mode-kit](https://github.com/jee599/fable-mode-kit)
- [Claude Code documentation](https://code.claude.com/docs)

Read the Korean version on [spoonai.me](https://spoonai.me/blog/fable-mode-opus-claude-code) · Also on [DEV.to](https://dev.to/jee599).
