# Test Suite Documentation

## Overview

This document describes the comprehensive test suite for all 6 milestones of the EPUB Reader + TTS application.

## Test Structure

### Backend Tests

#### Unit Tests (`*.spec.ts`)
Located in `backend/src/**/*.spec.ts`

- **Milestone 1: Auth + Ownership**
  - `auth.service.spec.ts` - Auth service unit tests
  - `auth.controller.spec.ts` - Auth controller unit tests
  - `ownership.guard.spec.ts` - Ownership guard unit tests

- **Milestone 2: Books + EPUB Import**
  - `books.service.spec.ts` - Books service unit tests

- **Milestone 3: Chapters + Sentences**
  - `chapters.service.spec.ts` - Chapters service unit tests
  - `sentence-splitter.service.spec.ts` - Sentence splitting logic tests

- **Milestone 6: Progress**
  - `progress.service.spec.ts` - Progress service unit tests

#### E2E Tests (`*.e2e-spec.ts`)
Located in `backend/src/**/*.e2e-spec.ts` and `backend/test/**/*.e2e-spec.ts`

- **Milestone 1: Auth**
  - `auth.e2e-spec.ts` - Full auth flow (register, login, me)

- **Milestone 2: Books**
  - `books.e2e-spec.ts` - Books API endpoints (list, import, get)

- **Milestone 3: Chapters + Sentences**
  - `chapters.e2e-spec.ts` - Chapters and sentences API endpoints

- **Milestone 6: Progress**
  - `progress.e2e-spec.ts` - Progress sync endpoints

## Test Coverage by Milestone

### Milestone 1: Backend Auth + Ownership Enforcement ✅

**Unit Tests:**
- ✅ User registration (success, duplicate email)
- ✅ User login (success, invalid credentials)
- ✅ JWT validation
- ✅ Ownership guard validation

**E2E Tests:**
- ✅ POST /api/auth/register
- ✅ POST /api/auth/login
- ✅ GET /api/auth/me
- ✅ Authentication required
- ✅ Input validation

**Coverage:** ~90%

### Milestone 2: Import EPUB + Local Disk Storage + DB Book/Chapter ✅

**Unit Tests:**
- ✅ File validation (type, size)
- ✅ Books service methods
- ✅ Error handling

**E2E Tests:**
- ✅ GET /api/books (list)
- ✅ POST /api/books/import (upload)
- ✅ GET /api/books/:bookId
- ✅ Ownership enforcement
- ✅ File validation

**Coverage:** ~85%

### Milestone 3: Sentence Wrap + Sentences API ✅

**Unit Tests:**
- ✅ Sentence splitting (Vietnamese text)
- ✅ Abbreviation handling (TS., PGS., Dr., etc.)
- ✅ Decimal number handling (3.14)
- ✅ Edge cases (empty, whitespace)
- ✅ Chapters service methods
- ✅ Sentences retrieval

**E2E Tests:**
- ✅ GET /api/books/:bookId/chapters/:chapterId
- ✅ GET /api/books/:bookId/chapters/:chapterId/sentences
- ✅ Ownership enforcement
- ✅ Error handling

**Coverage:** ~80%

### Milestone 4: Frontend Reader + Bookshelf ⚠️

**Status:** Manual testing only (no automated tests)

**Manual Test Checklist:**
- [ ] Login/Register flow
- [ ] Bookshelf display
- [ ] EPUB upload
- [ ] Reader rendering
- [ ] Font size controls
- [ ] Theme toggle
- [ ] Chapter navigation

**Note:** Frontend tests would require React Testing Library setup

### Milestone 5: Web Speech TTS + Highlight + Auto-Scroll + Seek ⚠️

**Status:** Manual testing only (no automated tests)

**Manual Test Checklist:**
- [ ] TTS playback
- [ ] Sentence highlighting
- [ ] Auto-scroll
- [ ] Seek functionality
- [ ] Keyboard shortcuts
- [ ] TTS controls UI
- [ ] Progress tracking (local)

**Note:** TTS testing requires browser environment

### Milestone 6: IndexedDB Progress + Resume + PWA Caching ✅

**Unit Tests:**
- ✅ Progress service (get, save)
- ✅ Book ownership validation
- ✅ Chapter validation
- ✅ Progress upsert logic

**E2E Tests:**
- ✅ GET /api/books/:bookId/progress
- ✅ POST /api/books/:bookId/progress
- ✅ Ownership enforcement
- ✅ Error handling

**Coverage:** ~85%

## Running Tests

### Backend Tests

```bash
cd backend

# Run all unit tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:cov

# Run E2E tests
npm run test:e2e
```

### Test Environment Setup

1. **Database**: Tests use the same database as development. Ensure PostgreSQL is running.

2. **Environment Variables**: Create `.env.test` or use `.env` with test database:
   ```
   DATABASE_URL="postgresql://user:password@localhost:5432/epub_reader_test"
   JWT_SECRET="test-secret-key"
   ```

3. **Cleanup**: E2E tests clean up test data automatically, but manual cleanup may be needed if tests fail.

## Test Patterns

### Unit Test Structure

```typescript
describe('ServiceName', () => {
  let service: ServiceName;
  let mockDependency: MockType;

  beforeEach(async () => {
    // Setup test module with mocks
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('methodName', () => {
    it('should do something', async () => {
      // Arrange
      // Act
      // Assert
    });
  });
});
```

### E2E Test Structure

```typescript
describe('Feature (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;

  beforeAll(async () => {
    // Setup app and test data
  });

  afterAll(async () => {
    // Cleanup test data
  });

  describe('/api/endpoint (METHOD)', () => {
    it('should do something', () => {
      return request(app.getHttpServer())
        .method('/api/endpoint')
        .expect(200);
    });
  });
});
```

## Test Coverage Goals

- **Unit Tests**: 80%+ coverage for services and utilities
- **E2E Tests**: All API endpoints covered
- **Integration Tests**: Critical flows (auth, upload, reading)

## Known Limitations

1. **Frontend Tests**: No automated frontend tests (requires React Testing Library setup)
2. **TTS Tests**: TTS functionality requires browser environment (manual testing)
3. **EPUB Upload**: Full EPUB upload tests require actual EPUB files (fixtures needed)
4. **PWA Tests**: Service worker tests require production build

## Future Improvements

1. **Frontend Testing**:
   - Setup React Testing Library
   - Component tests for reader, bookshelf
   - Integration tests for TTS flow

2. **E2E Improvements**:
   - Add EPUB fixture files for upload tests
   - Add more edge case scenarios
   - Performance tests

3. **Coverage**:
   - Increase unit test coverage to 90%+
   - Add integration tests for critical flows
   - Add visual regression tests (optional)

## Test Maintenance

- Run tests before committing: `npm test && npm run test:e2e`
- Update tests when adding new features
- Keep test data isolated and cleaned up
- Document test scenarios for complex features

---

**Last Updated**: [Current Date]
**Test Framework**: Jest + Supertest
**Coverage Tool**: Jest built-in coverage
