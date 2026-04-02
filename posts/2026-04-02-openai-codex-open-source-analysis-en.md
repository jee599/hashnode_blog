---
title: "71,700 Stars and 60 Rust Crates: Inside OpenAI's Codex CLI Source"
subtitle: "A deep read of OpenAI's open-sourced AI coding agent — agent loop, OS sandboxing, MCP integration, and how it compares to Claude Code"
slug: openai-codex-open-source-analysis
published: true
tags: [ai, opensource, rust, programming, codex]
cover: https://r2.jidonglab.com/blog/2026/04/openai-codex-open-source-analysis-hero.jpg
canonical: https://jidonglab.com/blog/openai-codex-open-source-analysis
enableToc: true
---

71,700 stars. 5,006 commits. 665 releases. 94.7% Rust. When [OpenAI](https://openai.com/) dropped the full source code of [Codex CLI](https://github.com/openai/codex) under the [Apache 2.0 license](https://www.apache.org/licenses/LICENSE-2.0), I expected a thin wrapper around an API. What I found was a deeply engineered system with over 60 Rust crates, OS-level sandboxing on three platforms, and an agent loop architecture that reveals how OpenAI thinks about local AI tooling.

I spent a weekend reading through the repository. This is what I found.

## Why I Opened the Source

I've been building with AI coding tools for over a year. I wrote about bootstrapping a full pipeline with GPT-5 Codex in a single day, and I've documented my experience running parallel subagents with Claude Code. But every tool I've used has been a black box at some level. The model is remote. The agent logic is proprietary. The sandbox rules are opaque.

When Codex CLI went open-source, the appeal was obvious: for the first time, I could read the exact code that decides what an AI agent can and cannot do on my machine. Not a documentation page. Not a blog summary. The actual Rust source.

The repository lives at `github.com/openai/codex`. The core logic sits under `codex-rs/`, with four top-level crates that divide responsibility cleanly. There's `core` for the agent loop and tool execution. There's `cli` for the terminal interface. There's `tui` for the text-based graphical UI. And there's `headless`, which speaks JSON-RPC over stdio so that VS Code extensions and web applications can connect to the same engine without any GUI.

## The Agent Loop, Unwrapped

The architecture follows a pattern that's becoming standard in AI coding tools, but the implementation details matter. When you type a natural language command into Codex CLI, the `core` crate takes over. It constructs an HTTP request to the [OpenAI Responses API](https://platform.openai.com/docs/api-reference) and opens a streaming connection. Events arrive one by one. Some are text tokens. Some are tool calls.

Here's the flow, stripped to its essence:

```
User prompt
     |
     v
+------------------+
|  core: agent     |
|  loop            |
+------------------+
     |
     v
OpenAI Responses API
(streaming HTTP)
     |
     v
+------------------+
|  Event parser    |
+------------------+
     |
     +---> Text token --> stream to terminal
     |
     +---> Tool call --> execute locally
                |
                v
         Return result to API
                |
                v
         (loop continues)
```

The tool system is defined through a `ToolSpec` enum. Each tool declares its input and output via [JSON Schema](https://json-schema.org/), which means the model knows exactly what parameters a tool accepts and what shape the response will take. This is the same pattern that Claude Code and other agent frameworks use, but seeing it implemented in Rust with full type safety gives it a different character. There's no runtime type coercion. No `any` escape hatch. Every tool call is validated at compile time against its schema.

What makes this extensible is [MCP](https://modelcontextprotocol.io/) integration. MCP, the Model Context Protocol, allows external servers to register tools dynamically. If you have a custom database tool or a deployment script that you want the agent to use, you spin up an MCP server and Codex CLI discovers it at runtime. The agent treats MCP tools identically to built-in ones. Same schema validation. Same sandbox restrictions.

The system prompt lives in a file called `codex-rs/core/prompt.md`, a plain Markdown file that anyone can read and modify. Configuration sits in `~/.codex/config.toml`. Session state persists to a local [SQLite](https://sqlite.org/) database. There's no cloud state. Everything lives on your machine.

## Sandboxing: Three Operating Systems, Three Strategies

The security model is where the engineering gets serious. Codex CLI doesn't just run commands in a subprocess and hope for the best. It wraps every tool execution in an OS-native sandbox.

On macOS, it uses [Seatbelt](https://developer.apple.com/documentation/security/app-sandbox), Apple's application sandbox framework. The same technology that restricts what App Store applications can access on your Mac is applied to every command the AI agent runs. File system access is limited to the project directory. Network connections can be blocked or scoped. Process creation is controlled.

On Linux, the approach combines [Bubblewrap](https://github.com/containers/bubblewrap) for filesystem and namespace isolation with [Seccomp](https://man7.org/linux/man-pages/man2/seccomp.2.html) for system call filtering. Bubblewrap creates a lightweight container-like environment. Seccomp sits below that, blocking dangerous syscalls entirely. The agent literally cannot call `execve` on an arbitrary binary outside its allowed list.

On Windows, Restricted Tokens limit the process's access rights. It's the least granular of the three approaches, but it still prevents the agent from accessing files or registry keys outside its scope.

This is fundamentally different from how [Claude Code](https://code.claude.com/) handles security. Claude Code runs its model inference on Anthropic's cloud. The local client, written in TypeScript, executes tools on your machine but relies on a permission-based model rather than OS-level sandboxing. You approve or deny each action. With Codex CLI, the sandbox enforces restrictions regardless of what the model requests. The model can ask to read `/etc/passwd` all day long. Seatbelt will say no.

## Performance: Caching and the Model Question

Codex CLI is built around GPT-5.3-Codex, a model variant optimized for code generation and tool use. The performance optimization strategy centers on prompt caching. System prompts, project context, and frequently repeated instructions are cached on the API side, reducing both latency and cost on subsequent turns within a conversation.

The Rust implementation itself contributes to performance in ways that a TypeScript or Python agent cannot match. There's no garbage collector pause. Memory allocation is deterministic. The binary ships as a single executable with no runtime dependencies. On my machine, cold start to first API call takes under 200 milliseconds. Compare that to Node.js-based tools where the module resolution alone can take longer.

The headless mode deserves attention here. By communicating over JSON-RPC through stdio using JSONL (newline-delimited JSON), Codex CLI achieves a clean separation between the engine and any frontend. The same binary that powers the terminal CLI also powers the VS Code extension and could power a web application. There's no separate server process. No WebSocket setup. Just stdin and stdout, the most universal IPC mechanism in computing.

## What Open Source Changes

Reading Codex CLI's source changed how I think about AI coding tools. When I use Claude Code, I trust [Anthropic](https://www.anthropic.com/)'s security claims. When I use Codex CLI, I can verify them. I can grep for `seatbelt` in the codebase and read the exact sandbox profile applied to my commands. I can open `prompt.md` and see what the model is told about my project before it generates a single token.

This transparency has practical implications. Enterprise security teams can audit the sandbox policies before approving the tool. Contributors can fix bugs in the agent loop without waiting for a vendor patch. Researchers can study a production-grade AI agent architecture without reverse engineering.

The choice of Rust is itself a statement. Building an AI tool's core in a systems language that guarantees memory safety, compiles to native code, and supports cross-platform builds from a single codebase signals long-term investment in performance and reliability. Python would have been easier. TypeScript would have matched the web ecosystem. Rust says: this tool will run on your machine, close to your code, and it will not crash.

The competitive landscape is shifting. Claude Code dominates in developer experience and model capability. [Cursor](https://cursor.sh/) owns the IDE integration space. [GitHub Copilot](https://github.com/features/copilot) has distribution through GitHub's user base. Codex CLI's bet is that full transparency and community ownership will attract developers who care about understanding and controlling the tools they depend on.

Whether that bet pays off depends on the community. The code is there. The architecture is solid. The question is whether 71,700 stars translate into contributors who push the tool beyond what OpenAI alone would build.

> The best way to trust an AI tool is to read its source code.

What would you build if you could fork the entire agent loop?

---

Korean version: [spoonai.me](https://spoonai.me/posts/openai-codex-open-source-analysis) | Also on [DEV.to](https://dev.to/jee599/71700-stars-and-60-rust-crates-inside-openais-codex-cli-source)
