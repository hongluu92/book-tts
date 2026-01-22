import {
  Injectable,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EpubParserService, ParsedEpub } from '../ingest/epub-parser.service';
import { ChapterProcessorService } from '../ingest/services/chapter-processor.service';
import { ChapterSplitterService } from '../ingest/services/chapter-splitter.service';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as cheerio from 'cheerio';
import { randomUUID } from 'crypto';

@Injectable()
export class BooksService {
  constructor(
    private prisma: PrismaService,
    private epubParser: EpubParserService,
    private chapterProcessor: ChapterProcessorService,
    private chapterSplitter: ChapterSplitterService,
  ) {}

  async importBook(userId: string, file: Express.Multer.File): Promise<{ bookId: string }> {
    // Validate file
    this.validateFile(file);

    const bookId = randomUUID();
    const bookDir = path.join(process.env.DATA_DIR || './data', 'epubs', bookId);
    const originalEpubPath = path.join(bookDir, 'original.epub');
    const extractDir = path.join(bookDir, 'extracted');

    try {
      // Create directory
      await fs.mkdir(bookDir, { recursive: true });
      // Create chapters directory
      const chaptersDir = path.join(bookDir, 'chapters');
      await fs.mkdir(chaptersDir, { recursive: true });

      // Save uploaded file
      await fs.writeFile(originalEpubPath, file.buffer);

      // Extract and parse EPUB
      const parsed: ParsedEpub = await this.epubParser.parseEpub(originalEpubPath, extractDir);

      // Save cover if exists
      let coverPath: string | undefined;
      if (parsed.coverPath && (await fs.access(parsed.coverPath).then(() => true).catch(() => false))) {
        const coverExt = path.extname(parsed.coverPath);
        coverPath = path.join(bookDir, `cover${coverExt}`);
        await fs.copyFile(parsed.coverPath, coverPath);
        coverPath = path.relative(process.env.DATA_DIR || './data', coverPath);
      }

      // Process chapters and create sentences
      const chaptersData = [];
      const allSentences = [];

      console.log(`[BooksService] Processing ${parsed.chapters.length} chapters for book ${bookId}`);

      let currentSpineIndex = 0;
      for (const chapter of parsed.chapters) {
        // Find chapter XHTML file in extracted directory
        // chapter.href is already relative to extractDir after fix in epub-parser
        const chapterXhtmlPath = path.join(extractDir, chapter.href);
        
        // Check if file exists
        try {
          await fs.access(chapterXhtmlPath);
        } catch (error: any) {
          // Log the error for debugging
          console.warn(`[BooksService] Chapter file not found: ${chapterXhtmlPath} (href: ${chapter.href})`);
          // Skip if file doesn't exist
          continue;
        }

        // Check if file contains multiple chapters
        const hasMultipleChapters = await this.chapterSplitter.detectMultipleChapters(chapterXhtmlPath);
        
        if (hasMultipleChapters) {
          console.log(`[BooksService] File ${chapter.href} contains multiple chapters, splitting...`);
          
          // Split into multiple chapters
          const splitChapters = await this.chapterSplitter.splitIntoChapters(
            chapterXhtmlPath,
            currentSpineIndex,
          );

          // Process each split chapter
          for (const splitChapter of splitChapters) {
            // Create temporary file for split chapter content
            const tempFilePath = path.join(bookDir, 'chapters', `temp_${splitChapter.spineIndex}.xhtml`);
            await fs.writeFile(tempFilePath, splitChapter.content, 'utf-8');

            // Process chapter (sanitize, split sentences, wrap)
            const outputPath = path.join(bookDir, 'chapters', `${splitChapter.spineIndex}.xhtml`);
            console.log(`[BooksService] Processing split chapter ${splitChapter.spineIndex}: ${splitChapter.title}`);
            
            const processed = await this.chapterProcessor.processChapter(
              tempFilePath,
              outputPath,
              '', // chapterId will be set after creation
            );

            // Clean up temp file
            await fs.unlink(tempFilePath).catch(() => {});

            // Store chapter data
            chaptersData.push({
              spineIndex: splitChapter.spineIndex,
              title: splitChapter.title,
              href: `${chapter.href}#split_${splitChapter.spineIndex}`,
              xhtmlPath: path.relative(process.env.DATA_DIR || './data', outputPath),
              sentences: processed.sentences,
            });
          }

          currentSpineIndex += splitChapters.length;
        } else {
          // Single chapter file, process normally
          const outputPath = path.join(bookDir, 'chapters', `${currentSpineIndex}.xhtml`);
          console.log(`[BooksService] Processing chapter ${currentSpineIndex}: ${chapterXhtmlPath} -> ${outputPath}`);
          
          const processed = await this.chapterProcessor.processChapter(
            chapterXhtmlPath,
            outputPath,
            '', // chapterId will be set after creation
          );

          // Store chapter data
          chaptersData.push({
            spineIndex: currentSpineIndex,
            title: chapter.title,
            href: chapter.href,
            xhtmlPath: path.relative(process.env.DATA_DIR || './data', outputPath),
            sentences: processed.sentences,
          });

          currentSpineIndex++;
        }
      }

      console.log(`[BooksService] Creating book with ${chaptersData.length} chapters`);

      // Create book with chapters
      const book = await this.prisma.book.create({
        data: {
          id: bookId,
          ownerUserId: userId,
          title: parsed.metadata.title,
          author: parsed.metadata.author,
          language: parsed.metadata.language,
          coverPath: coverPath ? path.relative(process.env.DATA_DIR || './data', coverPath) : null,
          epubPath: path.relative(process.env.DATA_DIR || './data', originalEpubPath),
          chapters: {
            create: chaptersData.map((ch) => ({
              spineIndex: ch.spineIndex,
              title: ch.title,
              href: ch.href,
              xhtmlPath: ch.xhtmlPath,
            })),
          },
        },
        include: {
          chapters: {
            orderBy: {
              spineIndex: 'asc',
            },
          },
        },
      });

      // Create sentences in batch
      for (const chapterData of chaptersData) {
        const dbChapter = book.chapters.find((ch) => ch.spineIndex === chapterData.spineIndex);
        if (dbChapter) {
          console.log(`[BooksService] Processing chapter ${dbChapter.id}: ${chapterData.sentences.length} sentences`);
          if (chapterData.sentences.length > 0) {
            await this.prisma.sentence.createMany({
              data: chapterData.sentences.map((sent) => ({
                chapterId: dbChapter.id,
                sentenceIndex: sent.sentenceIndex,
                text: sent.text,
                markerId: sent.markerId,
              })),
            });
            console.log(`[BooksService] Created ${chapterData.sentences.length} sentences for chapter ${dbChapter.id}`);
          } else {
            console.warn(`[BooksService] No sentences found for chapter ${dbChapter.id} (spineIndex: ${chapterData.spineIndex})`);
          }
        } else {
          console.warn(`[BooksService] Chapter not found in database for spineIndex: ${chapterData.spineIndex}`);
        }
      }

      return { bookId: book.id };
    } catch (error) {
      // Cleanup on error
      try {
        await fs.rm(bookDir, { recursive: true, force: true });
      } catch (cleanupError) {
        // Ignore cleanup errors
      }

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new InternalServerErrorException('Failed to import EPUB: ' + error.message);
    }
  }

  async getBooks(userId: string) {
    const books = await this.prisma.book.findMany({
      where: {
        ownerUserId: userId,
      },
      select: {
        id: true,
        title: true,
        author: true,
        language: true,
        coverPath: true,
        createdAt: true,
        _count: {
          select: {
            chapters: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return books.map((book) => ({
      ...book,
      coverUrl: book.coverPath
        ? `/api/books/${book.id}/cover`
        : null,
    }));
  }

  async getBook(userId: string, bookId: string) {
    const book = await this.prisma.book.findFirst({
      where: {
        id: bookId,
        ownerUserId: userId,
      },
      include: {
        chapters: {
          orderBy: {
            spineIndex: 'asc',
          },
          select: {
            id: true,
            spineIndex: true,
            title: true,
            href: true,
            xhtmlPath: true,
            createdAt: true,
          },
        },
      },
    });

    if (!book) {
      throw new NotFoundException('Book not found');
    }

    return {
      ...book,
      coverUrl: book.coverPath
        ? `/api/books/${book.id}/cover`
        : null,
      chapters: book.chapters.map((chapter) => ({
        ...chapter,
        xhtmlUrl: chapter.xhtmlPath
          ? `/books/${bookId}/chapters/${chapter.id}/xhtml`
          : null,
      })),
    };
  }

  async reprocessBook(userId: string, bookId: string) {
    // Verify book ownership
    const book = await this.prisma.book.findFirst({
      where: {
        id: bookId,
        ownerUserId: userId,
      },
      include: {
        chapters: {
          orderBy: {
            spineIndex: 'asc',
          },
        },
      },
    });

    if (!book) {
      throw new NotFoundException('Book not found');
    }

    const bookDir = path.join(process.env.DATA_DIR || './data', 'epubs', bookId);
    const extractDir = path.join(bookDir, 'extracted');
    const results = {
      bookId,
      chaptersProcessed: 0,
      sentencesCreated: 0,
      chaptersSplit: 0,
      errors: [] as string[],
    };

    // Re-parse EPUB to get fresh chapter list
    const originalEpubPath = path.join(bookDir, 'original.epub');
    let parsed: ParsedEpub;
    try {
      parsed = await this.epubParser.parseEpub(originalEpubPath, extractDir);
      console.log(`[ReprocessBook] Re-parsed EPUB: ${parsed.chapters.length} spine items found`);
    } catch (error: any) {
      throw new InternalServerErrorException('Failed to re-parse EPUB: ' + error.message);
    }

    // Delete all existing chapters and sentences
    console.log(`[ReprocessBook] Deleting ${book.chapters.length} existing chapters...`);
    for (const chapter of book.chapters) {
      await this.prisma.sentence.deleteMany({
        where: { chapterId: chapter.id },
      });
    }
    await this.prisma.chapter.deleteMany({
      where: { bookId: bookId },
    });

    // Re-process chapters with split logic (same as importBook)
    const chaptersData = [];
    let currentSpineIndex = 0;

    // Ensure chapters directory exists
    const chaptersDir = path.join(bookDir, 'chapters');
    await fs.mkdir(chaptersDir, { recursive: true });

    for (const chapter of parsed.chapters) {
      // Find chapter XHTML file in extracted directory
      const chapterXhtmlPath = path.join(extractDir, chapter.href);
      
      // Check if file exists
      try {
        await fs.access(chapterXhtmlPath);
      } catch (error: any) {
        console.warn(`[ReprocessBook] Chapter file not found: ${chapterXhtmlPath} (href: ${chapter.href})`);
        continue;
      }

      // Check if file contains multiple chapters
      const hasMultipleChapters = await this.chapterSplitter.detectMultipleChapters(chapterXhtmlPath);
      
      if (hasMultipleChapters) {
        console.log(`[ReprocessBook] File ${chapter.href} contains multiple chapters, splitting...`);
        
        // Split into multiple chapters
        const splitChapters = await this.chapterSplitter.splitIntoChapters(
          chapterXhtmlPath,
          currentSpineIndex,
        );

        // Process each split chapter
        for (const splitChapter of splitChapters) {
          // Create temporary file for split chapter content
          const tempFilePath = path.join(bookDir, 'chapters', `temp_${splitChapter.spineIndex}.xhtml`);
          await fs.writeFile(tempFilePath, splitChapter.content, 'utf-8');

          // Process chapter (sanitize, split sentences, wrap)
          const outputPath = path.join(bookDir, 'chapters', `${splitChapter.spineIndex}.xhtml`);
          console.log(`[ReprocessBook] Processing split chapter ${splitChapter.spineIndex}: ${splitChapter.title}`);
          
          const processed = await this.chapterProcessor.processChapter(
            tempFilePath,
            outputPath,
            '', // chapterId will be set after creation
          );

          // Clean up temp file
          await fs.unlink(tempFilePath).catch(() => {});

          // Store chapter data
          chaptersData.push({
            spineIndex: splitChapter.spineIndex,
            title: splitChapter.title,
            href: `${chapter.href}#split_${splitChapter.spineIndex}`,
            xhtmlPath: path.relative(process.env.DATA_DIR || './data', outputPath),
            sentences: processed.sentences,
          });
        }

        currentSpineIndex += splitChapters.length;
        results.chaptersSplit += splitChapters.length;
      } else {
        // Single chapter file, process normally
        const outputPath = path.join(bookDir, 'chapters', `${currentSpineIndex}.xhtml`);
        console.log(`[ReprocessBook] Processing chapter ${currentSpineIndex}: ${chapterXhtmlPath} -> ${outputPath}`);
        
        const processed = await this.chapterProcessor.processChapter(
          chapterXhtmlPath,
          outputPath,
          '', // chapterId will be set after creation
        );

        // Store chapter data
        chaptersData.push({
          spineIndex: currentSpineIndex,
          title: chapter.title,
          href: chapter.href,
          xhtmlPath: path.relative(process.env.DATA_DIR || './data', outputPath),
          sentences: processed.sentences,
        });

        currentSpineIndex++;
      }
    }

    console.log(`[ReprocessBook] Creating ${chaptersData.length} chapters...`);

    // Create all chapters
    const createdBook = await this.prisma.book.update({
      where: { id: bookId },
      data: {
        chapters: {
          create: chaptersData.map((ch) => ({
            spineIndex: ch.spineIndex,
            title: ch.title,
            href: ch.href,
            xhtmlPath: ch.xhtmlPath,
          })),
        },
      },
      include: {
        chapters: {
          orderBy: {
            spineIndex: 'asc',
          },
        },
      },
    });

    // Create sentences in batch
    for (const chapterData of chaptersData) {
      const dbChapter = createdBook.chapters.find((ch) => ch.spineIndex === chapterData.spineIndex);
      if (dbChapter) {
        if (chapterData.sentences.length > 0) {
          await this.prisma.sentence.createMany({
            data: chapterData.sentences.map((sent) => ({
              chapterId: dbChapter.id,
              sentenceIndex: sent.sentenceIndex,
              text: sent.text,
              markerId: sent.markerId,
            })),
          });
          results.sentencesCreated += chapterData.sentences.length;
        }
        results.chaptersProcessed++;
      }
    }

    return results;
  }

  async deleteBook(userId: string, bookId: string): Promise<void> {
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

    // Get book directory path
    const bookDir = path.join(process.env.DATA_DIR || './data', 'epubs', bookId);

    try {
      // Delete book from database (cascade will handle chapters, sentences, and progress)
      await this.prisma.book.delete({
        where: {
          id: bookId,
        },
      });

      // Delete physical files directory
      try {
        await fs.rm(bookDir, { recursive: true, force: true });
        console.log(`[BooksService] Deleted book directory: ${bookDir}`);
      } catch (fileError: any) {
        // Log error but don't fail the operation if file deletion fails
        console.error(`[BooksService] Failed to delete book directory ${bookDir}:`, fileError);
        // Continue - database record is already deleted
      }
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to delete book: ' + error.message);
    }
  }

  private validateFile(file: Express.Multer.File): void {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // Check file type
    if (!file.originalname.endsWith('.epub') && file.mimetype !== 'application/epub+zip') {
      throw new BadRequestException('File must be an EPUB file');
    }

    // Check file size (50MB max)
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      throw new BadRequestException('File size exceeds 50MB limit');
    }
  }
}
