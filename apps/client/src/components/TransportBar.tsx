import { Play, Pause, SkipBack, SkipForward } from 'lucide-react';
import { useTransport } from '@/hooks/useTransport';

export function TransportBar() {
  const { playing, bpm, timeSignature, key, scene, togglePlay, skipBack, skipForward } = useTransport();

  return (
    <div className="hayashi-transport-shell hayashi-transport-shell-compact">
      <div className="hayashi-transport">
        <div className="hayashi-transport-cluster">
          <div className="hayashi-pill hayashi-pill-muted">{bpm} BPM</div>
          <div className="hayashi-subpill">{timeSignature[0]}/{timeSignature[1]} · {key}</div>
        </div>
        <div className="hayashi-transport-center">
          <button className="hayashi-circle-button hayashi-circle-button-small" type="button" aria-label="Previous" onClick={skipBack}>
            <SkipBack size={14} />
          </button>
          <button className="hayashi-circle-button" type="button" aria-label={playing ? 'Pause' : 'Play'} onClick={togglePlay}>
            {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
          </button>
          <button className="hayashi-circle-button hayashi-circle-button-small" type="button" aria-label="Next" onClick={skipForward}>
            <SkipForward size={14} />
          </button>
        </div>
        <div className="hayashi-transport-cluster hayashi-transport-cluster-end">
          <div className="hayashi-pill">Scene {scene}</div>
          <div className="hayashi-led-stack">
            <span />
            <span />
            <span />
          </div>
        </div>
      </div>
    </div>
  );
}
