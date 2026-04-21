/**
 * 教程摘要服务测试
 *
 * 运行方式：
 *   npx vitest run src/__tests__/tutorialDigest.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  groupByDifficulty,
  formatDifficulty,
  formatDigestAsText,
  type TutorialHotspot,
  type TutorialDigest
} from '../services/tutorialDigest.js';

// ========== 测试数据工厂 ==========

function makeHotspot(overrides: Partial<TutorialHotspot> = {}): TutorialHotspot {
  return {
    id: 'test-id',
    title: 'Test Tutorial',
    content: 'Test content',
    url: 'https://example.com/tutorial',
    source: 'tutorial',
    difficulty: null,
    estimatedTime: null,
    techStack: null,
    relevance: 80,
    importance: 'medium',
    summary: null,
    createdAt: new Date(),
    ...overrides
  };
}

// ========== groupByDifficulty 测试 ==========

describe('groupByDifficulty', () => {
  it('空数组返回空分组', () => {
    const result = groupByDifficulty([]);
    expect(result).toEqual([]);
  });

  it('按难度正确分组', () => {
    const hotspots = [
      makeHotspot({ title: 'Easy 1', difficulty: 'easy' }),
      makeHotspot({ title: 'Medium 1', difficulty: 'medium' }),
      makeHotspot({ title: 'Hard 1', difficulty: 'hard' }),
      makeHotspot({ title: 'Easy 2', difficulty: 'easy' }),
    ];

    const result = groupByDifficulty(hotspots);

    expect(result).toHaveLength(3);
    expect(result[0].level).toBe('easy');
    expect(result[0].items).toHaveLength(2);
    expect(result[1].level).toBe('medium');
    expect(result[1].items).toHaveLength(1);
    expect(result[2].level).toBe('hard');
    expect(result[2].items).toHaveLength(1);
  });

  it('难度顺序正确：easy → medium → hard → unknown', () => {
    const hotspots = [
      makeHotspot({ title: 'Hard', difficulty: 'hard' }),
      makeHotspot({ title: 'Unknown', difficulty: null }),
      makeHotspot({ title: 'Easy', difficulty: 'easy' }),
      makeHotspot({ title: 'Medium', difficulty: 'medium' }),
    ];

    const result = groupByDifficulty(hotspots);
    const levels = result.map(g => g.level);

    expect(levels).toEqual(['easy', 'medium', 'hard', 'unknown']);
  });

  it('null 难度归类为 unknown', () => {
    const hotspots = [
      makeHotspot({ title: 'No difficulty', difficulty: null }),
    ];

    const result = groupByDifficulty(hotspots);

    expect(result).toHaveLength(1);
    expect(result[0].level).toBe('unknown');
    expect(result[0].items).toHaveLength(1);
  });

  it('跳过空分组', () => {
    const hotspots = [
      makeHotspot({ title: 'Easy', difficulty: 'easy' }),
      makeHotspot({ title: 'Hard', difficulty: 'hard' }),
    ];

    const result = groupByDifficulty(hotspots);

    const levels = result.map(g => g.level);
    expect(levels).toEqual(['easy', 'hard']);
    expect(result.some(g => g.level === 'medium')).toBe(false);
  });
});

// ========== formatDifficulty 测试 ==========

describe('formatDifficulty', () => {
  it('easy 格式化为入门', () => {
    expect(formatDifficulty('easy')).toBe('🟢 入门');
  });

  it('medium 格式化为进阶', () => {
    expect(formatDifficulty('medium')).toBe('🟡 进阶');
  });

  it('hard 格式化为高级', () => {
    expect(formatDifficulty('hard')).toBe('🔴 高级');
  });

  it('unknown 格式化为未分类', () => {
    expect(formatDifficulty('unknown')).toBe('⚪ 未分类');
  });

  it('未知难度返回原始值', () => {
    expect(formatDifficulty('extreme')).toBe('extreme');
  });
});

// ========== formatDigestAsText 测试 ==========

describe('formatDigestAsText', () => {
  it('生成正确的纯文本摘要', () => {
    const digest: TutorialDigest = {
      groups: [
        {
          level: 'easy',
          items: [
            makeHotspot({
              title: 'Getting Started with TypeScript',
              url: 'https://example.com/ts',
              estimatedTime: '30min',
              techStack: 'TypeScript'
            }),
          ]
        },
      ],
      totalCount: 1,
      dateRange: {
        start: new Date('2026-04-22T00:00:00Z'),
        end: new Date('2026-04-22T23:59:59Z')
      }
    };

    const text = formatDigestAsText(digest);

    expect(text).toContain('📚 教程简报');
    expect(text).toContain('共 1 篇');
    expect(text).toContain('Getting Started with TypeScript');
    expect(text).toContain('30min');
    expect(text).toContain('TypeScript');
    expect(text).toContain('🟢 入门');
  });

  it('处理多个分组', () => {
    const digest: TutorialDigest = {
      groups: [
        {
          level: 'easy',
          items: [makeHotspot({ title: 'Easy Tutorial' })]
        },
        {
          level: 'hard',
          items: [makeHotspot({ title: 'Hard Tutorial' })]
        },
      ],
      totalCount: 2,
      dateRange: {
        start: new Date(),
        end: new Date()
      }
    };

    const text = formatDigestAsText(digest);

    expect(text).toContain('🟢 入门');
    expect(text).toContain('🔴 高级');
    expect(text).toContain('Easy Tutorial');
    expect(text).toContain('Hard Tutorial');
  });

  it('处理没有预计时间和技术栈的教程', () => {
    const digest: TutorialDigest = {
      groups: [
        {
          level: 'easy',
          items: [makeHotspot({ estimatedTime: null, techStack: null })]
        },
      ],
      totalCount: 1,
      dateRange: {
        start: new Date(),
        end: new Date()
      }
    };

    const text = formatDigestAsText(digest);

    // 当没有预计时间和技术栈时，这些字段会被跳过（不显示 `-`）
    expect(text).not.toContain('预计时间:');
    expect(text).not.toContain('技术栈:');
  });
});
