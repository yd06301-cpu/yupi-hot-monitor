import axios from 'axios';
import * as cheerio from 'cheerio';

// User Agent 列表
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15'
];

const TIMEOUT_MS = 15000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 智能提取 HTML 正文内容
 * 按优先级尝试多个选择器，剥离无关元素
 */
export async function fetchFullText(url: string): Promise<string> {
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
        timeout: TIMEOUT_MS,
        maxRedirects: 5
      });

      const $ = cheerio.load(response.data);

      // 移除不需要的元素
      $('script, style, nav, header, footer, aside, .ads, .advertisement, .sidebar, .comments, .related').remove();

      // 按优先级尝试提取正文
      const contentSelectors = [
        'article',
        'main',
        '.post-content',
        '.entry-content',
        '.content',
        '.article-body',
        '.post-body',
        '#content',
        '.markdown-body',
        '.document',
        'body'
      ];

      let content = '';
      for (const selector of contentSelectors) {
        const element = $(selector);
        if (element.length > 0) {
          content = element.html() || '';
          if (content.trim().length > 100) {
            break;
          }
        }
      }

      if (!content) {
        content = $('body').text() || '';
      }

      // 将 HTML 转换为纯文本/类 Markdown 格式
      const textContent = htmlToMarkdown($, content);

      if (textContent.trim().length === 0) {
        throw new Error('No content extracted');
      }

      console.log(`✅ Fetched full text from ${url}: ${textContent.length} chars`);
      return textContent;

    } catch (error: any) {
      lastError = error;
      console.error(`Attempt ${attempt}/${MAX_RETRIES} failed for ${url}:`, error.message);
      if (attempt < MAX_RETRIES) {
        await delay(RETRY_DELAY_MS * attempt); // 指数退避
      }
    }
  }

  console.error(`❌ Failed to fetch full text from ${url}:`, lastError?.message);
  throw lastError || new Error(`Failed to fetch content from ${url}`);
}

/**
 * 将 HTML 内容转换为类 Markdown 格式
 */
function htmlToMarkdown($: cheerio.CheerioAPI, html: string): string {
  const temp = $('<div>').html(html);

  // 处理标题
  temp.find('h1').each((_, el) => {
    $(el).replaceWith(`\n# ${$(el).text().trim()}\n`);
  });
  temp.find('h2').each((_, el) => {
    $(el).replaceWith(`\n## ${$(el).text().trim()}\n`);
  });
  temp.find('h3').each((_, el) => {
    $(el).replaceWith(`\n### ${$(el).text().trim()}\n`);
  });
  temp.find('h4').each((_, el) => {
    $(el).replaceWith(`\n#### ${$(el).text().trim()}\n`);
  });

  // 处理代码块
  temp.find('pre').each((_, el) => {
    const code = $(el).text().trim();
    $(el).replaceWith(`\n\`\`\`\n${code}\n\`\`\`\n`);
  });

  // 处理列表
  temp.find('li').each((_, el) => {
    $(el).replaceWith(`\n- ${$(el).text().trim()}`);
  });

  // 处理段落
  temp.find('p').each((_, el) => {
    const text = $(el).text().trim();
    if (text) {
      $(el).replaceWith(`\n${text}\n`);
    } else {
      $(el).remove();
    }
  });

  // 处理换行
  temp.find('br').each((_, el) => {
    $(el).replaceWith('\n');
  });

  // 获取最终文本
  let result = temp.text();

  // 清理多余空白
  result = result.replace(/\n{3,}/g, '\n\n');
  result = result.trim();

  return result;
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
