import { useState } from 'react';
import { PatchCanvas } from './PatchCanvas';
import { RoomPresenceRail } from './RoomPresenceRail';
import { AssetLibrary } from './AssetLibrary';
import { ExportPanel } from './ExportPanel';
import { WorkstationEditor } from './WorkstationEditor';
import { DrumKitEditor } from './DrumKitEditor';
import { NodeInspector } from './NodeInspector';
import { useProjectStore } from '@/stores/projectStore';
import { useAudioEngine } from '@/hooks/useAudioEngine';
import { useTransportScheduler } from '@/hooks/useTransportScheduler';
import { Save, Share2, Waves, PanelRight, Headphones } from 'lucide-react';

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

  const [presenceOpen, setPresenceOpen] = useState(true);

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
          <span className="hayashi-canvas-status">
            <Headphones size={12} />
            {audioReady ? 'Audio ready' : 'Initializing…'}
          </span>
          <button className="hayashi-canvas-btn" type="button">
            <Save size={13} />
            Save
          </button>
          <button className="hayashi-canvas-btn" type="button">
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

        {/* Floating right panel: Presence only */}
        <div className={`hayashi-float-panel hayashi-float-right ${presenceOpen ? '' : 'collapsed'}`}>
          <button
            className="hayashi-float-toggle"
            onClick={() => setPresenceOpen(!presenceOpen)}
            title={presenceOpen ? 'Collapse presence' : 'Expand presence'}
          >
            <PanelRight size={14} />
          </button>
          {presenceOpen && (
            <div className="hayashi-float-content">
              <RoomPresenceRail />
            </div>
          )}
        </div>
      </div>

      {/* Bottom asset bar */}
      <div className={`hayashi-canvas-footer ${selectedNodeId ? 'hayashi-canvas-footer-focus' : ''}`}>
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
