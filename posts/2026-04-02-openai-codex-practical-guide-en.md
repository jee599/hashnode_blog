---
title: "I Read OpenAI Codex's Source and Built My Workflow Around It"
subtitle: "A practical guide to AGENTS.md, config.toml, MCP servers, Ollama, CI/CD automation, and plugin systems in OpenAI's open-source Codex CLI"
slug: openai-codex-practical-guide
published: true
tags: [ai, opensource, rust, programming, codex]
cover: https://r2.jidonglab.com/blog/2026/04/openai-codex-practical-guide-hero.jpg
canonical: https://jidonglab.com/blog/openai-codex-practical-guide
enableToc: true
---

I cloned the Codex repo and started reading. Not the README. Not the blog post. The actual Rust source under `codex-rs/core/`. After [dissecting the architecture](https://plzai.hashnode.dev/openai-codex-open-source-analysis) in my previous post, I wanted to answer a different question: how do you actually build a workflow around this thing?

The answer turned out to be more interesting than I expected. Codex CLI is not just a coding assistant you run in the terminal. It is a platform with five distinct extension points, each designed to integrate into different parts of the development lifecycle. I spent a week wiring them together. This is what the setup looks like, how it works, and where it breaks.

## The Configuration Stack: AGENTS.md Meets config.toml

Every AI coding tool needs a way to tell the agent what to do and what not to do. Codex CLI splits this into two files with very different purposes.

[AGENTS.md](https://developers.openai.com/codex/guides/agents-md) is the behavioral layer. It tells the agent how to write code, which patterns to follow, and what to avoid. The file loads hierarchically. The global file at `~/.codex/AGENTS.md` is read first. Then the project-level file at `.codex/AGENTS.md` is merged on top. If you navigate into a subdirectory that has its own AGENTS.md, that layer gets added too. The system merges up to 32KB of combined instructions automatically.

I set up mine like this. The global file carries standards that apply everywhere.

```markdown
# ~/.codex/AGENTS.md

Always use TypeScript strict mode.
Never commit console.log statements.
Every public function must have a JSDoc comment.
Prefer named exports over default exports.
```

The project file carries context that only matters for that codebase.

```markdown
# .codex/AGENTS.md

This project uses Next.js 16 App Router.
API routes live under src/app/api/.
Database migrations use drizzle-kit.
All API responses follow the { data, error, meta } envelope.
State management uses Zustand, not Redux.
```

The beauty of this hierarchy is team standardization. You commit `.codex/AGENTS.md` to the repository. Every developer who clones the project gets the same agent behavior. No more "but it works on my machine" for AI-assisted coding. The agent follows the same rules whether it is running on a senior engineer's laptop or a junior developer's first day setup.

[config.toml](https://developers.openai.com/codex/config-advanced) is the execution environment layer. It controls the sandbox, the model, and the approval policy. The sandbox determines what the agent can touch on the filesystem. The approval policy determines how much autonomy the agent has.

```toml
# ~/.codex/config.toml
model = "o4-mini"
approval_policy = "untrusted"

[sandbox]
mode = "workspace-write"
writable_roots = ["/Users/jidong/projects"]
```

Three approval levels exist. `on-request` makes the agent ask permission for every tool call, which is the safest but slowest mode. `untrusted` auto-approves safe operations like reading files and running linters, but asks before writing files or executing shell commands. `never` auto-approves everything, which is what you want in CI but never on your local machine with a production database connection.

The combination of AGENTS.md and config.toml creates a two-dimensional configuration space. One axis is "what should the agent do" (behavioral). The other is "what is the agent allowed to do" (environmental). Keeping them separate is a design decision that pays off when you want the same behavioral rules but different sandboxing in local development versus CI.

## MCP Servers: Plugging External Tools Into the Agent Loop

The [Model Context Protocol](https://developers.openai.com/codex/mcp) is how Codex CLI gains abilities beyond reading and writing code. MCP servers are external processes that expose tools through a standardized JSON interface. The agent discovers available tools at startup and can call them during its execution loop.

Adding a server takes one command.

```bash
codex mcp add my-db-tool -- npx @my-org/db-mcp-server --connection-string $DB_URL
```

That command registers a STDIO-based MCP server. When Codex starts, it spawns the server process, negotiates the tool list, and makes those tools available to the model. HTTP-based servers work similarly but connect over the network instead.

```bash
codex mcp add monitoring --url https://mcp.internal.company.com/v1
```

What makes MCP powerful is the filtering layer. You can whitelist specific tools from a server, which means you can connect a database MCP server but only allow SELECT queries. You can blacklist dangerous tools, keeping the data exploration capabilities while blocking anything that mutates state.

I connected three MCP servers to my setup. A PostgreSQL server for querying production data during debugging. A Sentry server for pulling error traces directly into the agent context. And a deployment server that lets the agent check the status of my Vercel deployments. The agent can now say "the last error in Sentry for this function was a null reference on line 42, and here's the fix" instead of making me alt-tab between four browser tabs.

## The Plugin System: Packaging Team Workflows

MCP gives you individual tools. [Plugins](https://developers.openai.com/codex/plugins/build) give you packaged workflows. A plugin is a directory with a `plugin.json` manifest that bundles multiple tools, configurations, and documentation into a single installable unit.

```json
{
  "name": "acme-dev-workflow",
  "version": "2.1.0",
  "description": "Standard development workflow for ACME Corp",
  "tools": [
    {
      "name": "deploy-staging",
      "description": "Deploy current branch to staging environment",
      "command": "bash scripts/deploy-staging.sh"
    },
    {
      "name": "run-e2e",
      "description": "Execute end-to-end test suite with Playwright",
      "command": "npx playwright test --reporter=json"
    },
    {
      "name": "check-migration",
      "description": "Validate database migration safety",
      "command": "npx drizzle-kit check"
    }
  ]
}
```

The difference between a plugin and a collection of shell scripts is discoverability. When the agent knows these tools exist and what they do, it can use them autonomously. You say "deploy this to staging and run the E2E suite" and the agent chains deploy-staging followed by run-e2e without you specifying the commands. The tool descriptions in the manifest are the prompt engineering that makes this work.

I packaged my entire project workflow into a plugin. New team members run `codex plugin install ./codex-plugin` and immediately have access to deployment, testing, and database validation tools. No onboarding document needed. The agent knows the workflow because the plugin told it.

## Local LLMs: Running Codex Without the Cloud

The `--oss` flag changes everything about how Codex CLI operates. Instead of calling the OpenAI API, it connects to a local model runtime. [Ollama](https://ollama.com/), [LM Studio](https://lmstudio.ai/), and [MLX](https://github.com/ml-explore/mlx) are all supported through the OpenAI-compatible API interface.

The configuration lives in config.toml.

```toml
[model_providers.ollama]
base_url = "http://localhost:11434/v1"
model = "deepseek-coder-v2:33b"
```

```bash
codex --oss --model deepseek-coder-v2:33b "refactor this function to use async/await"
```

I tested this with DeepSeek Coder V2 33B on an M4 Max MacBook Pro with 128GB of unified memory. The model generates about 30 tokens per second, which is usable for code review and refactoring tasks. For comparison, OpenAI's o4-mini streams at over 100 tokens per second through the API. The speed gap is real, but the tradeoffs are equally real. Zero API cost. Zero data leaving your machine. Zero network latency for the prompt upload.

The community has taken this further. Searching [Codex forks on GitHub](https://github.com/openai/codex/forks) reveals dozens of variants. Some optimize the Ollama integration path for specific model architectures. Others add support for custom model providers that do not follow the OpenAI API format. One fork implements a prompt caching layer that reuses previous context windows across sessions, cutting inference time by roughly 40% for repetitive tasks.

This is where the Apache 2.0 license shows its value. The commercial AI coding tools are black boxes. You cannot fork Claude Code and optimize it for your hardware. With Codex CLI, the entire agent loop is in `codex-rs/core/src/agent_loop.rs`. You can read it, modify it, and rebuild it in under a minute with `cargo build --release`.

## CI/CD Automation: The Agent Moves to the Pipeline

The most practical extension point is the [GitHub Action](https://developers.openai.com/codex/github-action). The `openai/codex-action@v1` action runs Codex CLI in a GitHub Actions runner, triggered by pull request events.

```yaml
name: Codex PR Review
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: openai/codex-action@v1
        with:
          openai_api_key: ${{ secrets.OPENAI_API_KEY }}
          prompt: |
            Review this PR for security vulnerabilities,
            performance regressions, and coding convention violations.
            Reference the project's AGENTS.md for conventions.
          approval_policy: "never"
```

The `codex exec` command is the non-interactive counterpart for scripting. It runs a prompt, executes the agent loop, and outputs the result to stdout. No terminal UI, no interactive approval. Combined with `--output json`, it becomes a building block for arbitrary automation.

```bash
codex exec --output json "analyze the security posture of src/auth/"
```

What ties CI/CD together with the rest of the configuration stack is AGENTS.md. The same behavioral rules that guide the agent on your local machine guide it in the CI pipeline. When the GitHub Action checks out your repository, it reads `.codex/AGENTS.md` and follows the same coding conventions. Your human reviewers and your AI reviewer enforce the same standards.

I set up a workflow where every PR gets an automated review comment within 90 seconds. The action reads the diff, applies the project's AGENTS.md rules, and posts a review with specific line comments. It catches about 60% of the issues that would otherwise surface in human review, mostly formatting violations, missing error handling, and inconsistent naming. The remaining 40% still needs human judgment, but the first pass is free and instant.

## Reading the Agent Loop Source

If you want to understand how any of this works at the deepest level, the code path is straightforward. The `codex-rs/core/` directory contains the engine.

```
codex-rs/core/
  src/
    agent_loop.rs    -- entry point, the main request-response cycle
    tool_spec.rs     -- tool definitions and JSON Schema validation
    sandbox.rs       -- filesystem permission enforcement
    config.rs        -- config.toml parsing and validation
    mcp_client.rs    -- MCP protocol client implementation
```

`agent_loop.rs` is where the model output becomes action. It parses streaming events from the API, detects tool calls in the response, dispatches them to the appropriate handler, collects results, and feeds them back into the next API request. The loop continues until the model produces a final text response with no tool calls.

`sandbox.rs` is the security boundary. On macOS it uses the sandbox-exec profile system. On Linux it uses Landlock, a kernel-level access control mechanism. The implementation forks at compile time based on the target platform, which means the sandbox is not a runtime abstraction but a platform-native security enforcement layer.

Reading these files took me about four hours. The Rust code is dense but well-structured. The comments explain "why" rather than "what," which aligns with good systems programming practice. If you have ever wanted to understand how an AI coding agent actually works, not at the blog post level but at the syscall level, this is the codebase to read.

## What This Means for the AI Coding Tool Landscape

Codex CLI is not the most capable AI coding tool available today. Claude Code handles complex multi-file refactoring with more reliability. Cursor's IDE integration is more seamless for day-to-day editing. But Codex CLI is the most extensible.

The five extension points create a platform, not just a tool. AGENTS.md standardizes agent behavior across teams. config.toml controls the security boundary. MCP connects external systems. Plugins package workflows. The GitHub Action moves the agent into CI/CD. Each point is independently useful. Together, they form an infrastructure layer for AI-assisted development.

The open-source model means the community can fill gaps that OpenAI's team cannot prioritize. Local LLM performance is improving through community forks. Domain-specific plugins are emerging for frameworks like Rails, Django, and Spring Boot. Custom MCP servers are being built for internal tooling at companies that would never contribute to a closed-source project.

Whether Codex CLI catches up to Claude Code in raw capability is an open question. But the extensibility gap runs in the opposite direction, and it is widening.

> "The best tool is the one you can modify." -- Every systems programmer, eventually.

What extension point would you build first? I'm curious whether anyone has wired up MCP servers for something I haven't thought of. Find me at [spoonai.me](https://spoonai.me) where I cover AI development tooling daily.
