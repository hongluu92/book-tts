import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChaptersService {
  constructor(private prisma: PrismaService) {}

  async getChapter(userId: string, bookId: string, chapterId: string) {
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

    const chapter = await this.prisma.chapter.findFirst({
      where: {
        id: chapterId,
        bookId: bookId,
      },
      select: {
        id: true,
        bookId: true,
        spineIndex: true,
        title: true,
        href: true,
        xhtmlPath: true,
        createdAt: true,
      },
    });

    if (!chapter) {
      throw new NotFoundException('Chapter not found');
    }

    return {
      ...chapter,
      xhtmlUrl: chapter.xhtmlPath
        ? `/books/${bookId}/chapters/${chapterId}/xhtml`
        : null,
    };
  }

  async getSentences(userId: string, bookId: string, chapterId: string) {
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
        id: chapterId,
        bookId: bookId,
      },
    });

    if (!chapter) {
      throw new NotFoundException('Chapter not found');
    }

    // Get sentences
    const sentences = await this.prisma.sentence.findMany({
      where: {
        chapterId: chapterId,
      },
      select: {
        sentenceIndex: true,
        text: true,
        markerId: true,
      },
      orderBy: {
        sentenceIndex: 'asc',
      },
    });

    console.log(`[ChaptersService] getSentences: chapterId=${chapterId}, count=${sentences.length}`);

    return {
      sentences,
    };
  }
}
