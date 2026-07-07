---
title: "I Cut My Claude Code Prompt Overhead 84% Per Turn (v1.4)"
subtitle: "Adaptive norm injection, a grep-based leak guard, and an honest per-task cost re-measurement of the Opus→Fable hook"
slug: fable-mode-v14-adaptive-injection
cover: https://raw.githubusercontent.com/jee599/fable-mode-kit/main/docs/hero-1000x420.png
tags: [ai, claude, developer-tools, open-source, productivity]
canonical: https://jidonglab.com/blog/fable-mode-v14-adaptive-injection
enableToc: true
---

A few days ago I shipped [fable-mode](https://github.com/jee599/fable-mode-kit), a set of [Claude Code hooks](https://docs.anthropic.com/en/docs/claude-code/hooks) that makes Opus 4.8 behave like Fable 5 — leading with the answer, not touching files you only asked about, verifying before it reports. It works by re-injecting a block of conduct norms into the model on every turn.

Two things nagged at me after launch. That block was 1,377 characters. It went in on **every** turn, so a one-line question like "show me the git log" was paying 860 tokens of preamble it didn't need. And the cost number I published — 0.70× Fable — was a three-task average that hid a much uglier per-task picture.

v1.4 fixes both. And while I was in there, I took a regression I had papered over with trust and sealed it with code instead.

## Feeding the same 1,377 characters every turn was waste

Re-injecting the norms every turn is deliberate. In a long conversation, an instruction sitting at the top of the system prompt gets buried under recent turns. So fable-mode plants the norms in the "always most recent" slot — right before the user message — on every turn.

The problem was that not every turn needs them.

A turn where you ask the model to *do work* needs the whole block: respect scope, inspect targets before you overwrite them, only claim done when a tool result proves it. Those clauses matter when the model is about to touch code. But on a turn like "what's the difference between rebase and merge?" they're dead weight. What that turn needs is just "conclusion first, in prose, complete sentences."

So v1.4 splits the injection by turn size:

```
major turn (real work) · session's first turn · every 5th turn  →  full block, 1,377 chars (≈860 tokens)
every other minor turn (short Q&A)                              →  reminder, 214 chars (≈134 tokens)
```

The reminder doesn't repeat the norms. It opens with "the full set of norms injected earlier is still in effect" and lists six essentials on one line — keeping the anchor while dropping the weight. Every fifth turn re-injects the full block even on a minor turn, so the norms never fully fade in a long session.

The major test is dumb on purpose: the prompt is over 80 characters, or it contains a work verb. I deliberately left short English verbs like `run`, `test`, and `make` out of the verb list — they match as substrings inside ordinary words and misfire. The 80-character rule catches those prompts anyway.

The payoff is arithmetic. If short Q&A is half your turns, per-session injection overhead drops 34%; at 70% it's 47%; at 80% it's 54%. For a single minor turn in isolation, 860 tokens becomes 134 — down 84%.

## Now the session tells me exactly what I'm spending

If you're going to make claims in tokens, you need to observe the tokens. Before, my overhead was "roughly this much." v1.4 logs every injection to a file.

```
full	1377
lite	214
lite	214
lite	214
full	1377
```

`/fable-mode status` reads that file and reports how many full blocks and how many reminders went into this session, and what that costs in tokens. Every number in this post — the 84%, the 34% — came out of that log, not an estimate.

That sounds minor, but the most common mistake when you build a tool that steers a model through prompts is not knowing how much you're feeding it. Keep pushing text into the context without measuring it and eventually the tax outweighs the benefit. Make it observable and you don't fall into that hole.

## grep instead of trust

There was a regression in v1.3 that actually fired in the wild.

fable-mode forces a self-check right before a major turn ends. When Claude Code's Stop hook returns `decision:block`, the model can't finish the turn and takes one more pass. That pass asks it: is there evidence behind every "done" claim? If your last paragraph is a promise, execute it now. It's Fable's trained "verify before you finish" habit, imposed on Opus as an external loop.

The problem was the check instruction leaking into user output. On the re-finish pass the model would leave a sentence like "self-verification passed, no issues" in its final answer. Internal guidance is not supposed to reach the user.

In v1.3 I fixed that by adding one line to the norms: *don't mention this check in your output.* That's the trust approach. It holds most of the time. Most.

v1.4 stopped trusting it. When the turn ends, it greps the final assistant text.

```bash
# right before finishing, scan the final message for internal-guidance vocabulary
if printf '%s' "$LAST_TEXT" | grep -qiE 'self-check|self-verif|fable-mode|conduct block'; then
  # detected → drop a .leakfix marker and force exactly one rewrite
  ...
fi
```

If a term is found, it forces one rewrite. A `.leakfix` marker guarantees it runs at most once, so there's no stop loop. The rewrite instruction has a trap of its own: if the term is genuinely the subject of the task — say, a session where I'm developing the fable-mode kit itself — resubmit as-is. Otherwise a session *about* fable-mode would rewrite its own normal answers on every turn.

The lesson generalizes. A behavior you enforced with a prompt should not be verified only with a prompt. Whatever you can check deterministically, check deterministically. Asking the model "please don't" and grepping to confirm it didn't are two very different levels of trust.

## The truth behind that pretty 0.70×

Here's the uncomfortable part. Last time I reported cost as 0.70× Fable. Building v1.4, I widened to four task types and re-measured. The aggregate held near it — 0.72×. But the average was hiding the shape.

Line the stack (Opus + fable-mode) up against Fable per task and it looks like this:

| task | bare Opus | + stack | Fable | stack/Fable |
|------|----------:|--------:|------:|:-----------:|
| diagnosis | $0.23 | $0.28 | $0.49 | 0.57× |
| implementation | $0.34 | $0.45 | $0.49 | 0.91× |
| ambiguous cleanup | $0.86 | $1.13 | $1.52 | 0.74× |
| simple question | $0.12 | $0.13 | $0.27 | 0.49× |

Look at implementation. The stack was only 9% cheaper than Fable, because it burns extra tokens running the self-check turns. The ambiguous cleanup task is worse: the stack cost **31% more than bare Opus** — $0.86 became $1.13. That's the price of the correction turns that buy the conduct.

Honestly, fable-mode isn't free. You pay in turns, not quality. Fable gets it right on the first attempt; the stack reaches the same place after a few corrections, and those corrections eat tokens.

The reason the aggregate still lands at 0.72× is unit price. Fable is [$10/$50 per million tokens](https://www.anthropic.com/pricing), Opus 4.8 is half that. Fable writes half the output tokens — 9.8k against the stack's 20.0k across these four tasks — and still loses on cost because its rate is 2×. The outputs were the interesting part: on the slugify implementation, the code from bare Opus, the stack, and Fable produced identical results on shared test cases. On diagnosis, all three named the same root cause and all three diagnosed without editing. The conclusions matched; only the "reasonable default" chosen on the ambiguous task diverged.

The benchmark isn't perfect either. One run per task, and I hit the subscription session limit twice mid-run and kept restarting. That surfaced something funny: on the "clean up this folder" benchmark, both bare Opus and Fable moved the running measurement file (`result.json`) into an archive folder. I told them to tidy up, so they tidied — the measurement tool filed itself away. Next benchmark, the measurement files live outside the task directory.

## What stays

v1.4 also settled the fourth hook. Subagents never receive the per-turn injection event, so in fan-out work the workers ran bare while the main session followed the norms. A [SubagentStart hook](https://docs.anthropic.com/en/docs/claude-code/hooks) now injects the norms at spawn, and v1.4 extended its double-injection guard to cover plugin agent paths too.

Some limits stay honest. 97% is a conduct score, not an intelligence score. Entangled single-pass reasoning and long autonomous runs live in the weights, and no prompt closes that. Route that work to Fable, or if it has to be Opus, compensate with fan-out plus adversarial verification.

I wrote up the mechanics and the measurements as [slide decks](https://jee599.github.io/reports/posts/fable-mode-v14-ir.html) too. The kit installs in two lines inside any Claude Code session.

What this release taught me was less about the tool and more about the discipline. When you steer a model through prompts: measure how much you're feeding it, verify what you enforced with code, and don't hide the messy per-task numbers behind a pretty average. That's what earns trust.

> A behavior you enforced with a prompt — don't trust with a prompt alone. Measure what you can measure, grep what you can grep.

If you've built prompt-injection tooling like this: how do you keep the injected overhead from quietly eating your token budget?

---

**Sources:**
- [fable-mode kit — GitHub](https://github.com/jee599/fable-mode-kit)
- [Claude Code Hooks — Anthropic Docs](https://docs.anthropic.com/en/docs/claude-code/hooks)
- [Anthropic Pricing](https://www.anthropic.com/pricing)
- [v1.4 measurement deck](https://jee599.github.io/reports/posts/fable-mode-v14-ir.html) · [principles deck](https://jee599.github.io/reports/posts/fable-mode-principles-ir.html)

Read the Korean version on [spoonai.me](https://spoonai.me/blog/fable-mode-v14-adaptive-injection).
