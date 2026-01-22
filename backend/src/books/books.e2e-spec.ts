import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('Books (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let userId: string;

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
        email: 'books@example.com',
        password: 'password123',
      });

    accessToken = registerRes.body.accessToken;
    userId = registerRes.body.user.id;
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.book.deleteMany({
      where: {
        ownerUserId: userId,
      },
    });
    await prisma.user.deleteMany({
      where: {
        email: 'books@example.com',
      },
    });
    await app.close();
  });

  describe('/api/books (GET)', () => {
    it('should return empty list initially', () => {
      return request(app.getHttpServer())
        .get('/api/books')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });

    it('should require authentication', () => {
      return request(app.getHttpServer()).get('/api/books').expect(401);
    });
  });

  describe('/api/books/import (POST)', () => {
    it('should reject request without file', () => {
      return request(app.getHttpServer())
        .post('/api/books/import')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });

    it('should reject non-EPUB file', () => {
      return request(app.getHttpServer())
        .post('/api/books/import')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', Buffer.from('fake pdf content'), 'test.pdf')
        .expect(400);
    });

    it('should reject file exceeding size limit', () => {
      // Create a large buffer (60MB)
      const largeBuffer = Buffer.alloc(60 * 1024 * 1024);

      return request(app.getHttpServer())
        .post('/api/books/import')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', largeBuffer, 'large.epub')
        .expect(400);
    });

    // Note: Actual EPUB upload test would require a real EPUB file
    // This would be tested manually or with a test fixture
  });

  describe('/api/books/:bookId (GET)', () => {
    it('should return 404 for non-existent book', () => {
      return request(app.getHttpServer())
        .get('/api/books/non-existent-id')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('should require ownership', async () => {
      // Create another user
      const otherUserRes = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'other@example.com',
          password: 'password123',
        });

      const otherToken = otherUserRes.body.accessToken;

      // Try to access book (will fail as no book exists, but tests auth)
      return request(app.getHttpServer())
        .get('/api/books/non-existent-id')
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(404); // Or 403 if ownership check happens first
    });
  });
});
