---
title: "What 512,000 Lines of Leaked Code Taught Me About Using Claude Code"
subtitle: "A practical guide to hooks, MCP servers, sub-agents, and agent teams — built from the leaked source and official documentation"
slug: "claude-code-source-practical-guide"
cover: https://r2.jidonglab.com/blog/2026/04/claude-code-source-practical-guide-hero.jpg
tags: [ai, programming, productivity, opensource]
canonical: https://jidonglab.com/blog/claude-code-source-practical-guide
enableToc: true
---

When the Claude Code source leaked through that npm source map incident last week, I wrote about what was found inside — KAIROS, anti-distillation, the Undercover mode. That article was about what Anthropic was hiding. This one is about what they were giving away for free, if you knew where to look.

I spent the past several days cross-referencing the leaked TypeScript source against Anthropic's [official documentation](https://code.claude.com/docs/en/hooks) and building out configurations that actually work. The gap between "install Claude Code and start chatting" and "configure Claude Code as a programmable development platform" is enormous. Most developers are stuck on the first side. After reading 512,000 lines of source, I am firmly on the second.

## The Three Layers of Control

Claude Code's architecture reveals a deliberate separation into three control surfaces, and understanding this separation is the key to everything that follows.

The first layer is declarative. Your `CLAUDE.md` file — placed at the project root, in subdirectories, or globally at `~/.claude/CLAUDE.md` — tells the agent what your project is about. According to [Claude Directory's guide](https://www.claudedirectory.org/blog/claude-md-guide), this file supports hierarchical loading: the root file sets the baseline, subdirectory files override within their scope, and the global file applies everywhere. The leaked source confirmed something the documentation only hints at: there's a `.claude/rules/` directory that accepts YAML files with conditional rules. You can trigger different instructions based on file extensions, directory paths, and even change patterns. When the agent touches a `.tsx` file it gets your accessibility checklist; when it works inside `api/` it gets your error handling requirements. The loading is deterministic — no model interpretation involved.

The second layer is programmatic. This is the [Hooks system](https://code.claude.com/docs/en/hooks), and it changed how I think about Claude Code entirely. There are three hook types: `PreToolUse` fires before the agent executes any tool, `PostToolUse` fires after, and `SessionStart` fires when a session begins. The critical detail is that hooks are executed by the client, not by the LLM. This means your hook script runs deterministically regardless of the model's reasoning. It cannot be prompt-injected. It cannot be talked out of running. When I configure a `PreToolUse` hook that blocks `rm -rf` commands, that block is as reliable as a firewall rule.

Here is a working `settings.json` configuration that I use daily:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "command": "python3 ~/.claude/hooks/block-dangerous.py"
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write",
        "command": "npm test -- --bail 2>/dev/null"
      }
    ],
    "SessionStart": [
      {
        "command": "cat ~/.claude/project-context.md"
      }
    ]
  }
}
```

The `PreToolUse` hook intercepts every Bash command before execution. My `block-dangerous.py` script parses the command and rejects anything matching a deny list — `rm -rf /`, `git push --force`, `DROP TABLE`, and about thirty other patterns that no AI agent should be running without explicit human approval. The `PostToolUse` hook triggers after every file write, running the test suite in bail mode so it fails fast on the first broken test. The `SessionStart` hook pipes project context into the conversation at the start, saving the agent from having to explore the codebase from scratch every time.

The third layer is connective. This is where [MCP servers](https://code.claude.com/docs/en/mcp), [sub-agents](https://code.claude.com/docs/en/sub-agents), and [Agent Teams](https://code.claude.com/docs/en/agent-teams) live, and it is where Claude Code transforms from a code editor into a development platform.

## MCP and the Tool Search Optimization

The Model Context Protocol is Claude Code's standard interface for connecting to external services. It supports both HTTP/SSE and STDIO transports, and the idea is straightforward: you expose GitHub, Notion, databases, or any other service as "tools" that the agent can invoke. What is not straightforward — and what the leaked source revealed — is how Claude Code manages the cost of having many tools available.

When you connect multiple MCP servers, each exposing dozens of tools, the naive approach would be to load every tool's full JSON schema into the context window. For a setup with 50 tools, that could easily consume 72,000 tokens before the agent has even started working. The leaked source showed a mechanism called Tool Search that works differently. First, only the tool names and one-line descriptions are loaded — roughly 100 tokens per tool. When the agent determines it needs a specific tool, only then does it fetch the full schema. According to [Alex Kim's analysis](https://alex000kim.com/posts/2026-03-31-claude-code-source-leak/), this optimization reduced context consumption from 72,000 tokens to 8,700 tokens in a real-world configuration. That is an 87.9% reduction in context overhead, which directly translates to more room for actual conversation and code.

```
Tool Search: Progressive Loading Architecture

Phase 1 — Always Loaded (~100 tokens per tool)
+------------------------------------------+
|  tool_name: "github_create_pr"           |
|  description: "Create a pull request"    |
+------------------------------------------+
|  tool_name: "notion_query_db"            |
|  description: "Query a Notion database"  |
+------------------------------------------+
|  ... (50 tools = ~5,000 tokens)          |
+------------------------------------------+

Phase 2 — On Demand (~1,500 tokens per tool)
+------------------------------------------+
|  Full JSON Schema                        |
|  Parameters, types, examples             |
|  Only loaded when agent needs this tool  |
+------------------------------------------+
```

This pattern — which the source internally calls "progressive disclosure" — appears everywhere in Claude Code's architecture. The plugin and skill system works the same way. Skill metadata (name, trigger conditions, description) costs about 100 tokens and stays loaded permanently. The full skill content, which can be up to 5,000 tokens, loads only when the skill is actually invoked. This is why you can register dozens of skills without drowning the context window.

## Sub-agents and Agent Teams: Parallel Work That Actually Works

The [sub-agent documentation](https://code.claude.com/docs/en/sub-agents) emphasizes two principles that the leaked source enforces rigorously. The first is single-goal assignment: each sub-agent receives exactly one concrete objective. Not "refactor the auth module and update the tests" but "refactor the auth module" for one agent and "update the tests for the auth module" for another. The second principle is minimum-privilege scoping: each sub-agent gets explicit access to only the files and tools it needs. The leaked dispatch logic showed that scoping violations — a sub-agent trying to read a file outside its assigned directory — are caught and blocked at the client level.

The cost optimization built into this system is worth understanding. The main agent runs on Opus, which is the stronger and more expensive model optimized for complex reasoning. Sub-agents default to Sonnet, which is cheaper and faster, suited for execution rather than planning. This is not just a cost-saving trick; it reflects a genuine architectural insight. Planning and decomposition require deep reasoning. Execution of a well-defined task does not. By splitting these concerns across model tiers, you get Opus-quality orchestration with Sonnet-level costs for the bulk of the work.

[Agent Teams](https://code.claude.com/docs/en/agent-teams) take this further with a team lead and team member model. The team lead maintains a task list, assigns work to members, and collects results. Each team member works independently and simultaneously. The critical constraint is scope isolation: no two team members should write to the same file. When they need to work on shared files — type definitions, configuration, shared utilities — the team lead assigns those files exclusively to one member.

```
Agent Teams: Work Distribution Model

                  +------------------+
                  |   Team Lead      |  (Opus)
                  |   Task List:     |
                  |   [A] [B] [C]    |
                  +--+-----+-----+--+
                     |     |     |
              +------+  +--+--+ +------+
              |      |  |     | |      |
         +----v--+ +-v--v-+ +-v----+
         |Agent A| |Agent B| |Agent C|  (Sonnet)
         |src/   | |api/  | |tests/ |
         |auth/  | |      | |       |
         +-------+ +------+ +-------+
         Worktree1  Worktree2  Worktree3
```

The mechanism that prevents file conflicts at scale is Worktree isolation. The `--worktree` flag creates an independent directory for each branch, leveraging Git's native `git worktree` functionality. Each agent operates in its own worktree, meaning they can modify files simultaneously without ever touching the same working directory. The leaked source showed conflict detection logic that validates worktree boundaries before any file operation, and agents that attempt cross-worktree access are stopped before the write reaches disk.

## The Settings Nobody Talks About

Beyond hooks and agents, `settings.json` contains configuration options that meaningfully change how Claude Code behaves in practice. The [sandboxing documentation](https://code.claude.com/docs/en/sandboxing) covers the basics — macOS uses Seatbelt for kernel-level isolation, Linux uses bubblewrap for namespace-based containers — but the real control lives in the settings file.

```json
{
  "permissions": {
    "allowedDomains": ["api.github.com", "registry.npmjs.org"],
    "filesystem": {
      "allowWrite": ["./src", "./tests"],
      "denyRead": ["./secrets", "./.env"]
    }
  },
  "autoCompactWindow": 0.7,
  "effortLevel": "high"
}
```

The `allowedDomains` field is a network whitelist. The agent can only make HTTP requests to domains on this list, which means a compromised MCP server or a prompt injection attack cannot exfiltrate data to an arbitrary endpoint. The `filesystem` block provides directory-level access control — `allowWrite` restricts where the agent can create or modify files, and `denyRead` makes specific paths completely invisible to the agent. Setting `denyRead` on `.env` and secrets directories is the kind of defense-in-depth that the sandboxing documentation recommends but does not spell out as a configuration example.

The `autoCompactWindow` setting controls automatic context compression. At a value of 0.7, the agent compresses older conversation history when the context window reaches 70% capacity. This prevents the hard cutoff that happens when context runs out entirely, which typically causes the agent to lose track of what it was doing. The `effortLevel` parameter adjusts reasoning depth — "high" makes the agent think more carefully about each step, which is worth the extra latency for complex refactoring tasks but wasteful for simple file edits.

There is one more setting in the leaked source that I found particularly revealing. The internal permissions system has a granularity that goes beyond what the documentation describes. Individual tool types can be granted or denied independently, and these permissions can be scoped to specific directories. You could, in theory, allow the agent to run Bash commands only within `./scripts/` while allowing file writes only within `./src/`. The source code treats this as a matrix of (tool type, directory scope, permission level), which is the kind of fine-grained access control you would expect from a tool that runs autonomously for hours.

## What the Undocumented Features Mean for You

The features I covered in [the leak analysis](https://jidonglab.com/blog/claude-code-source-leak-analysis) — KAIROS, anti-distillation, Undercover mode — exist behind feature flags in the production bundle. They are not accessible to external users today. But their architecture tells us where Claude Code is going.

KAIROS is a 24-hour autonomous agent with a task queue, permission tiers, and state checkpointing. When it ships publicly, the hooks and settings I described above will be your primary control surface for governing what it can do unsupervised. The developers who have already built robust `PreToolUse` hooks and tight filesystem permissions will be ready. Those who are still running Claude Code with default settings will be scrambling to catch up.

Anti-distillation — the injection of fabricated tool definitions to poison competitors' training data — is invisible to end users and does not affect your workflows. But it reveals Anthropic's threat model: they expect their outputs to be scraped and used for training, and they are actively sabotaging that pipeline. If you are building on top of Claude's API and caching or reprocessing tool definitions, this is something to be aware of.

The progressive disclosure pattern that underlies Tool Search, skills, and plugin loading is perhaps the most important architectural insight of all. It means Claude Code is designed to scale. You can add dozens of MCP servers, register scores of custom skills, connect multiple external services, and the system will not collapse under its own weight because it only loads what it needs when it needs it. This is the kind of design decision that separates a tool from a platform.

> The difference between using Claude Code and programming Claude Code is the difference between riding a bicycle and building a road.

The question I keep coming back to is this: how many developers will read the documentation deeply enough to discover these capabilities before Anthropic makes them obvious in the UI? The source code leak, ironically, may have done more to educate the developer community about Claude Code's real potential than any official tutorial ever could.

---

*I write about AI development tools and agent architecture. For daily analysis of the AI tooling landscape, visit [spoonai.me](https://spoonai.me).*
