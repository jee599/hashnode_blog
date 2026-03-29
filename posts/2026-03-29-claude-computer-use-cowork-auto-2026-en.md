---
title: "Claude Now Controls Your Mac From Your iPhone"
published: true
enableToc: true
description: "Computer Use, Cowork, Auto Mode, and Dispatch combine into one autonomous workflow. Send a command from iPhone, Claude executes on Mac."
tags: [ai, productivity, webdev, programming]
cover_image: https://r2.jidonglab.com/blog/2026/03/claude-computer-use-cowork-auto-2026-hero.jpg
canonical_url: https://jidonglab.com/blog/claude-computer-use-cowork-auto-2026
---

I sent "review the latest PR and leave comments" from my iPhone while waiting for coffee. By the time I sat down at my desk, Claude had already run `git diff`, analyzed 340 lines of changes across 6 files, and posted three review comments on GitHub. My Mac did the work. I did not touch it.

That scenario became real on March 25, 2026, when [Anthropic](https://www.anthropic.com/) shipped three features that, individually, are incremental — but combined, create something I have not seen from any other AI tool. Computer Use gives Claude direct control over mouse, keyboard, and screen. Cowork runs tasks in the background on Claude Desktop. Auto Mode uses an AI classifier to auto-approve safe developer commands. And Dispatch, the iPhone-to-Mac bridge, ties them all together.

I wrote about [Cowork when it launched](https://spoonai.me/blog/2026-03-21-claude-cowork-en) and covered the [March 2026 Claude Code updates](https://spoonai.me/blog/2026-03-25-claude-code-march-2026-updates-en). This piece is about what happens when you stop treating them as individual features and start using them as a single system.

## How the Pieces Fit Together

The mental model is straightforward once you see it. Computer Use is the hands. Cowork is the workspace. Auto Mode is the judgment. Dispatch is the remote control.

[Computer Use](https://claude.com/blog/dispatch-and-computer-use) lets Claude interact with anything on your screen. According to [Engadget](https://www.engadget.com/ai/claude-code-and-cowork-can-now-use-your-computer-210000126.html), Claude reaches for the most precise tool available first. If a Slack connector exists, it uses the API. If a Google Calendar integration is set up, it goes through that. Only when there is no dedicated connector does Claude fall back to direct screen control — clicking buttons, typing text, navigating tabs. It opens browsers, finds files, runs terminal commands. No configuration required.

[Cowork](https://support.claude.com/en/articles/14128542-let-claude-use-your-computer-in-cowork) is the background execution environment in Claude Desktop. It launched in January, but without Computer Use it was limited to text-based tasks — drafting documents, organizing files through the filesystem API. With screen control, Cowork becomes a workspace where Claude can do virtually anything you would do manually. And it keeps working while you are away.

[Auto Mode](https://www.anthropic.com/engineering/claude-code-auto-mode) addresses a friction point in Claude Code that every developer knows: the permission prompt. Previously, you either approved every `git status`, every `cat`, every `ls` manually — or you set `--dangerously-skip-permissions` and hoped nothing went wrong. Auto Mode introduces a middle path. An AI classifier evaluates each command before execution. Safe operations run automatically. Destructive operations get blocked or require explicit confirmation. It needs Claude Sonnet 4.6 or Opus 4.6.

The combination changes the interaction model. Instead of sitting at your computer directing Claude step by step, you describe the outcome you want from your phone and Claude orchestrates the execution across tools, apps, and code.

## A Real Workflow, Step by Step

Here is an actual sequence I tested. From my iPhone, I sent via Dispatch: "Check the open issues on our GitHub repo, pick the top-priority bug, create a branch, fix it if it's straightforward, and open a draft PR."

Claude woke up on my Mac. In Claude Code with Auto Mode, it ran `gh issue list --label bug --sort priority` — auto-approved by the classifier because listing issues is read-only. It identified the top issue, read the description, and checked the relevant source files. It created a branch with `git checkout -b fix/issue-247` — also auto-approved. It made changes across two files. When it reached `git push origin fix/issue-247`, the classifier flagged it as a write operation to a remote and asked for confirmation through a notification on my phone. I approved. Claude opened a draft PR with `gh pr create --draft`.

The entire sequence took about four minutes. The classifier intervened exactly once, on the push. Everything else flowed automatically.

For non-coding tasks, the workflow is similar but uses Computer Use instead of Claude Code. "Summarize today's meeting notes from Notion and post to #engineering on Slack" triggers Cowork. Claude opens the browser, navigates to Notion (or uses a connector if available), reads the notes, generates a summary, and posts it to Slack. If I am at my desk, I can watch it happen in real time — the mouse moving, pages loading, text appearing. If I am away, it runs in the background and sends a completion notification.

## The Safety Architecture Matters

More autonomy requires more safety infrastructure. Anthropic built this as a two-layer system.

The input layer runs a server-side prompt injection probe. Every piece of external content Claude reads — files, web pages, API responses, shell output — gets scanned before entering the agent's context. Prompt injection is when malicious instructions are hidden in content to hijack the AI's behavior. If the probe detects a suspicious pattern, it adds a warning tag. Claude is trained to treat flagged content as suspect and anchor on the user's original request.

The execution layer is the Auto Mode classifier itself. Before each tool call runs, a separate model evaluates it against a risk taxonomy: mass deletion, data exfiltration, credential access, unintended network requests. The classifier model is distinct from the model performing the task, creating an independent safety check.

```text filename="safety-architecture.txt"
User Command (iPhone)
       |
       v
  [Dispatch] ──> Mac
       |
       v
  [Cowork / Claude Code]
       |
       v
  [Input Layer: Prompt Injection Probe]
       |
       v
  [Agent Context]
       |
       v
  [Execution Layer: Auto Mode Classifier]
       |
    safe? ──yes──> Execute
       |
      no ──> Block / Ask User
```

This is not theoretical risk. Security researcher Johann Rehberger found a data exfiltration vulnerability in Cowork just two days after its January 2026 launch. Anthropic patched it quickly, but the incident proves that autonomous agents operating on real computers face real attack surfaces. Computer Use is currently in research preview, and apps handling sensitive data are disabled by default.

I would not run this on a machine with production credentials to AWS or a password manager unlocked. Not yet. For development work on isolated repos and general productivity tasks, the safety layer feels sufficient. For anything with real-world financial or security consequences, manual oversight is still warranted.

## What This Replaces

The value proposition is not any single feature. It is the consolidation. Before this week, achieving what Claude now does out of the box required stitching together Zapier for app automation, n8n or Make for workflow orchestration, Alfred or Raycast for Mac automation, and custom scripts for Git operations. Each tool had its own configuration, its own failure modes, its own pricing.

Claude replaces a meaningful portion of that stack with a single natural-language interface at $20/month (Pro) or $100/month (Max). The limitation is macOS only, and the Computer Use feature is in research preview — meaning Anthropic might change the API or restrict functionality based on safety findings.

Microsoft's [Copilot](https://copilot.microsoft.com/) handles Office 365 well but does not control the OS. Google's [Gemini](https://gemini.google.com/) experiments with Android device control but has no desktop equivalent. Apple Intelligence integrates deeply with macOS but does not connect to developer tools. Anthropic is the first to ship a developer-and-productivity agent that operates at the OS level with a phone-based remote control.

Whether this becomes the default way developers work depends on two things: reliability at scale (can it handle 50 tasks a day without misclicking?) and security hardening (can it safely operate on machines with production access?). Both are solvable problems with the architecture Anthropic has laid out.

> One sentence from your phone. Your Mac does the work. The question is not whether this is possible — it is how much of your workflow you are willing to hand over.

---

Full Korean analysis on [spoonai.me](https://spoonai.me/blog/2026-03-29-claude-computer-use-cowork-auto-2026-ko).

Also published on [DEV.to](https://dev.to/jee599/claude-computer-use-cowork-auto-2026).

**Sources:**
- [Anthropic Blog: Dispatch and Computer Use](https://claude.com/blog/dispatch-and-computer-use)
- [Engadget: Claude Code and Cowork Can Now Use Your Computer](https://www.engadget.com/ai/claude-code-and-cowork-can-now-use-your-computer-210000126.html)
- [MacRumors: Claude Use Mac Remotely from iPhone](https://www.macrumors.com/2026/03/24/claude-use-mac-remotely-iphone/)
- [Anthropic Engineering: Claude Code Auto Mode](https://www.anthropic.com/engineering/claude-code-auto-mode)
- [WinBuzzer: Claude Code Cowork Auto Mode](https://winbuzzer.com/2026/03/25/anthropic-claude-code-cowork-auto-mode-computer-use-xcxwbn/)
- [Builder.io: Claude Code Updates](https://www.builder.io/blog/claude-code-updates)
