import { useCallback } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { Plus } from 'lucide-react';

export function SessionEntryScreen() {
  const user = useProjectStore((s) => s.user);
  const setProjectId = useProjectStore((s) => s.setProjectId);
  const setProjectTitle = useProjectStore((s) => s.setProjectTitle);

  const createProject = useCallback(() => {
    const id = crypto.randomUUID();
    setProjectId(id);
    setProjectTitle(`${user?.username ?? 'Anonymous'}'s Jam`);
  }, [setProjectId, setProjectTitle, user]);

  return (
    <div className="hayashi-app-bg hayashi-app-grain relative flex h-screen w-screen items-center justify-center p-6">
      <div className="hayashi-surface max-w-md w-full p-8 text-center space-y-6">
        <img src="/hayashi-logo.png" alt="Hayashi" className="mx-auto h-16 w-16 rounded-2xl opacity-80" />
        <div>
          <h1 className="hayashi-title-display mb-2 text-2xl">Start a Jam</h1>
          <p className="hayashi-body text-sm">
            Create a new shared room or join an existing session.
          </p>
        </div>

        <button className="hayashi-action w-full justify-center" type="button" onClick={createProject}>
          <Plus size={16} />
          New Room
        </button>

        <div className="hayashi-note-list text-left space-y-2">
          <p className="hayashi-mini-label">What happens next</p>
          <ul>
            <li>Everyone in this Discord channel joins the same room.</li>
            <li>Build loops, patch synths, and drop samples together.</li>
            <li>Audio renders locally from shared project state.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
