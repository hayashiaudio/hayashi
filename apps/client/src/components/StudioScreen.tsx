import { PatchCanvas } from './PatchCanvas';
import { HeaderPresenceStack } from './RoomPresenceRail';
import { AssetLibrary } from './AssetLibrary';
import { ExportPanel } from './ExportPanel';
import { WorkstationEditor } from './WorkstationEditor';
import { DrumKitEditor } from './DrumKitEditor';
import { NodeInspector } from './NodeInspector';
import { useProjectStore } from '@/stores/projectStore';
import { useAudioEngine } from '@/hooks/useAudioEngine';
import { openInviteDialog } from '@/hooks/useDiscordSdk';
import { useTransportScheduler } from '@/hooks/useTransportScheduler';
import { Save, Share2, Waves, Headphones } from 'lucide-react';

export function StudioScreen() {
  const projectTitle = useProjectStore((s) => s.projectTitle);
  const exportPanelOpen = useProjectStore((s) => s.exportPanelOpen);
  const toggleExportPanel = useProjectStore((s) => s.toggleExportPanel);
  const selectedNodeId = useProjectStore((s) => s.selectedNodeId);
  const selectNode = useProjectStore((s) => s.selectNode);
  const workstationEditorNodeId = useProjectStore((s) => s.workstationEditorNodeId);
  const closeWorkstationEditor = useProjectStore((s) => s.closeWorkstationEditor);
  const drumKitEditorNodeId = useProjectStore((s) => s.drumKitEditorNodeId);
  const closeDrumKitEditor = useProjectStore((s) => s.closeDrumKitEditor);
  const { ready: audioReady } = useAudioEngine();
  useTransportScheduler();

  return (
    <main className="hayashi-canvas-app">
      {/* Top bar */}
      <header className="hayashi-canvas-topbar">
        <div className="hayashi-canvas-brand">
          <div className="hayashi-canvas-mark">
            <img src="/hayashi-logo.png" alt="Hayashi" />
          </div>
          <div>
            <p className="hayashi-canvas-label">Discord Activity Room</p>
            <h1>{projectTitle}</h1>
          </div>
        </div>

        <div className="hayashi-canvas-actions">
          <div className="hayashi-canvas-presence-strip">
            <span className="hayashi-canvas-status">
              <Headphones size={12} />
              {audioReady ? 'Audio ready' : 'Initializing…'}
            </span>
            <HeaderPresenceStack />
          </div>
          <button className="hayashi-canvas-btn" type="button">
            <Save size={13} />
            Save
          </button>
          <button className="hayashi-canvas-btn" type="button" onClick={() => openInviteDialog()}>
            <Share2 size={13} />
            Invite
          </button>
          <button className="hayashi-canvas-btn-accent" type="button" onClick={toggleExportPanel}>
            <Waves size={13} />
            Export
          </button>
        </div>
      </header>

      {/* Canvas area */}
      <div className="hayashi-canvas-body">
        <PatchCanvas />
      </div>

      {/* Bottom asset bar */}
      <div className={`hayashi-canvas-footer ${selectedNodeId && !drumKitEditorNodeId ? 'hayashi-canvas-footer-focus' : ''}`}>
        {selectedNodeId ? (
          <NodeInspector embedded onClose={() => selectNode(null)} />
        ) : (
          <AssetLibrary />
        )}
      </div>

      {exportPanelOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <ExportPanel />
        </div>
      )}

      {workstationEditorNodeId && (
        <WorkstationEditor
          nodeId={workstationEditorNodeId}
          onClose={closeWorkstationEditor}
        />
      )}

      {drumKitEditorNodeId && (
        <DrumKitEditor
          nodeId={drumKitEditorNodeId}
          onClose={closeDrumKitEditor}
        />
      )}
    </main>
  );
}
