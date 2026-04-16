---
title: "Opus 4.7 killed budget_tokens: what changed and how to migrate"
subtitle: "Claude Opus 4.7's adaptive-only thinking, omitted display default, and tokenizer inflation explained with code."
slug: opus-4-7-killed-budget-tokens
cover: https://r2.jidonglab.com/blog/2026/04/opus-4-7-killed-budget-tokens-hero.jpg
tags: [claude, anthropic, ai, webdev, opus-4-7]
canonical: https://jidonglab.com/blog/opus-4-7-killed-budget-tokens
enableToc: true
---

Adaptive thinking is Claude Opus 4.7's only supported reasoning mode: you pass `thinking: {type: "adaptive"}` and the model decides how much to reason, with `budget_tokens` removed from the API entirely. My production trading bot threw 400 Bad Request on its first inference after I bumped `claude-opus-4-6` to `claude-opus-4-7` — one character in a model ID, three breaking changes attached.

[Anthropic shipped Opus 4.7 on April 16](https://www.anthropic.com/news/claude-opus-4-7) at the same sticker price as Opus 4.6: $5 per million input tokens, $25 per million output tokens. That sameness is misleading. The model ID is `claude-opus-4-7`, the context window is 1M tokens, max output is 128k, and knowledge cutoff is January 2026. Vision accepts 2,576-pixel long-edge images, about 3.75 megapixels, which Anthropic describes as "more than 3x as many pixels" as prior Claude models. The release is available on the Claude API, Amazon Bedrock research preview, Google Vertex AI, and Microsoft Foundry.

Flat pricing on a new tokenizer is not flat pricing. I'll get to the math in a minute, but first the three changes that matter when you flip the model ID.

## The 400 no one warned you about

Here is the code that worked on Opus 4.6 and dies on Opus 4.7.

```typescript:thinking-before.ts
const response = await client.messages.create({
  model: "claude-opus-4-6",
  max_tokens: 16000,
  thinking: {
    type: "enabled",
    budget_tokens: 10000,
  },
  messages: [{ role: "user", content: task }],
});

for (const block of response.content) {
  if (block.type === "thinking") {
    console.log(block.thinking);
  }
}
```

`thinking.type: "enabled"` and the `budget_tokens` field together used to mean "reason up to 10,000 tokens before answering." Opus 4.7's gateway rejects that shape with a 400. There is no deprecation shim. You get an error body complaining about `thinking.type`, and your workflow stops.

The replacement, from the [adaptive thinking docs](https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking), looks like this.

```typescript:thinking-after.ts
const response = await client.messages.create({
  model: "claude-opus-4-7",
  max_tokens: 16000,
  thinking: { type: "adaptive", display: "summarized" } as any,
  output_config: { effort: "high" } as any,
  messages: [{ role: "user", content: task }],
});
```

Three shifts. The type moves to `"adaptive"`, which lets the model choose reasoning depth per request. Budget control migrates from integer tokens to the categorical `effort` field on `output_config`. And the SDK's TypeScript definitions have not shipped yet for these fields, so `as any` is the pragmatic workaround for the next few days. Opus 4.6 and Sonnet 4.6 still accept `"enabled"` as deprecated behavior, but anything new should target the adaptive shape to avoid back-to-back migrations.

Two side effects of adaptive worth flagging. First, interleaved thinking — reasoning between tool calls — is on by default in adaptive mode. Agent loops that previously needed a beta header now get mid-call reasoning for free, which is the concrete backing for Anthropic's "step-change improvement in agentic coding" claim. Second, thinking itself is OFF by default on Opus 4.7. Drop the `thinking` field entirely and you get no reasoning blocks — not an error, just worse answers. If you are migrating existing code, add an explicit `thinking: {type: "adaptive"}` at every call site rather than relying on the old implicit default.

## The empty thinking block problem

The second breaking change does not throw. The default value of `thinking.display` used to be `"summarized"` on Opus 4.6. On Opus 4.7 the default is `"omitted"`, which means `block.thinking` comes back as an empty string.

I caught this in LLMTrio, which has a "show Claude's reasoning" disclosure UI. Thirty minutes after rolling out the Opus 4.7 bump, the first report came in: the panel had gone blank. The thinking blocks were still in the response — type `thinking`, full `signature` field — but the text payload was empty. The fix is one line: pass `display: "summarized"` explicitly.

The encrypted `signature` field still travels regardless of display. Multi-turn continuity — feeding prior reasoning into the next turn — works independently. Anthropic's rationale for `"omitted"` as the new default is faster time-to-first-text-token when streaming. That makes sense for chat UIs where the user never sees reasoning anyway. It bites hard for research tools, agent observability dashboards, and any product that surfaces a reasoning trace.

This is the migration where a code reviewer really earns their keep. The compiler does not help; every call site needs the explicit display flag, and missing ones will only surface in UI bug reports.

## The tokenizer is 1.35x the bill

The third change you only catch by measuring. Opus 4.7 ships a new tokenizer. Anthropic's migration docs describe the input token count as "roughly 1.0–1.35x depending on content type." Prices held flat, so the invoice for an identical workload can rise by up to 35 percent.

In worked numbers: a workload that metered 500M input tokens per month on Opus 4.6, costing $2,500 per month, can meter as 675M input tokens on Opus 4.7 in the worst case, costing $3,375 per month. $875 delta per month from tokenizer swap alone. The [models overview](https://platform.claude.com/docs/en/about-claude/models/overview) makes the same claim from the other direction: 1M tokens holds ~750k English words on Opus 4.6 but only ~555k on Opus 4.7. That ratio is basically 1.35x.

My own corpus confirms the ceiling is real for Korean text and typed code. The same prompt that metered 2,312 tokens on Opus 4.6 yesterday metered 3,014 tokens on Opus 4.7 today — a 1.30x ratio. My trading bot's prompts, which I broke down in [Trading bot with 15 strategies](https://dev.to/ji_ai/trading-bot-15-strategies-en), are densely typed TypeScript and saw the biggest jumps. I learned the hard way from my [llmtrio caching work](https://dev.to/ji_ai/prompting-is-programming) that you measure before you flip. This is that test, at scale.

## Effort levels and the xhigh surprise

`budget_tokens` is gone, so how do you tell Opus 4.7 to think harder? Through `output_config.effort`, which has five levels on Opus 4.7. Here is the full ladder.

| effort | availability | intended use |
| --- | --- | --- |
| low | all models | snappy replies, tight budgets |
| medium | all models | general workloads |
| high | all models (default) | balanced reasoning |
| xhigh | Opus 4.7 only | deeper reasoning short of max |
| max | all models | maximum reasoning, maximum cost |

Here is the twist. Claude Code's default effort moved to xhigh on all plans today. No announcement, no release note in the UI — the [models overview](https://platform.claude.com/docs/en/about-claude/models/overview) only mentions the level exists. Same commands you ran yesterday will feel slower today, and combined with the tokenizer inflation, monthly spend can jump visibly. If cost is a concern, set effort to high at the project level and reach for xhigh deliberately, not by default.

Claude Code also shipped a unified interface for multiple projects and a Microsoft Word beta integration in the same release. I am writing a book about Claude Code right now, tracked in [Writing a Claude Code book with Claude Code](https://dev.to/ji_ai/writing-claude-code-book-with-claude-code-en), and the xhigh default has already earned a callout in the next draft.

## The companion release you should know about

On the same day, Anthropic launched an in-house AI design tool for websites and presentations. [The Information broke it on April 14](https://www.theinformation.com/briefings/exclusive-anthropic-preps-opus-4-7-model-ai-design-tool) and Figma and Wix shares closed between 2 and 4 percent lower that session. This is the moment Opus 4.7 stops being a model bump and becomes part of a product stack expansion. If you have ever spent a weekend producing five landing page variants by hand, that work compresses to a single agent call on the new stack.

One more item worth a mention: Anthropic announced Claude Mythos Preview, an invitation-only model available through Project Glasswing for defensive cybersecurity research. The UK AI Safety Institute reported that Mythos "autonomously executed a 32-step network simulation typically requiring 20 human hours" at rates not previously benchmarked. Mythos is not Opus 4.7 — it is a separate model — but the two ship together as evidence that Anthropic's agent story is accelerating.

## The migration order I ran today

The order that let me ship the bump without burning a day. Find every call site that still uses `thinking.type: "enabled"` — ripgrep `"enabled"` under your `thinking` usage — and swap to `"adaptive"`, removing `budget_tokens`. Where your UI surfaces reasoning, add `display: "summarized"` explicitly. Meter a representative sample of production prompts against the new tokenizer and multiply by your usage to project the invoice impact before traffic shifts. For Claude Code, set effort to high at the project level and only escalate to xhigh on tasks that clearly warrant deeper reasoning. Then flip the model ID.

The cheap alternatives are worth naming. You can stay on Opus 4.6, which still serves the old `"enabled"` shape as deprecated behavior — fine for a week or two while you prep. You can route some traffic to Sonnet 4.6 for cost-sensitive paths. You can opt into adaptive on Opus 4.6 first, so the thinking-shape migration happens independently of the model swap. What you cannot do is bump the model ID and hope no code noticed.

After running through this migration on three different projects today, my blunt read is that Opus 4.7 is better approached as an API redesign with a model upgrade attached, rather than a drop-in version increment. The reasoning quality on agentic coding is noticeably better — I can feel it in Claude Code's tool sequencing — and the 1M-context window with interleaved thinking by default is genuinely nice. But the invoice story is tighter than the announcement suggests, and the display default is a trap.

What did your `budget_tokens` code do when you bumped to 4-7 — silent behavior change or loud 400?

> One character in a model ID can drag three breaking changes behind it.

---

Read the Korean version on [spoonai.me](https://spoonai.me/posts/opus-4-7-adaptive-thinking).

Follow me on [DEV.to](https://dev.to/ji_ai).

**Sources**

- [Introducing Claude Opus 4.7 — Anthropic](https://www.anthropic.com/news/claude-opus-4-7)
- [Anthropic Models Overview](https://platform.claude.com/docs/en/about-claude/models/overview)
- [Adaptive Thinking Docs](https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking)
- [Extended Thinking Reference](https://platform.claude.com/docs/en/build-with-claude/extended-thinking)
- [Migration Guide](https://platform.claude.com/docs/en/about-claude/models/migration-guide)
- [The Information — Anthropic Preps Opus 4.7 and AI Design Tool](https://www.theinformation.com/briefings/exclusive-anthropic-preps-opus-4-7-model-ai-design-tool)
