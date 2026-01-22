import { Module } from '@nestjs/common';
import { BooksController } from './books.controller';
import { BooksService } from './books.service';
import { EpubParserService } from '../ingest/epub-parser.service';
import { ChapterProcessorService } from '../ingest/services/chapter-processor.service';
import { SentenceSplitterService } from '../ingest/services/sentence-splitter.service';
import { ChapterSplitterService } from '../ingest/services/chapter-splitter.service';

@Module({
  controllers: [BooksController],
  providers: [
    BooksService,
    EpubParserService,
    ChapterProcessorService,
    SentenceSplitterService,
    ChapterSplitterService,
  ],
  exports: [BooksService],
})
export class BooksModule {}
