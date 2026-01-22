import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ProgressService } from './progress.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ProgressService', () => {
  let service: ProgressService;
  let prisma: PrismaService;

  const mockPrismaService = {
    book: {
      findFirst: jest.fn(),
    },
    chapter: {
      findFirst: jest.fn(),
    },
    progress: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProgressService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<ProgressService>(ProgressService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getProgress', () => {
    it('should return progress if found', async () => {
      const userId = 'user-id';
      const bookId = 'book-id';
      const progress = {
        id: 'progress-id',
        userId: userId,
        bookId: bookId,
        chapterId: 'chapter-id',
        sentenceIndex: 5,
        markerId: 's-000005',
        ttsVoice: 'vi-VN',
        ttsRate: 1.0,
        updatedAt: new Date(),
        chapter: {
          id: 'chapter-id',
          spineIndex: 0,
          title: 'Chapter 1',
        },
      };

      (mockPrismaService.book.findFirst as jest.Mock).mockResolvedValue({
        id: bookId,
        ownerUserId: userId,
      });
      (mockPrismaService.progress.findFirst as jest.Mock).mockResolvedValue(progress);

      const result = await service.getProgress(userId, bookId);

      expect(result).toEqual(progress);
      expect(mockPrismaService.book.findFirst).toHaveBeenCalledWith({
        where: { id: bookId, ownerUserId: userId },
      });
    });

    it('should return null if no progress found', async () => {
      const userId = 'user-id';
      const bookId = 'book-id';

      (mockPrismaService.book.findFirst as jest.Mock).mockResolvedValue({
        id: bookId,
        ownerUserId: userId,
      });
      (mockPrismaService.progress.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.getProgress(userId, bookId);

      expect(result).toBeNull();
    });

    it('should throw NotFoundException if book not found', async () => {
      (mockPrismaService.book.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.getProgress('user-id', 'non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if user does not own book', async () => {
      (mockPrismaService.book.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.getProgress('user-id', 'book-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('saveProgress', () => {
    it('should create new progress if not exists', async () => {
      const userId = 'user-id';
      const bookId = 'book-id';
      const chapterId = 'chapter-id';
      const progressData = {
        chapterId: chapterId,
        sentenceIndex: 10,
        markerId: 's-000010',
        ttsVoice: 'vi-VN',
        ttsRate: 1.2,
      };

      const book = { id: bookId, ownerUserId: userId };
      const chapter = { id: chapterId, bookId: bookId };
      const createdProgress = {
        id: 'progress-id',
        userId: userId,
        bookId: bookId,
        ...progressData,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (mockPrismaService.book.findFirst as jest.Mock).mockResolvedValue(book);
      (mockPrismaService.chapter.findFirst as jest.Mock).mockResolvedValue(chapter);
      (mockPrismaService.progress.findFirst as jest.Mock).mockResolvedValue(null);
      (mockPrismaService.progress.create as jest.Mock).mockResolvedValue(createdProgress);

      const result = await service.saveProgress(userId, bookId, progressData);

      expect(result).toEqual(createdProgress);
      expect(mockPrismaService.progress.create).toHaveBeenCalledWith({
        data: {
          userId: userId,
          bookId: bookId,
          ...progressData,
        },
      });
    });

    it('should update existing progress', async () => {
      const userId = 'user-id';
      const bookId = 'book-id';
      const chapterId = 'chapter-id';
      const progressData = {
        chapterId: chapterId,
        sentenceIndex: 15,
        markerId: 's-000015',
        ttsVoice: 'vi-VN',
        ttsRate: 1.5,
      };

      const book = { id: bookId, ownerUserId: userId };
      const chapter = { id: chapterId, bookId: bookId };
      const existingProgress = {
        id: 'progress-id',
        userId: userId,
        bookId: bookId,
        chapterId: chapterId,
        sentenceIndex: 5,
        markerId: 's-000005',
      };
      const updatedProgress = {
        ...existingProgress,
        ...progressData,
        updatedAt: new Date(),
      };

      (mockPrismaService.book.findFirst as jest.Mock).mockResolvedValue(book);
      (mockPrismaService.chapter.findFirst as jest.Mock).mockResolvedValue(chapter);
      (mockPrismaService.progress.findFirst as jest.Mock).mockResolvedValue(existingProgress);
      (mockPrismaService.progress.update as jest.Mock).mockResolvedValue(updatedProgress);

      const result = await service.saveProgress(userId, bookId, progressData);

      expect(result).toEqual(updatedProgress);
      expect(mockPrismaService.progress.update).toHaveBeenCalledWith({
        where: { id: existingProgress.id },
        data: {
          sentenceIndex: progressData.sentenceIndex,
          markerId: progressData.markerId,
          ttsVoice: progressData.ttsVoice,
          ttsRate: progressData.ttsRate,
          updatedAt: expect.any(Date),
        },
      });
    });

    it('should throw NotFoundException if book not found', async () => {
      (mockPrismaService.book.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.saveProgress('user-id', 'non-existent', {
          chapterId: 'chapter-id',
          sentenceIndex: 0,
          markerId: 's-000000',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if chapter not found', async () => {
      const book = { id: 'book-id', ownerUserId: 'user-id' };
      (mockPrismaService.book.findFirst as jest.Mock).mockResolvedValue(book);
      (mockPrismaService.chapter.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.saveProgress('user-id', 'book-id', {
          chapterId: 'non-existent',
          sentenceIndex: 0,
          markerId: 's-000000',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if chapter does not belong to book', async () => {
      const book = { id: 'book-id', ownerUserId: 'user-id' };
      (mockPrismaService.book.findFirst as jest.Mock).mockResolvedValue(book);
      (mockPrismaService.chapter.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.saveProgress('user-id', 'book-id', {
          chapterId: 'wrong-chapter',
          sentenceIndex: 0,
          markerId: 's-000000',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
