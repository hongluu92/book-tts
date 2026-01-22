import {
  Controller,
  Post,
  Get,
  Delete,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Param,
  Request,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { BooksService } from './books.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequireOwnership } from '../common/guards/ownership.decorator';
import * as path from 'path';
import * as fs from 'fs/promises';

@Controller('books')
@UseGuards(JwtAuthGuard)
export class BooksController {
  constructor(private booksService: BooksService) {}

  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  async importBook(@Request() req: any, @UploadedFile() file: Express.Multer.File) {
    return this.booksService.importBook(req.user.sub, file);
  }

  @Get()
  async getBooks(@Request() req: any) {
    return this.booksService.getBooks(req.user.sub);
  }

  // Specific routes must come before parameterized routes
  @Post(':bookId/reprocess')
  @RequireOwnership()
  async reprocessBook(@Request() req: any, @Param('bookId') bookId: string) {
    return this.booksService.reprocessBook(req.user.sub, bookId);
  }

  @Get(':bookId/cover')
  @RequireOwnership()
  async getCover(@Request() req: any, @Param('bookId') bookId: string, @Res() res: Response) {
    const book = await this.booksService.getBook(req.user.sub, bookId);

    const bookDir = path.join(process.env.DATA_DIR || './data', 'epubs', bookId);
    let coverPath: string | null = null;

    // First, try to use coverPath from database if available
    if (book.coverPath) {
      coverPath = path.join(process.env.DATA_DIR || './data', book.coverPath);
      try {
        await fs.access(coverPath);
      } catch {
        // coverPath in DB doesn't exist, try book directory
        coverPath = null;
      }
    }

    // If no coverPath or it doesn't exist, try common locations in book directory
    if (!coverPath) {
      const possiblePaths = [
        path.join(bookDir, 'cover.jpg'),
        path.join(bookDir, 'cover.jpeg'),
        path.join(bookDir, 'cover.png'),
      ];

      for (const possiblePath of possiblePaths) {
        try {
          await fs.access(possiblePath);
          coverPath = possiblePath;
          break;
        } catch {
          // Continue to next
        }
      }
    }

    if (!coverPath) {
      return res.status(404).json({ message: 'Cover not found' });
    }

    try {
      const coverBuffer = await fs.readFile(coverPath);
      const ext = path.extname(coverPath).toLowerCase();

      const contentType =
        ext === '.jpg' || ext === '.jpeg'
          ? 'image/jpeg'
          : ext === '.png'
            ? 'image/png'
            : 'image/*';

      res.setHeader('Content-Type', contentType);
      res.send(coverBuffer);
    } catch (error: any) {
      console.error(`[BooksController] Error reading cover file: ${coverPath}`, error);
      res.status(404).json({ message: 'Cover file not found' });
    }
  }

  @Get(':bookId')
  @RequireOwnership()
  async getBook(@Request() req: any, @Param('bookId') bookId: string) {
    return this.booksService.getBook(req.user.sub, bookId);
  }

  @Delete(':bookId')
  @RequireOwnership()
  async deleteBook(@Request() req: any, @Param('bookId') bookId: string) {
    await this.booksService.deleteBook(req.user.sub, bookId);
    return { message: 'Book deleted successfully' };
  }
}
