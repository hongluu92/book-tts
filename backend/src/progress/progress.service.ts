import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProgressService {
  constructor(private prisma: PrismaService) {}

  async getProgress(userId: string, bookId: string) {
    // Verify book ownership
    const book = await this.prisma.book.findFirst({
      where: {
        id: bookId,
        ownerUserId: userId,
      },
    });

    if (!book) {
      throw new NotFoundException('Book not found');
    }

    // Get latest progress for this book
    const progress = await this.prisma.progress.findFirst({
      where: {
        bookId: bookId,
        userId: userId,
      },
      orderBy: {
        updatedAt: 'desc',
      },
      include: {
        chapter: {
          select: {
            id: true,
            spineIndex: true,
            title: true,
          },
        },
      },
    });

    return progress || null;
  }

  async saveProgress(
    userId: string,
    bookId: string,
    data: { chapterId: string; sentenceIndex: number; markerId: string; ttsVoice?: string; ttsRate?: number },
  ) {
    // Verify book ownership
    const book = await this.prisma.book.findFirst({
      where: {
        id: bookId,
        ownerUserId: userId,
      },
    });

    if (!book) {
      throw new NotFoundException('Book not found');
    }

    // Verify chapter belongs to book
    const chapter = await this.prisma.chapter.findFirst({
      where: {
        id: data.chapterId,
        bookId: bookId,
      },
    });

    if (!chapter) {
      throw new NotFoundException('Chapter not found');
    }

    // Upsert progress
    const existing = await this.prisma.progress.findFirst({
      where: {
        userId: userId,
        bookId: bookId,
        chapterId: data.chapterId,
      },
    });

    if (existing) {
      return this.prisma.progress.update({
        where: { id: existing.id },
        data: {
          sentenceIndex: data.sentenceIndex,
          markerId: data.markerId,
          ttsVoice: data.ttsVoice,
          ttsRate: data.ttsRate,
          updatedAt: new Date(),
        },
      });
    } else {
      return this.prisma.progress.create({
        data: {
          userId: userId,
          bookId: bookId,
          chapterId: data.chapterId,
          sentenceIndex: data.sentenceIndex,
          markerId: data.markerId,
          ttsVoice: data.ttsVoice,
          ttsRate: data.ttsRate,
        },
      });
    }
  }
}
