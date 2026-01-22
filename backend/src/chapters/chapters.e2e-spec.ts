import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';

describe('Chapters (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let userId: string;
  let bookId: string;
  let chapterId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.setGlobalPrefix('api');

    prisma = moduleFixture.get<PrismaService>(PrismaService);

    await app.init();

    // Register and login
    const registerRes = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: 'chapters@example.com',
        password: 'password123',
      });

    accessToken = registerRes.body.accessToken;
    userId = registerRes.body.user.id;

    // Create a test book and chapter
    const book = await prisma.book.create({
      data: {
        ownerUserId: userId,
        title: 'Test Book',
        author: 'Test Author',
        language: 'vi',
        epubPath: 'test/path.epub',
      },
    });
    bookId = book.id;

    const chapter = await prisma.chapter.create({
      data: {
        bookId: bookId,
        spineIndex: 0,
        title: 'Chapter 1',
        href: 'chapter1.xhtml',
        xhtmlPath: 'test/chapter1.xhtml',
      },
    });
    chapterId = chapter.id;

    // Create test sentences
    await prisma.sentence.createMany({
      data: [
        {
          chapterId: chapterId,
          sentenceIndex: 0,
          text: 'Đây là câu đầu tiên.',
          markerId: 's-000000',
        },
        {
          chapterId: chapterId,
          sentenceIndex: 1,
          text: 'Đây là câu thứ hai.',
          markerId: 's-000001',
        },
        {
          chapterId: chapterId,
          sentenceIndex: 2,
          text: 'Đây là câu thứ ba.',
          markerId: 's-000002',
        },
      ],
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.sentence.deleteMany({
      where: { chapterId: chapterId },
    });
    await prisma.chapter.deleteMany({
      where: { bookId: bookId },
    });
    await prisma.book.deleteMany({
      where: { ownerUserId: userId },
    });
    await prisma.user.deleteMany({
      where: { email: 'chapters@example.com' },
    });
    await app.close();
  });

  describe('/api/books/:bookId/chapters/:chapterId (GET)', () => {
    it('should return chapter metadata', () => {
      return request(app.getHttpServer())
        .get(`/api/books/${bookId}/chapters/${chapterId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res: any) => {
          expect(res.body).toHaveProperty('id', chapterId);
          expect(res.body).toHaveProperty('title', 'Chapter 1');
          expect(res.body).toHaveProperty('xhtmlUrl');
          expect(res.body).toHaveProperty('spineIndex', 0);
        });
    });

    it('should require authentication', () => {
      return request(app.getHttpServer())
        .get(`/api/books/${bookId}/chapters/${chapterId}`)
        .expect(401);
    });

    it('should return 404 for non-existent chapter', () => {
      return request(app.getHttpServer())
        .get(`/api/books/${bookId}/chapters/non-existent-id`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('should enforce ownership', async () => {
      // Create another user
      const otherUserRes = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'other-chapters@example.com',
          password: 'password123',
        });

      const otherToken = otherUserRes.body.accessToken;

      // Try to access chapter (should fail)
      return request(app.getHttpServer())
        .get(`/api/books/${bookId}/chapters/${chapterId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(404); // Book not found for this user
    });
  });

  describe('/api/books/:bookId/chapters/:chapterId/sentences (GET)', () => {
    it('should return sentences for chapter', () => {
      return request(app.getHttpServer())
        .get(`/api/books/${bookId}/chapters/${chapterId}/sentences`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res: any) => {
          expect(res.body).toHaveProperty('sentences');
          expect(Array.isArray(res.body.sentences)).toBe(true);
          expect(res.body.sentences.length).toBe(3);
          expect(res.body.sentences[0]).toHaveProperty('sentenceIndex', 0);
          expect(res.body.sentences[0]).toHaveProperty('text');
          expect(res.body.sentences[0]).toHaveProperty('markerId', 's-000000');
        });
    });

    it('should return sentences ordered by sentenceIndex', () => {
      return request(app.getHttpServer())
        .get(`/api/books/${bookId}/chapters/${chapterId}/sentences`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res: any) => {
          const sentences = res.body.sentences;
          expect(sentences[0].sentenceIndex).toBe(0);
          expect(sentences[1].sentenceIndex).toBe(1);
          expect(sentences[2].sentenceIndex).toBe(2);
        });
    });

    it('should require authentication', () => {
      return request(app.getHttpServer())
        .get(`/api/books/${bookId}/chapters/${chapterId}/sentences`)
        .expect(401);
    });

    it('should return 404 for non-existent chapter', () => {
      return request(app.getHttpServer())
        .get(`/api/books/${bookId}/chapters/non-existent-id/sentences`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('should enforce ownership', async () => {
      // Create another user
      const otherUserRes = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'other-sentences@example.com',
          password: 'password123',
        });

      const otherToken = otherUserRes.body.accessToken;

      // Try to access sentences (should fail)
      return request(app.getHttpServer())
        .get(`/api/books/${bookId}/chapters/${chapterId}/sentences`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(404); // Book not found for this user
    });
  });
});
