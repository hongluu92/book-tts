import { Test, TestingModule } from '@nestjs/testing';
import { SentenceSplitterService } from './sentence-splitter.service';

describe('SentenceSplitterService', () => {
  let service: SentenceSplitterService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SentenceSplitterService],
    }).compile();

    service = module.get<SentenceSplitterService>(SentenceSplitterService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('splitSentences', () => {
    it('should split simple sentences', () => {
      const text = 'Đây là câu đầu tiên. Đây là câu thứ hai.';
      const result = service.splitSentences(text);
      expect(result).toEqual(['Đây là câu đầu tiên.', 'Đây là câu thứ hai.']);
    });

    it('should handle question marks', () => {
      const text = 'Bạn có khỏe không? Tôi khỏe.';
      const result = service.splitSentences(text);
      expect(result).toEqual(['Bạn có khỏe không?', 'Tôi khỏe.']);
    });

    it('should handle exclamation marks', () => {
      const text = 'Tuyệt vời! Tôi rất vui.';
      const result = service.splitSentences(text);
      expect(result).toEqual(['Tuyệt vời!', 'Tôi rất vui.']);
    });

    it('should not split on abbreviations', () => {
      const text = 'TS. Nguyễn Văn A đã nói. Ông ấy là giáo sư.';
      const result = service.splitSentences(text);
      expect(result).toEqual(['TS. Nguyễn Văn A đã nói.', 'Ông ấy là giáo sư.']);
    });

    it('should not split on decimal numbers', () => {
      const text = 'Giá trị là 3.14. Đây là số pi.';
      const result = service.splitSentences(text);
      expect(result).toEqual(['Giá trị là 3.14.', 'Đây là số pi.']);
    });

    it('should handle empty text', () => {
      const result = service.splitSentences('');
      expect(result).toEqual([]);
    });

    it('should handle whitespace-only text', () => {
      const result = service.splitSentences('   \n\t  ');
      expect(result).toEqual([]);
    });

    it('should handle multiple spaces', () => {
      const text = 'Câu  một.   Câu   hai.';
      const result = service.splitSentences(text);
      expect(result).toEqual(['Câu một.', 'Câu hai.']);
    });

    it('should handle ellipsis', () => {
      const text = 'Đang suy nghĩ… Xong rồi.';
      const result = service.splitSentences(text);
      expect(result.length).toBeGreaterThan(0);
    });
  });
});
