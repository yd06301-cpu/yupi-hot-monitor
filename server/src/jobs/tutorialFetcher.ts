import { Server } from 'socket.io';
import { prisma } from '../db.js';
import { fetchFullText, isTutorialUrl } from '../services/fullTextFetcher.js';

/**
 * 定时任务：扫描并抓取教程热点的全文
 * - 每小时执行
 * - 跳过有用户在线的情况
 * - 并发控制（最大3个同时请求）
 */
export async function runTutorialFetch(io: Server): Promise<void> {
  console.log('📚 Starting tutorial fetch job...');

  // 检查是否有用户在线
  const onlineCount = io.sockets.sockets.size;
  if (onlineCount > 0) {
    console.log(`👤 ${onlineCount} user(s) online, skipping tutorial fetch`);
    return;
  }

  // 查询需要抓取全文的教程热点
  // contentType='tutorial' 或 summary 中包含教程关键词且 fullContent 为空
  const tutorials = await prisma.hotspot.findMany({
    where: {
      OR: [
        { contentType: 'tutorial' },
        {
          AND: [
            { summary: { not: null } },
            { fullContent: null }
          ]
        }
      ],
      fullContent: null
    },
    take: 20
  });

  if (tutorials.length === 0) {
    console.log('No tutorials need full-text fetching');
    return;
  }

  console.log(`Found ${tutorials.length} tutorials to fetch`);

  let fetchedCount = 0;
  let skippedCount = 0;

  for (const tutorial of tutorials) {
    // 再次检查用户在线状态
    if (io.sockets.sockets.size > 0) {
      console.log('👤 User came online, stopping tutorial fetch');
      break;
    }

    // 如果已经是教程类型但还没抓取，或者 summary 包含教程关键词
    const isTutorial = tutorial.contentType === 'tutorial' ||
      isTutorialUrl(tutorial.url, tutorial.title, tutorial.summary || undefined);

    if (!isTutorial) {
      skippedCount++;
      continue;
    }

    try {
      console.log(`📖 Fetching: ${tutorial.title.slice(0, 50)}...`);

      const content = await fetchFullText(tutorial.url);

      await prisma.hotspot.update({
        where: { id: tutorial.id },
        data: {
          fullContent: content,
          contentFetched: true,
          contentType: tutorial.contentType || 'tutorial'
        }
      });

      fetchedCount++;
      console.log(`✅ Fetched tutorial: ${tutorial.title.slice(0, 40)}... (${content.length} chars)`);

    } catch (error: any) {
      console.error(`❌ Failed to fetch ${tutorial.title.slice(0, 40)}...:`, error.message);

      // 标记为已处理（避免反复重试失败的 URL）
      await prisma.hotspot.update({
        where: { id: tutorial.id },
        data: {
          contentFetched: true,
          fullContent: `// 抓取失败: ${error.message}`,
          contentType: tutorial.contentType || 'tutorial'
        }
      });
    }
  }

  console.log(`✨ Tutorial fetch completed. Fetched: ${fetchedCount}, Skipped: ${skippedCount}`);
}
