---
title: "512,000 Lines of Claude Code Leaked Through a Single .npmignore Mistake"
subtitle: "Analyzing KAIROS, anti-distillation, and the full architecture of Anthropic's AI agent after an accidental npm source map leak"
slug: "claude-code-source-leak-analysis"
cover: https://r2.jidonglab.com/blog/2026/04/claude-code-source-leak-analysis-hero.jpg
tags: [ai, opensource, programming, security, anthropic]
canonical: https://jidonglab.com/blog/claude-code-source-leak-analysis
enableToc: true
---

On March 31, 2026, [Anthropic](https://www.anthropic.com/) published version 2.1.88 of their [@anthropic-ai/claude-code](https://www.npmjs.com/package/@anthropic-ai/claude-code) package to the npm registry. Within hours, developers noticed something unusual: the package had ballooned to 59.8MB, roughly six times its normal size. The reason was a source map file — a `.map` file that contained the complete, unminified [TypeScript](https://www.typescriptlang.org/) source code for the entire Claude Code CLI. All 1,900 files. All 512,000 lines. Every internal function name, every comment, every feature flag.

I spent the past two days analyzing what those 512,000 lines reveal about how Anthropic builds its most important developer tool. This is what I found.

## How a Build Configuration Error Exposed Everything

The mechanism is almost painfully simple. When you publish a package to [npm](https://www.npmjs.com/), a file called `.npmignore` tells the registry which files to exclude. Source maps — the `.map` files that let debuggers trace minified code back to its original source — are routinely excluded from production packages because they contain the pre-bundled source. Anthropic's build pipeline had this rule in place for every prior release. In 2.1.88, the rule was missing.

The Claude Code build process compiles TypeScript into a single 10.5MB `cli.js` bundle. The source map for that bundle embeds every original source file inline, meaning anyone who downloaded the package could reconstruct the entire codebase without any reverse engineering. According to [BleepingComputer](https://www.bleepingcomputer.com/news/security/claude-code-source-code-leaked-via-npm-source-maps/), automated package-size monitoring bots flagged the anomaly first, and the community started decoding within minutes.

The fallout was immediate and massive. [The Hacker News reported](https://thehackernews.com/2026/03/anthropic-claude-code-source-leak.html) that GitHub saw over 41,500 forks of repositories containing the extracted source within the first 24 hours. Anthropic pulled the package and issued a patched release, then sent [DMCA](https://www.dmca.com/) takedown notices to 8,100 GitHub repositories. According to [Axios](https://www.axios.com/2026/03/31/anthropic-dmca-claude-code-source-leak), retrieving code that has already been downloaded and forked at this scale is practically impossible.

This is the second major security incident for Anthropic in a single week. The first was the [Claude Mythos leak](https://jidonglab.com/blog/claude-mythos-leak-2026), where a misconfigured CMS exposed internal documents about an unreleased model with unprecedented cybersecurity capabilities.

## Inside KAIROS: The 24-Hour Autonomous Agent

The most significant discovery in the leaked source is a system called KAIROS — Knowledge-Aware Intelligent Reasoning and Operation System. [Fortune reported](https://fortune.com/2026/03/31/claude-code-source-code-leak-npm/) on its existence, but the source code reveals far more than any news article could.

KAIROS is designed to run autonomously for 24 hours at a stretch. It monitors code repositories, analyzes issues, and generates pull requests without explicit user instruction for each action. The scheduling logic uses a priority queue that weighs task urgency against estimated completion time, and the permission system defines three tiers of autonomy: actions the agent can take immediately, actions that require a lightweight confirmation, and actions that are blocked until a human explicitly approves them.

What makes KAIROS architecturally interesting is how it manages context across a full day of operation. The source reveals a sliding-window approach to conversation history, where older context is compressed into summaries rather than dropped entirely. There's also a "checkpoint" mechanism that periodically saves agent state to disk, allowing recovery from crashes without losing hours of accumulated context.

I should note that KAIROS appears to be behind a feature flag that isn't enabled in the public release. The code is present, but the activation pathway requires an internal configuration that external users don't have access to. Still, the fact that this infrastructure exists and is shipping in the production bundle says something about where Anthropic is headed with Claude Code.

```text
// KAIROS Architecture (reconstructed from source)

+------------------+
|   Task Queue     |  Priority-weighted scheduling
+--------+---------+
         |
    +----v----+
    | Planner |  Decomposes tasks, estimates cost
    +----+----+
         |
   +-----v------+     +----------------+
   | Executor   +---->| Permission Gate|
   +-----+------+     +-------+--------+
         |                    |
   +-----v------+    +-------v--------+
   | Tool Layer  |    | Human Approval |
   | (MCP/Shell) |    | (if required)  |
   +-----+------+    +----------------+
         |
   +-----v------+
   | Checkpoint  |  Periodic state persistence
   +-------------+
```

## Anti-Distillation and the Undercover Mode

The second major finding is the anti-distillation mechanism. Distillation is the process where one AI model's outputs are used as training data to improve a competing model — effectively stealing capability through the API. Anthropic's defense against this is both clever and somewhat unsettling.

According to [Alex Kim's technical analysis](https://alexkim.dev/blog/claude-code-source-analysis), the system works by injecting fabricated tool definitions into certain responses. These fake definitions don't affect Claude's normal operation — the model knows to ignore them. But if a competitor scrapes Claude's outputs and feeds them into their own training pipeline, those fabricated definitions introduce systematic errors into the competing model's tool-use capabilities. The poisoned tool definitions look syntactically valid but contain subtle semantic errors that would degrade a model trained on them.

The third discovery, Undercover mode, is a response-filtering layer that prevents Claude Code from revealing internal identifiers. When a user asks about the model's name, version, or system prompt structure, this filter intercepts the response and substitutes public-facing information. The source code contains a mapping table: Capybara corresponds to Claude 4.6, Fennec maps to Opus 4.6, and there's an entry for Numbat — a model that hasn't been announced yet.

```text
// Internal Codename Mapping (from source)

  Codename    Public Name       Status
  ---------   ----------------  -----------
  Capybara    Claude 4.6        Released
  Fennec      Opus 4.6          Released
  Numbat      ???               Unreleased
```

The combination of anti-distillation and Undercover mode reveals a company that is simultaneously defending against competitive threats and maintaining tight control over what users know about the system running on their machines. Whether this level of opacity is justified for a tool that executes commands in your terminal is a question worth sitting with.

## The Architecture: React in Your Terminal

Beyond the headline-grabbing features, the leaked source provides a complete picture of Claude Code's technical stack.

The UI layer is built with [React](https://react.dev/) and [Ink](https://github.com/vadimdemedes/ink), a library that renders React components to the terminal. Layout is handled by [Yoga](https://yogalayout.dev/), the Flexbox engine that also powers React Native. The runtime is [Bun](https://bun.sh/) rather than Node.js, and the entire application compiles down to a single `cli.js` bundle at 10.5MB.

The sandbox implementation is where the engineering gets particularly impressive. On macOS, Claude Code uses [Seatbelt](https://reverse.put.as/wp-content/uploads/2011/06/The-Apple-Sandbox-BHDC2011-Paper.pdf), Apple's kernel-level sandboxing framework that's the same technology Safari uses to isolate web content. On Linux, it uses [bubblewrap](https://github.com/containers/bubblewrap), a namespace-based container isolation tool originally developed for Flatpak. The source reveals granular permission controls over filesystem access, network requests, and process spawning — each operation goes through a policy check before execution.

The sub-agent system is another notable architectural choice. When Claude Code encounters a complex task, it can decompose it into subtasks and delegate them to child agents, each with their own isolated context window and tool permissions. These sub-agents communicate through a structured message-passing protocol, and the parent agent aggregates their results. Integration with [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) allows external services to plug into this agent hierarchy, and a plugin/skill system lets users extend Claude Code's capabilities through modular packages.

What struck me most about the architecture is how seriously Anthropic takes isolation boundaries. Each sub-agent, each tool invocation, each file access goes through explicit permission checks. The irony — and it is genuine irony, not a rhetorical device — is that all of this careful security engineering was undone by a missing line in `.npmignore`.

## What This Means for the AI Agent Ecosystem

The Claude Code source leak is a mirror held up to the entire AI agent ecosystem. Every company building agents that run on user machines faces the same tension: the more capable the agent, the more it needs access to, and the more important it becomes to be transparent about what that agent actually does.

Anthropic's leaked code shows an engineering team that has thought deeply about sandboxing, permission hierarchies, and safe autonomous operation. The KAIROS checkpoint system, the tiered permission gates, the kernel-level isolation — these aren't afterthoughts. They represent significant investment in doing agent security right.

But the anti-distillation mechanism and Undercover mode tell a different story. These are features designed to operate without the user's knowledge, embedded in a tool that the user trusts with terminal access. The question isn't whether Anthropic has good reasons for these features — competitive defense and information security are legitimate concerns. The question is whether undisclosed features belong in a tool with this level of system access.

The `.npmignore` failure itself carries a lesson that extends beyond Anthropic. CI/CD pipelines for AI agents need artifact auditing as a first-class concern, not an afterthought. Package size validation, source map detection, and pre-publish review should be automated gates that block deployment, not monitoring alerts that fire after the damage is done.

> The most dangerous assumption in software security isn't that your code is correct — it's that your build process is.

What happens when the next agent source leak reveals features that aren't as defensible as sandboxing and permission gates?

---

Read the Korean version on [spoonai.me](https://spoonai.me/posts/claude-code-source-leak-analysis)

Follow me on [DEV.to](https://dev.to/jee599)
