import axios from 'axios';
import * as cheerio from 'cheerio';

// User Agent 列表
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15'
];

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

const FETCH_TIMEOUT = 15000;
const MAX_RETRIES = 3;
const MAX_CONCURRENT = 3;

// 手动信号量实现并发控制
class Semaphore {
  private running = 0;
  private queue: Array<() => void> = [];

  constructor(private maxConcurrent: number) {}

  async acquire(): Promise<void> {
    if (this.running < this.maxConcurrent) {
      this.running++;
      return;
    }
    await new Promise<void>(resolve => {
      this.queue.push(resolve);
    });
    this.running++;
  }

  release(): void {
    this.running--;
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      next();
    }
  }
}

const semaphore = new Semaphore(MAX_CONCURRENT);

/**
 * 提取 HTML 正文内容
 * 移除 script、style、nav、footer 等无关元素
 */
function extractMainContent($: cheerio.CheerioAPI): string {
  // 移除无关元素
  $('script, style, nav, footer, header, aside, .ads, .sidebar, .comments, .related, .share, .newsletter').remove();

  // 尝试提取 article 内容
  let content = '';
  const article = $('article, .article-content, .post-content, .entry-content, .content, main').first();
  if (article.length > 0) {
    content = article.text().trim();
  } else {
    // 回退：取 body 文本
    content = $('body').text().trim();
  }

  // 清理多余空白
  content = content.replace(/\s+/g, ' ').replace(/\n{3,}/g, '\n\n');

  return content;
}

/**
 * 将 HTML 内容转换为简单的 Markdown
 */
function htmlToMarkdown($: cheerio.CheerioAPI): string {
  // 提取标题
  const title = $('h1').first().text().trim();

  // 提取所有 h2-h6 作为小标题
  let markdown = '';
  if (title) {
    markdown += `# ${title}\n\n`;
  }

  // 处理段落
  $('p').each((_, el) => {
    const text = $(el).text().trim();
    if (text.length > 20) {
      markdown += `${text}\n\n`;
    }
  });

  // 处理代码块
  $('pre code').each((_, el) => {
    const code = $(el).text().trim();
    const lang = $(el).attr('class')?.split(' ').find(c => c.startsWith('language-'))?.replace('language-', '') || '';
    markdown += `\n\`\`\`${lang}\n${code}\n\`\`\`\n\n`;
  });

  // 处理列表
  $('ul, ol').each((_, el) => {
    $(el).find('li').each((_, li) => {
      markdown += `- ${$(li).text().trim()}\n`;
    });
    markdown += '\n';
  });

  return markdown.trim();
}

/**
 * 抓取全文内容
 * @param url 目标 URL
 * @returns 提取的正文内容（Markdown 格式）
 */
export async function fetchFullText(url: string): Promise<string> {
  await semaphore.acquire();

  try {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await axios.get(url, {
          headers: {
            'User-Agent': getRandomUserAgent(),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br'
          },
          timeout: FETCH_TIMEOUT,
          maxRedirects: 5,
          validateStatus: (status) => status >= 200 && status < 400
        });

        const $ = cheerio.load(response.data);

        // 尝试转换为 Markdown
        let content = htmlToMarkdown($);

        // 如果 Markdown 转换结果太短，回退到纯文本提取
        if (content.length < 100) {
          content = extractMainContent($);
        }

        if (!content || content.length < 50) {
          throw new Error('Content too short or empty');
        }

        // 限制大小（500KB）
        if (content.length > 500 * 1024) {
          content = content.substring(0, 500 * 1024) + '\n\n...（内容已截断）';
        }

        return content;

      } catch (error: any) {
        lastError = error;
        console.error(`Full-text fetch attempt ${attempt}/${MAX_RETRIES} failed for ${url}:`, error.message);

        if (attempt < MAX_RETRIES) {
          // 指数退避
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('Failed to fetch full text');

  } finally {
    semaphore.release();
  }
}

/**
 * 检测 URL 是否可能是教程
 */
export function isTutorialUrl(url: string, title?: string, summary?: string): boolean {
  const text = (url + ' ' + (title || '') + ' ' + (summary || '')).toLowerCase();

  const tutorialPatterns = [
    '/tutorial/', '/learn/', '/guide/', '/docs/', '/blog/',
    '教程', '指南', '入门', '详解', '手把手', '教程',
    'how to', 'getting started', 'introduction to', 'beginner',
    'step by step', 'walkthrough', 'quickstart'
  ];

  return tutorialPatterns.some(pattern => text.includes(pattern));
}
