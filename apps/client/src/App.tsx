import { useEffect, useRef, useState } from 'react';
import { useDiscordSdk } from './hooks/useDiscordSdk';
import { useProjectStore } from './stores/projectStore';
import { useYjsProject } from './hooks/useYjsProject';
import {
  bootstrapBilling,
  createBillingCheckout,
  createBillingPortal,
  createBillingStreamToken,
  loadProjectSnapshot,
  saveProjectSnapshot,
} from './lib/api';
import { BrandGuidelinesPage } from './components/BrandGuidelinesPage';
import { CoreWorkspaceMockupPage } from './components/CoreWorkspaceMockupPage';
import { PerformanceWorkspaceMockupPage } from './components/PerformanceWorkspaceMockupPage';
import { SessionEntryScreen } from './components/SessionEntryScreen';
import { StudioScreen } from './components/StudioScreen';
import { BillingModal } from './components/BillingModal';
import { Crown } from 'lucide-react';
import { openExternalUrl } from './hooks/useDiscordSdk';
import { SERVER_BASE_URL } from './lib/constants';
import type { BillingSnapshot } from './types/billing';
import { getHasRemoteRealtimeState } from './lib/projectSync';

function App() {
  const params = new URLSearchParams(window.location.search);
  const brandMode = params.get('brand') === '1';
  const mockupMode = params.get('mockup') === '1';
  const performanceMockupMode = params.get('mockup') === 'performance';

  if (brandMode) return <BrandGuidelinesPage />;
  if (mockupMode) return <CoreWorkspaceMockupPage />;
  if (performanceMockupMode) return <PerformanceWorkspaceMockupPage />;

  const { ready, channelId, guildId, error, user, participants, accessToken } = useDiscordSdk();
  const setChannelId = useProjectStore((s) => s.setChannelId);
  const setGuildId = useProjectStore((s) => s.setGuildId);
  const setAccessToken = useProjectStore((s) => s.setAccessToken);
  const setUser = useProjectStore((s) => s.setUser);
  const billing = useProjectStore((s) => s.billing);
  const setBillingLoading = useProjectStore((s) => s.setBillingLoading);
  const setBillingSnapshot = useProjectStore((s) => s.setBillingSnapshot);
  const setBillingError = useProjectStore((s) => s.setBillingError);
  const openPaywall = useProjectStore((s) => s.openPaywall);
  const projectId = useProjectStore((s) => s.projectId);
  const setProjectId = useProjectStore((s) => s.setProjectId);
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
  const [installationAction, setInstallationAction] = useState<'checkout' | 'portal' | null>(null);

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

  const storageKey = channelId ? `hayashi:lastProject:${channelId}` : null;

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

  useEffect(() => {
    if (!storageKey || projectId) return;
    const savedProjectId = window.localStorage.getItem(storageKey);
    if (savedProjectId) {
      setProjectId(savedProjectId);
    }
  }, [projectId, setProjectId, storageKey]);

  useEffect(() => {
    if (!storageKey || !projectId) return;
    window.localStorage.setItem(storageKey, projectId);
  }, [projectId, storageKey]);

  const { collabReady, remoteStateLoaded } = useYjsProject(channelId, projectId, participants);

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
        const result = await loadProjectSnapshot(projectId);
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
    };

    saveTimerRef.current = window.setTimeout(() => {
      saveProjectSnapshot(projectId, snapshot).catch((err) => {
        console.error('[Hayashi] Failed to save project snapshot:', err);
      });
    }, 400);

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [projectId, projectTitle, localTransport, nodes, edges, assets, clips, tracks]);

  if (!ready) {
    return (
      <div className="hayashi-app-bg hayashi-app-grain relative flex h-screen w-screen items-center justify-center">
        <div className="flex flex-col items-center gap-5">
          <img src="/hayashi-logo.png" alt="Hayashi" className="h-16 w-16 rounded-2xl opacity-80" />
          <div className="hayashi-loader-ring" />
          <p className="font-mono text-xs tracking-widest uppercase" style={{ color: 'var(--hayashi-text-dim)', fontFamily: 'var(--hayashi-font-mono)' }}>
            Connecting to Discord
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="hayashi-app-bg hayashi-app-grain relative flex h-screen w-screen items-center justify-center p-6">
        <div className="hayashi-surface max-w-lg p-8 text-center">
          <img src="/hayashi-logo.png" alt="Hayashi" className="mx-auto mb-6 h-14 w-14 rounded-2xl opacity-60" />
          <h1 className="hayashi-title-display mb-3 text-2xl">Connection Error</h1>
          <pre className="hayashi-error-box mb-4 whitespace-pre-wrap text-left">{error}</pre>
          <p className="font-mono text-xs" style={{ color: 'var(--hayashi-text-dim)', fontFamily: 'var(--hayashi-font-mono)' }}>
            Check the browser console for more details.
          </p>
        </div>
      </div>
    );
  }

  if (!channelId) {
    return (
      <div className="hayashi-app-bg hayashi-app-grain relative flex h-screen w-screen items-center justify-center p-6">
        <div className="hayashi-surface max-w-md p-8 text-center">
          <h1 className="hayashi-title-display mb-2 text-xl">No Channel Context</h1>
          <p className="hayashi-body text-sm">
            Hayashi must be launched from within a Discord voice channel to establish a collaborative session.
          </p>
        </div>
      </div>
    );
  }

  const installationBlocked =
    billing.snapshot?.contextAccess.allowed === false && billing.snapshot.contextAccess.reason === 'installation_limit';

  if (installationBlocked) {
    const handleUpgrade = async () => {
      if (!accessToken) return;
      setInstallationAction('checkout');
      try {
        const result = await createBillingCheckout({ accessToken, guildId, channelId });
        setBillingSnapshot(result.snapshot);
        if (result.url) await openExternalUrl(result.url);
      } finally {
        setInstallationAction(null);
      }
    };

    const handleManage = async () => {
      if (!accessToken || !billing.snapshot?.stripeCustomerId) return;
      setInstallationAction('portal');
      try {
        const result = await createBillingPortal(accessToken);
        if (result.url) await openExternalUrl(result.url);
      } finally {
        setInstallationAction(null);
      }
    };

    return (
      <>
        <div className="hayashi-app-bg hayashi-app-grain relative flex h-screen w-screen items-center justify-center p-6">
          <div className="hayashi-surface max-w-xl p-8 text-center">
            <h1 className="hayashi-title-display mb-2 text-2xl">Upgrade Required</h1>
            <p className="hayashi-body text-sm">
              {billing.snapshot?.contextAccess.message ?? 'This Discord installation is outside the free plan limits.'}
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                className="hayashi-action"
                type="button"
                onClick={handleUpgrade}
                disabled={!accessToken || installationAction !== null}
              >
                <Crown size={15} />
                {installationAction === 'checkout' ? 'Opening checkout…' : 'Upgrade to Unlimited'}
              </button>
              {billing.snapshot?.stripeCustomerId && (
                <button
                  className="hayashi-secondary-action"
                  type="button"
                  onClick={handleManage}
                  disabled={!accessToken || installationAction !== null}
                >
                  {installationAction === 'portal' ? 'Opening portal…' : 'Manage billing'}
                </button>
              )}
            </div>
          </div>
        </div>
        <BillingModal accessToken={accessToken} guildId={guildId} channelId={channelId} />
      </>
    );
  }

  return (
    <>
      {projectId ? <StudioScreen /> : <SessionEntryScreen />}
      <BillingModal accessToken={accessToken} guildId={guildId} channelId={channelId} />
    </>
  );
}

export default App;
