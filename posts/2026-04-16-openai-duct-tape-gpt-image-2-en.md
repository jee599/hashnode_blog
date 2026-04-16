---
title: "OpenAI's 'duct-tape' model appeared on Arena — then vanished"
subtitle: "Three anonymous models nicknamed duct-tape are likely GPT-Image 2. Community inference, verified capabilities, and what it means for solo builders."
slug: openai-duct-tape-gpt-image-2
cover: https://r2.jidonglab.com/blog/2026/04/openai-duct-tape-gpt-image-2-hero.jpg
tags: [openai, ai, imagegen, webdev, gpt-image-2]
canonical: https://jidonglab.com/blog/openai-duct-tape-gpt-image-2
enableToc: true
---

I opened LM Arena on a Tuesday night to A/B two image models. The one on the left had no name — just `packingtape-alpha`. Three renders in, I knew what I was looking at.

LM Arena is the blind-comparison leaderboard for text-to-image models at arena.ai. "duct-tape" is the community nickname for three anonymous models — `packingtape-alpha`, `maskingtape-alpha`, `gaffertape-alpha` — that appeared there in early April 2026 and were pulled within hours. OpenAI has not confirmed ownership, but the community has settled on the inference that this is the next-generation OpenAI image model, widely rumored as GPT-Image 2.

I want to walk through why I think this matters for solo builders, what the community actually verified during the brief test window, what the alternatives look like right now, and what it changes in my own stack. Keep one thing in mind throughout: strong community inference is not the same as confirmation. I'll flag the line every time it matters.

## Why a solo builder should care

My three active projects are a saju app, a trading bot, and a coffee-chat platform. Every one of them runs on a multi-tool image pipeline: generate a base render, import to Figma to fix the text, retouch skin or lighting in a second tool, export the thumbnail. Ten to thirty minutes per asset, per platform. The binding constraint has been text-in-image. Every current model garbles strings longer than a few words, which means every marketing asset has a mandatory edit step after generation.

That binding constraint is what duct-tape appears to dissolve. If the tests the community reproduced are anywhere near representative, the first step in that pipeline stops needing the second, third, and fourth steps. That is not a productivity improvement, that is a shape change. I started redesigning my asset workflow the week the tests dropped, before any launch, because the cost of waiting and being wrong is small and the cost of waiting and being right is that my competitors get there first.

## What the test actually showed, facts vs rumors

Here is the clean version of what is confirmed. Three anonymous models with adhesive-tape codenames appeared on LM Arena. They were live for a fraction of a day. The community dubbed the family "duct-tape." Hundreds of blind A/B renders were captured and screenshotted before the models disappeared. There is no official statement from OpenAI.

Here is what is inference, strong but unofficial. The rendering fingerprint — a specific softness in specular highlights, a particular handling of sans-serif text — matches the gpt-image-1 and gpt-image-1.5 lineage. DALL-E retires on May 12, 2026, which forces OpenAI to have a replacement ready. Analyst estimates center on a May to June 2026 public launch. The working name "GPT-Image 2" is a rumor and may not be the final product name.

Three capability themes came out of the reproduced tests. Text rendering was the loudest. A fake OpenAI homepage prompt returned a nav bar, button labels, and body copy with correct spelling across roughly a dozen words. A League of Legends screenshot mock rendered KDA numbers, item names, and cooldown timers at pixel accuracy. World knowledge was the second. Prompts naming specific locations — a "Shibuya Scramble at 4 AM in the rain" test circulated widely — returned building layouts, chain logos, and lane counts that matched Street View. Photorealism was the third. Skin, eye highlights, and hair-end specular handling all improved noticeably versus gpt-image-1.5. Korean testers zeroed in on Hangul rendering, and `@choi.openai` on Threads captured the mood when he wrote that Nano Banana Pro had been out-muscled for the first time.

One weakness carried over unchanged. Duct-tape still fails the Rubik's Cube reflection test, the community benchmark for mirror-image physical correctness. Content filters also ran more aggressive than gpt-image-1.5, with refusals on prompts that previously passed. No public API, no pricing, no SDK.

## Alternatives — where things stand on April 16

Google's Nano Banana 2 has held the LM Arena text-to-image top spot since December 2025. gpt-image-1.5 is second. Midjourney v7 still wins on artistic ceiling and has about 21 million paid subscribers, but its text rendering has slipped behind gpt-image-1.5 over the past quarter. Here is the comparison I would actually use to decide what to touch in my stack today.

| Capability | duct-tape (rumored) | Nano Banana 2 | gpt-image-1.5 |
|---|---|---|---|
| In-image text | Near-perfect on ~12-word strings | Strong but inconsistent | 30–40% error on long strings |
| World knowledge / real places | Matches Street View on named scenes | Strong on Western cities | Generic, often invented |
| Photorealism | Visibly improved skin / eye / hair | Top-tier, slightly plastic | Good, AI tells remain |
| Hangul / non-English text | Reportedly excellent | Mixed | Unreliable |
| Public API availability | None | Yes | Yes |
| Pricing | Unknown | ~$0.04/image | $0.04–0.17/image |

If you are shipping product today, Nano Banana 2 plus gpt-image-1.5 in a fallback chain is the defensible choice. If your pipeline's bottleneck is in-image text, and you can afford to wait until mid-to-late May, the smart move is to design the duct-tape API integration now and leave a stubbed adapter in place.

```ts
// sketch of a provider-agnostic adapter
type ImageProvider = "duct-tape" | "nano-banana-2" | "gpt-image-1.5";

async function renderAsset(prompt: string, provider: ImageProvider) {
  switch (provider) {
    case "duct-tape":
      throw new Error("duct-tape API not yet public — stub only");
    case "nano-banana-2":
      return callNanoBanana(prompt);
    case "gpt-image-1.5":
      return callGptImage(prompt);
  }
}
```

## A walkthrough of the test that made me change plans

The viral test that hit my feed was the fake OpenAI homepage prompt. A community tester wrote a prompt describing a landing page for a new OpenAI image model: center hero with "GPT Image 2" headline in sans-serif, subheadline in smaller weight, a horizontal nav with six labeled links, a primary CTA button, and footer text. The render came back with every label in the right position, spelled correctly, typographically consistent. The button had a hover shadow. The footer had a legal line that did not quite match a real one but was spelled cleanly. Nothing in that render would have failed a first glance from a designer.

The equivalent output from gpt-image-1.5 would have rendered maybe three of the six nav labels correctly, butchered the subheadline, and inserted a fake-looking OpenAI logo. Either output would still need to go through Figma for the actual build, but the duct-tape render would go through as a reference, not as something to fix. That is the hinge.

## Results — what this shifts in my stack

Three practical changes I am making now. First, I am writing my new asset pipeline with a single image-generation step and a lightweight review step instead of a multi-tool chain. The new shape assumes the model gets text right. If duct-tape or equivalent ships, the pipeline is already aligned. If it slips, my fallback keeps the multi-tool chain available for text-heavy assets only.

Second, I am putting a Korean small-business SaaS hypothesis back into my prototype queue. Hangul rendering has been the binding constraint on image-AI product adoption in that segment for years, and a duct-tape-class API opens it. I wrote about the saju app's visual language in my Three.js cosmic design work on the saju app, and the same reasoning applies — when the visual tooling gets good enough to ship without hand-editing, new product surfaces open.

Third, I am not rewriting my trading bot's UI generation scripts. The bot renders strategy reports as images for a Telegram channel, and the current pipeline with gpt-image-1.5 plus a small Figma overlay is stable. I covered the bot's architecture in [the trading bot 15 strategies writeup](https://dev.to/ji_ai/building-an-ai-trading-bot-with-claude-code-14-sessions-961-tool-calls-4o0n), and the image step is mid-priority compared to execution logic. A better image model does not change what needs to be true for that product to work.

A thought about the broader arc. Model releases used to be judged on whether they were "prettier." That axis is dead. What matters now is how many steps in your workflow disappear when the model ships. This is the same pattern I wrote about in [prompting is programming](https://dev.to/ji_ai/structured-prompting-for-multi-stack-project-bootstraps-with-ai-n73) — the useful question is no longer "is the output better" but "what does the output let me stop doing."

If duct-tape is really GPT-Image 2, what's the first thing in your workflow that becomes unnecessary?

> An anonymous model appeared on the leaderboard and was gone by morning. Nothing is confirmed. Those few hours still reset the next month of my roadmap.

---

Read the Korean version on [spoonai.me](https://spoonai.me/posts/openai-duct-tape-gpt-image-2). Follow me on [DEV.to](https://dev.to/ji_ai).

Sources:

- [How to Use the Duct Tape AI Image Model — Miraflow AI](https://miraflow.ai/blog/how-to-use-duct-tape-ai-model-arena-gpt-image-2-guide)
- [GPT Image 2 Rumours, Leaks, and Release Date — getimg.ai](https://getimg.ai/blog/gpt-image-2-rumours-leaks-release-date-2026)
- [CHOI Korean community reaction — Threads](https://www.threads.com/@choi.openai/post/DXJRBDrj4LB/)
- [CHOI duct-tape thread — X](https://x.com/arrakis_ai/status/2044374437215273108)
- [LM Arena text-to-image leaderboard](https://arena.ai/leaderboard/text-to-image)
- [The Information](https://www.theinformation.com/)
