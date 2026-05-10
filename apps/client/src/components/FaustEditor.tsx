import { useState, useCallback } from 'react';
import { compileFaustNode } from '@/audio/faustLoader';
import { storeFaustModule } from '@/samples/indexedDb';
import { audioEngine } from '@/audio/engine';
import { X, Play, Save } from 'lucide-react';

interface FaustEditorProps {
  onClose: () => void;
  onSaved?: () => void;
  initialCode?: string;
}

export function FaustEditor({ onClose, onSaved, initialCode }: FaustEditorProps) {
  const [code, setCode] = useState(initialCode ?? 'process = _;\n');
  const [name, setName] = useState('');
  const [compiling, setCompiling] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleCompile = useCallback(async () => {
    setError('');
    setSuccess('');
    setCompiling(true);

    try {
      await audioEngine.init();
      const ctx = audioEngine.ctx;
      if (!ctx) {
        setError('Audio context unavailable');
        return;
      }

      const testName = `test-${crypto.randomUUID().slice(0, 6)}`;
      const node = await compileFaustNode(ctx, code, testName);
      if (!node) {
        setError('Faust compilation returned no worklet. Check your DSP code.');
        return;
      }

      setSuccess('Compilation successful! DSP is valid.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setCompiling(false);
    }
  }, [code]);

  const handleSave = useCallback(async () => {
    setError('');
    setSuccess('');

    if (!name.trim()) {
      setError('Please enter a module name before saving.');
      return;
    }

    try {
      // Verify compilation before storing
      await audioEngine.init();
      const ctx = audioEngine.ctx;
      if (!ctx) {
        setError('Audio context unavailable');
        return;
      }

      const testName = `test-${crypto.randomUUID().slice(0, 6)}`;
      const node = await compileFaustNode(ctx, code, testName);
      if (!node) {
        setError('Faust compilation failed. Fix errors before saving.');
        return;
      }

      const id = crypto.randomUUID();
      await storeFaustModule({
        id,
        name: name.trim(),
        dspCode: code,
        compiledAt: Date.now(),
      });

      setSuccess(`Saved as "${name.trim()}"`);
      onSaved?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    }
  }, [code, name, onSaved]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.4)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        className="hayashi-mockup-panel"
        style={{
          width: 'min(720px, 92vw)',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        {/* Header */}
        <div className="hayashi-panel-title-row" style={{ marginBottom: 0 }}>
          <div>
            <p className="hayashi-mini-label">Faust DSP Editor</p>
            <h2>New Module</h2>
          </div>
          <button className="hayashi-icon-button" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>

        {/* Name input */}
        <div>
          <label className="hayashi-label">Module name</label>
          <input
            className="hayashi-input"
            type="text"
            placeholder="e.g. My Filter"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {/* Code editor */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label className="hayashi-label">DSP Code</label>
          <textarea
            className="hayashi-input"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            spellCheck={false}
            style={{
              minHeight: 240,
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: '0.88rem',
              lineHeight: 1.5,
              resize: 'vertical',
            }}
          />
        </div>

        {/* Error / Success */}
        {error && (
          <div className="hayashi-error-box" style={{ fontSize: '0.82rem' }}>
            {error}
          </div>
        )}
        {success && (
          <div
            style={{
              padding: '12px 16px',
              borderRadius: 16,
              background: 'rgba(106,155,61,0.12)',
              border: '1px solid rgba(106,155,61,0.25)',
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: '0.82rem',
              color: '#6a9b3d',
            }}
          >
            {success}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            className="hayashi-secondary-action"
            type="button"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="hayashi-action hayashi-button-sm"
            type="button"
            disabled={compiling}
            onClick={handleCompile}
          >
            <Play size={14} />
            {compiling ? 'Compiling…' : 'Compile'}
          </button>
          <button
            className="hayashi-action hayashi-button-sm"
            type="button"
            disabled={compiling}
            onClick={handleSave}
          >
            <Save size={14} />
            Save Module
          </button>
        </div>
      </div>
    </div>
  );
}
