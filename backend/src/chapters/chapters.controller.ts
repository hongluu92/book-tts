import { Controller, Get, Param, UseGuards, Request, Res } from '@nestjs/common';
import { Response } from 'express';
import { ChaptersService } from './chapters.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequireOwnership } from '../common/guards/ownership.decorator';
import * as fs from 'fs/promises';
import * as path from 'path';

@Controller('books/:bookId/chapters')
@UseGuards(JwtAuthGuard)
export class ChaptersController {
  constructor(private chaptersService: ChaptersService) {}

  @Get(':chapterId')
  @RequireOwnership()
  async getChapter(
    @Request() req: any,
    @Param('bookId') bookId: string,
    @Param('chapterId') chapterId: string,
  ) {
    return this.chaptersService.getChapter(req.user.sub, bookId, chapterId);
  }

  @Get(':chapterId/xhtml')
  @RequireOwnership()
  async getChapterXhtml(
    @Request() req: any,
    @Param('bookId') bookId: string,
    @Param('chapterId') chapterId: string,
    @Res() res: Response,
  ) {
    const chapter = await this.chaptersService.getChapter(req.user.sub, bookId, chapterId);

    if (!chapter.xhtmlPath) {
      return res.status(404).json({ message: 'Chapter XHTML not found' });
    }

    const xhtmlPath = path.join(process.env.DATA_DIR || './data', chapter.xhtmlPath);

    try {
      const xhtmlContent = await fs.readFile(xhtmlPath, 'utf-8');
      res.setHeader('Content-Type', 'application/xhtml+xml; charset=utf-8');
      res.send(xhtmlContent);
    } catch (error) {
      res.status(404).json({ message: 'Chapter file not found' });
    }
  }

  @Get(':chapterId/sentences')
  @RequireOwnership()
  async getSentences(
    @Request() req: any,
    @Param('bookId') bookId: string,
    @Param('chapterId') chapterId: string,
  ) {
    return this.chaptersService.getSentences(req.user.sub, bookId, chapterId);
  }
}
