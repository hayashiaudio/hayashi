import { useCallback, useEffect, useRef, useState } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { Plus, Loader2, X } from 'lucide-react';
import { listProjects } from '@/lib/api';

interface ProjectItem {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export function SessionEntryScreen() {
  const user = useProjectStore((s) => s.user);
  const accessToken = useProjectStore((s) => s.accessToken);
  const setProjectId = useProjectStore((s) => s.setProjectId);
  const setProjectTitle = useProjectStore((s) => s.setProjectTitle);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [namingOpen, setNamingOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!accessToken) return;
    setLoading(true);
    listProjects(accessToken)
      .then((res) => {
        setProjects(res.projects ?? []);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load projects');
      })
      .finally(() => setLoading(false));
  }, [accessToken]);

  const createProject = useCallback(() => {
    const defaultTitle = `${user?.username ?? "Anonymous"}'s Jam`;
    setDraftTitle(defaultTitle);
    setNamingOpen(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [user]);

  const confirmCreate = useCallback(() => {
    const id = crypto.randomUUID();
    const title = draftTitle.trim() || `${user?.username ?? "Anonymous"}'s Jam`;
    setProjectId(id);
    setProjectTitle(title);
    setNamingOpen(false);
    setDraftTitle('');
  }, [draftTitle, setProjectId, setProjectTitle, user]);

  const cancelCreate = useCallback(() => {
    setNamingOpen(false);
    setDraftTitle('');
  }, []);

  const loadProject = useCallback(
    (project: ProjectItem) => {
      setProjectId(project.id);
      setProjectTitle(project.title);
    },
    [setProjectId, setProjectTitle]
  );

  return (
    <div
      className="relative flex h-screen w-screen items-center justify-center p-6"
      style={{ background: '#f5e6c8' }}
    >
      <div
        className="max-w-md w-full p-8 text-center space-y-6"
        style={{
          background: '#ffffff',
          border: '1px solid rgba(16, 38, 29, 0.08)',
          borderRadius: '10px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.06)',
        }}
      >
        <img
          src="/hayashi-logo.png"
          alt="Hayashi"
          className="mx-auto h-16 w-16 rounded-2xl opacity-90"
        />
        <div>
          <h1
            className="mb-2 text-2xl font-semibold"
            style={{ color: '#1a1a1a', fontFamily: 'var(--hayashi-font-display)' }}
          >
            Start a Jam
          </h1>
          <p
            className="text-sm"
            style={{ color: '#555555', fontFamily: 'var(--hayashi-font-body)' }}
          >
            Create a new shared room or join an existing session.
          </p>
        </div>

        <button
          className="hayashi-action w-full justify-center"
          type="button"
          onClick={createProject}
        >
          <Plus size={16} />
          New Room
        </button>

        {loading && (
          <div className="flex items-center justify-center gap-2 text-sm" style={{ color: '#777' }}>
            <Loader2 size={14} className="animate-spin" />
            Loading projects…
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        {projects.length > 0 && (
          <div className="space-y-2 text-left">
            <p
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: '#999' }}
            >
              Recent Projects
            </p>
            <div className="space-y-2">
              {projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => loadProject(project)}
                  className="w-full text-left p-3 rounded-lg transition-colors"
                  style={{
                    background: '#faf5eb',
                    border: '1px solid rgba(16, 38, 29, 0.06)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#f0eadc';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#faf5eb';
                  }}
                >
                  <p className="font-semibold text-sm" style={{ color: '#1a1a1a' }}>
                    {project.title}
                  </p>
                  <p className="text-xs" style={{ color: '#888' }}>
                    {new Date(project.updatedAt).toLocaleDateString()}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="text-left space-y-2" style={{ color: '#666' }}>
          <p
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: '#999' }}
          >
            What happens next
          </p>
          <ul className="text-sm space-y-1 list-disc list-inside">
            <li>Everyone in this Discord channel joins the same room.</li>
            <li>Build loops, patch synths, and drop samples together.</li>
            <li>Audio renders locally from shared project state.</li>
          </ul>
        </div>
      </div>

      {namingOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div
            className="w-full max-w-sm p-6 space-y-4"
            style={{
              background: '#ffffff',
              border: '1px solid rgba(16, 38, 29, 0.08)',
              borderRadius: '10px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold" style={{ color: '#1a1a1a' }}>
                Name your room
              </h2>
              <button
                type="button"
                onClick={cancelCreate}
                className="rounded-md p-1 transition-colors hover:bg-black/5"
                aria-label="Cancel"
              >
                <X size={16} style={{ color: '#666' }} />
              </button>
            </div>
            <input
              ref={inputRef}
              type="text"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmCreate();
                if (e.key === 'Escape') cancelCreate();
              }}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[rgba(237,146,47,0.4)]"
              style={{
                borderColor: 'rgba(16, 38, 29, 0.12)',
                color: '#1a1a1a',
                background: '#fafafa',
              }}
              placeholder={`${user?.username ?? "Anonymous"}'s Jam`}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={cancelCreate}
                className="flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-black/5"
                style={{ color: '#555', border: '1px solid rgba(16, 38, 29, 0.1)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmCreate}
                className="flex-1 rounded-lg px-3 py-2 text-sm font-medium text-white transition-colors"
                style={{ background: '#ed922f' }}
              >
                Create Room
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
