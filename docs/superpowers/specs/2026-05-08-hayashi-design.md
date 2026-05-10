# Hayashi — Collaborative Code Editor Discord Activity

## Overview

A Discord Embedded App Activity where a voice channel becomes a shared development workspace. The initiator connects a GitHub repo via the `launch` context. Channel members collaborate on code in real-time using Monaco + Yjs. An AI designer (Vercel AI SDK + Cloudflare Workers AI) can be assigned to specific files/folders by the initiator, generating code that merges via Yjs CRDTs. A "play" button opens a preview pane + xterm.js terminal showing the running app.

## Goals

- Lower the barrier for collaborative coding inside Discord voice channels
- Provide a real-time multi-user editor that feels native to Discord
- Allow non-coders to contribute via a generative AI agent with controlled scope
- Create a social, shared "vibe coding" experience distinct from desktop IDEs

## Non-Goals

- Full Git integration (push/pull/merge) — commits are out of scope for MVP
- Persistent hosting of preview deployments
- Support for non-web projects (e.g., mobile apps, compiled languages)
- File system operations beyond read/edit (no mkdir, rm, mv in MVP)

## Tech Stack

| Concern | Technology |
|---|---|
| Framework | React 19 + Vite |
| UI | shadcn/ui + Tailwind CSS |
| Editor | Monaco Editor + `y-monaco` |
| Collaboration | Yjs + `y-websocket` |
| AI Generation | Vercel AI SDK + Cloudflare Workers AI |
| Terminal | xterm.js |
| Preview | iframe (sandboxed) |
| Discord SDK | Embedded App SDK v2 |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Discord Client (iframe)                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ File Tree   │  │ Monaco Tabs │  │   Preview Drawer    │ │
│  │ (shadcn/ui) │  │(y-monaco)   │  │  (iframe + xterm)   │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│         │                │                    │             │
│         └────────────────┴────────────────────┘             │
│                        React State                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ WebSocket
┌─────────────────────────────────────────────────────────────┐
│                    Collaboration Server                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │  Yjs DocStore  │  │ GitHub Proxy │  │  Preview Server  │ │
│  │  (CRDT sync)   │  │ (API + clone)│  │  (iframe source) │ │
│  └──────────────┘  └──────────────┘  └──────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │         Vercel AI SDK → Cloudflare Workers AI          │ │
│  │              (generative agent endpoint)                │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Core Flow

### Initiation (Initiator only)

1. User clicks Activity in Discord voice channel
2. App receives `launch` context with `guild_id`, `channel_id`
3. Onboarding: paste GitHub repo URL, pick branch, confirm
4. Server clones/fetches repo, hydrates files into Yjs documents
5. Activity transitions to Workspace for all participants

### Collaboration (All voice channel members)

1. File tree loads from repo manifest
2. Clicking a file opens a Monaco tab bound to its Yjs document
3. Typing syncs via `y-websocket` to all clients in the channel
4. Remote cursors render via Yjs Awareness (Discord avatar colors)

### Preview

1. User hits ▶ Play button
2. Drawer slides in from right (default)
3. Server runs build command (e.g., `npm run dev`), streams logs to xterm.js
4. Preview iframe loads sandboxed dev server URL
5. Interactions in preview are live for all viewers

### AI Designer

1. Initiator opens "AI Designer" panel
2. Assigns specific files or folders to the agent (e.g., `src/components/`, `app/page.tsx`)
3. Non-coders in the channel open the AI panel, type prompts like "add a dark mode toggle"
4. AI generates code via Vercel AI SDK (Cloudflare Workers AI)
5. Generated diff is shown in a preview panel; user clicks "Apply"
6. Applied edits write into the Yjs document — CRDT merges with any human edits
7. **Guardrails:** AI can only edit files not currently open by another user; one AI request per file at a time

## State & Data Model

### Per-Channel State (server-side)

- `repo`: `{ url, branch, commit, fileManifest[] }`
- `yDocs`: `Map<path, Y.Doc>` — one Yjs document per file
- `awareness`: Yjs Awareness protocol mapping socket IDs to Discord user metadata
- `previewServer`: ephemeral dev server process + port
- `aiLock`: `Set<path>` — files currently being edited by AI

### Per-Client State (React)

- `openTabs`: `Array<{ path, yDoc, isDirty }>`
- `activeTabPath`: `string`
- `drawerOpen`: `boolean`
- `drawerTab`: `'preview' | 'terminal'`
- `selectedFile`: `string | null`
- `aiPanelOpen`: `boolean`

## UI Layout

Editor-first (v0-style) layout: file tree left, Monaco center. Preview opens as a slide-in drawer from the right. Terminal is a bottom panel inside the drawer.

```
┌──────────────────────────────────────────────────────────────┐
│  🌿 hayashi    repo-name    [Share]    [AI]    [JD] [AL] +2 │
├──────────┬───────────────────────────────┬───────────────────┤
│ 📁 src   │  Editor Tabs                  │   Preview Drawer  │
│   📄 App │  ┌─────┐ ┌─────┐              │   ┌─────────────┐ │
│   📁 lib │  │App.tsx│Navbar.tsx x│       │   │  iframe     │ │
│   📄 ... │  └─────┘                 │   │   │  (live app) │ │
│          │                               │   │             │ │
│          │  function App() {             │   └─────────────┘ │
│          │    return (                   │   ┌─────────────┐ │
│          │      <Navbar />               │   │  Terminal   │ │
│          │    );                         │   │  > npm run dev│ │
│          │  }                            │   │  [ building ]│ │
│          │                               │   └─────────────┘ │
├──────────┴───────────────────────────────┴───────────────────┤
│ [▶ Play] [🤖 Ask AI]                                       │
└──────────────────────────────────────────────────────────────┘
```

## Error Handling

| Scenario | Behavior |
|---|---|
| Repo fails to load | Error toast, return to onboarding with retry |
| GitHub auth missing | Prompt initiator to authenticate |
| Build fails | Terminal shows stderr, preview pane displays error state with logs |
| AI generation fails | Inline error in AI panel, retry button |
| AI/human conflict | File is locked while AI operates; human sees read-only badge |
| Yjs disconnect | Monaco goes read-only, "Reconnecting..." banner |
| Preview server crash | Auto-restart attempt (1x), then error state |

## Testing Strategy

- **Unit**: Yjs document operations, AI prompt formatting, tab state reducers
- **Integration**: Monaco + y-monaco binding, xterm.js data streaming
- **E2E**: Full flow — onboard repo → open file → type collaboratively → hit play → see preview

## Phase 1 Scope (MVP)

1. Discord SDK integration + `launch` context handling
2. Repo onboarding (GitHub URL → file manifest)
3. File tree + Monaco tabs with Yjs sync
4. Play button → preview drawer + xterm.js terminal
5. AI Designer panel (Vercel AI SDK + Cloudflare Workers AI) with guardrails

## Open Questions (Future Phases)

- Should the AI agent have a persistent "personality" or system prompt per project?
- How do we handle secrets (env vars) for preview builds?
- Should there be a "request review" flow before applying AI edits?
- Can we persist channel workspaces across Discord sessions?
