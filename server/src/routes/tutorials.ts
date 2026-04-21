import { Router } from 'express';
import { prisma } from '../db.js';
import { fetchFullText } from '../services/fullTextFetcher.js';

const router = Router();

// 获取所有教程类热点
router.get('/', async (req, res) => {
  try {
    const { page = '1', limit = '20' } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const [tutorials, total] = await Promise.all([
      prisma.hotspot.findMany({
        where: { contentType: 'tutorial' },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
        include: { keyword: true }
      }),
      prisma.hotspot.count({ where: { contentType: 'tutorial' } })
    ]);

    res.json({
      data: tutorials,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Error fetching tutorials:', error);
    res.status(500).json({ error: 'Failed to fetch tutorials' });
  }
});

// 获取单个教程的全文内容
router.get('/:id/content', async (req, res) => {
  try {
    const hotspot = await prisma.hotspot.findUnique({
      where: { id: req.params.id }
    });

    if (!hotspot) {
      return res.status(404).json({ error: 'Tutorial not found' });
    }

    if (hotspot.contentType !== 'tutorial') {
      return res.status(404).json({ error: 'Not a tutorial' });
    }

    if (!hotspot.fullContentFetched) {
      return res.status(404).json({ error: 'Content not yet fetched' });
    }

    res.json({
      id: hotspot.id,
      title: hotspot.title,
      url: hotspot.url,
      content: hotspot.fullContent,
      fetchedAt: hotspot.publishedAt?.toISOString() || null
    });
  } catch (error) {
    console.error('Error fetching tutorial content:', error);
    res.status(500).json({ error: 'Failed to fetch tutorial content' });
  }
});

// 手动触发抓取教程全文
router.post('/:id/fetch', async (req, res) => {
  try {
    const hotspot = await prisma.hotspot.findUnique({
      where: { id: req.params.id }
    });

    if (!hotspot) {
      return res.status(404).json({ error: 'Tutorial not found' });
    }

    if (hotspot.contentType !== 'tutorial') {
      return res.status(400).json({ error: 'Not a tutorial' });
    }

    const content = await fetchFullText(hotspot.url);

    const updated = await prisma.hotspot.update({
      where: { id: hotspot.id },
      data: {
        fullContent: content,
        fullContentFetched: true
      },
      include: { keyword: true }
    });

    res.json(updated);
  } catch (error: any) {
    console.error('Error fetching tutorial content:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch tutorial content' });
  }
});

export default router;
