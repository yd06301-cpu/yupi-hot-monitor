/**
 * RSS Feed 服务测试
 *
 * 运行方式：
 *   npx vitest run src/__tests__/rssFeeds.test.ts
 */

import { describe, it, expect } from 'vitest';
import { deduplicateResults } from '../services/rssFeeds.js';
import type { SearchResult } from '../types.js';

// ========== deduplicateResults 测试 ==========

describe('deduplicateResults', () => {
  it('去除重复 URL', () => {
    const results: SearchResult[] = [
      { title: 'A', content: '', url: 'https://example.com/a', source: 'tutorial' },
      { title: 'A dup', content: '', url: 'https://example.com/a', source: 'tutorial' },
      { title: 'B', content: '', url: 'https://example.com/b', source: 'tutorial' },
    ];

    const unique = deduplicateResults(results);

    expect(unique).toHaveLength(2);
    expect(unique.map(r => r.title)).toContain('A');
    expect(unique.map(r => r.title)).toContain('B');
  });

  it('标准化 URL 去重（尾部斜杠）', () => {
    const results: SearchResult[] = [
      { title: 'A', content: '', url: 'https://example.com/a', source: 'tutorial' },
      { title: 'A dup', content: '', url: 'https://example.com/a/', source: 'tutorial' },
    ];

    const unique = deduplicateResults(results);
    expect(unique).toHaveLength(1);
  });

  it('标准化 URL 去重（www 前缀）', () => {
    const results: SearchResult[] = [
      { title: 'A', content: '', url: 'https://example.com/a', source: 'tutorial' },
      { title: 'A dup', content: '', url: 'https://www.example.com/a', source: 'tutorial' },
    ];

    const unique = deduplicateResults(results);
    expect(unique).toHaveLength(1);
  });

  it('空数组返回空数组', () => {
    expect(deduplicateResults([])).toEqual([]);
  });

  it('保留第一个出现的条目', () => {
    const results: SearchResult[] = [
      { title: 'First', content: '', url: 'https://example.com/a', source: 'tutorial' },
      { title: 'Second', content: '', url: 'https://example.com/a', source: 'tutorial' },
    ];

    const unique = deduplicateResults(results);
    expect(unique[0].title).toBe('First');
  });

  it('不修改原数组', () => {
    const results: SearchResult[] = [
      { title: 'A', content: '', url: 'https://example.com/a', source: 'tutorial' },
      { title: 'B', content: '', url: 'https://example.com/b', source: 'tutorial' },
    ];
    const original = [...results];

    deduplicateResults(results);

    expect(results).toEqual(original);
  });
});
