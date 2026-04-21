import { Server } from 'socket.io';
import { prisma } from '../db.js';
import { searchTwitter } from '../services/twitter.js';
import { searchBing, searchHackerNews, deduplicateResults } from '../services/search.js';
import { searchSogou, searchBilibili, searchWeibo, detectAndFetchAccount } from '../services/chinaSearch.js';
import { fetchAllTutorialFeeds } from '../services/rssFeeds.js';
import { analyzeContent, expandKeyword, preMatchKeyword } from '../services/ai.js';
import { sendHotspotEmail } from '../services/email.js';
import type { SearchResult } from '../types.js';

// 新鲜度过滤：丢弃超过指定小时数的内容
// Twitter 层面已通过 since: 限制了时间范围，这里只做兜底
const MAX_AGE_HOURS = 7 * 24; // 7天

// ========== 教程元数据提取工具函数 ==========

/**
 * 从教程内容中提取难度级别
 */
function extractDifficulty(content: string): string | null {
  const lower = content.toLowerCase();
  if (/\b(beginner|入门|初级|easy|basic|fundamentals|getting started)\b/i.test(lower)) {
    return 'easy';
  }
  if (/\b(intermediate|中级|进阶|medium)\b/i.test(lower)) {
    return 'medium';
  }
  if (/\b(advanced|高级|hard|expert|deep dive)\b/i.test(lower)) {
    return 'hard';
  }
  return null;
}

/**
 * 从教程内容中提取预估学习时间
 */
function extractEstimatedTime(content: string): string | null {
  // 匹配常见时间格式：10min, 1h, 30 minutes, 2 hours, 1.5h
  const match = content.match(/\b(\d+\.?\d*)\s*(min|minute|hour|hr|h|分钟|小时)\b/i);
  if (match) {
    const value = match[1];
    const unit = match[2].toLowerCase();
    if (unit.startsWith('h') || unit.includes('小时')) {
      return `${value}h`;
    }
    return `${value}min`;
  }
  return null;
}

/**
 * 从教程标题和内容中提取技术栈标签
 */
function extractTechStack(text: string): string | null {
  const techs: string[] = [];
  const knownTech = [
    'Python', 'JavaScript', 'TypeScript', 'React', 'Vue', 'Angular',
    'Node.js', 'Go', 'Rust', 'Java', 'C++', 'C#',
    'TensorFlow', 'PyTorch', 'Machine Learning', 'Deep Learning',
    'Docker', 'Kubernetes', 'AWS', 'Azure', 'GCP',
    'Next.js', 'Nuxt', 'Svelte', 'Tailwind CSS',
    'GraphQL', 'REST API', 'PostgreSQL', 'MySQL', 'MongoDB',
    'Redis', 'Elasticsearch', 'Kafka', 'RabbitMQ',
    'CI/CD', 'DevOps', 'Microservices', 'Serverless',
    'Claude', 'GPT', 'LLM', 'AI', 'OpenAI', 'Anthropic'
  ];

  for (const tech of knownTech) {
    const regex = new RegExp(`\\b${tech.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(text)) {
      techs.push(tech);
    }
  }

  return techs.length > 0 ? techs.slice(0, 5).join(', ') : null;
}

// ========== 热点检查主流程 ==========

function filterByFreshness(results: SearchResult[]): SearchResult[] {
  const cutoff = new Date(Date.now() - MAX_AGE_HOURS * 3600 * 1000);
  return results.filter(item => {
    // 没有发布时间的，暂时保留（搜索引擎结果通常没有时间）
    if (!item.publishedAt) return true;
    return item.publishedAt >= cutoff;
  });
}

// 按来源优先级排序：Twitter > 微博 > B站/账号内容 > 搜索引擎
function prioritizeResults(results: SearchResult[]): SearchResult[] {
  const priorityMap: Record<string, number> = {
    twitter: 1,
    weibo: 2,
    bilibili: 3,
    hackernews: 4,
    sogou: 5,
    bing: 6,
    google: 7,
    duckduckgo: 8
  };
  return [...results].sort((a, b) => {
    return (priorityMap[a.source] || 99) - (priorityMap[b.source] || 99);
  });
}

export async function runHotspotCheck(io?: Server): Promise<void> {
  console.log('🔍 Starting hotspot check...');

  // 获取所有激活的关键词
  const keywords = await prisma.keyword.findMany({
    where: { isActive: true }
  });

  if (keywords.length === 0) {
    console.log('No active keywords to monitor');
    return;
  }

  console.log(`Checking ${keywords.length} keywords...`);

  let newHotspotsCount = 0;

  for (const keyword of keywords) {
    console.log(`\n📎 Checking keyword: "${keyword.text}"`);

    try {
      // 第一步：检测关键词是否为某个平台账号
      console.log(`  🎯 Detecting account for "${keyword.text}"...`);
      const accountResult = await detectAndFetchAccount(keyword.text);
      
      if (accountResult.accounts.length > 0) {
        for (const acc of accountResult.accounts) {
          console.log(`  ✅ Found ${acc.platform} account: ${acc.name} (${acc.followers} followers)`);
        }
      }

      // 第 1.5 步：Query Expansion（查询扩展）
      console.log(`  🔍 Expanding keyword "${keyword.text}"...`);
      const expandedKeywords = await expandKeyword(keyword.text);
      console.log(`  📋 Expanded to ${expandedKeywords.length} variants: ${expandedKeywords.slice(0, 5).join(', ')}${expandedKeywords.length > 5 ? '...' : ''}`);

      // 第二步：从多个来源获取数据（国际 + 国内 + 教程源并行请求）
      const [
        twitterResults,
        bingResults,
        hackernewsResults,
        sogouResults,
        bilibiliResults,
        weiboResults,
        tutorialResults
      ] = await Promise.allSettled([
        searchTwitter(keyword.text),
        searchBing(keyword.text),
        searchHackerNews(keyword.text),
        searchSogou(keyword.text),
        searchBilibili(keyword.text),
        searchWeibo(keyword.text),
        fetchAllTutorialFeeds()
      ]);

      const allResults: SearchResult[] = [];
      
      // 优先添加账号检测到的最新内容
      if (accountResult.results.length > 0) {
        allResults.push(...accountResult.results);
        console.log(`  AccountFetch: ${accountResult.results.length} results`);
      }

      const sources = [
        { name: 'Twitter', result: twitterResults },
        { name: 'Bing', result: bingResults },
        { name: 'HackerNews', result: hackernewsResults },
        { name: 'Sogou', result: sogouResults },
        { name: 'Bilibili', result: bilibiliResults },
        { name: 'Weibo', result: weiboResults },
        { name: 'Tutorial', result: tutorialResults }
      ];

      for (const source of sources) {
        if (source.result.status === 'fulfilled') {
          allResults.push(...source.result.value);
          console.log(`  ${source.name}: ${source.result.value.length} results`);
        } else {
          console.log(`  ${source.name}: failed - ${source.result.reason}`);
        }
      }

      // 去重 → 新鲜度过滤 → 按来源优先级排序
      const uniqueResults = deduplicateResults(allResults);
      const freshResults = filterByFreshness(uniqueResults);
      const sortedResults = prioritizeResults(freshResults);
      console.log(`  Total: ${allResults.length} raw → ${uniqueResults.length} unique → ${freshResults.length} fresh (within ${MAX_AGE_HOURS}h)`);

      // 处理结果：Twitter 优先多给配额
      // Twitter 最多处理 15 条，其他来源共享 10 条配额
      let twitterProcessed = 0;
      let otherProcessed = 0;
      const TWITTER_QUOTA = 15;
      const OTHER_QUOTA = 10;

      for (const item of sortedResults) {
        // 检查配额
        if (item.source === 'twitter' && twitterProcessed >= TWITTER_QUOTA) continue;
        if (item.source !== 'twitter' && otherProcessed >= OTHER_QUOTA) continue;
        if (twitterProcessed + otherProcessed >= TWITTER_QUOTA + OTHER_QUOTA) break;
        try {
          // 检查是否已存在
          const existing = await prisma.hotspot.findFirst({
            where: {
              url: item.url,
              source: item.source
            }
          });

          if (existing) {
            continue;
          }

          // AI 分析（传入关键词和预匹配结果）
          const fullText = item.title + '\n' + item.content;
          const preMatch = preMatchKeyword(fullText, expandedKeywords);
          const analysis = await analyzeContent(fullText, keyword.text, preMatch);

          // 只保存真实且相关的热点
          if (!analysis.isReal) {
            console.log(`  ❌ Filtered fake/spam: ${item.title.slice(0, 30)}...`);
            continue;
          }

          // 相关性阈值：50 分以下过滤
          if (analysis.relevance < 50) {
            console.log(`  ⏭ Low relevance (${analysis.relevance}): ${item.title.slice(0, 30)}...`);
            continue;
          }

          // 额外规则：关键词未被提及且相关性不足 65 → 过滤
          if (!analysis.keywordMentioned && analysis.relevance < 65) {
            console.log(`  ⏭ Keyword not mentioned & relevance < 65 (${analysis.relevance}): ${item.title.slice(0, 30)}...`);
            continue;
          }

          // 保存热点
          const hotspot = await prisma.hotspot.create({
            data: {
              title: item.title,
              content: item.content,
              url: item.url,
              source: item.source,
              sourceId: item.sourceId || null,
              isReal: analysis.isReal,
              relevance: analysis.relevance,
              relevanceReason: analysis.relevanceReason || null,
              keywordMentioned: analysis.keywordMentioned ?? null,
              importance: analysis.importance,
              summary: analysis.summary,
              viewCount: item.viewCount || null,
              likeCount: item.likeCount || null,
              retweetCount: item.retweetCount || null,
              replyCount: item.replyCount || null,
              commentCount: item.commentCount || null,
              quoteCount: item.quoteCount || null,
              danmakuCount: item.danmakuCount || null,
              authorName: item.author?.name || null,
              authorUsername: item.author?.username || null,
              authorAvatar: item.author?.avatar || null,
              authorFollowers: item.author?.followers || null,
              authorVerified: item.author?.verified ?? null,
              publishedAt: item.publishedAt || null,
              difficulty: item.source === 'tutorial' ? extractDifficulty(item.content) : null,
              estimatedTime: item.source === 'tutorial' ? extractEstimatedTime(item.content) : null,
              techStack: item.source === 'tutorial' ? extractTechStack(item.title + ' ' + item.content) : null,
              keywordId: keyword.id
            },
            include: {
              keyword: true
            }
          });

          newHotspotsCount++;
          if (item.source === 'twitter') twitterProcessed++;
          else otherProcessed++;
          console.log(`  ✅ New hotspot [${item.source}]: ${hotspot.title.slice(0, 40)}... (${analysis.importance})`);

          // 创建通知
          await prisma.notification.create({
            data: {
              type: 'hotspot',
              title: `发现新热点: ${hotspot.title.slice(0, 50)}`,
              content: analysis.summary || hotspot.content.slice(0, 100),
              hotspotId: hotspot.id
            }
          });

          // WebSocket 通知
          if (io) {
            io.to(`keyword:${keyword.text}`).emit('hotspot:new', hotspot);
            io.emit('notification', {
              type: 'hotspot',
              title: '发现新热点',
              content: hotspot.title,
              hotspotId: hotspot.id,
              importance: hotspot.importance
            });
          }

          // 邮件通知（仅对高重要级别）
          if (['high', 'urgent'].includes(analysis.importance)) {
            await sendHotspotEmail(hotspot);
          }

        } catch (error) {
          console.error(`  Error processing result:`, error);
        }
      }

      // 避免过快请求
      await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (error) {
      console.error(`Error checking keyword "${keyword.text}":`, error);
    }
  }

  console.log(`\n✨ Hotspot check completed. Found ${newHotspotsCount} new hotspots.`);
}
