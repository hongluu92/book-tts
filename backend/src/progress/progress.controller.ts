import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ProgressService } from './progress.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequireOwnership } from '../common/guards/ownership.decorator';

@Controller('books/:bookId/progress')
@UseGuards(JwtAuthGuard)
export class ProgressController {
  constructor(private progressService: ProgressService) {}

  @Get()
  @RequireOwnership()
  async getProgress(@Request() req: any, @Param('bookId') bookId: string) {
    return this.progressService.getProgress(req.user.sub, bookId);
  }

  @Post()
  @RequireOwnership()
  async saveProgress(
    @Request() req: any,
    @Param('bookId') bookId: string,
    @Body() body: { chapterId: string; sentenceIndex: number; markerId: string; ttsVoice?: string; ttsRate?: number },
  ) {
    return this.progressService.saveProgress(req.user.sub, bookId, body);
  }
}
