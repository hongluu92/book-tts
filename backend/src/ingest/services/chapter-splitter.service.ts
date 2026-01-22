import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import * as fs from 'fs/promises';
import * as path from 'path';

type CheerioElement = any; // cheerio.Element type is not exported in this version

export interface SplitChapter {
  spineIndex: number;
  title: string;
  content: string;
  startHeading: string;
}

@Injectable()
export class ChapterSplitterService {
  /**
   * Detect if a file contains multiple chapters based on headings
   */
  async detectMultipleChapters(filePath: string): Promise<boolean> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const $ = cheerio.load(content, { xmlMode: true });

      // Count headings that look like chapter titles
      const headings = this.findChapterHeadings($);
      const hasMultiple = headings.length > 1;
      
      if (hasMultiple) {
        console.log(`[ChapterSplitter] Detected ${headings.length} chapter headings in ${filePath}`);
        headings.each((_, heading) => {
          console.log(`[ChapterSplitter]   - ${$(heading).text().trim()}`);
        });
      }
      
      return hasMultiple;
    } catch (error) {
      console.error(`[ChapterSplitter] Error detecting chapters in ${filePath}:`, error);
      return false;
    }
  }

  /**
   * Split a file into multiple chapters based on headings
   */
  async splitIntoChapters(
    filePath: string,
    baseSpineIndex: number,
  ): Promise<SplitChapter[]> {
    const content = await fs.readFile(filePath, 'utf-8');
    const $ = cheerio.load(content, { xmlMode: true });

    const headings = this.findChapterHeadings($);
    const chapters: SplitChapter[] = [];

    if (headings.length === 0) {
      // No headings found, treat entire file as one chapter
      const bodyContent = $('body').html() || $.html();
      chapters.push({
        spineIndex: baseSpineIndex,
        title: this.extractTitleFromFile($) || `Chapter ${baseSpineIndex + 1}`,
        content: bodyContent,
        startHeading: '',
      });
      return chapters;
    }

    // Create a map of heading elements for quick lookup
    const headingElements = new Set(headings.toArray());

    // Split by headings - traverse body children in order
    const body = $('body').length > 0 ? $('body') : $.root();
    let bodyChildren: CheerioElement[];
    if (body.length > 0) {
      bodyChildren = (body as any).children().toArray();
    } else {
      bodyChildren = ($.root() as any).children().toArray();
    }

    let currentChapterIndex = 0;
    let currentChapterElements: CheerioElement[] = [];
    let currentHeading: cheerio.Cheerio<CheerioElement> | null = null;

    for (let i = 0; i < bodyChildren.length; i++) {
      const element = bodyChildren[i];
      const $element = $(element);

      // Check if this element is a chapter heading
      let isHeading = false;
      let headingElement: CheerioElement | null = null;

      // Check if element itself is a heading
      if (headingElements.has(element)) {
        isHeading = true;
        headingElement = element;
      } else {
        // Check if any direct child is a heading
        $element.children().each((_, child) => {
          if (headingElements.has(child)) {
            isHeading = true;
            headingElement = child;
            return false; // Break loop
          }
        });
      }

      if (isHeading && headingElement) {
        // Save previous chapter if exists
        if (currentChapterElements.length > 0 && currentHeading) {
          const chapterContent = this.buildChapterContent($, currentChapterElements, body);
          chapters.push({
            spineIndex: baseSpineIndex + currentChapterIndex,
            title: this.extractTitleFromHeading(currentHeading),
            content: chapterContent,
            startHeading: currentHeading.text().trim(),
          });
          currentChapterIndex++;
        }

        // Start new chapter with the heading element
        currentHeading = $(headingElement);
        // Always include the element containing the heading
        currentChapterElements = [element];
      } else {
        // Add to current chapter
        currentChapterElements.push(element);
      }
    }

    // Add last chapter
    if (currentChapterElements.length > 0) {
      const heading = currentHeading || this.findFirstHeading($);
      const chapterContent = this.buildChapterContent($, currentChapterElements, body);
      chapters.push({
        spineIndex: baseSpineIndex + currentChapterIndex,
        title: heading ? this.extractTitleFromHeading(heading) : this.extractTitleFromFile($) || `Chapter ${baseSpineIndex + currentChapterIndex + 1}`,
        content: chapterContent,
        startHeading: heading ? heading.text().trim() : '',
      });
    }

    return chapters;
  }

  /**
   * Find all headings that look like chapter titles in document order
   */
  private findChapterHeadings($: cheerio.CheerioAPI): cheerio.Cheerio<CheerioElement> {
    const headings: CheerioElement[] = [];
    const body = $('body').length > 0 ? $('body') : $.root();

    // Traverse all elements in order to find headings
    const traverse = (element: CheerioElement) => {
      const $element = $(element);
      const tagName = element.tagName?.toLowerCase();

      // Check if it's a heading tag with chapter-like text
      if (tagName && ['h1', 'h2', 'h3'].includes(tagName)) {
        const text = $element.text().trim().toLowerCase();
        if (this.looksLikeChapterTitle(text)) {
          headings.push(element);
          return; // Don't traverse children of headings
        }
      }

      // Check if it's a paragraph or div with bold text that looks like chapter title
      if (tagName === 'p' || tagName === 'div') {
        const $strong = $element.find('> strong, > b').first();
        if ($strong.length > 0) {
          const text = $strong.text().trim().toLowerCase();
          // Check if paragraph/div only contains the bold text (standalone chapter title)
          const allText = $element.text().trim();
          const boldText = $strong.text().trim();
          if (
            this.looksLikeChapterTitle(text) &&
            allText === boldText // Only contains the bold text
          ) {
            headings.push(element);
            return; // Don't traverse children
          }
        }
      }

      // Traverse children
      $element.children().each((_, child) => {
        traverse(child);
      });
    };

    // Start traversal from body
    if (body.length > 0) {
      (body as any).children().each((_: any, element: CheerioElement) => {
        traverse(element);
      });
    } else {
      ($.root() as any).children().each((_: any, element: CheerioElement) => {
        traverse(element);
      });
    }

    return $(headings);
  }

  /**
   * Check if text looks like a chapter title
   */
  private looksLikeChapterTitle(text: string): boolean {
    // Normalize text: remove extra spaces, trim
    const normalized = text.replace(/\s+/g, ' ').trim();
    
    // Patterns for chapter titles
    const patterns = [
      /^chương\s+\d+/i, // "Chương 1", "Chương  2" (multiple spaces)
      /^chapter\s+\d+/i, // "Chapter 1"
      /^phần\s+\d+/i, // "Phần 1"
      /^part\s+\d+/i, // "Part 1"
      /^quyển\s+\d+/i, // "Quyển 1"
      /^book\s+\d+/i, // "Book 1"
      /^hồi\s+\d+/i, // "Hồi 1"
      /^\d+\./, // "1.", "2."
      /^chương\s+\d+\s*:/i, // "Chương 1:", "Chương  2 :"
      /^chapter\s+\d+\s*:/i, // "Chapter 1:"
    ];

    return patterns.some((pattern) => pattern.test(normalized));
  }

  /**
   * Extract title from a heading element
   */
  private extractTitleFromHeading($heading: cheerio.Cheerio<CheerioElement>): string {
    return $heading.text().trim() || 'Untitled Chapter';
  }

  /**
   * Extract title from file (fallback)
   */
  private extractTitleFromFile($: cheerio.CheerioAPI): string | null {
    const title = $('title').first().text();
    if (title) return title.trim();
    
    const h1 = $('h1').first();
    if (h1.length > 0) return h1.text().trim();
    
    return null;
  }

  /**
   * Find first heading in document
   */
  private findFirstHeading($: cheerio.CheerioAPI): cheerio.Cheerio<CheerioElement> | null {
    const h1 = $('h1').first();
    if (h1.length > 0) return h1;
    
    const h2 = $('h2').first();
    if (h2.length > 0) return h2;
    
    return null;
  }

  /**
   * Build chapter content from elements
   */
  private buildChapterContent(
    $: cheerio.CheerioAPI,
    elements: CheerioElement[],
    body: cheerio.Cheerio<CheerioElement>,
  ): string {
    // Get the original HTML structure
    const originalHtml = $.html();
    
    // Create a new document with just the chapter elements
    const $newDoc = cheerio.load('<!DOCTYPE html><html><head></head><body></body></html>', { xmlMode: true });
    
    // Copy head content if exists
    const originalHead = $('head');
    if (originalHead.length > 0) {
      $newDoc('head').append(originalHead.html() || '');
    }
    
    // Get the body tag structure from original
    const bodyTag = body[0]?.tagName || 'body';
    const bodyAttrs = body[0]?.attribs || {};
    
    // Create new body with attributes
    const $newBody = $newDoc('body');
    Object.entries(bodyAttrs).forEach(([key, value]) => {
      if (typeof value === 'string') {
        $newBody.attr(key, value);
      }
    });
    
    // Add chapter elements
    elements.forEach((element) => {
      $newBody.append($(element).clone());
    });

    return $newDoc.html();
  }
}
