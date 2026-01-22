import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BooksService } from './books.service';
import { PrismaService } from '../prisma/prisma.service';
import { EpubParserService } from '../ingest/epub-parser.service';
import { ChapterProcessorService } from '../ingest/services/chapter-processor.service';

describe('BooksService', () => {
  let service: BooksService;
  let prisma: PrismaService;
  let epubParser: EpubParserService;

  const mockPrismaService = {
    book: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
  };

  const mockEpubParserService = {
    parseEpub: jest.fn(),
  };

  const mockChapterProcessorService = {
    processChapter: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BooksService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: EpubParserService,
          useValue: mockEpubParserService,
        },
        {
          provide: ChapterProcessorService,
          useValue: mockChapterProcessorService,
        },
      ],
    }).compile();

    service = module.get<BooksService>(BooksService);
    prisma = module.get<PrismaService>(PrismaService);
    epubParser = module.get<EpubParserService>(EpubParserService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateFile', () => {
    it('should throw BadRequestException if no file', () => {
      expect(() => {
        (service as any).validateFile(null);
      }).toThrow(BadRequestException);
    });

    it('should throw BadRequestException if file is not EPUB', () => {
      const file = {
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
        size: 1000,
      } as Express.Multer.File;

      expect(() => {
        (service as any).validateFile(file);
      }).toThrow(BadRequestException);
    });

    it('should throw BadRequestException if file exceeds size limit', () => {
      const file = {
        originalname: 'test.epub',
        mimetype: 'application/epub+zip',
        size: 60 * 1024 * 1024, // 60MB
      } as Express.Multer.File;

      expect(() => {
        (service as any).validateFile(file);
      }).toThrow(BadRequestException);
    });
  });

  describe('getBooks', () => {
    it('should return books for user', async () => {
      const userId = 'user-id';
      const books = [
        {
          id: 'book-1',
          title: 'Test Book',
          author: 'Test Author',
          coverPath: 'cover.jpg',
          createdAt: new Date(),
          _count: { chapters: 5 },
        },
      ];

      (mockPrismaService.book.findMany as jest.Mock).mockResolvedValue(books);

      const result = await service.getBooks(userId);

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('coverUrl');
      expect(mockPrismaService.book.findMany).toHaveBeenCalledWith({
        where: { ownerUserId: userId },
        select: expect.any(Object),
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('getBook', () => {
    it('should return book with chapters', async () => {
      const userId = 'user-id';
      const bookId = 'book-id';
      const book = {
        id: bookId,
        title: 'Test Book',
        chapters: [],
      };

      (mockPrismaService.book.findFirst as jest.Mock).mockResolvedValue(book);

      const result = await service.getBook(userId, bookId);

      expect(result).toEqual(expect.objectContaining({ id: bookId }));
    });

    it('should throw NotFoundException if book not found', async () => {
      (mockPrismaService.book.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.getBook('user-id', 'non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
