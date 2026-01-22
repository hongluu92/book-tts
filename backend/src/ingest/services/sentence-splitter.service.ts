import { Injectable } from '@nestjs/common';

export interface Sentence {
  text: string;
  index: number;
}

@Injectable()
export class SentenceSplitterService {
  // Common Vietnamese abbreviations that end with period
  private readonly abbreviations = new Set([
    'TS.', 'PGS.', 'GS.', 'Dr.', 'Mr.', 'Mrs.', 'Ms.',
    'TP.', 'TT.', 'P.', 'Q.', 'H.', 'X.',
    'v.v.', 'v.v...', 'etc.', 'vs.', 'i.e.', 'e.g.',
    'ThS.', 'CN.', 'KS.', 'BS.', 'LS.',
  ]);

  /**
   * Split text into sentences (Vietnamese rule-based)
   */
  splitSentences(text: string): string[] {
    if (!text || text.trim().length === 0) {
      return [];
    }

    // Normalize whitespace
    let normalized = text.replace(/\s+/g, ' ').trim();

    if (normalized.length === 0) {
      return [];
    }

    // Split by sentence terminators
    const sentences: string[] = [];
    let currentSentence = '';
    let i = 0;

    while (i < normalized.length) {
      const char = normalized[i];
      currentSentence += char;

      // Check for sentence terminators
      if (this.isSentenceTerminator(char)) {
        // Check if it's an abbreviation
        const beforeTerminator = this.getTextBeforeIndex(normalized, i);
        
        if (!this.isAbbreviation(beforeTerminator)) {
          // Check if it's a decimal number
          if (!this.isDecimalNumber(normalized, i)) {
            // This is a sentence end
            const sentence = currentSentence.trim();
            if (sentence.length > 0) {
              sentences.push(sentence);
            }
            currentSentence = '';
            
            // Skip whitespace after terminator
            while (i + 1 < normalized.length && /\s/.test(normalized[i + 1])) {
              i++;
            }
          }
        }
      }

      i++;
    }

    // Add remaining text as last sentence
    if (currentSentence.trim().length > 0) {
      sentences.push(currentSentence.trim());
    }

    // Filter out empty sentences
    return sentences.filter((s) => s.length > 0);
  }

  private isSentenceTerminator(char: string): boolean {
    return char === '.' || char === '!' || char === '?' || char === '…';
  }

  private getTextBeforeIndex(text: string, index: number): string {
    // Get text before the terminator (up to 10 chars)
    const start = Math.max(0, index - 10);
    return text.substring(start, index + 1).trim();
  }

  private isAbbreviation(textBefore: string): boolean {
    // Check if the text ends with a known abbreviation
    for (const abbrev of this.abbreviations) {
      if (textBefore.endsWith(abbrev)) {
        return true;
      }
    }
    return false;
  }

  private isDecimalNumber(text: string, index: number): boolean {
    // Check if there's a digit before and after the period
    if (index === 0 || index >= text.length - 1) {
      return false;
    }

    const before = text[index - 1];
    const after = text[index + 1];

    return /\d/.test(before) && /\d/.test(after);
  }
}
