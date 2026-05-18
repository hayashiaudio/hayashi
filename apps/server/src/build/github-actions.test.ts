import { describe, expect, it } from 'vitest';
import { selectDispatchedWorkflowRun, selectGitHubWorkflow } from './github-actions.js';

describe('selectGitHubWorkflow', () => {
  const workflows = [
    {
      id: 123,
      name: 'Plugin Native Build',
      path: '.github/workflows/plugin-native-build.yml',
      state: 'active',
    },
  ];

  it('matches by workflow filename', () => {
    expect(selectGitHubWorkflow(workflows, 'plugin-native-build.yml')).toEqual(workflows[0]);
  });

  it('matches by workflow display name', () => {
    expect(selectGitHubWorkflow(workflows, 'Plugin Native Build')).toEqual(workflows[0]);
  });

  it('matches by workflow id', () => {
    expect(selectGitHubWorkflow(workflows, '123')).toEqual(workflows[0]);
  });
});

describe('selectDispatchedWorkflowRun', () => {
  const workflow = {
    id: 123,
    name: 'Plugin Native Build',
    path: '.github/workflows/plugin-native-build.yml',
    state: 'active',
  };

  it('returns the workflow_dispatch run created after dispatch', () => {
    const dispatchedAt = Date.parse('2026-05-18T21:00:00.000Z');
    const run = selectDispatchedWorkflowRun(
      workflow,
      [
        {
          id: 99,
          name: 'Plugin Native Build',
          status: 'queued',
          conclusion: null,
          html_url: 'https://github.com/acme/repo/actions/runs/99',
          path: '.github/workflows/plugin-native-build.yml',
          event: 'workflow_dispatch',
          head_branch: 'main',
          created_at: '2026-05-18T21:00:03.000Z',
        },
      ],
      'main',
      dispatchedAt,
    );

    expect(run?.id).toBe(99);
  });

  it('ignores older or unrelated runs', () => {
    const dispatchedAt = Date.parse('2026-05-18T21:00:00.000Z');
    const run = selectDispatchedWorkflowRun(
      workflow,
      [
        {
          id: 1,
          name: 'Plugin Native Build',
          status: 'completed',
          conclusion: 'success',
          html_url: 'https://github.com/acme/repo/actions/runs/1',
          path: '.github/workflows/plugin-native-build.yml',
          event: 'workflow_dispatch',
          head_branch: 'main',
          created_at: '2026-05-18T20:58:00.000Z',
        },
        {
          id: 2,
          name: 'Other Workflow',
          status: 'queued',
          conclusion: null,
          html_url: 'https://github.com/acme/repo/actions/runs/2',
          path: '.github/workflows/other.yml',
          event: 'workflow_dispatch',
          head_branch: 'main',
          created_at: '2026-05-18T21:00:03.000Z',
        },
      ],
      'main',
      dispatchedAt,
    );

    expect(run).toBeNull();
  });
});
