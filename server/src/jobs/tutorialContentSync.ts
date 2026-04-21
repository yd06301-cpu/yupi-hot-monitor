import { Server } from 'socket.io';
import { prisma } from '../db.js';
import { fetchFullText } from '../services/fullTextFetcher.js';

const MAX_CONCURRENT = 3;

/**
 * 定时任务：同步教程类热点的全文内容
 * 每小时运行，跳过有用户在线的时段
 */
export async function runTutorialSync(io: Server): Promise<void> {
  console.log('📚 Starting tutorial content sync...');

  // 检查是否有用户在线
  const connectedCount = io.sockets.sockets.size;
  if (connectedCount > 0) {
    console.log(`⏭️ Skipping tutorial sync — ${connectedCount} users online`);
    return;
  }

  // 查询未抓取全文的教程热点
  const tutorials = await prisma.hotspot.findMany({
    where: {
      contentType: 'tutorial',
      fullContentFetched: false
    },
    select: {
      id: true,
      title: true,
      url: true
    }
  });

  if (tutorials.length === 0) {
    console.log('📚 No unfetched tutorial content found');
    return;
  }

  console.log(`📚 Found ${tutorials.length} tutorials needing content fetch`);

  // 简单并发控制
  const queue = [...tutorials];
  const inProgress = new Set<string>();
  let processed = 0;
  let failed = 0;

  return new Promise((resolve) => {
    function startNext(): void {
      while (inProgress.size < MAX_CONCURRENT && queue.length > 0) {
        const tutorial = queue.shift()!;
        inProgress.add(tutorial.id);
        processTutorial(tutorial).finally(() => {
          inProgress.delete(tutorial.id);
          processed++;
          if (queue.length === 0 && inProgress.size === 0) {
            console.log(`✅ Tutorial sync completed: ${processed - failed}/${processed} succeeded, ${failed} failed`);
            resolve();
          } else {
            startNext();
          }
        });
      }
    }

    startNext();
  });
}

async function processTutorial(tutorial: { id: string; title: string; url: string }): Promise<void> {
  try {
    console.log(`📖 Fetching: ${tutorial.title.slice(0, 50)}...`);
    const content = await fetchFullText(tutorial.url);

    await prisma.hotspot.update({
      where: { id: tutorial.id },
      data: {
        fullContent: content,
        fullContentFetched: true
      }
    });

    console.log(`✅ Fetched: ${tutorial.title.slice(0, 50)}... (${content.length} chars)`);
  } catch (error: any) {
    console.error(`❌ Failed: ${tutorial.title.slice(0, 50)}... — ${error.message}`);
  }
}
