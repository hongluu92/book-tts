import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import * as sanitizeHtml from 'sanitize-html';
import * as fs from 'fs/promises';
import * as path from 'path';
import { SentenceSplitterService } from './sentence-splitter.service';

export interface ProcessedChapter {
  xhtmlPath: string;
  sentences: Array<{
    sentenceIndex: number;
    text: string;
    markerId: string;
  }>;
}

@Injectable()
export class ChapterProcessorService {
  constructor(private sentenceSplitter: SentenceSplitterService) {}

  async processChapter(
    chapterXhtmlPath: string,
    outputPath: string,
    chapterId: string,
  ): Promise<ProcessedChapter> {
    // Read chapter XHTML
    const xhtmlContent = await fs.readFile(chapterXhtmlPath, 'utf-8');

    // Sanitize HTML
    const sanitized = this.sanitizeHtml(xhtmlContent);

    // Parse with cheerio
    const $ = cheerio.load(sanitized, {
      xmlMode: true,
    });

    // Process and wrap sentences
    const sentences: Array<{ sentenceIndex: number; text: string; markerId: string }> = [];
    let sentenceIndex = 0;
    let textNodeCount = 0;
    let emptyTextNodes = 0;
    let noSentencesNodes = 0;

    // Check if body exists
    const body = $('body');
    if (body.length === 0) {
      console.warn(`[ChapterProcessor] No body element found in chapter ${chapterId}`);
      // Try to find root element
      const root = $.root().children().first();
      if (root.length === 0) {
        console.error(`[ChapterProcessor] No root element found in chapter ${chapterId}`);
        return {
          xhtmlPath: outputPath,
          sentences: [],
        };
      }
    }

    // Traverse all text nodes in reading order
    this.traverseTextNodes($, $('body').length > 0 ? $('body') : $.root(), (textNode) => {
      textNodeCount++;
      const text = this.normalizeWhitespace(textNode.data || '');

      if (text.trim().length === 0) {
        emptyTextNodes++;
        return;
      }

      // Split into sentences
      const sentenceTexts = this.sentenceSplitter.splitSentences(text);

      if (sentenceTexts.length === 0) {
        noSentencesNodes++;
        console.warn(`[ChapterProcessor] No sentences found in text node: "${text.substring(0, 50)}..."`);
        return;
      }

      // Build HTML for all sentences
      const wrappedSentences: string[] = [];

      sentenceTexts.forEach((sentenceText) => {
        const markerId = this.generateMarkerId(sentenceIndex);
        wrappedSentences.push(
          `<span data-sent="${sentenceIndex}" id="${markerId}">${this.escapeHtml(sentenceText)}</span>`,
        );

        sentences.push({
          sentenceIndex,
          text: sentenceText,
          markerId,
        });

        sentenceIndex++;
      });

      // Replace text node with wrapped sentences
      const replacementHtml = wrappedSentences.join(' ');
      const $parent = $(textNode).parent();
      $(textNode).replaceWith(replacementHtml);
    });

    console.log(`[ChapterProcessor] Processed chapter ${chapterId}: ${textNodeCount} text nodes (${emptyTextNodes} empty, ${noSentencesNodes} no sentences), ${sentences.length} sentences created`);

    // Get processed HTML
    const processedHtml = $.html();

    // Ensure output directory exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    // Save processed XHTML
    await fs.writeFile(outputPath, processedHtml, 'utf-8');

    return {
      xhtmlPath: outputPath,
      sentences,
    };
  }

  private sanitizeHtml(html: string): string {
    return sanitizeHtml(html, {
      allowedTags: [
        'p',
        'div',
        'span',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'br',
        'strong',
        'em',
        'b',
        'i',
        'u',
        'blockquote',
        'ul',
        'ol',
        'li',
        'a',
        'img',
      ],
      allowedAttributes: {
        '*': ['id', 'data-sent', 'class', 'href', 'src', 'alt', 'title'],
      },
      allowedSchemes: ['http', 'https', 'data'],
      disallowedTagsMode: 'discard',
    });
  }

  private normalizeWhitespace(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }

  private traverseTextNodes(
    $: cheerio.CheerioAPI,
    $element: cheerio.Cheerio<any>,
    callback: (textNode: any) => void,
  ): void {
    $element.contents().each((_, node) => {
      if (node.type === 'text') {
        callback(node);
      } else if (node.type === 'tag') {
        const $child = $(node);
        // Skip if already has sentence markers
        if (!$child.attr('data-sent')) {
          this.traverseTextNodes($, $child, callback);
        }
      }
    });
  }

  private generateMarkerId(index: number): string {
    return `s-${index.toString().padStart(6, '0')}`;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
