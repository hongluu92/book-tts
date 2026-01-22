import { Test, TestingModule } from '@nestjs/testing';
import { ChapterSplitterService } from './chapter-splitter.service';
import * as path from 'path';
import * as fs from 'fs/promises';

describe('ChapterSplitterService', () => {
  let service: ChapterSplitterService;
  const testEpubPath = path.join(__dirname, '../../../../thamkhongbingan.epub');

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ChapterSplitterService],
    }).compile();

    service = module.get<ChapterSplitterService>(ChapterSplitterService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('detectMultipleChapters', () => {
    it('should detect multiple chapters in a file with multiple h1 headings', async () => {
      // Create a test HTML file with multiple chapters
      const testHtml = `
        <html>
          <body>
            <h1>Chương 1: Mở đầu</h1>
            <p>Nội dung chương 1</p>
            <h1>Chương 2: Tiếp theo</h1>
            <p>Nội dung chương 2</p>
            <h1>Chương 3: Kết thúc</h1>
            <p>Nội dung chương 3</p>
          </body>
        </html>
      `;

      const testFilePath = path.join(__dirname, 'test-multiple.html');
      await fs.writeFile(testFilePath, testHtml, 'utf-8');

      try {
        const result = await service.detectMultipleChapters(testFilePath);
        expect(result).toBe(true);
      } finally {
        await fs.unlink(testFilePath).catch(() => {});
      }
    });

    it('should return false for a file with single chapter', async () => {
      const testHtml = `
        <html>
          <body>
            <h1>Chương 1: Mở đầu</h1>
            <p>Nội dung chương 1</p>
          </body>
        </html>
      `;

      const testFilePath = path.join(__dirname, 'test-single.html');
      await fs.writeFile(testFilePath, testHtml, 'utf-8');

      try {
        const result = await service.detectMultipleChapters(testFilePath);
        expect(result).toBe(false);
      } finally {
        await fs.unlink(testFilePath).catch(() => {});
      }
    });
  });

  describe('splitIntoChapters', () => {
    it('should split a file with multiple chapters correctly', async () => {
      const testHtml = `
        <html>
          <body>
            <h1 id="toc_1">Chương 1: Mở đầu</h1>
            <p>Nội dung chương 1</p>
            <h1 id="toc_2">Chương 2: Tiếp theo</h1>
            <p>Nội dung chương 2</p>
            <h1 id="toc_3">Chương 3: Kết thúc</h1>
            <p>Nội dung chương 3</p>
          </body>
        </html>
      `;

      const testFilePath = path.join(__dirname, 'test-split.html');
      await fs.writeFile(testFilePath, testHtml, 'utf-8');

      try {
        const result = await service.splitIntoChapters(testFilePath, 0);
        
        expect(result).toHaveLength(3);
        expect(result[0].spineIndex).toBe(0);
        expect(result[0].title).toContain('Chương 1');
        expect(result[1].spineIndex).toBe(1);
        expect(result[1].title).toContain('Chương 2');
        expect(result[2].spineIndex).toBe(2);
        expect(result[2].title).toContain('Chương 3');
      } finally {
        await fs.unlink(testFilePath).catch(() => {});
      }
    });

    it('should handle file with no chapters (single content)', async () => {
      const testHtml = `
        <html>
          <body>
            <p>Nội dung không có chapter</p>
          </body>
        </html>
      `;

      const testFilePath = path.join(__dirname, 'test-no-chapters.html');
      await fs.writeFile(testFilePath, testHtml, 'utf-8');

      try {
        const result = await service.splitIntoChapters(testFilePath, 0);
        
        expect(result).toHaveLength(1);
        expect(result[0].spineIndex).toBe(0);
      } finally {
        await fs.unlink(testFilePath).catch(() => {});
      }
    });
  });

  describe('Integration test with thamkhongbingan.epub', () => {
    it('should extract and split chapters from thamkhongbingan.epub', async () => {
      // Check if test file exists in multiple possible locations
      let epubPath = testEpubPath;
      const possiblePaths = [
        testEpubPath,
        path.join(__dirname, '../../../../thamkhongbingan.epub'),
        path.join(process.cwd(), 'thamkhongbingan.epub'),
        path.join(process.cwd(), '../thamkhongbingan.epub'),
      ];

      let found = false;
      for (const possiblePath of possiblePaths) {
        try {
          await fs.access(possiblePath);
          epubPath = possiblePath;
          found = true;
          console.log(`Found test file at: ${epubPath}`);
          break;
        } catch {
          // Continue searching
        }
      }

      if (!found) {
        console.warn(`Test file not found in any of these locations:`);
        possiblePaths.forEach(p => console.warn(`  - ${p}`));
        console.warn('Skipping integration test. Please place thamkhongbingan.epub in project root.');
        return;
      }

      // Extract EPUB first
      const { EpubParserService } = await import('../epub-parser.service');
      const epubParser = new EpubParserService();
      
      const extractDir = path.join(__dirname, '../../../../test-extract');
      await fs.mkdir(extractDir, { recursive: true });

      try {
        const parsed = await epubParser.parseEpub(epubPath, extractDir);
        console.log(`Parsed EPUB: ${parsed.chapters.length} spine items`);

        // Test each file for multiple chapters
        let totalChaptersFound = 0;
        let filesWithMultipleChapters = 0;

        for (const chapter of parsed.chapters) {
          const chapterPath = path.join(extractDir, chapter.href);
          
          try {
            await fs.access(chapterPath);
            
            const hasMultiple = await service.detectMultipleChapters(chapterPath);
            
            if (hasMultiple) {
              filesWithMultipleChapters++;
              const splitChapters = await service.splitIntoChapters(chapterPath, totalChaptersFound);
              console.log(`File ${chapter.href}: ${splitChapters.length} chapters`);
              totalChaptersFound += splitChapters.length;
            } else {
              totalChaptersFound++;
            }
          } catch (error) {
            console.warn(`File not found: ${chapterPath}`);
          }
        }

        console.log(`\n=== Test Results ===`);
        console.log(`Spine items: ${parsed.chapters.length}`);
        console.log(`Files with multiple chapters: ${filesWithMultipleChapters}`);
        console.log(`Total chapters after split: ${totalChaptersFound}`);
        console.log(`Expected chapters: 910`);

        // The book should have around 910 chapters
        expect(totalChaptersFound).toBeGreaterThan(parsed.chapters.length);
        expect(totalChaptersFound).toBeGreaterThan(500); // At least half of expected
        expect(totalChaptersFound).toBeLessThanOrEqual(1000); // But not too many
        
        // Log detailed info for debugging
        if (totalChaptersFound < 800) {
          console.warn(`WARNING: Found only ${totalChaptersFound} chapters, expected ~910`);
        }
      } finally {
        // Cleanup
        await fs.rm(extractDir, { recursive: true, force: true }).catch(() => {});
      }
    }, 60000); // 60 second timeout for integration test
  });
});
