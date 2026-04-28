import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { SettingsPanel } from './SettingsPanel.js';
import { dashboardConfig } from './dashboard-config.js';
import type { ResolvedSettings } from './dashboard-settings.js';
import {
  getEmptyStateMessage,
  getFilterOptions,
  getGridColumns,
  findVisibleEntityGroupById,
  getChildEntities,
  getEntityStatusSummary,
  getVisibleEntityGroups,
  getVisibleEntities,
  pruneViewerPreferencesToLiveOptions,
} from './dashboard-view.js';

const entities = [
  {
    entityId: '1',
    source: 'codex',
    entityKind: 'worker',
    currentStatus: 'active',
    lastEventAt: '2026-04-10T10:00:00.000Z',
    activityScore: 0.9,
  },
  {
    entityId: '2',
    source: 'claude',
    entityKind: 'session',
    currentStatus: 'dormant',
    lastEventAt: '2026-04-10T09:00:00.000Z',
    activityScore: 0.2,
  },
  {
    entityId: '3',
    source: 'gemini',
    entityKind: 'worker',
    currentStatus: 'idle',
    lastEventAt: '2026-04-10T10:05:00.000Z',
    activityScore: 0.7,
  },
] as const;

const recentSettings = {
  layout: { maxAgentsShown: 3, density: 'comfortable', sortMode: 'recent' },
  filters: {
    hideDormant: false,
    hideDone: false,
    visibleSources: [],
    visibleEntityKinds: [],
    sourceFilterActive: false,
    entityKindFilterActive: false,
  },
} satisfies Pick<ResolvedSettings, 'layout' | 'filters'>;

describe('getVisibleEntities', () => {
  it('filters dormant entities and respects maxAgentsShown', () => {
    const result = getVisibleEntities(entities, {
      layout: { maxAgentsShown: 1, density: 'comfortable', sortMode: 'activity' },
      filters: {
        hideDormant: true,
        hideDone: false,
        visibleSources: [],
        visibleEntityKinds: [],
        sourceFilterActive: false,
        entityKindFilterActive: false,
      },
    } satisfies Pick<ResolvedSettings, 'layout' | 'filters'>);

    expect(result.map(entity => entity.entityId)).toEqual(['1']);
  });

  it('supports recent sorting', () => {
    const result = getVisibleEntities(entities, recentSettings);

    expect(result.map(entity => entity.entityId)).toEqual(['3', '1', '2']);
  });

  it('pushes invalid timestamps to the end in recent sorting', () => {
    const settings = {
      layout: { maxAgentsShown: 3, density: 'comfortable', sortMode: 'recent' },
      filters: {
        hideDormant: false,
        hideDone: false,
        visibleSources: [],
        visibleEntityKinds: [],
        sourceFilterActive: false,
        entityKindFilterActive: false,
      },
    } satisfies Pick<ResolvedSettings, 'layout' | 'filters'>;

    const result = getVisibleEntities(
      [
        {
          entityId: 'bad-a',
          source: 'gemini',
          entityKind: 'worker',
          currentStatus: 'idle',
          lastEventAt: 'not-a-date',
          activityScore: 0.8,
        },
        {
          entityId: 'valid',
          source: 'codex',
          entityKind: 'worker',
          currentStatus: 'active',
          lastEventAt: '2026-04-10T10:00:00.000Z',
          activityScore: 0.4,
        },
        {
          entityId: 'bad-b',
          source: 'mistral',
          entityKind: 'worker',
          currentStatus: 'idle',
          lastEventAt: 'still-not-a-date',
          activityScore: 0.1,
        },
      ],
      settings
    );

    expect(result.map(entity => entity.entityId)).toEqual(['valid', 'bad-a', 'bad-b']);
  });

  it('treats an explicitly empty source selection as filtering to zero results', () => {
    const result = getVisibleEntities(entities, {
      layout: { maxAgentsShown: 3, density: 'comfortable', sortMode: 'activity' },
      filters: {
        hideDormant: false,
        hideDone: false,
        visibleSources: [],
        visibleEntityKinds: [],
        sourceFilterActive: true,
        entityKindFilterActive: false,
      },
    } satisfies Pick<ResolvedSettings, 'layout' | 'filters'>);

    expect(result).toEqual([]);
  });
});

describe('getVisibleEntityGroups', () => {
  it('keeps tool-run entities out of the top-level card grid', () => {
    const result = getVisibleEntityGroups(
      [
        {
          entityId: 'codex:session:abc',
          sessionId: 'abc',
          source: 'codex',
          entityKind: 'session',
          currentStatus: 'idle',
          lastEventAt: '2026-04-10T10:00:00.000Z',
          activityScore: 0.5,
        },
        {
          entityId: 'codex:tool-run:abc:grep',
          parentEntityId: 'codex:session:abc',
          sessionId: 'abc',
          source: 'codex',
          entityKind: 'tool-run',
          currentStatus: 'active',
          lastEventAt: '2026-04-10T10:05:00.000Z',
          activityScore: 0.9,
        },
      ],
      recentSettings
    );

    expect(result).toHaveLength(1);
    expect(result[0].representative.entityId).toBe('codex:session:abc');
    expect(result[0].memberCount).toBe(1);
  });

  it('maps fresh child tool runs to their parent entities', () => {
    const children = getChildEntities(
      [
        {
          entityId: 'codex:session:abc',
          source: 'codex',
          entityKind: 'session',
          currentStatus: 'active',
          lastEventAt: '2026-04-10T10:05:00.000Z',
          activityScore: 0.8,
        },
        {
          entityId: 'codex:tool-run:abc:grep',
          parentEntityId: 'codex:session:abc',
          source: 'codex',
          entityKind: 'tool-run',
          currentStatus: 'active',
          lastEventAt: '2026-04-10T10:05:10.000Z',
          activityScore: 0.9,
        },
        {
          entityId: 'codex:tool-run:abc:old',
          parentEntityId: 'codex:session:abc',
          source: 'codex',
          entityKind: 'tool-run',
          currentStatus: 'done',
          lastEventAt: '2026-04-10T10:04:20.000Z',
          activityScore: 0.3,
        },
      ],
      ['codex:session:abc'],
      new Date('2026-04-10T10:05:20.000Z')
    );

    expect(children.map(child => child.entityId)).toEqual(['codex:tool-run:abc:grep']);
  });

  it('collapses multiple events from the same session into one card', () => {
    const result = getVisibleEntityGroups(
      [
        {
          entityId: 'tool-1',
          sessionId: 'session-a',
          source: 'codex',
          entityKind: 'tool-run',
          currentStatus: 'active',
          lastEventAt: '2026-04-10T10:00:00.000Z',
          activityScore: 0.4,
        },
        {
          entityId: 'turn-1',
          sessionId: 'session-a',
          source: 'codex',
          entityKind: 'session',
          currentStatus: 'idle',
          lastEventAt: '2026-04-10T10:05:00.000Z',
          activityScore: 0.8,
        },
        {
          entityId: 'session-b',
          source: 'claude',
          entityKind: 'session',
          currentStatus: 'active',
          lastEventAt: '2026-04-10T10:03:00.000Z',
          activityScore: 0.7,
        },
      ],
      recentSettings
    );

    expect(result.map(group => group.groupId)).toEqual(['codex|session-a', 'claude|session-b']);
    expect(result[0].memberCount).toBe(1);
    expect(result[0].representative.entityId).toBe('turn-1');
    expect(
      getChildEntities(
        [
          {
            entityId: 'tool-1',
            sessionId: 'session-a',
            parentEntityId: 'turn-1',
            source: 'codex',
            entityKind: 'tool-run',
            currentStatus: 'active',
            lastEventAt: '2026-04-10T10:00:00.000Z',
            activityScore: 0.4,
          },
        ],
        result[0].members.map(member => member.entityId),
        new Date('2026-04-10T10:00:05.000Z')
      ).map(child => child.entityId)
    ).toEqual(['tool-1']);
  });

  it('collapses related entities that share a source group key', () => {
    const result = getVisibleEntityGroups(
      [
        {
          entityId: 'openclaw:session:alpha-1',
          sessionId: 'alpha-1',
          groupKey: 'clawson',
          source: 'openclaw',
          entityKind: 'session',
          currentStatus: 'active',
          lastEventAt: '2026-04-10T10:00:00.000Z',
          activityScore: 0.9,
        },
        {
          entityId: 'openclaw:session:alpha-2',
          sessionId: 'alpha-2',
          groupKey: 'clawson',
          source: 'openclaw',
          entityKind: 'session',
          currentStatus: 'idle',
          lastEventAt: '2026-04-10T10:02:00.000Z',
          activityScore: 0.7,
        },
      ],
      recentSettings
    );

    expect(result).toHaveLength(1);
    expect(result[0].groupId).toBe('openclaw|clawson');
    expect(result[0].memberCount).toBe(2);
    expect(result[0].representative.entityId).toBe('openclaw:session:alpha-2');
  });

  it('keeps a group visible when any member matches the entity-kind filter', () => {
    const result = getVisibleEntityGroups(
      [
        {
          entityId: 'tool-1',
          sessionId: 'session-a',
          source: 'codex',
          entityKind: 'tool-run',
          currentStatus: 'active',
          lastEventAt: '2026-04-10T10:00:00.000Z',
          activityScore: 0.4,
        },
        {
          entityId: 'turn-1',
          sessionId: 'session-a',
          source: 'codex',
          entityKind: 'session',
          currentStatus: 'idle',
          lastEventAt: '2026-04-10T10:05:00.000Z',
          activityScore: 0.8,
        },
      ],
      {
        layout: { maxAgentsShown: 3, density: 'comfortable', sortMode: 'recent' },
        filters: {
          hideDormant: false,
          hideDone: false,
          visibleSources: ['codex'],
          visibleEntityKinds: ['session'],
          sourceFilterActive: true,
          entityKindFilterActive: true,
        },
      } satisfies Pick<ResolvedSettings, 'layout' | 'filters'>
    );

    expect(result).toHaveLength(1);
    expect(result[0].representative.entityKind).toBe('session');
  });
});

describe('findVisibleEntityGroupById', () => {
  it('returns the matching visible group when it is still on screen', () => {
    const groups = getVisibleEntityGroups(
      [
        {
          entityId: 'tool-1',
          sessionId: 'session-a',
          source: 'codex',
          entityKind: 'tool-run',
          currentStatus: 'active',
          lastEventAt: '2026-04-10T10:00:00.000Z',
          activityScore: 0.4,
        },
        {
          entityId: 'turn-1',
          sessionId: 'session-a',
          source: 'codex',
          entityKind: 'session',
          currentStatus: 'idle',
          lastEventAt: '2026-04-10T10:05:00.000Z',
          activityScore: 0.8,
        },
      ],
      recentSettings
    );

    expect(findVisibleEntityGroupById(groups, 'codex|session-a')?.representative.entityId).toBe(
      'turn-1'
    );
  });

  it('returns undefined when a selected group is no longer visible', () => {
    const groups = getVisibleEntityGroups(
      [
        {
          entityId: 'turn-1',
          sessionId: 'session-a',
          source: 'codex',
          entityKind: 'session',
          currentStatus: 'idle',
          lastEventAt: '2026-04-10T10:05:00.000Z',
          activityScore: 0.8,
        },
      ],
      recentSettings
    );

    expect(findVisibleEntityGroupById(groups, 'codex|missing')).toBeUndefined();
  });
});

describe('getGridColumns', () => {
  it('caps compact layouts at more columns than comfortable layouts', () => {
    expect(getGridColumns(6, 'comfortable')).toBe(3);
    expect(getGridColumns(6, 'compact')).toBe(4);
  });
});

describe('dashboard view helpers', () => {
  it('summarizes the current entity mix for the top bar', () => {
    const summary = getEntityStatusSummary(entities);

    expect(summary.total).toBe(3);
    expect(summary.active).toBe(1);
    expect(summary.idle).toBe(1);
    expect(summary.dormant).toBe(1);
    expect(summary.latestEventAt).toBe('2026-04-10T10:05:00.000Z');
  });

  it('builds sorted unique filter options from live entities', () => {
    const options = getFilterOptions([
      {
        entityId: '1',
        source: 'codex',
        entityKind: 'worker',
        currentStatus: 'active',
        lastEventAt: '2026-04-10T10:00:00.000Z',
        activityScore: 0.9,
      },
      {
        entityId: '2',
        source: 'claude',
        entityKind: 'session',
        currentStatus: 'idle',
        lastEventAt: '2026-04-10T10:01:00.000Z',
        activityScore: 0.7,
      },
      {
        entityId: '3',
        source: 'codex',
        entityKind: 'session',
        currentStatus: 'sleepy',
        lastEventAt: '2026-04-10T10:02:00.000Z',
        activityScore: 0.6,
      },
    ]);

    expect(options.sources).toEqual(['claude', 'codex']);
    expect(options.entityKinds).toEqual(['session', 'worker']);
  });

  it('returns a filter-specific empty-state message when live data exists', () => {
    expect(getEmptyStateMessage(3, 0)).toBe(
      'No conversations match the current filters. Reset your overrides or widen the filters.'
    );
  });

  it('returns the default empty-state message when no live data exists', () => {
    expect(getEmptyStateMessage(0, 0)).toBe(
      'No active entities yet. Start the collector to stream events.'
    );
  });

  it('seeds derived filter checkboxes from live options when viewer overrides are absent', () => {
    const markup = renderToStaticMarkup(
      createElement(SettingsPanel, {
        config: dashboardConfig,
        settings: {
          layout: { maxAgentsShown: 12, density: 'comfortable', sortMode: 'activity' },
          filters: {
            hideDormant: false,
            hideDone: false,
            visibleSources: [],
            visibleEntityKinds: [],
            sourceFilterActive: false,
            entityKindFilterActive: false,
          },
          theme: {
            id: 'sunrise-arcade',
            label: 'Sunrise Arcade',
            pageBackground: '',
            panelBackground: '',
            textColor: '',
            mutedTextColor: '',
          },
          visualRules: [],
          ui: dashboardConfig.ui,
          artStyleMode: 'config',
        },
        sourceOptions: ['claude', 'codex'],
        entityKindOptions: ['session', 'worker'],
        onChange: () => undefined,
        onReset: () => undefined,
      })
    );

    expect((markup.match(/type="checkbox" checked=""/g) ?? []).length).toBe(4);
  });

  it('prunes stale filter selections against the live option lists', () => {
    expect(
      pruneViewerPreferencesToLiveOptions(
        {
          visibleSources: ['codex', 'legacy'],
          visibleEntityKinds: ['worker', 'archived'],
        },
        {
          sources: ['claude', 'codex'],
          entityKinds: ['session', 'worker'],
        }
      )
    ).toEqual({
      visibleSources: ['codex'],
      visibleEntityKinds: ['worker'],
    });
  });

  it('keeps saved filter selections intact before live options load', () => {
    expect(
      pruneViewerPreferencesToLiveOptions(
        {
          visibleSources: ['codex'],
          visibleEntityKinds: ['worker'],
        },
        {
          sources: [],
          entityKinds: [],
        }
      )
    ).toEqual({
      visibleSources: ['codex'],
      visibleEntityKinds: ['worker'],
    });
  });
});
