import { useEffect, useRef } from 'react';
import { ClerkProvider } from '@clerk/clerk-react';
import { useDiscordSdk } from './hooks/useDiscordSdk';
import { useProjectStore } from './stores/projectStore';
import { useYjsProject } from './hooks/useYjsProject';
import {
  bootstrapBilling,
  createBillingStreamToken,
  loadProjectSnapshot,
  saveProjectSnapshot,
} from './lib/api';
import { MarketingPage } from './pages/MarketingPage';
import { BrandGuidelinesPage } from './components/BrandGuidelinesPage';
import PluginGenerator from './components/PluginGenerator';
import { SessionEntryScreen } from './components/SessionEntryScreen';
import { StudioScreen } from './components/StudioScreen';
import { BillingModal } from './components/BillingModal';
import { Toast } from './components/Toast';
import { SERVER_BASE_URL } from './lib/constants';
import type { BillingSnapshot } from './types/billing';
import { getHasRemoteRealtimeState, hydrateYjsFromSnapshot, createRealtimeSnapshot } from './lib/projectSync';

const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? '';

function App() {
  const params = new URLSearchParams(window.location.search);
  const brandMode = params.get('brand') === '1';

  if (brandMode) return <BrandGuidelinesPage />;

  if (params.get('studio') === '1') {
    return (
      <ClerkProvider publishableKey={CLERK_KEY} afterSignOutUrl="/?studio=1">
        <PluginGenerator />
      </ClerkProvider>
    );
  }

  if (window.location.pathname === '/') return <MarketingPage />;

  const { ready, channelId, guildId, instanceId, error, user, participants, accessToken } = useDiscordSdk();
  const setChannelId = useProjectStore((s) => s.setChannelId);
  const setGuildId = useProjectStore((s) => s.setGuildId);
  const setAccessToken = useProjectStore((s) => s.setAccessToken);
  const setUser = useProjectStore((s) => s.setUser);
  const setBillingLoading = useProjectStore((s) => s.setBillingLoading);
  const setBillingSnapshot = useProjectStore((s) => s.setBillingSnapshot);
  const setBillingError = useProjectStore((s) => s.setBillingError);
  const openPaywall = useProjectStore((s) => s.openPaywall);
  const projectId = useProjectStore((s) => s.projectId);
  const projectTitle = useProjectStore((s) => s.projectTitle);
  const setProjectTitle = useProjectStore((s) => s.setProjectTitle);
  const localTransport = useProjectStore((s) => s.localTransport);
  const updateLocalTransport = useProjectStore((s) => s.updateLocalTransport);
  const nodes = useProjectStore((s) => s.nodes);
  const setNodes = useProjectStore((s) => s.setNodes);
  const edges = useProjectStore((s) => s.edges);
  const setEdges = useProjectStore((s) => s.setEdges);
  const assets = useProjectStore((s) => s.assets);
  const setAssets = useProjectStore((s) => s.setAssets);
  const clips = useProjectStore((s) => s.clips);
  const setClips = useProjectStore((s) => s.setClips);
  const tracks = useProjectStore((s) => s.tracks);
  const setTracks = useProjectStore((s) => s.setTracks);
  const hydratedRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);
  useEffect(() => {
    const root = document.documentElement;
    const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

    const applyViewportSizing = () => {
      const viewport = window.visualViewport;
      const width = Math.round(viewport?.width ?? window.innerWidth);
      const height = Math.round(viewport?.height ?? window.innerHeight);
      const scale = clamp(Math.min(width / 1440, height / 900), 0.82, 1.08);

      const mode =
        width < 900 && height < 650
          ? 'compact'
          : width < 1360 || height < 820
            ? 'cozy'
            : 'wide';

      root.dataset.hayashiSize = mode;
      root.style.setProperty('--hayashi-vw', `${width}px`);
      root.style.setProperty('--hayashi-vh', `${height}px`);
      root.style.setProperty('--hayashi-scale', scale.toFixed(3));
      root.style.setProperty('--hayashi-topbar-pad-x', `${clamp(width * 0.014, 12, 20)}px`);
      root.style.setProperty('--hayashi-topbar-pad-y', `${clamp(height * 0.012, 8, 14)}px`);
      root.style.setProperty('--hayashi-shell-gap', `${clamp(width * 0.008, 8, 16)}px`);
      root.style.setProperty('--hayashi-topbar-gap', `${clamp(12 * scale, 10, 18)}px`);
      root.style.setProperty('--hayashi-mark-size', `${clamp(36 * scale, 30, 42)}px`);
      root.style.setProperty('--hayashi-title-size', `${clamp(1.1 * scale, 0.96, 1.18)}rem`);
      root.style.setProperty('--hayashi-label-size', `${clamp(0.6 * scale, 0.54, 0.66)}rem`);
      root.style.setProperty('--hayashi-button-pad-y', `${clamp(6 * scale, 5, 8)}px`);
      root.style.setProperty('--hayashi-button-pad-x', `${clamp(12 * scale, 10, 14)}px`);
      root.style.setProperty('--hayashi-button-radius', `${clamp(6 * scale, 6, 9)}px`);
      root.style.setProperty('--hayashi-panel-radius', `${clamp(10 * scale, 9, 14)}px`);
      root.style.setProperty('--hayashi-panel-pad', `${clamp(10 * scale, 8, 14)}px`);
      root.style.setProperty('--hayashi-footer-height', `${clamp(height * 0.22, 146, 210)}px`);
      root.style.setProperty('--hayashi-footer-focus-height', `${clamp(height * 0.29, 178, 266)}px`);
      root.style.setProperty('--hayashi-footer-pad', `${clamp(10 * scale, 8, 12)}px`);
      root.style.setProperty('--hayashi-footer-focus-pad', `${clamp(12 * scale, 9, 14)}px`);
      root.style.setProperty('--hayashi-inspector-pad', `${clamp(12 * scale, 10, 16)}px`);
      root.style.setProperty('--hayashi-inspector-gap', `${clamp(10 * scale, 8, 12)}px`);
      root.style.setProperty('--hayashi-node-width', `${clamp(width * 0.108, 148, 176)}px`);
      root.style.setProperty('--hayashi-node-pad', `${clamp(10 * scale, 8, 12)}px`);
      root.style.setProperty('--hayashi-node-title-size', `${clamp(0.9 * scale, 0.8, 0.98)}rem`);
      root.style.setProperty('--hayashi-node-meta-size', `${clamp(0.62 * scale, 0.58, 0.68)}rem`);
      root.style.setProperty('--hayashi-float-width', `${clamp(width * 0.19, 220, 300)}px`);
      root.style.setProperty('--hayashi-float-max-height', `${clamp(height - 88, 280, 760)}px`);
      root.style.setProperty('--hayashi-guidance-width', `${clamp(width * 0.22, 240, 360)}px`);
      root.style.setProperty('--hayashi-asset-card-width', `${clamp(width * 0.074, 104, 146)}px`);
      root.style.setProperty('--hayashi-sample-card-width', `${clamp(width * 0.102, 140, 188)}px`);
    };

    applyViewportSizing();
    window.addEventListener('resize', applyViewportSizing);
    window.visualViewport?.addEventListener('resize', applyViewportSizing);

    return () => {
      window.removeEventListener('resize', applyViewportSizing);
      window.visualViewport?.removeEventListener('resize', applyViewportSizing);
      delete root.dataset.hayashiSize;
      root.style.removeProperty('--hayashi-vw');
      root.style.removeProperty('--hayashi-vh');
      root.style.removeProperty('--hayashi-scale');
      root.style.removeProperty('--hayashi-topbar-pad-x');
      root.style.removeProperty('--hayashi-topbar-pad-y');
      root.style.removeProperty('--hayashi-shell-gap');
      root.style.removeProperty('--hayashi-topbar-gap');
      root.style.removeProperty('--hayashi-mark-size');
      root.style.removeProperty('--hayashi-title-size');
      root.style.removeProperty('--hayashi-label-size');
      root.style.removeProperty('--hayashi-button-pad-y');
      root.style.removeProperty('--hayashi-button-pad-x');
      root.style.removeProperty('--hayashi-button-radius');
      root.style.removeProperty('--hayashi-panel-radius');
      root.style.removeProperty('--hayashi-panel-pad');
      root.style.removeProperty('--hayashi-footer-height');
      root.style.removeProperty('--hayashi-footer-focus-height');
      root.style.removeProperty('--hayashi-footer-pad');
      root.style.removeProperty('--hayashi-footer-focus-pad');
      root.style.removeProperty('--hayashi-inspector-pad');
      root.style.removeProperty('--hayashi-inspector-gap');
      root.style.removeProperty('--hayashi-node-width');
      root.style.removeProperty('--hayashi-node-pad');
      root.style.removeProperty('--hayashi-node-title-size');
      root.style.removeProperty('--hayashi-node-meta-size');
      root.style.removeProperty('--hayashi-float-width');
      root.style.removeProperty('--hayashi-float-max-height');
      root.style.removeProperty('--hayashi-guidance-width');
      root.style.removeProperty('--hayashi-asset-card-width');
      root.style.removeProperty('--hayashi-sample-card-width');
    };
  }, []);

  useEffect(() => {
    if (channelId) setChannelId(channelId);
  }, [channelId, setChannelId]);

  useEffect(() => {
    setGuildId(guildId);
  }, [guildId, setGuildId]);

  useEffect(() => {
    setAccessToken(accessToken);
  }, [accessToken, setAccessToken]);

  useEffect(() => {
    if (user) setUser(user);
  }, [user, setUser]);

  useEffect(() => {
    if (!ready || !user || !accessToken || !channelId) return;
    let cancelled = false;
    setBillingLoading(true);

    bootstrapBilling({ accessToken, guildId, channelId })
      .then((snapshot) => {
        if (cancelled) return;
        setBillingSnapshot(snapshot);
        if (!snapshot.contextAccess.allowed && snapshot.contextAccess.reason && snapshot.contextAccess.message) {
          openPaywall(snapshot.contextAccess.reason, snapshot.contextAccess.message);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setBillingError(err instanceof Error ? err.message : 'Failed to load billing');
      });

    return () => {
      cancelled = true;
    };
  }, [
    accessToken,
    channelId,
    guildId,
    openPaywall,
    ready,
    setBillingError,
    setBillingLoading,
    setBillingSnapshot,
    user,
  ]);

  useEffect(() => {
    if (!ready || !user || !accessToken || !channelId) return;

    let eventSource: EventSource | null = null;
    let cancelled = false;
    let reconnectTimer: number | null = null;

    const handleSnapshot = (snapshot: BillingSnapshot) => {
      setBillingSnapshot(snapshot);
      if (snapshot.contextAccess.allowed) {
        useProjectStore.getState().closePaywall();
      } else if (snapshot.contextAccess.reason && snapshot.contextAccess.message) {
        openPaywall(snapshot.contextAccess.reason, snapshot.contextAccess.message);
      }
    };

    const connect = () => {
      createBillingStreamToken({ accessToken, guildId, channelId })
        .then(({ token }) => {
          if (cancelled) return;
          eventSource = new EventSource(`${SERVER_BASE_URL}/billing/events?token=${encodeURIComponent(token)}`);

          const onReady = (event: MessageEvent) => {
            const snapshot = JSON.parse(event.data) as BillingSnapshot;
            handleSnapshot(snapshot);
          };

          const onUpdated = (event: MessageEvent) => {
            const snapshot = JSON.parse(event.data) as BillingSnapshot;
            handleSnapshot(snapshot);
          };

          eventSource.addEventListener('billing.ready', onReady as EventListener);
          eventSource.addEventListener('billing.updated', onUpdated as EventListener);
          eventSource.onerror = () => {
            eventSource?.close();
            if (!cancelled) {
              reconnectTimer = window.setTimeout(connect, 2500);
            }
          };
        })
        .catch((err) => {
          if (!cancelled) {
            console.warn('[Hayashi] Failed to attach billing SSE stream:', err);
            reconnectTimer = window.setTimeout(connect, 4000);
          }
        });
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      eventSource?.close();
    };
  }, [
    accessToken,
    channelId,
    guildId,
    openPaywall,
    ready,
    setBillingSnapshot,
    user,
  ]);

  const { collabReady, remoteStateLoaded, ydocRef } = useYjsProject(instanceId, projectId, participants);

  useEffect(() => {
    let cancelled = false;

    if (!projectId) {
      hydratedRef.current = false;
      return;
    }

    if (!collabReady) {
      hydratedRef.current = false;
      return;
    }

    if (remoteStateLoaded || getHasRemoteRealtimeState()) {
      hydratedRef.current = true;
      return;
    }

    hydratedRef.current = false;

    (async () => {
      try {
        if (!accessToken) return;
        const result = await loadProjectSnapshot(projectId, accessToken);
        if (cancelled) return;
        const snapshot = result?.snapshot as
          | {
              projectTitle?: string;
              localTransport?: typeof localTransport;
              nodes?: typeof nodes;
              edges?: typeof edges;
              assets?: typeof assets;
              clips?: typeof clips;
              tracks?: typeof tracks;
            }
          | undefined;

        if (snapshot) {
          const fullSnapshot = createRealtimeSnapshot({
            projectTitle: snapshot.projectTitle ?? 'Untitled Jam',
            localTransport: snapshot.localTransport ?? localTransport,
            nodes: snapshot.nodes ?? {},
            edges: snapshot.edges ?? {},
            assets: snapshot.assets ?? {},
            clips: snapshot.clips ?? {},
            tracks: snapshot.tracks ?? {},
          });

          const ydoc = ydocRef.current;
          if (ydoc) {
            hydrateYjsFromSnapshot(fullSnapshot, ydoc);
          }

          if (snapshot.projectTitle) setProjectTitle(snapshot.projectTitle);
          if (snapshot.localTransport) updateLocalTransport(snapshot.localTransport);
          setNodes(snapshot.nodes ?? {});
          setEdges(snapshot.edges ?? {});
          setAssets(snapshot.assets ?? {});
          setClips(snapshot.clips ?? {});
          setTracks(snapshot.tracks ?? {});
        }
      } catch {
        // no existing snapshot yet
      } finally {
        if (!cancelled) hydratedRef.current = true;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    accessToken,
    collabReady,
    projectId,
    remoteStateLoaded,
    setAssets,
    setClips,
    setEdges,
    setNodes,
    setProjectTitle,
    setTracks,
    updateLocalTransport,
  ]);

  useEffect(() => {
    if (!projectId || !hydratedRef.current) return;

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    const snapshot = {
      projectTitle,
      localTransport,
      nodes,
      edges,
      assets,
      clips,
      tracks,
      createdBy: user?.id,
      channelId,
      guildId,
    };

    saveTimerRef.current = window.setTimeout(() => {
      if (!accessToken) return;
      saveProjectSnapshot(projectId, snapshot, accessToken).catch((err) => {
        console.error('[Hayashi] Failed to save project snapshot:', err);
      });
    }, 400);

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [accessToken, projectId, projectTitle, localTransport, nodes, edges, assets, clips, tracks]);

  const chromeBg = { background: 'var(--hayashi-chrome)' } as React.CSSProperties;
  const chromeText = { color: '#1a1a1a' } as React.CSSProperties;
  const chromeMuted = { color: '#555555' } as React.CSSProperties;

  if (!ready) {
    return (
      <div className="relative flex h-screen w-screen items-center justify-center" style={chromeBg}>
        <div className="flex flex-col items-center gap-5">
          <img src="/hayashi-logo.png" alt="Hayashi" className="h-16 w-16 rounded-2xl opacity-80" />
          <div className="hayashi-loader-ring" />
          <p className="font-mono text-xs tracking-widest uppercase" style={{ color: '#888888', fontFamily: 'var(--hayashi-font-mono)' }}>
            Connecting to Discord
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="relative flex h-screen w-screen items-center justify-center p-6" style={chromeBg}>
        <div className="max-w-lg p-8 text-center space-y-4" style={{ background: '#ffffff', borderRadius: 10, border: '1px solid rgba(16,38,29,0.08)', boxShadow: '0 8px 32px rgba(0,0,0,0.06)' }}>
          <img src="/hayashi-logo.png" alt="Hayashi" className="mx-auto mb-2 h-14 w-14 rounded-2xl opacity-60" />
          <h1 className="text-2xl font-semibold" style={chromeText}>Connection Error</h1>
          <pre className="mb-4 whitespace-pre-wrap text-left text-xs p-3 rounded-lg" style={{ background: '#faf5eb', color: '#c75b5b', border: '1px solid rgba(199,91,91,0.2)' }}>{error}</pre>
          <p className="font-mono text-xs" style={{ color: '#888888', fontFamily: 'var(--hayashi-font-mono)' }}>
            Check the browser console for more details.
          </p>
        </div>
      </div>
    );
  }

  if (!channelId) {
    return (
      <div className="relative flex h-screen w-screen items-center justify-center p-6" style={chromeBg}>
        <div className="max-w-md p-8 text-center space-y-3" style={{ background: '#ffffff', borderRadius: 10, border: '1px solid rgba(16,38,29,0.08)', boxShadow: '0 8px 32px rgba(0,0,0,0.06)' }}>
          <h1 className="text-xl font-semibold" style={chromeText}>No Channel Context</h1>
          <p className="text-sm" style={chromeMuted}>
            Hayashi must be launched from within a Discord voice channel to establish a collaborative session.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {projectId ? <StudioScreen /> : <SessionEntryScreen />}
      <BillingModal accessToken={accessToken} />
      <Toast />
    </>
  );
}

export default App;
