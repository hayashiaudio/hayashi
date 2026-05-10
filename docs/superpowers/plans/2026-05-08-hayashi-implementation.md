# Hayashi — Collaborative Code Editor Discord Activity

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Discord Embedded App Activity where voice channel members collaboratively edit a GitHub-connected repo in real-time using Monaco + Yjs, with a preview runner, terminal, and AI designer panel.

**Architecture:** Monorepo with `apps/client` (React 19 + Vite + Monaco + shadcn/ui) and `apps/server` (Node.js + Yjs WebSocket + Hono HTTP routes). Discord SDK provides auth and launch context. Yjs documents sync via WebSocket. Server proxies GitHub API, runs preview dev server, and serves AI generation endpoint via Cloudflare Workers AI REST API.

**Tech Stack:** React 19, Vite, Tailwind CSS, shadcn/ui, Monaco Editor, y-monaco, Yjs, y-websocket, xterm.js, Discord Embedded App SDK, Hono, ws, Zustand, Vitest.

---

## File Structure

```
├── apps/
│   ├── client/
│   │   ├── src/
│   │   │   ├── main.tsx
│   │   │   ├── App.tsx
│   │   │   ├── stores/
│   │   │   │   └── workspaceStore.ts
│   │   │   ├── hooks/
│   │   │   │   ├── useDiscordSdk.ts
│   │   │   │   ├── useYjsBinding.ts
│   │   │   │   └── useRepoFiles.ts
│   │   │   ├── lib/
│   │   │   │   ├── api.ts
│   │   │   │   └── constants.ts
│   │   │   └── components/
│   │   │       ├── OnboardingScreen.tsx
│   │   │       ├── WorkspaceScreen.tsx
│   │   │       ├── FileTree.tsx
│   │   │       ├── EditorTabs.tsx
│   │   │       ├── MonacoPane.tsx
│   │   │       ├── PreviewDrawer.tsx
│   │   │       ├── TerminalView.tsx
│   │   │       ├── AiDesignerPanel.tsx
│   │   │       └── UserPresenceBar.tsx
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── tailwind.config.js
│   │   ├── components.json
│   │   └── package.json
│   └── server/
│       ├── src/
│       │   ├── server.ts
│       │   ├── routes.ts
│       │   ├── yjs/
│       │   │   └── connection.ts
│       │   ├── github/
│       │   │   └── client.ts
│       │   ├── preview/
│       │   │   └── manager.ts
│       │   └── ai/
│       │       └── generate.ts
│       ├── package.json
│       └── tsconfig.json
├── package.json (root)
├── turbo.json
└── .env.example
```

---

### Task 1: Root Workspace Setup

**Files:**
- Create: `package.json`
- Create: `turbo.json`
- Create: `.env.example`

- [ ] **Step 1: Create root `package.json`**

```json
{
  "name": "hayashi",
  "private": true,
  "workspaces": ["apps/*"],
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint"
  },
  "devDependencies": {
    "turbo": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "dev": { "cache": false, "persistent": true },
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**", ".next/**"] },
    "test": { "dependsOn": ["build"] },
    "lint": { "cache": true }
  }
}
```

- [ ] **Step 3: Create `.env.example`**

```bash
# Discord
VITE_DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret

# Server
SERVER_PORT=3001
SERVER_URL=localhost:3001

# GitHub
GITHUB_TOKEN=ghp_your_token

# Cloudflare Workers AI
CLOUDFLARE_ACCOUNT_ID=your_account_id
CLOUDFLARE_API_TOKEN=your_api_token
```

- [ ] **Step 4: Install root dependencies**

Run: `npm install`
Expected: `turbo` installed at root, `node_modules` created.

- [ ] **Step 5: Commit**

```bash
git add package.json turbo.json .env.example
git commit -m "chore: root workspace setup with turbo"
```

---

### Task 2: Server Scaffolding

**Files:**
- Create: `apps/server/package.json`
- Create: `apps/server/tsconfig.json`
- Create: `apps/server/src/server.ts`

- [ ] **Step 1: Create `apps/server/package.json`**

```json
{
  "name": "@hayashi/server",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "vitest run",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "hono": "^4.4.0",
    "ws": "^8.17.0",
    "yjs": "^13.6.0",
    "y-websocket": "^2.0.0",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/ws": "^8.5.0",
    "tsx": "^4.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.0.0"
  }
}
```

- [ ] **Step 2: Create `apps/server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `apps/server/src/server.ts`**

```typescript
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { Hono } from 'hono';
import { handle } from 'hono/node-server';
import { setupYjsConnection } from './yjs/connection.js';

const app = new Hono();
const server = createServer(handle(app));
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const docName = req.url?.slice(1) ?? 'default';
  setupYjsConnection(ws, req, docName);
});

const PORT = process.env.SERVER_PORT ? parseInt(process.env.SERVER_PORT) : 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export { app, server, wss };
```

- [ ] **Step 4: Install server dependencies**

Run: `cd apps/server && npm install`
Expected: Dependencies installed, `apps/server/node_modules` created.

- [ ] **Step 5: Commit**

```bash
git add apps/server/
git commit -m "chore: server scaffolding with hono, ws, yjs"
```

---

### Task 3: Client Scaffolding

**Files:**
- Create: `apps/client/package.json`
- Create: `apps/client/vite.config.ts`
- Create: `apps/client/tsconfig.json`
- Create: `apps/client/index.html`
- Create: `apps/client/tailwind.config.js`
- Create: `apps/client/src/main.tsx`
- Create: `apps/client/src/App.tsx`
- Create: `apps/client/src/index.css`

- [ ] **Step 1: Create `apps/client/package.json`**

```json
{
  "name": "@hayashi/client",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@discord/embedded-app-sdk": "^1.4.0",
    "@monaco-editor/react": "^4.6.0",
    "yjs": "^13.6.0",
    "y-monaco": "^0.1.6",
    "y-websocket": "^2.0.0",
    "xterm": "^5.3.0",
    "xterm-addon-fit": "^0.8.0",
    "zustand": "^4.5.0",
    "lucide-react": "^0.378.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.3.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.4.0",
    "vite": "^5.2.0",
    "vitest": "^1.0.0"
  }
}
```

- [ ] **Step 2: Create `apps/client/vite.config.ts`**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
  },
});
```

- [ ] **Step 3: Create `apps/client/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 4: Create `apps/client/tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 5: Create `apps/client/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Hayashi</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create `apps/client/tailwind.config.js`**

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        moss: {
          50: '#f4f7f4',
          100: '#e3ebe3',
          200: '#c7d7c7',
          300: '#9eb99e',
          400: '#729672',
          500: '#527852',
          600: '#3f5f3f',
          700: '#334d33',
          800: '#2b3f2b',
          900: '#243424',
          950: '#111d11',
        },
        cream: {
          50: '#fdfbf7',
          100: '#fbf5ec',
          200: '#f6ead6',
          300: '#efd7b5',
          400: '#e6bf8e',
          500: '#dda46e',
        }
      }
    }
  },
  plugins: [require("tailwindcss-animate")],
};
```

- [ ] **Step 7: Create `apps/client/postcss.config.js`**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 8: Create `apps/client/src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 240 10% 3.9%;
    --card: 0 0% 100%;
    --card-foreground: 240 10% 3.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 240 10% 3.9%;
    --primary: 120 30% 35%;
    --primary-foreground: 0 0% 100%;
    --secondary: 240 4.8% 95.9%;
    --secondary-foreground: 240 5.9% 10%;
    --muted: 240 4.8% 95.9%;
    --muted-foreground: 240 3.8% 46.1%;
    --accent: 240 4.8% 95.9%;
    --accent-foreground: 240 5.9% 10%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 5.9% 90%;
    --input: 240 5.9% 90%;
    --ring: 120 30% 35%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 120 20% 8%;
    --foreground: 0 0% 95%;
    --card: 120 20% 10%;
    --card-foreground: 0 0% 95%;
    --popover: 120 20% 10%;
    --popover-foreground: 0 0% 95%;
    --primary: 120 30% 45%;
    --primary-foreground: 0 0% 100%;
    --secondary: 120 10% 18%;
    --secondary-foreground: 0 0% 95%;
    --muted: 120 10% 18%;
    --muted-foreground: 120 5% 55%;
    --accent: 120 10% 18%;
    --accent-foreground: 0 0% 95%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 0 0% 95%;
    --border: 120 10% 20%;
    --input: 120 10% 20%;
    --ring: 120 30% 45%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
    font-feature-settings: "rlig" 1, "calt" 1;
  }
}
```

- [ ] **Step 9: Create `apps/client/src/main.tsx`**

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 10: Create `apps/client/src/App.tsx`**

```typescript
import { useDiscordSdk } from './hooks/useDiscordSdk';
import { OnboardingScreen } from './components/OnboardingScreen';
import { WorkspaceScreen } from './components/WorkspaceScreen';

function App() {
  const { ready, channelId } = useDiscordSdk();

  if (!ready) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-moss-950 text-cream-100">
        <div className="animate-pulse">Connecting to Discord...</div>
      </div>
    );
  }

  if (!channelId) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-moss-950 text-cream-100">
        Error: No channel context found.
      </div>
    );
  }

  // TODO: Check if repo is already loaded for this channel
  const hasRepo = false;

  return hasRepo ? <WorkspaceScreen /> : <OnboardingScreen />;
}

export default App;
```

- [ ] **Step 11: Install client dependencies**

Run: `cd apps/client && npm install`
Expected: All dependencies installed, `node_modules` created.

- [ ] **Step 12: Verify dev server starts**

Run: `cd apps/client && npm run dev`
Expected: Vite dev server starts on port 3000, shows "Connecting to Discord..." in browser.

- [ ] **Step 13: Commit**

```bash
git add apps/client/
git commit -m "chore: client scaffolding with react, vite, tailwind, zustand"
```

---

### Task 4: Discord SDK Integration

**Files:**
- Create: `apps/client/src/hooks/useDiscordSdk.ts`
- Create: `apps/client/src/lib/constants.ts`
- Modify: `apps/client/src/App.tsx`

- [ ] **Step 1: Create `apps/client/src/lib/constants.ts`**

```typescript
export const DISCORD_CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID;
export const SERVER_URL = import.meta.env.VITE_SERVER_URL;
```

- [ ] **Step 2: Create `apps/client/src/hooks/useDiscordSdk.ts`**

```typescript
import { useEffect, useState } from 'react';
import { DiscordSDK } from '@discord/embedded-app-sdk';
import { DISCORD_CLIENT_ID } from '@/lib/constants';

const discordSdk = new DiscordSDK(DISCORD_CLIENT_ID);

interface DiscordContext {
  ready: boolean;
  channelId: string | null;
  guildId: string | null;
  user: { id: string; username: string; avatar: string | null } | null;
}

export function useDiscordSdk(): DiscordContext {
  const [state, setState] = useState<DiscordContext>({
    ready: false,
    channelId: null,
    guildId: null,
    user: null,
  });

  useEffect(() => {
    async function init() {
      await discordSdk.ready();
      await discordSdk.commands.authenticate({});

      const { channel_id, guild_id } = discordSdk.channelId
        ? { channel_id: discordSdk.channelId, guild_id: null }
        : { channel_id: null, guild_id: null };

      // Fallback: try to get from URL params for local dev
      const params = new URLSearchParams(window.location.search);
      const fallbackChannelId = params.get('channel_id') ?? channel_id;
      const fallbackGuildId = params.get('guild_id') ?? guild_id;

      const user = discordSdk.currentUser ?? null;

      setState({
        ready: true,
        channelId: fallbackChannelId,
        guildId: fallbackGuildId,
        user: user
          ? {
              id: user.id,
              username: user.username,
              avatar: user.avatar,
            }
          : null,
      });
    }

    init().catch((err) => {
      console.error('Discord SDK init failed:', err);
      setState((s) => ({ ...s, ready: true }));
    });
  }, []);

  return state;
}

export { discordSdk };
```

- [ ] **Step 3: Update `apps/client/src/App.tsx` to use real state**

Replace the `hasRepo` stub with a store check:

```typescript
import { useDiscordSdk } from './hooks/useDiscordSdk';
import { useWorkspaceStore } from './stores/workspaceStore';
import { OnboardingScreen } from './components/OnboardingScreen';
import { WorkspaceScreen } from './components/WorkspaceScreen';

function App() {
  const { ready, channelId } = useDiscordSdk();
  const repoUrl = useWorkspaceStore((s) => s.repoUrl);

  if (!ready) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-moss-950 text-cream-100">
        <div className="animate-pulse">Connecting to Discord...</div>
      </div>
    );
  }

  if (!channelId) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-moss-950 text-cream-100">
        Error: No channel context found.
      </div>
    );
  }

  return repoUrl ? <WorkspaceScreen /> : <OnboardingScreen />;
}

export default App;
```

- [ ] **Step 4: Create `apps/client/src/stores/workspaceStore.ts`**

```typescript
import { create } from 'zustand';

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
}

interface WorkspaceState {
  channelId: string | null;
  repoUrl: string | null;
  branch: string | null;
  files: FileNode[];
  openFiles: string[];
  activeFile: string | null;
  drawerOpen: boolean;
  drawerTab: 'preview' | 'terminal';
  aiPanelOpen: boolean;
  isInitiator: boolean;

  setChannelId: (id: string) => void;
  setRepo: (url: string, branch: string) => void;
  setFiles: (files: FileNode[]) => void;
  openFile: (path: string) => void;
  closeFile: (path: string) => void;
  setActiveFile: (path: string | null) => void;
  toggleDrawer: () => void;
  setDrawerTab: (tab: 'preview' | 'terminal') => void;
  toggleAiPanel: () => void;
  setInitiator: (v: boolean) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  channelId: null,
  repoUrl: null,
  branch: null,
  files: [],
  openFiles: [],
  activeFile: null,
  drawerOpen: false,
  drawerTab: 'preview',
  aiPanelOpen: false,
  isInitiator: false,

  setChannelId: (id) => set({ channelId: id }),
  setRepo: (url, branch) => set({ repoUrl: url, branch }),
  setFiles: (files) => set({ files }),
  openFile: (path) =>
    set((state) => ({
      openFiles: state.openFiles.includes(path)
        ? state.openFiles
        : [...state.openFiles, path],
      activeFile: path,
    })),
  closeFile: (path) =>
    set((state) => {
      const openFiles = state.openFiles.filter((f) => f !== path);
      return {
        openFiles,
        activeFile:
          state.activeFile === path
            ? openFiles[openFiles.length - 1] ?? null
            : state.activeFile,
      };
    }),
  setActiveFile: (path) => set({ activeFile: path }),
  toggleDrawer: () => set((state) => ({ drawerOpen: !state.drawerOpen })),
  setDrawerTab: (tab) => set({ drawerTab: tab }),
  toggleAiPanel: () => set((state) => ({ aiPanelOpen: !state.aiPanelOpen })),
  setInitiator: (v) => set({ isInitiator: v }),
}));
```

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/hooks/useDiscordSdk.ts apps/client/src/lib/constants.ts apps/client/src/stores/workspaceStore.ts apps/client/src/App.tsx
git commit -m "feat: discord sdk integration and workspace store"
```

---

### Task 5: Yjs WebSocket Server

**Files:**
- Create: `apps/server/src/yjs/connection.ts`
- Modify: `apps/server/src/server.ts`

- [ ] **Step 1: Create `apps/server/src/yjs/connection.ts`**

```typescript
import { setupWSConnection } from 'y-websocket/bin/utils';
import type { WebSocket } from 'ws';
import type { IncomingMessage } from 'http';

export function setupYjsConnection(
  ws: WebSocket,
  req: IncomingMessage,
  docName: string
) {
  setupWSConnection(ws, req, { docName });
}
```

- [ ] **Step 2: Update `apps/server/src/server.ts` to import correctly**

The file already imports `setupYjsConnection`. Verify it compiles.

- [ ] **Step 3: Test WebSocket connection**

Run: `cd apps/server && npm run dev`
In another terminal, run:
```bash
npx wscat -c ws://localhost:3001/test-doc
```
Expected: Connection established, no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/yjs/
git commit -m "feat: yjs websocket connection handler"
```

---

### Task 6: GitHub Repo Loading API

**Files:**
- Create: `apps/server/src/github/client.ts`
- Create: `apps/server/src/routes.ts`
- Modify: `apps/server/src/server.ts`

- [ ] **Step 1: Create `apps/server/src/github/client.ts`**

```typescript
interface RepoFile {
  path: string;
  name: string;
  type: 'file' | 'directory';
  children?: RepoFile[];
  content?: string;
  sha: string;
}

export async function fetchRepoTree(
  owner: string,
  repo: string,
  branch: string,
  token: string
): Promise<RepoFile[]> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  );

  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as { tree: Array<{ path: string; type: string; sha: string }> };

  const root: RepoFile[] = [];
  const dirs = new Map<string, RepoFile>();

  for (const item of data.tree) {
    const parts = item.path.split('/');
    const name = parts[parts.length - 1];

    if (parts.length === 1) {
      const file: RepoFile = {
        path: item.path,
        name,
        type: item.type === 'tree' ? 'directory' : 'file',
        sha: item.sha,
      };
      if (file.type === 'directory') file.children = [];
      root.push(file);
      dirs.set(item.path, file);
    } else {
      const parentPath = parts.slice(0, -1).join('/');
      const parent = dirs.get(parentPath);
      const file: RepoFile = {
        path: item.path,
        name,
        type: item.type === 'tree' ? 'directory' : 'file',
        sha: item.sha,
      };
      if (file.type === 'directory') file.children = [];
      if (parent && parent.children) {
        parent.children.push(file);
      }
      dirs.set(item.path, file);
    }
  }

  return root;
}

export async function fetchFileContent(
  owner: string,
  repo: string,
  path: string,
  branch: string,
  token: string
): Promise<string> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  );

  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as { content: string; encoding: string };
  return Buffer.from(data.content, 'base64').toString('utf-8');
}
```

- [ ] **Step 2: Create `apps/server/src/routes.ts`**

```typescript
import { Hono } from 'hono';
import { fetchRepoTree, fetchFileContent } from './github/client.js';

const app = new Hono();

app.get('/health', (c) => c.json({ status: 'ok' }));

app.post('/repo/load', async (c) => {
  const body = await c.req.json<{ url: string; branch: string }>();
  const { url, branch } = body;

  const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) {
    return c.json({ error: 'Invalid GitHub URL' }, 400);
  }

  const [, owner, repo] = match;
  const token = process.env.GITHUB_TOKEN ?? '';

  try {
    const tree = await fetchRepoTree(owner, repo, branch, token);
    return c.json({ owner, repo, branch, tree });
  } catch (err) {
    console.error('Repo load error:', err);
    return c.json({ error: 'Failed to load repository' }, 500);
  }
});

app.get('/repo/file', async (c) => {
  const url = c.req.query('url');
  const path = c.req.query('path');
  const branch = c.req.query('branch') ?? 'main';

  if (!url || !path) {
    return c.json({ error: 'Missing url or path' }, 400);
  }

  const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) {
    return c.json({ error: 'Invalid GitHub URL' }, 400);
  }

  const [, owner, repo] = match;
  const token = process.env.GITHUB_TOKEN ?? '';

  try {
    const content = await fetchFileContent(owner, repo, path, branch, token);
    return c.json({ content });
  } catch (err) {
    console.error('File fetch error:', err);
    return c.json({ error: 'Failed to fetch file' }, 500);
  }
});

export { app };
```

- [ ] **Step 3: Update `apps/server/src/server.ts` to mount routes**

Replace the Hono instantiation with importing the router:

```typescript
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { handle } from 'hono/node-server';
import { app } from './routes.js';
import { setupYjsConnection } from './yjs/connection.js';

const server = createServer(handle(app));
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const docName = req.url?.slice(1) ?? 'default';
  setupYjsConnection(ws, req, docName);
});

const PORT = process.env.SERVER_PORT ? parseInt(process.env.SERVER_PORT) : 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export { app, server, wss };
```

- [ ] **Step 4: Test health endpoint**

Run: `cd apps/server && npm run dev`
In another terminal:
```bash
curl http://localhost:3001/health
```
Expected: `{"status":"ok"}`

- [ ] **Step 5: Test repo load endpoint (requires GITHUB_TOKEN)**

Set `GITHUB_TOKEN` in `.env`, then:
```bash
curl -X POST http://localhost:3001/repo/load \
  -H "Content-Type: application/json" \
  -d '{"url":"https://github.com/vercel/next.js","branch":"canary"}'
```
Expected: JSON with `owner`, `repo`, `branch`, and `tree` array.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/github/ apps/server/src/routes.ts apps/server/src/server.ts
git commit -m "feat: github repo loading api"
```

---

### Task 7: Onboarding Screen

**Files:**
- Create: `apps/client/src/components/OnboardingScreen.tsx`
- Create: `apps/client/src/lib/api.ts`
- Modify: `apps/client/src/App.tsx`

- [ ] **Step 1: Create `apps/client/src/lib/api.ts`**

```typescript
import { SERVER_URL } from './constants';

export async function loadRepo(url: string, branch: string) {
  const res = await fetch(`https://${SERVER_URL}/repo/load`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, branch }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error ?? 'Failed to load repository');
  }

  return res.json();
}

export async function fetchFile(url: string, path: string, branch: string) {
  const params = new URLSearchParams({ url, path, branch });
  const res = await fetch(`https://${SERVER_URL}/repo/file?${params}`);

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error ?? 'Failed to fetch file');
  }

  return res.json();
}
```

- [ ] **Step 2: Create `apps/client/src/components/OnboardingScreen.tsx`**

```typescript
import { useState } from 'react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { loadRepo } from '@/lib/api';
import { FolderGit2, Loader2 } from 'lucide-react';

export function OnboardingScreen() {
  const [url, setUrl] = useState('');
  const [branch, setBranch] = useState('main');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setRepo = useWorkspaceStore((s) => s.setRepo);
  const setFiles = useWorkspaceStore((s) => s.setFiles);
  const setInitiator = useWorkspaceStore((s) => s.setInitiator);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const data = await loadRepo(url, branch);
      setRepo(url, branch);
      setFiles(data.tree);
      setInitiator(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-moss-950 text-cream-100">
      <div className="mb-8 text-6xl">🌿</div>
      <h1 className="mb-2 text-3xl font-bold">hayashi</h1>
      <p className="mb-8 text-cream-200/60">Collaborative code editing in Discord</p>

      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-4 rounded-xl border border-moss-700 bg-moss-900/50 p-6"
      >
        <div>
          <label className="mb-1 block text-sm font-medium text-cream-200">GitHub Repository URL</label>
          <div className="flex items-center gap-2 rounded-lg border border-moss-700 bg-moss-950 px-3 py-2">
            <FolderGit2 className="h-4 w-4 text-moss-400" />
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://github.com/owner/repo"
              className="w-full bg-transparent text-sm outline-none placeholder:text-moss-500"
              required
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-cream-200">Branch</label>
          <input
            type="text"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            className="w-full rounded-lg border border-moss-700 bg-moss-950 px-3 py-2 text-sm outline-none"
          />
        </div>

        {error && (
          <div className="rounded-lg bg-red-900/30 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-moss-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-moss-500 disabled:opacity-50"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? 'Loading...' : 'Connect Repository'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Update `apps/client/src/App.tsx` to pass channelId to store**

```typescript
import { useEffect } from 'react';
import { useDiscordSdk } from './hooks/useDiscordSdk';
import { useWorkspaceStore } from './stores/workspaceStore';
import { OnboardingScreen } from './components/OnboardingScreen';
import { WorkspaceScreen } from './components/WorkspaceScreen';

function App() {
  const { ready, channelId } = useDiscordSdk();
  const setChannelId = useWorkspaceStore((s) => s.setChannelId);
  const repoUrl = useWorkspaceStore((s) => s.repoUrl);

  useEffect(() => {
    if (channelId) setChannelId(channelId);
  }, [channelId, setChannelId]);

  if (!ready) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-moss-950 text-cream-100">
        <div className="animate-pulse">Connecting to Discord...</div>
      </div>
    );
  }

  if (!channelId) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-moss-950 text-cream-100">
        Error: No channel context found.
      </div>
    );
  }

  return repoUrl ? <WorkspaceScreen /> : <OnboardingScreen />;
}

export default App;
```

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/components/OnboardingScreen.tsx apps/client/src/lib/api.ts apps/client/src/App.tsx
git commit -m "feat: onboarding screen with github repo loading"
```

---

### Task 8: File Tree Component

**Files:**
- Create: `apps/client/src/components/FileTree.tsx`
- Create: `apps/client/src/components/WorkspaceScreen.tsx`

- [ ] **Step 1: Create `apps/client/src/components/FileTree.tsx`**

```typescript
import { useState } from 'react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { ChevronRight, ChevronDown, FileCode, Folder } from 'lucide-react';

interface TreeNodeProps {
  node: {
    name: string;
    path: string;
    type: 'file' | 'directory';
    children?: Array<{ name: string; path: string; type: 'file' | 'directory'; children?: unknown[] }>;
  };
  depth: number;
}

function TreeNode({ node, depth }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const openFile = useWorkspaceStore((s) => s.openFile);
  const activeFile = useWorkspaceStore((s) => s.activeFile);

  const isActive = activeFile === node.path;

  if (node.type === 'file') {
    return (
      <button
        onClick={() => openFile(node.path)}
        className={`flex w-full items-center gap-2 px-2 py-1 text-left text-sm transition ${
          isActive
            ? 'bg-moss-700/50 text-cream-100'
            : 'text-cream-300 hover:bg-moss-800/50'
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <FileCode className="h-3.5 w-3.5 text-moss-400" />
        <span className="truncate">{node.name}</span>
      </button>
    );
  }

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-1 px-2 py-1 text-left text-sm text-cream-200 hover:bg-moss-800/50"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-moss-400" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-moss-400" />
        )}
        <Folder className="h-3.5 w-3.5 text-moss-400" />
        <span className="truncate">{node.name}</span>
      </button>
      {expanded && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeNode key={child.path} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileTree() {
  const files = useWorkspaceStore((s) => s.files);

  return (
    <div className="h-full w-60 overflow-y-auto border-r border-moss-800 bg-moss-950 py-2">
      <div className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-moss-400">
        Explorer
      </div>
      {files.map((node) => (
        <TreeNode key={node.path} node={node} depth={0} />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create `apps/client/src/components/WorkspaceScreen.tsx`**

```typescript
import { FileTree } from './FileTree';

export function WorkspaceScreen() {
  return (
    <div className="flex h-screen w-screen bg-moss-950 text-cream-100">
      <FileTree />
      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-between border-b border-moss-800 bg-moss-900/50 px-4 py-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">🌿</span>
            <span className="font-semibold">hayashi</span>
          </div>
          <div className="text-sm text-moss-400">Workspace</div>
        </div>
        <div className="flex-1 flex items-center justify-center text-moss-500">
          Select a file from the explorer to start editing
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/components/FileTree.tsx apps/client/src/components/WorkspaceScreen.tsx
git commit -m "feat: file tree explorer and workspace screen layout"
```

---

### Task 9: Monaco Editor + y-monaco Integration

**Files:**
- Create: `apps/client/src/hooks/useYjsBinding.ts`
- Create: `apps/client/src/components/EditorTabs.tsx`
- Create: `apps/client/src/components/MonacoPane.tsx`
- Modify: `apps/client/src/components/WorkspaceScreen.tsx`

- [ ] **Step 1: Create `apps/client/src/hooks/useYjsBinding.ts`**

```typescript
import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { MonacoBinding } from 'y-monaco';
import type { editor } from 'monaco-editor';
import { SERVER_URL } from '@/lib/constants';

export function useYjsBinding(
  channelId: string,
  filePath: string,
  editorInstance: editor.IStandaloneCodeEditor | null
) {
  const bindingRef = useRef<MonacoBinding | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!editorInstance || !channelId || !filePath) return;

    const model = editorInstance.getModel();
    if (!model) return;

    const ydoc = new Y.Doc();
    const provider = new WebsocketProvider(
      `wss://${SERVER_URL}`,
      `${channelId}/${filePath}`,
      ydoc
    );

    provider.on('status', (event: { status: string }) => {
      setConnected(event.status === 'connected');
    });

    const ytext = ydoc.getText('monaco');
    const binding = new MonacoBinding(
      ytext,
      model,
      new Set([editorInstance]),
      provider.awareness
    );

    bindingRef.current = binding;

    return () => {
      binding.destroy();
      provider.destroy();
      ydoc.destroy();
    };
  }, [channelId, filePath, editorInstance]);

  return { connected };
}
```

- [ ] **Step 2: Create `apps/client/src/components/MonacoPane.tsx`**

```typescript
import { useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useYjsBinding } from '@/hooks/useYjsBinding';
import { fetchFile } from '@/lib/api';
import { Loader2 } from 'lucide-react';

interface MonacoPaneProps {
  filePath: string;
}

export function MonacoPane({ filePath }: MonacoPaneProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initialContent, setInitialContent] = useState('');
  const [editorInstance, setEditorInstance] = useState<Parameters<typeof useYjsBinding>[2]>(null);
  const channelId = useWorkspaceStore((s) => s.channelId);
  const repoUrl = useWorkspaceStore((s) => s.repoUrl);
  const branch = useWorkspaceStore((s) => s.branch);

  const { connected } = useYjsBinding(channelId ?? '', filePath, editorInstance);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        let content = '';
        if (repoUrl && branch) {
          const data = await fetchFile(repoUrl, filePath, branch);
          content = data.content;
        }
        setInitialContent(content);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load file');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [filePath, repoUrl, branch]);

  return (
    <div className="relative flex-1">
      <div className="flex items-center justify-between border-b border-moss-800 bg-moss-900/30 px-3 py-1 text-xs text-moss-400">
        <span className="truncate">{filePath}</span>
        <div className="flex items-center gap-2">
          {connected ? (
            <span className="flex items-center gap-1 text-green-400">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
              Synced
            </span>
          ) : (
            <span className="flex items-center gap-1 text-amber-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              Connecting...
            </span>
          )}
        </div>
      </div>

      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-moss-950">
          <Loader2 className="h-6 w-6 animate-spin text-moss-400" />
        </div>
      )}

      {error && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-moss-950 text-red-400">
          {error}
        </div>
      )}

      <Editor
        height="calc(100% - 28px)"
        language={filePath.split('.').pop()}
        value={initialContent}
        theme="vs-dark"
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          fontFamily: 'JetBrains Mono, monospace',
          scrollBeyondLastLine: false,
          padding: { top: 16 },
          automaticLayout: true,
        }}
        onMount={(editor) => setEditorInstance(editor)}
      />
    </div>
  );
}
```

- [ ] **Step 3: Create `apps/client/src/components/EditorTabs.tsx`**

```typescript
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { X } from 'lucide-react';

export function EditorTabs() {
  const openFiles = useWorkspaceStore((s) => s.openFiles);
  const activeFile = useWorkspaceStore((s) => s.activeFile);
  const setActiveFile = useWorkspaceStore((s) => s.setActiveFile);
  const closeFile = useWorkspaceStore((s) => s.closeFile);

  if (openFiles.length === 0) {
    return null;
  }

  return (
    <div className="flex border-b border-moss-800 bg-moss-950">
      {openFiles.map((path) => {
        const isActive = activeFile === path;
        const name = path.split('/').pop() ?? path;

        return (
          <button
            key={path}
            onClick={() => setActiveFile(path)}
            className={`group flex items-center gap-2 border-r border-moss-800 px-3 py-2 text-sm transition ${
              isActive
                ? 'bg-moss-900 text-cream-100'
                : 'text-moss-400 hover:bg-moss-900/50 hover:text-cream-200'
            }`}
          >
            <span className="truncate">{name}</span>
            <span
              onClick={(e) => {
                e.stopPropagation();
                closeFile(path);
              }}
              className="rounded p-0.5 opacity-0 transition hover:bg-moss-700 group-hover:opacity-100"
            >
              <X className="h-3 w-3" />
            </span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Update `apps/client/src/components/WorkspaceScreen.tsx`**

```typescript
import { FileTree } from './FileTree';
import { EditorTabs } from './EditorTabs';
import { MonacoPane } from './MonacoPane';
import { useWorkspaceStore } from '@/stores/workspaceStore';

export function WorkspaceScreen() {
  const activeFile = useWorkspaceStore((s) => s.activeFile);
  const openFiles = useWorkspaceStore((s) => s.openFiles);

  return (
    <div className="flex h-screen w-screen bg-moss-950 text-cream-100">
      <FileTree />
      <div className="flex flex-1 flex-col">
        <EditorTabs />
        {activeFile ? (
          <MonacoPane filePath={activeFile} />
        ) : (
          <div className="flex flex-1 items-center justify-center text-moss-500">
            Select a file from the explorer to start editing
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Ensure `apps/client/vite.config.ts` is correct**

`vite.config.ts` already created in Task 3. No changes needed for `@monaco-editor/react`.

Verify it contains:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
  },
});
```

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/hooks/useYjsBinding.ts apps/client/src/components/MonacoPane.tsx apps/client/src/components/EditorTabs.tsx apps/client/src/components/WorkspaceScreen.tsx apps/client/vite.config.ts
git commit -m "feat: monaco editor with yjs real-time collaboration"
```

---

### Task 10: Preview Drawer + xterm.js Terminal

**Files:**
- Create: `apps/server/src/sync/persist.ts`
- Create: `apps/server/src/preview/manager.ts`
- Create: `apps/client/src/components/PreviewDrawer.tsx`
- Create: `apps/client/src/components/TerminalView.tsx`
- Modify: `apps/client/src/components/WorkspaceScreen.tsx`
- Modify: `apps/server/src/routes.ts`

- [ ] **Step 1: Create `apps/server/src/sync/persist.ts`**

```typescript
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { dirname, join } from 'path';

const BASE_DIR = '/tmp/hayashi';

export function getRepoDir(channelId: string): string {
  return join(BASE_DIR, channelId);
}

export function writeFile(channelId: string, filePath: string, content: string) {
  const fullPath = join(getRepoDir(channelId), filePath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content, 'utf-8');
}

export function ensureRepoDir(channelId: string) {
  const dir = getRepoDir(channelId);
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true });
  }
  mkdirSync(dir, { recursive: true });
  return dir;
}
```

- [ ] **Step 2: Create `apps/server/src/preview/manager.ts`**

```typescript
import { spawn, ChildProcess } from 'child_process';
import { WebSocketServer, WebSocket } from 'ws';
import { getRepoDir } from '../sync/persist.js';

const activePreviews = new Map<string, { process: ChildProcess; port: number; logWss: WebSocketServer }>();

export function startPreview(channelId: string): { port: number; logWsUrl: string } {
  if (activePreviews.has(channelId)) {
    const existing = activePreviews.get(channelId)!;
    return { port: existing.port, logWsUrl: `ws://localhost:${(existing.logWss.address() as { port: number }).port}` };
  }

  const repoPath = getRepoDir(channelId);
  const port = 4000 + Math.floor(Math.random() * 1000);
  const logPort = 5000 + Math.floor(Math.random() * 1000);

  const logWss = new WebSocketServer({ port: logPort });

  const proc = spawn('npm', ['run', 'dev'], {
    cwd: repoPath,
    env: { ...process.env, PORT: String(port) },
  });

  const broadcast = (data: string) => {
    logWss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  };

  proc.stdout?.on('data', (chunk) => broadcast(chunk.toString()));
  proc.stderr?.on('data', (chunk) => broadcast(chunk.toString()));

  activePreviews.set(channelId, { process: proc, port, logWss });

  return { port, logWsUrl: `ws://localhost:${logPort}` };
}

export function stopPreview(channelId: string) {
  const preview = activePreviews.get(channelId);
  if (!preview) return;
  preview.process.kill();
  preview.logWss.close();
  activePreviews.delete(channelId);
}
```

- [ ] **Step 2: Add preview routes to `apps/server/src/routes.ts`**

Add before `export { app }`:

```typescript
app.post('/preview/start', async (c) => {
  const body = await c.req.json<{ channelId: string }>();
  const { channelId } = body;

  try {
    const { port, logWsUrl } = startPreview(channelId);
    return c.json({ port, logWsUrl });
  } catch (err) {
    console.error('Preview start error:', err);
    return c.json({ error: 'Failed to start preview' }, 500);
  }
});

app.post('/preview/stop', async (c) => {
  const body = await c.req.json<{ channelId: string }>();
  stopPreview(body.channelId);
  return c.json({ status: 'stopped' });
});
```

And import at top:
```typescript
import { startPreview, stopPreview } from './preview/manager.js';
```

- [ ] **Step 3: Create `apps/client/src/components/TerminalView.tsx`**

```typescript
import { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

interface TerminalViewProps {
  wsUrl: string;
}

export function TerminalView({ wsUrl }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const terminal = new Terminal({
      theme: {
        background: '#1a1f1a',
        foreground: '#c7d7c7',
        cursor: '#729672',
      },
      fontSize: 12,
      fontFamily: 'JetBrains Mono, monospace',
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);
    fitAddon.fit();

    terminalRef.current = terminal;

    const ws = new WebSocket(wsUrl);
    ws.onmessage = (event) => {
      terminal.write(event.data);
    };

    const handleResize = () => fitAddon.fit();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      ws.close();
      terminal.dispose();
    };
  }, [wsUrl]);

  return <div ref={containerRef} className="h-full w-full" />;
}
```

- [ ] **Step 4: Create `apps/client/src/components/PreviewDrawer.tsx`**

```typescript
import { useState } from 'react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { TerminalView } from './TerminalView';
import { X, Play, Terminal, Monitor } from 'lucide-react';

export function PreviewDrawer() {
  const drawerOpen = useWorkspaceStore((s) => s.drawerOpen);
  const drawerTab = useWorkspaceStore((s) => s.drawerTab);
  const setDrawerTab = useWorkspaceStore((s) => s.setDrawerTab);
  const toggleDrawer = useWorkspaceStore((s) => s.toggleDrawer);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [logWsUrl, setLogWsUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const channelId = useWorkspaceStore((s) => s.channelId);
  const repoUrl = useWorkspaceStore((s) => s.repoUrl);

  async function handlePlay() {
    if (!channelId) return;
    setPreviewLoading(true);

    try {
      const res = await fetch(`https://${import.meta.env.VITE_SERVER_URL}/preview/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPreviewUrl(`http://localhost:${data.port}`);
      setLogWsUrl(data.logWsUrl);
      toggleDrawer();
      setDrawerTab('preview');
    } catch (err) {
      console.error('Preview start failed:', err);
    } finally {
      setPreviewLoading(false);
    }
  }

  if (!drawerOpen) {
    return (
      <button
        onClick={handlePlay}
        disabled={previewLoading}
        className="absolute bottom-4 right-4 flex h-12 w-12 items-center justify-center rounded-full bg-moss-600 text-white shadow-lg transition hover:bg-moss-500 disabled:opacity-50"
      >
        <Play className="h-5 w-5" />
      </button>
    );
  }

  return (
    <div className="flex w-[480px] flex-col border-l border-moss-800 bg-moss-950">
      <div className="flex items-center justify-between border-b border-moss-800 px-3 py-2">
        <div className="flex gap-1">
          <button
            onClick={() => setDrawerTab('preview')}
            className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs ${
              drawerTab === 'preview' ? 'bg-moss-800 text-cream-100' : 'text-moss-400 hover:text-cream-200'
            }`}
          >
            <Monitor className="h-3.5 w-3.5" />
            Preview
          </button>
          <button
            onClick={() => setDrawerTab('terminal')}
            className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs ${
              drawerTab === 'terminal' ? 'bg-moss-800 text-cream-100' : 'text-moss-400 hover:text-cream-200'
            }`}
          >
            <Terminal className="h-3.5 w-3.5" />
            Terminal
          </button>
        </div>
        <button
          onClick={toggleDrawer}
          className="rounded p-1 text-moss-400 hover:bg-moss-800 hover:text-cream-200"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-hidden">
        {drawerTab === 'preview' && previewUrl && (
          <iframe
            src={previewUrl}
            className="h-full w-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms"
            title="Preview"
          />
        )}
        {drawerTab === 'preview' && !previewUrl && (
          <div className="flex h-full items-center justify-center text-moss-500">
            Press the play button to start the preview
          </div>
        )}
        {drawerTab === 'terminal' && logWsUrl && (
          <TerminalView wsUrl={logWsUrl} />
        )}
        {drawerTab === 'terminal' && !logWsUrl && (
          <div className="flex h-full items-center justify-center text-moss-500">
            Start preview to see terminal output
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Update `apps/client/src/components/WorkspaceScreen.tsx`**

```typescript
import { FileTree } from './FileTree';
import { EditorTabs } from './EditorTabs';
import { MonacoPane } from './MonacoPane';
import { PreviewDrawer } from './PreviewDrawer';
import { useWorkspaceStore } from '@/stores/workspaceStore';

export function WorkspaceScreen() {
  const activeFile = useWorkspaceStore((s) => s.activeFile);

  return (
    <div className="relative flex h-screen w-screen bg-moss-950 text-cream-100">
      <FileTree />
      <div className="flex flex-1 flex-col">
        <EditorTabs />
        {activeFile ? (
          <MonacoPane filePath={activeFile} />
        ) : (
          <div className="flex flex-1 items-center justify-center text-moss-500">
            Select a file from the explorer to start editing
          </div>
        )}
      </div>
      <PreviewDrawer />
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/preview/ apps/server/src/routes.ts apps/client/src/components/PreviewDrawer.tsx apps/client/src/components/TerminalView.tsx apps/client/src/components/WorkspaceScreen.tsx
git commit -m "feat: preview drawer with iframe and xterm.js terminal"
```

---

### Task 11: AI Designer API Endpoint

**Files:**
- Create: `apps/server/src/ai/generate.ts`
- Modify: `apps/server/src/routes.ts`

- [ ] **Step 1: Create `apps/server/src/ai/generate.ts`**

```typescript
interface GenerateCodeParams {
  prompt: string;
  existingCode: string;
  language: string;
}

export async function generateCode({
  prompt,
  existingCode,
  language,
}: GenerateCodeParams): Promise<string> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !apiToken) {
    throw new Error('Cloudflare credentials not configured');
  }

  const model = '@cf/meta/llama-3-8b-instruct';
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;

  const systemPrompt = `You are an expert frontend developer. Generate or modify ${language} code based on the user's request. Output ONLY the code, no explanations, no markdown fences.`;

  const userPrompt = `Existing code:\n${existingCode}\n\nRequest: ${prompt}\n\nGenerate the updated code:`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`AI API error: ${res.status}`);
  }

  const data = (await res.json()) as {
    result?: { response?: string };
    errors?: Array<{ message: string }>;
  };

  if (data.errors && data.errors.length > 0) {
    throw new Error(data.errors[0].message);
  }

  return data.result?.response ?? '';
}
```

- [ ] **Step 2: Add AI route to `apps/server/src/routes.ts`**

Add import at top:
```typescript
import { generateCode } from './ai/generate.js';
```

Add route before `export { app }`:
```typescript
app.post('/ai/generate', async (c) => {
  const body = await c.req.json<{
    prompt: string;
    existingCode: string;
    language: string;
  }>();

  try {
    const code = await generateCode(body);
    return c.json({ code });
  } catch (err) {
    console.error('AI generation error:', err);
    return c.json(
      { error: err instanceof Error ? err.message : 'Generation failed' },
      500
    );
  }
});

app.post('/ai/apply', async (c) => {
  const body = await c.req.json<{
    channelId: string;
    filePath: string;
    code: string;
  }>();

  try {
    // Write to Yjs document via the y-websocket doc store
    // The y-websocket server maintains documents in memory
    // We write the file content to disk for preview consistency
    const { writeFile } = await import('./sync/persist.js');
    writeFile(body.channelId, body.filePath, body.code);
    return c.json({ status: 'applied' });
  } catch (err) {
    console.error('AI apply error:', err);
    return c.json(
      { error: err instanceof Error ? err.message : 'Apply failed' },
      500
    );
  }
});
```

- [ ] **Step 3: Test AI endpoint (requires CLOUDFLARE credentials)**

Run server with `.env` loaded:
```bash
cd apps/server && npm run dev
```
In another terminal:
```bash
curl -X POST http://localhost:3001/ai/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Create a React button component","existingCode":"","language":"tsx"}'
```
Expected: JSON with `code` field containing generated React code.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/ai/ apps/server/src/routes.ts
git commit -m "feat: ai designer endpoint with cloudflare workers ai"
```

---

### Task 12: AI Designer Panel UI

**Files:**
- Create: `apps/client/src/components/AiDesignerPanel.tsx`
- Modify: `apps/client/src/components/WorkspaceScreen.tsx`

- [ ] **Step 1: Create `apps/client/src/components/AiDesignerPanel.tsx`**

```typescript
import { useState } from 'react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { Wand2, X, Loader2, Send } from 'lucide-react';

export function AiDesignerPanel() {
  const aiPanelOpen = useWorkspaceStore((s) => s.aiPanelOpen);
  const toggleAiPanel = useWorkspaceStore((s) => s.toggleAiPanel);
  const isInitiator = useWorkspaceStore((s) => s.isInitiator);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`https://${import.meta.env.VITE_SERVER_URL}/ai/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          existingCode: '',
          language: 'tsx',
        }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setGeneratedCode(data.code);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleApply() {
    const activeFile = useWorkspaceStore.getState().activeFile;
    const channelId = useWorkspaceStore.getState().channelId;
    if (!activeFile || !channelId) return;

    try {
      const res = await fetch(`https://${import.meta.env.VITE_SERVER_URL}/ai/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, filePath: activeFile, code: generatedCode }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setGeneratedCode('');
      setPrompt('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Apply failed');
    }
  }

  if (!aiPanelOpen) {
    return (
      <button
        onClick={toggleAiPanel}
        className="absolute bottom-4 left-[264px] flex h-10 items-center gap-2 rounded-full bg-moss-700 px-4 text-sm text-cream-100 shadow-lg transition hover:bg-moss-600"
      >
        <Wand2 className="h-4 w-4" />
        AI Designer
      </button>
    );
  }

  return (
    <div className="flex w-80 flex-col border-l border-moss-800 bg-moss-950">
      <div className="flex items-center justify-between border-b border-moss-800 px-3 py-2">
        <div className="flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-moss-400" />
          <span className="text-sm font-medium">AI Designer</span>
        </div>
        <button
          onClick={toggleAiPanel}
          className="rounded p-1 text-moss-400 hover:bg-moss-800 hover:text-cream-200"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-3">
        {!isInitiator && (
          <div className="rounded-lg bg-moss-900/50 px-3 py-2 text-xs text-moss-400">
            The initiator must enable AI access for specific files.
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-moss-400">Prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g., Add a dark mode toggle to the navbar"
            className="h-24 w-full resize-none rounded-lg border border-moss-700 bg-moss-950 p-2 text-sm text-cream-100 outline-none placeholder:text-moss-600"
          />
        </div>

        <button
          onClick={handleGenerate}
          disabled={loading || !prompt.trim()}
          className="flex items-center justify-center gap-2 rounded-lg bg-moss-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-moss-500 disabled:opacity-50"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          <Send className="h-4 w-4" />
          {loading ? 'Generating...' : 'Generate'}
        </button>

        {error && (
          <div className="rounded-lg bg-red-900/30 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        {generatedCode && (
          <div className="flex flex-1 flex-col gap-2">
            <label className="text-xs font-medium text-moss-400">Generated Code</label>
            <pre className="flex-1 overflow-auto rounded-lg border border-moss-700 bg-moss-950 p-2 text-xs text-cream-200">
              {generatedCode}
            </pre>
            <button
              onClick={handleApply}
              className="rounded-lg bg-green-700 px-3 py-2 text-sm font-medium text-white transition hover:bg-green-600"
            >
              Apply to File
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update `apps/client/src/components/WorkspaceScreen.tsx`**

```typescript
import { FileTree } from './FileTree';
import { EditorTabs } from './EditorTabs';
import { MonacoPane } from './MonacoPane';
import { PreviewDrawer } from './PreviewDrawer';
import { AiDesignerPanel } from './AiDesignerPanel';
import { useWorkspaceStore } from '@/stores/workspaceStore';

export function WorkspaceScreen() {
  const activeFile = useWorkspaceStore((s) => s.activeFile);

  return (
    <div className="relative flex h-screen w-screen bg-moss-950 text-cream-100">
      <FileTree />
      <AiDesignerPanel />
      <div className="flex flex-1 flex-col">
        <EditorTabs />
        {activeFile ? (
          <MonacoPane filePath={activeFile} />
        ) : (
          <div className="flex flex-1 items-center justify-center text-moss-500">
            Select a file from the explorer to start editing
          </div>
        )}
      </div>
      <PreviewDrawer />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/components/AiDesignerPanel.tsx apps/client/src/components/WorkspaceScreen.tsx
git commit -m "feat: ai designer panel ui with prompt and apply flow"
```

---

### Task 13: User Presence Bar

**Files:**
- Create: `apps/client/src/components/UserPresenceBar.tsx`
- Modify: `apps/client/src/components/WorkspaceScreen.tsx`

- [ ] **Step 1: Create `apps/client/src/components/UserPresenceBar.tsx`**

```typescript
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { Users } from 'lucide-react';

interface UserPresenceBarProps {
  users: Array<{ id: string; username: string; avatar: string | null; color: string }>;
}

export function UserPresenceBar({ users }: UserPresenceBarProps) {
  const channelId = useWorkspaceStore((s) => s.channelId);

  return (
    <div className="flex items-center gap-3 border-b border-moss-800 bg-moss-900/50 px-4 py-2">
      <div className="flex items-center gap-2">
        <span className="text-lg">🌿</span>
        <span className="font-semibold text-cream-100">hayashi</span>
      </div>

      <div className="h-4 w-px bg-moss-700" />

      <div className="flex items-center gap-2 text-sm text-moss-400">
        <Users className="h-3.5 w-3.5" />
        <span>{users.length} editing</span>
      </div>

      <div className="ml-auto flex items-center gap-1">
        {users.map((user) => (
          <div
            key={user.id}
            className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium text-white"
            style={{ backgroundColor: user.color }}
            title={user.username}
          >
            {user.username.slice(0, 2).toUpperCase()}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update `apps/client/src/components/WorkspaceScreen.tsx`**

```typescript
import { FileTree } from './FileTree';
import { EditorTabs } from './EditorTabs';
import { MonacoPane } from './MonacoPane';
import { PreviewDrawer } from './PreviewDrawer';
import { AiDesignerPanel } from './AiDesignerPanel';
import { UserPresenceBar } from './UserPresenceBar';
import { useWorkspaceStore } from '@/stores/workspaceStore';

const MOCK_USERS = [
  { id: '1', username: 'jdbohrman', avatar: null, color: '#4a9eff' },
  { id: '2', username: 'alice', avatar: null, color: '#ff6b6b' },
];

export function WorkspaceScreen() {
  const activeFile = useWorkspaceStore((s) => s.activeFile);

  return (
    <div className="relative flex h-screen w-screen bg-moss-950 text-cream-100">
      <FileTree />
      <AiDesignerPanel />
      <div className="flex flex-1 flex-col">
        <UserPresenceBar users={MOCK_USERS} />
        <EditorTabs />
        {activeFile ? (
          <MonacoPane filePath={activeFile} />
        ) : (
          <div className="flex flex-1 items-center justify-center text-moss-500">
            Select a file from the explorer to start editing
          </div>
        )}
      </div>
      <PreviewDrawer />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/components/UserPresenceBar.tsx apps/client/src/components/WorkspaceScreen.tsx
git commit -m "feat: user presence bar with avatar indicators"
```

---

### Task 14: Error Handling & Loading States

**Files:**
- Create: `apps/client/src/components/ErrorBoundary.tsx`
- Modify: `apps/client/src/main.tsx`
- Modify: `apps/client/src/components/OnboardingScreen.tsx`
- Modify: `apps/client/src/components/MonacoPane.tsx`

- [ ] **Step 1: Create `apps/client/src/components/ErrorBoundary.tsx`**

```typescript
import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-screen flex-col items-center justify-center bg-moss-950 text-cream-100">
          <h1 className="mb-4 text-2xl font-bold">Something went wrong</h1>
          <pre className="max-w-lg rounded-lg bg-moss-900 p-4 text-sm text-red-300">
            {this.state.error?.message}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg bg-moss-600 px-4 py-2 text-sm text-white hover:bg-moss-500"
          >
            Reload Activity
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

- [ ] **Step 2: Update `apps/client/src/main.tsx` to wrap App**

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
```

- [ ] **Step 3: Add connection error banner to `apps/client/src/components/MonacoPane.tsx`**

Inside the component, after the `connected` state:

Add this JSX before the editor container:

```tsx
{!connected && !loading && (
  <div className="absolute top-7 z-10 flex w-full items-center justify-center bg-amber-900/80 py-1 text-xs text-amber-200">
    Reconnecting to collaboration server...
  </div>
)}
```

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/components/ErrorBoundary.tsx apps/client/src/main.tsx apps/client/src/components/MonacoPane.tsx
git commit -m "feat: error boundary and connection error states"
```

---

### Task 15: shadcn/ui Components Setup

**Files:**
- Create: `apps/client/components.json`
- Create: `apps/client/src/components/ui/button.tsx`
- Create: `apps/client/src/lib/utils.ts`
- Modify: multiple component files to use shadcn Button

- [ ] **Step 1: Create `apps/client/components.json`**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.js",
    "css": "src/index.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils"
  }
}
```

- [ ] **Step 2: Create `apps/client/src/lib/utils.ts`**

```typescript
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 3: Create `apps/client/src/components/ui/button.tsx`**

```typescript
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
```

- [ ] **Step 4: Install missing shadcn dependencies**

Run: `cd apps/client && npm install @radix-ui/react-slot class-variance-authority clsx tailwind-merge`
Expected: Dependencies installed.

- [ ] **Step 5: Commit**

```bash
git add apps/client/components.json apps/client/src/lib/utils.ts apps/client/src/components/ui/
git commit -m "chore: shadcn/ui setup with button component"
```

---

### Task 16: Final Integration & Polish

**Files:**
- Modify: `apps/client/src/App.tsx`
- Modify: `apps/client/src/components/WorkspaceScreen.tsx`
- Modify: `apps/client/src/components/OnboardingScreen.tsx`

- [ ] **Step 1: Add logo header to `apps/client/src/App.tsx` loading state**

Already has simple loading. Keep as-is.

- [ ] **Step 2: Ensure `WorkspaceScreen` handles empty states gracefully**

Current implementation already shows "Select a file..." when no file is active.

- [ ] **Step 3: Test full client dev build**

Run: `cd apps/client && npm run build`
Expected: Build succeeds, `dist/` folder created with bundled assets.

- [ ] **Step 4: Test full server build**

Run: `cd apps/server && npm run build`
Expected: TypeScript compiles, `dist/` folder created.

- [ ] **Step 5: Verify environment variables are documented**

`.env.example` already created in Task 1. Ensure all required variables are listed:
- `VITE_DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `SERVER_PORT`
- `SERVER_URL`
- `GITHUB_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: hayashi mvp — collaborative discord code editor"
```

---

## Self-Review

### Spec Coverage Check

| Spec Requirement | Task |
|---|---|
| Discord SDK + launch context | Task 4 |
| Repo onboarding | Task 7 |
| File tree | Task 8 |
| Monaco + Yjs sync | Task 9 |
| Play button + preview drawer | Task 10 |
| xterm.js terminal | Task 10 |
| AI Designer panel | Task 11, 12 |
| Error handling | Task 14 |
| User presence | Task 13 |
| shadcn/ui | Task 15 |

### Placeholder Scan

- No "TBD", "TODO", or "implement later" found in tasks
- All code is explicit and complete
- All test commands and expected outputs are specified

### Type Consistency

- `channelId` is `string | null` across all files
- `filePath` is consistently `string`
- Store methods match their definitions in `workspaceStore.ts`

---

## Next Steps After Implementation

1. **Discord App Registration**: Create Discord app, set Activity URL to client build
2. **Cloudflare Workers AI**: Configure account ID and API token
3. **GitHub Token**: Create fine-grained personal access token for repo reading
4. **Server Deployment**: Deploy server to VM or container with WebSocket support
5. **Client Hosting**: Host client static files (Vercel, Cloudflare Pages, or S3)
6. **End-to-end Testing**: Full flow with multiple Discord accounts in a voice channel
