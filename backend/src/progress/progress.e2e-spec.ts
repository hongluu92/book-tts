import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';

describe('Progress (e2e)', () => {
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
        email: 'progress@example.com',
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
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.progress.deleteMany({
      where: { userId: userId },
    });
    await prisma.chapter.deleteMany({
      where: { bookId: bookId },
    });
    await prisma.book.deleteMany({
      where: { ownerUserId: userId },
    });
    await prisma.user.deleteMany({
      where: { email: 'progress@example.com' },
    });
    await app.close();
  });

  describe('/api/books/:bookId/progress (GET)', () => {
    it('should return null if no progress exists', () => {
      return request(app.getHttpServer())
        .get(`/api/books/${bookId}/progress`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res: any) => {
          expect(res.body).toBeNull();
        });
    });

    it('should return progress if exists', async () => {
      // Create progress first
      await prisma.progress.create({
        data: {
          userId: userId,
          bookId: bookId,
          chapterId: chapterId,
          sentenceIndex: 5,
          markerId: 's-000005',
          ttsVoice: 'vi-VN',
          ttsRate: 1.2,
        },
      });

      return request(app.getHttpServer())
        .get(`/api/books/${bookId}/progress`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res: any) => {
          expect(res.body).toHaveProperty('sentenceIndex', 5);
          expect(res.body).toHaveProperty('markerId', 's-000005');
          expect(res.body).toHaveProperty('ttsVoice', 'vi-VN');
          expect(res.body).toHaveProperty('ttsRate', 1.2);
          expect(res.body).toHaveProperty('chapter');
        });
    });

    it('should require authentication', () => {
      return request(app.getHttpServer())
        .get(`/api/books/${bookId}/progress`)
        .expect(401);
    });

    it('should return 404 for non-existent book', () => {
      return request(app.getHttpServer())
        .get('/api/books/non-existent-id/progress')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('should enforce ownership', async () => {
      // Create another user
      const otherUserRes = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'other-progress@example.com',
          password: 'password123',
        });

      const otherToken = otherUserRes.body.accessToken;

      // Try to access progress (should fail)
      return request(app.getHttpServer())
        .get(`/api/books/${bookId}/progress`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(404); // Book not found for this user
    });
  });

  describe('/api/books/:bookId/progress (POST)', () => {
    it('should create new progress', () => {
      return request(app.getHttpServer())
        .post(`/api/books/${bookId}/progress`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          chapterId: chapterId,
          sentenceIndex: 10,
          markerId: 's-000010',
          ttsVoice: 'vi-VN',
          ttsRate: 1.0,
        })
        .expect(201)
        .expect((res: any) => {
          expect(res.body).toHaveProperty('sentenceIndex', 10);
          expect(res.body).toHaveProperty('markerId', 's-000010');
          expect(res.body).toHaveProperty('ttsVoice', 'vi-VN');
          expect(res.body).toHaveProperty('ttsRate', 1.0);
        });
    });

    it('should update existing progress', async () => {
      // Create initial progress
      await prisma.progress.create({
        data: {
          userId: userId,
          bookId: bookId,
          chapterId: chapterId,
          sentenceIndex: 5,
          markerId: 's-000005',
        },
      });

      return request(app.getHttpServer())
        .post(`/api/books/${bookId}/progress`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          chapterId: chapterId,
          sentenceIndex: 15,
          markerId: 's-000015',
          ttsVoice: 'en-US',
          ttsRate: 1.5,
        })
        .expect(201)
        .expect((res: any) => {
          expect(res.body).toHaveProperty('sentenceIndex', 15);
          expect(res.body).toHaveProperty('markerId', 's-000015');
          expect(res.body).toHaveProperty('ttsVoice', 'en-US');
          expect(res.body).toHaveProperty('ttsRate', 1.5);
        });
    });

    it('should require authentication', () => {
      return request(app.getHttpServer())
        .post(`/api/books/${bookId}/progress`)
        .send({
          chapterId: chapterId,
          sentenceIndex: 0,
          markerId: 's-000000',
        })
        .expect(401);
    });

    it('should validate required fields', () => {
      return request(app.getHttpServer())
        .post(`/api/books/${bookId}/progress`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          sentenceIndex: 0,
          // Missing chapterId and markerId
        })
        .expect(400);
    });

    it('should return 404 for non-existent book', () => {
      return request(app.getHttpServer())
        .post('/api/books/non-existent-id/progress')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          chapterId: chapterId,
          sentenceIndex: 0,
          markerId: 's-000000',
        })
        .expect(404);
    });

    it('should return 404 for non-existent chapter', () => {
      return request(app.getHttpServer())
        .post(`/api/books/${bookId}/progress`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          chapterId: 'non-existent-chapter',
          sentenceIndex: 0,
          markerId: 's-000000',
        })
        .expect(404);
    });

    it('should enforce ownership', async () => {
      // Create another user
      const otherUserRes = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'other-progress-save@example.com',
          password: 'password123',
        });

      const otherToken = otherUserRes.body.accessToken;

      // Try to save progress (should fail)
      return request(app.getHttpServer())
        .post(`/api/books/${bookId}/progress`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({
          chapterId: chapterId,
          sentenceIndex: 0,
          markerId: 's-000000',
        })
        .expect(404); // Book not found for this user
    });
  });
});
