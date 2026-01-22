import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ChaptersService } from './chapters.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ChaptersService', () => {
  let service: ChaptersService;
  let prisma: PrismaService;

  const mockPrismaService = {
    book: {
      findFirst: jest.fn(),
    },
    chapter: {
      findFirst: jest.fn(),
    },
    sentence: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChaptersService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<ChaptersService>(ChaptersService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getChapter', () => {
    it('should return chapter if found', async () => {
      const book = { id: 'book-id', ownerUserId: 'user-id' };
      const chapter = {
        id: 'chapter-id',
        bookId: 'book-id',
        spineIndex: 0,
        title: 'Chapter 1',
        href: 'chapter1.xhtml',
        xhtmlPath: 'path/to/chapter.xhtml',
        createdAt: new Date(),
      };

      (mockPrismaService.book.findFirst as jest.Mock).mockResolvedValue(book);
      (mockPrismaService.chapter.findFirst as jest.Mock).mockResolvedValue(chapter);

      const result = await service.getChapter('user-id', 'book-id', 'chapter-id');

      expect(result).toHaveProperty('xhtmlUrl');
      expect(result.id).toBe('chapter-id');
    });

    it('should throw NotFoundException if book not found', async () => {
      (mockPrismaService.book.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.getChapter('user-id', 'book-id', 'chapter-id'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if chapter not found', async () => {
      const book = { id: 'book-id', ownerUserId: 'user-id' };
      (mockPrismaService.book.findFirst as jest.Mock).mockResolvedValue(book);
      (mockPrismaService.chapter.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.getChapter('user-id', 'book-id', 'chapter-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getSentences', () => {
    it('should return sentences for chapter', async () => {
      const book = { id: 'book-id', ownerUserId: 'user-id' };
      const chapter = { id: 'chapter-id', bookId: 'book-id' };
      const sentences = [
        { sentenceIndex: 0, text: 'Sentence 1', markerId: 's-000000' },
        { sentenceIndex: 1, text: 'Sentence 2', markerId: 's-000001' },
      ];

      (mockPrismaService.book.findFirst as jest.Mock).mockResolvedValue(book);
      (mockPrismaService.chapter.findFirst as jest.Mock).mockResolvedValue(chapter);
      (mockPrismaService.sentence.findMany as jest.Mock).mockResolvedValue(sentences);

      const result = await service.getSentences('user-id', 'book-id', 'chapter-id');

      expect(result.sentences).toHaveLength(2);
      expect(result.sentences[0].markerId).toBe('s-000000');
    });
  });
});
