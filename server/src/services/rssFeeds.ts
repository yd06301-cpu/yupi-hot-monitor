import axios from 'axios';
import * as cheerio from 'cheerio';
import type { SearchResult } from '../types.js';

// User Agent 列表
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15'
];

// 频率限制器
class RateLimiter {
  private lastRequestTime = 0;
  private minInterval: number;

  constructor(minIntervalMs: number = 5000) {
    this.minInterval = minIntervalMs;
  }

  async wait(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestTime;
    if (elapsed < this.minInterval) {
      await new Promise(resolve => setTimeout(resolve, this.minInterval - elapsed));
    }
    this.lastRequestTime = Date.now();
  }
}

// 教程源配置
interface TutorialFeedConfig {
  name: string;
  url: string;
  limiter: RateLimiter;
}

const TUTORIAL_FEEDS: TutorialFeedConfig[] = [
  {
    name: 'Dev.to AI',
    url: 'https://dev.to/feed/tag/ai',
    limiter: new RateLimiter(3000)
  },
  {
    name: 'Hashnode AI',
    url: 'https://hashnode.com/n/ai/rss',
    limiter: new RateLimiter(3000)
  },
  {
    name: 'Papers With Code',
    url: 'https://paperswithcode.com/api/v1/papers/',
    limiter: new RateLimiter(5000)
  }
];

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// 解析 RSS/Atom feed 通用函数
function parseFeedItems($: cheerio.CheerioAPI, feedUrl: string): SearchResult[] {
  const results: SearchResult[] = [];

  // 处理 RSS 格式
  $('item').each((_, element) => {
    const title = $(element).find('title').text().trim();
    const link = $(element).find('link').text().trim();
    const description = $(element).find('description').text().trim();
    const content = $(element).find('content\\:encoded').text().trim();
    const pubDate = $(element).find('pubDate').text().trim();

    if (title && link) {
      results.push({
        title,
        content: content || description,
        url: link,
        source: 'tutorial'
      });
    }
  });

  // 处理 Atom 格式
  if (results.length === 0) {
    $('entry').each((_, element) => {
      const title = $(element).find('title').text().trim();
      const linkEl = $(element).find('link').first();
      const link = linkEl.attr('href') || linkEl.text().trim();
      const summary = $(element).find('summary').text().trim();
      const content = $(element).find('content').text().trim();
      const published = $(element).find('published').text().trim();

      if (title && link) {
        const item: SearchResult = {
          title,
          content: content || summary,
          url: link,
          source: 'tutorial'
        };
        if (published) {
          item.publishedAt = new Date(published);
        }
        results.push(item);
      }
    });
  }

  return results;
}

// 从单个教程源获取内容
async function fetchTutorialFeed(feed: TutorialFeedConfig): Promise<SearchResult[]> {
  await feed.limiter.wait();

  try {
    const response = await axios.get(feed.url, {
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'application/rss+xml,application/atom+xml,application/xml,text/xml,*/*;q=0.9',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br'
      },
      timeout: 15000
    });

    const $ = cheerio.load(response.data);
    const results = parseFeedItems($, feed.url);

    console.log(`${feed.name}: found ${results.length} tutorial items`);
    return results;
  } catch (error) {
    console.error(`${feed.name} feed error:`, error);
    return [];
  }
}

// 获取所有教程源的内容
export async function fetchAllTutorialFeeds(): Promise<SearchResult[]> {
  const results = await Promise.allSettled(
    TUTORIAL_FEEDS.map(feed => fetchTutorialFeed(feed))
  );

  const allResults: SearchResult[] = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      allResults.push(...result.value);
    } else {
      console.warn(`${TUTORIAL_FEEDS[index].name} feed failed:`, result.reason);
    }
  });

  // 去重
  const uniqueResults = deduplicateResults(allResults);
  console.log(`Tutorial feed aggregation: ${allResults.length} total, ${uniqueResults.length} unique`);
  return uniqueResults;
}

// 去重工具函数
export function deduplicateResults(allResults: SearchResult[]): SearchResult[] {
  const uniqueUrls = new Set<string>();
  return allResults.filter(item => {
    const normalizedUrl = item.url.replace(/\/$/, '').replace(/^https?:\/\/www\./, 'https://');
    if (uniqueUrls.has(normalizedUrl)) {
      return false;
    }
    uniqueUrls.add(normalizedUrl);
    return true;
  });
}
