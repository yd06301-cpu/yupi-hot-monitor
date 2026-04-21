import { prisma } from '../db.js';

export interface TutorialHotspot {
  id: string;
  title: string;
  content: string;
  url: string;
  source: string;
  difficulty: string | null;
  estimatedTime: string | null;
  techStack: string | null;
  relevance: number;
  importance: string;
  summary: string | null;
  createdAt: Date;
}

export interface DifficultyGroup {
  level: 'easy' | 'medium' | 'hard' | 'unknown';
  items: TutorialHotspot[];
}

export interface TutorialDigest {
  groups: DifficultyGroup[];
  totalCount: number;
  dateRange: {
    start: Date;
    end: Date;
  };
}

// 难度级别映射
const DIFFICULTY_ORDER: Record<string, number> = {
  easy: 1,
  medium: 2,
  hard: 3,
  unknown: 4
};

/**
 * 从数据库获取指定时间范围内的教程热点
 */
export async function fetchTutorialHotspots(hours = 24): Promise<TutorialHotspot[]> {
  const cutoff = new Date(Date.now() - hours * 3600 * 1000);

  const hotspots = await prisma.hotspot.findMany({
    where: {
      source: 'tutorial',
      createdAt: { gte: cutoff }
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  return hotspots.map(h => ({
    id: h.id,
    title: h.title,
    content: h.content,
    url: h.url,
    source: h.source,
    difficulty: h.difficulty,
    estimatedTime: h.estimatedTime,
    techStack: h.techStack,
    relevance: h.relevance,
    importance: h.importance,
    summary: h.summary,
    createdAt: h.createdAt
  }));
}

/**
 * 按难度分组教程热点
 */
export function groupByDifficulty(hotspots: TutorialHotspot[]): DifficultyGroup[] {
  const groups: Map<string, TutorialHotspot[]> = new Map();

  for (const hotspot of hotspots) {
    const level = (hotspot.difficulty as 'easy' | 'medium' | 'hard') || 'unknown';
    if (!groups.has(level)) {
      groups.set(level, []);
    }
    groups.get(level)!.push(hotspot);
  }

  // 按难度顺序排序：easy → medium → hard → unknown
  const orderedLevels = ['easy', 'medium', 'hard', 'unknown'] as const;
  const result: DifficultyGroup[] = [];

  for (const level of orderedLevels) {
    if (groups.has(level) && groups.get(level)!.length > 0) {
      result.push({
        level,
        items: groups.get(level)!
      });
    }
  }

  return result;
}

/**
 * 生成教程摘要（ digest）
 */
export async function generateTutorialDigest(hours = 24): Promise<TutorialDigest> {
  const hotspots = await fetchTutorialHotspots(hours);
  const groups = groupByDifficulty(hotspots);

  const now = new Date();
  const start = new Date(now.getTime() - hours * 3600 * 1000);

  return {
    groups,
    totalCount: hotspots.length,
    dateRange: {
      start,
      end: now
    }
  };
}

/**
 * 格式化难度标签为中文显示
 */
export function formatDifficulty(level: string): string {
  const labels: Record<string, string> = {
    easy: '🟢 入门',
    medium: '🟡 进阶',
    hard: '🔴 高级',
    unknown: '⚪ 未分类'
  };
  return labels[level] || level;
}

/**
 * 生成教程摘要的纯文本摘要（用于邮件或其他通知）
 */
export function formatDigestAsText(digest: TutorialDigest): string {
  let text = `📚 教程简报 - 共 ${digest.totalCount} 篇\n`;
  text += `时间范围: ${digest.dateRange.start.toLocaleString('zh-CN')} - ${digest.dateRange.end.toLocaleString('zh-CN')}\n\n`;

  for (const group of digest.groups) {
    text += `${formatDifficulty(group.level)}（${group.items.length} 篇）\n`;
    text += '-'.repeat(30) + '\n';

    for (const item of group.items) {
      text += `• ${item.title}\n`;
      if (item.estimatedTime) {
        text += `  预计时间: ${item.estimatedTime}\n`;
      }
      if (item.techStack) {
        text += `  技术栈: ${item.techStack}\n`;
      }
      text += `  ${item.url}\n\n`;
    }
  }

  return text;
}
