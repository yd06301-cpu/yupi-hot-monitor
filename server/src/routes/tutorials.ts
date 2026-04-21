import { Router } from 'express';
import { prisma } from '../db.js';
import { fetchFullText } from '../services/fullTextFetcher.js';

const router = Router();

// 获取所有教程热点
router.get('/', async (req, res) => {
  try {
    const { page = '1', limit = '20' } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const [tutorials, total] = await Promise.all([
      prisma.hotspot.findMany({
        where: {
          OR: [
            { contentType: 'tutorial' },
            { summary: { contains: '教程' } },
            { summary: { contains: '指南' } },
            { summary: { contains: '入门' } },
            { summary: { contains: '详解' } }
          ]
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
        include: {
          keyword: true
        }
      }),
      prisma.hotspot.count({
        where: {
          OR: [
            { contentType: 'tutorial' },
            { summary: { contains: '教程' } },
            { summary: { contains: '指南' } },
            { summary: { contains: '入门' } },
            { summary: { contains: '详解' } }
          ]
        }
      })
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

    res.json({
      id: hotspot.id,
      title: hotspot.title,
      url: hotspot.url,
      content: hotspot.fullContent || null,
      contentFetched: hotspot.contentFetched
    });
  } catch (error: any) {
    console.error('Error fetching tutorial content:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Tutorial not found' });
    }
    res.status(500).json({ error: 'Failed to fetch tutorial content' });
  }
});

// 手动触发抓取教程全文
router.post('/fetch', async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Hotspot ID is required' });
    }

    const hotspot = await prisma.hotspot.findUnique({
      where: { id }
    });

    if (!hotspot) {
      return res.status(404).json({ error: 'Hotspot not found' });
    }

    if (hotspot.fullContent) {
      return res.json({ message: 'Content already fetched', content: hotspot.fullContent });
    }

    const content = await fetchFullText(hotspot.url);

    await prisma.hotspot.update({
      where: { id },
      data: {
        fullContent: content,
        contentFetched: true,
        contentType: hotspot.contentType || 'tutorial'
      }
    });

    res.json({ message: 'Content fetched successfully', content });
  } catch (error: any) {
    console.error('Error fetching tutorial content:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Hotspot not found' });
    }
    res.status(500).json({ error: 'Failed to fetch tutorial content: ' + error.message });
  }
});

export default router;
