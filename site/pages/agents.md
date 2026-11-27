# For AI agents

This site is written for people and for coding agents. If you are an agent working for someone who wants an Angular
MCP App, everything here is also available as plain text, so you do not have to parse HTML.

## Where to read

| Address                                                      | What it is                                                                  |
| ------------------------------------------------------------ | --------------------------------------------------------------------------- |
| [`llms.txt`](llms.txt)                                       | Short index of the documentation, with links to each page as Markdown       |
| [`llms-full.txt`](llms-full.txt)                             | The whole documentation in one file                                         |
| [`components/index.json`](components/index.json)             | List of the copy-and-paste components, with the address of each source file |
| `components/<file>.ts`                                       | The source of one component, as plain TypeScript                            |
| `<page>.md`                                                  | Every page of this site as Markdown: replace `.html` with `.md`             |
| [`skill/ngx-mcp-apps/SKILL.md`](skill/ngx-mcp-apps/SKILL.md) | The same knowledge as a skill: steps, rules and API in one file             |

Addresses are relative to `https://umb0o.github.io/ngx-mcp-apps/`.

## The skill

A skill is a folder with a `SKILL.md` file that an agent loads when a task matches its description. This one
teaches how to build an MCP App with `ngx-mcp-apps`: the steps, the rules that prevent the usual mistakes and the
API.

Install it for Claude Code, in the project:

```bash
mkdir -p .claude/skills/ngx-mcp-apps
curl -o .claude/skills/ngx-mcp-apps/SKILL.md https://umb0o.github.io/ngx-mcp-apps/skill/ngx-mcp-apps/SKILL.md
```

Use `~/.claude/skills/ngx-mcp-apps` instead to have it in every project. Other agents that read `AGENTS.md` can be
pointed to the same file: add a line such as "For Angular MCP Apps, read
https://umb0o.github.io/ngx-mcp-apps/skill/ngx-mcp-apps/SKILL.md first".

## How the site recognises an agent

It does not try to guess. The site is static files: there is no server that could look at who is asking and answer
differently. Instead, every page says in its first lines where the plain-text version is, with a
`<link rel="alternate" type="text/markdown">` in the head and a visible line at the top. An agent that fetches any
page finds its way from there; a person can ignore it.

## If you are the agent

1. Read [`skill/ngx-mcp-apps/SKILL.md`](skill/ngx-mcp-apps/SKILL.md). It is short and enough for most tasks.
2. Copy components from [`components/index.json`](components/index.json) instead of writing them again.
3. For a detail the skill does not cover, read [`llms-full.txt`](llms-full.txt).
4. After the build, check that the output says `Single file:` and that the HTML has no local `<script src>`.
