# Implementation Plan — EPUB Reader + Sentence-level TTS (MVP)

> Plan triển khai dựa trên SPEC.md, ARCHITECTURE.md và UI_UX_RECOMMENDATIONS.md

---

## Overview

**Goal**: Xây dựng web app đọc EPUB với TTS theo câu, local-first, PWA.

**Timeline**: 6 milestones, ước tính 8-12 tuần (tùy team size)

**Tech Stack**:
- Frontend: Next.js + TypeScript + epub.js + Dexie
- Backend: NestJS + TypeScript + PostgreSQL + Prisma
- Storage: Local disk (MVP)

---

## Milestones

### Milestone 1: Backend Auth + Ownership Enforcement
**Goal**: Setup backend foundation, auth system, ownership validation

**Duration**: 1-2 tuần

#### Tasks

**1.1 Project Setup**
- [ ] Initialize NestJS project với TypeScript
- [ ] Setup Prisma với PostgreSQL
- [ ] Configure environment variables (.env)
- [ ] Setup folder structure theo ARCHITECTURE.md
- [ ] Setup linting (ESLint + Prettier)
- [ ] Setup basic logging (Pino)

**1.2 Database Schema**
- [ ] Create Prisma schema: `users`, `books`, `chapters`, `sentences`
- [ ] Add indexes: `books(ownerUserId)`, `chapters(bookId, spineIndex)`, `sentences(chapterId, sentenceIndex)`
- [ ] Run migrations
- [ ] Seed test data (optional)

**1.3 Auth Module**
- [ ] Install dependencies: `@nestjs/jwt`, `argon2` (hoặc bcrypt)
- [ ] Create `AuthModule` với:
  - `POST /api/auth/register` (validate email/password, hash password)
  - `POST /api/auth/login` (verify password, return JWT)
  - `GET /api/auth/me` (verify JWT, return user)
- [ ] JWT strategy + guard
- [ ] Password validation (min length, strength)
- [ ] Error handling (duplicate email, invalid credentials)

**1.4 Ownership Guard**
- [ ] Create `OwnershipGuard` middleware
- [ ] Validate `book.ownerUserId === currentUser.id` cho books endpoints
- [ ] Test với unauthorized access

**1.5 Testing**
- [ ] Unit tests cho auth service
- [ ] Integration tests cho auth endpoints
- [ ] Test ownership enforcement

**Dependencies**: None (foundation)

**Deliverables**:
- Working auth API (register/login/me)
- Ownership guard middleware
- Database schema ready

---

### Milestone 2: Import EPUB + Local Disk Storage + DB Book/Chapter
**Goal**: Upload EPUB, extract metadata, lưu file, persist DB

**Duration**: 2-3 tuần

#### Tasks

**2.1 File Upload**
- [ ] Install `multer` (hoặc NestJS file upload)
- [ ] Create `POST /api/books/import` endpoint
- [ ] Validate file type (.epub)
- [ ] Validate file size (max 50MB)
- [ ] Save uploaded file to `data/epubs/{bookId}/original.epub`
- [ ] Generate `bookId` (UUID)

**2.2 EPUB Extraction**
- [ ] Install `yauzl` (hoặc `adm-zip`) để unzip EPUB
- [ ] Extract EPUB to temp directory
- [ ] Parse `META-INF/container.xml` để tìm OPF
- [ ] Parse OPF file để extract:
  - Metadata (title, author, language)
  - Spine (chapter order)
  - TOC (optional)
- [ ] Extract cover image (nếu có)

**2.3 Database Persistence**
- [ ] Create `Book` record với metadata
- [ ] Create `Chapter` records với spine order
- [ ] Save cover image path (nếu có)
- [ ] Handle errors (rollback DB nếu file save fail)

**2.4 Books API**
- [ ] `GET /api/books` - list books của user (filter by `ownerUserId`)
- [ ] `GET /api/books/:bookId` - get book metadata + chapters list
- [ ] Apply ownership guard
- [ ] Return cover image URL (nếu có)

**2.5 Error Handling**
- [ ] Invalid EPUB format
- [ ] Corrupted EPUB
- [ ] Missing OPF/spine
- [ ] File system errors
- [ ] Database errors

**2.6 Testing**
- [ ] Test với valid EPUB
- [ ] Test với invalid/corrupted EPUB
- [ ] Test ownership (user A không thể access book của user B)
- [ ] Test file size limits

**Dependencies**: Milestone 1 (auth + ownership)

**Deliverables**:
- Working upload endpoint
- EPUB metadata extraction
- Books list API
- File storage structure

---

### Milestone 3: Sentence Wrap + Sentences API
**Goal**: Process chapters, wrap sentences, expose sentences API

**Duration**: 2-3 tuần

#### Tasks

**3.1 XHTML Processing Setup**
- [ ] Install `cheerio` (hoặc `jsdom`) để parse HTML
- [ ] Install `sanitize-html` để sanitize
- [ ] Create `IngestModule` với sentence processing logic

**3.2 Chapter Processing**
- [ ] Load chapter XHTML từ extracted EPUB
- [ ] Sanitize HTML (remove scripts, unsafe attributes)
- [ ] Parse DOM với cheerio
- [ ] Traverse text nodes theo reading order
- [ ] Normalize whitespace

**3.3 Sentence Splitting (Vietnamese)**
- [ ] Implement rule-based sentence splitter:
  - Split theo `. ? ! …` và newlines
  - Blacklist viết tắt: `TS.`, `PGS.`, `Dr.`, `Mr.`, `TP.`, ...
  - Handle số thập phân: `3.14`
  - Handle quotes/brackets
- [ ] Test với sample Vietnamese text
- [ ] Edge cases: empty sentences, nested quotes

**3.4 Sentence Wrapping**
- [ ] Wrap mỗi sentence trong `<span data-sent="{index}" id="s-{paddedIndex}">`
- [ ] Generate `markerId` format: `s-000000`, `s-000001`, ...
- [ ] Preserve original HTML structure (headings, paragraphs, etc.)
- [ ] Save processed XHTML to `data/epubs/{bookId}/chapters/{spineIndex}.xhtml`

**3.5 Sentences Database**
- [ ] Create `Sentence` records:
  - `chapterId`, `sentenceIndex`, `text`, `markerId`
- [ ] Batch insert sentences (optimize performance)
- [ ] Index `(chapterId, sentenceIndex)`

**3.6 Sentences API**
- [ ] `GET /api/books/:bookId/chapters/:chapterId/sentences`
- [ ] Return: `{ sentences: [{ sentenceIndex, text, markerId }] }`
- [ ] Apply ownership guard
- [ ] Pagination (nếu chapter quá lớn)

**3.7 Chapter Serving**
- [ ] `GET /api/books/:bookId/chapters/:chapterId`
- [ ] Return: `{ xhtmlUrl, title, spineIndex }`
- [ ] Serve processed XHTML file (với auth check)
- [ ] CORS headers (nếu cần)

**3.8 Testing**
- [ ] Test sentence splitting với Vietnamese text
- [ ] Test sentence wrapping (verify HTML structure)
- [ ] Test sentences API
- [ ] Test với chapters lớn (1000+ sentences)
- [ ] Performance test (ingest time)

**Dependencies**: Milestone 2 (EPUB extraction)

**Deliverables**:
- Processed chapters với sentence markers
- Sentences API
- Sentence splitting working cho Vietnamese

---

### Milestone 4: Frontend Reader (Pagination, Theme/Font) + Bookshelf
**Goal**: Frontend foundation, bookshelf UI, reader view với epub.js

**Duration**: 2-3 tuần

#### Tasks

**4.1 Next.js Setup**
- [ ] Initialize Next.js project với TypeScript
- [ ] Setup TailwindCSS
- [ ] Setup folder structure (theo ARCHITECTURE.md)
- [ ] Install dependencies: `epub.js`, `dexie`, `@heroicons/react` (hoặc lucide-react)

**4.2 Design System**
- [ ] Create design tokens (colors, typography, spacing)
- [ ] Setup light/dark theme (CSS variables hoặc Tailwind dark mode)
- [ ] Import Google Fonts (Crimson Text/Lora cho reader)
- [ ] Create base components (Button, Input, Card)

**4.3 Auth Frontend**
- [ ] Create auth context/store
- [ ] Login page (theo UI_UX_RECOMMENDATIONS.md)
- [ ] Register page
- [ ] Token/cookie handling
- [ ] Protected routes (middleware hoặc HOC)
- [ ] Error handling (invalid credentials, network errors)

**4.4 Bookshelf UI**
- [ ] Bookshelf page layout
- [ ] Book card component (grid/list view)
- [ ] Book cover image (placeholder nếu không có)
- [ ] Progress indicator (nếu đã đọc)
- [ ] Empty state
- [ ] Loading state (skeleton loaders)

**4.5 Upload Flow**
- [ ] Upload button (FAB)
- [ ] File picker (accept .epub)
- [ ] Upload progress modal
- [ ] Error handling (file too large, network error)
- [ ] Success feedback

**4.6 Reader Setup**
- [ ] Install và configure `epub.js`
- [ ] Create reader page/layout
- [ ] Load chapter XHTML từ API
- [ ] Render với epub.js rendition
- [ ] Basic pagination (swipe left/right)

**4.7 Reader Controls**
- [ ] Header (Back, Title, Settings) - auto-hide
- [ ] Settings drawer/modal:
  - Font size slider (16px - 24px)
  - Theme toggle (light/dark)
  - Line height preset
  - Font family (Serif/Sans-serif)
- [ ] Persist settings (localStorage)
- [ ] Apply settings to epub.js rendition

**4.8 Navigation**
- [ ] Chapter navigation (prev/next)
- [ ] TOC sidebar (optional, future)
- [ ] Progress indicator

**4.9 Testing**
- [ ] Test auth flow (login/register)
- [ ] Test bookshelf (list, upload)
- [ ] Test reader (load chapter, pagination)
- [ ] Test settings (font size, theme)
- [ ] Test responsive (mobile/desktop)

**Dependencies**: Milestone 1 (backend auth), Milestone 2 (books API)

**Deliverables**:
- Working bookshelf UI
- Reader view với epub.js
- Settings (font/theme)
- Auth flow

---

### Milestone 5: Web Speech TTS + Highlight + Auto-Scroll + Seek
**Goal**: TTS controller, sentence highlighting, auto-scroll, seek functionality

**Duration**: 2-3 tuần

#### Tasks

**5.1 TTS Engine Abstraction**
- [ ] Create `TtsEngine` interface
- [ ] Implement `BrowserSpeechEngine` (Web Speech API)
- [ ] Voice loading (handle iOS delay)
- [ ] Voice selection UI (dropdown)
- [ ] Rate control (0.5x - 2.0x slider)

**5.2 TTS Controller**
- [ ] Create TTS controller component
- [ ] Sentence queue management
- [ ] Play/Pause functionality
- [ ] Prev/Next sentence navigation
- [ ] Cancel speech on seek
- [ ] iOS gesture requirement handling

**5.3 Sentence Highlighting**
- [ ] Locate sentence element by `markerId` trong epub.js iframe
- [ ] Add/remove `.tts-active` class
- [ ] CSS styling (theo UI_UX_RECOMMENDATIONS.md)
- [ ] Smooth transition (200ms)
- [ ] Handle highlight khi sentence active

**5.4 Auto-Scroll**
- [ ] `scrollIntoView({ behavior: 'smooth', block: 'center' })` cho sentence
- [ ] Handle pagination (nếu sentence ở trang khác)
- [ ] Use `rendition.display(cfi)` nếu cần nhảy trang
- [ ] Delay nhỏ (100-200ms) sau highlight

**5.5 Seek Functionality**
- [ ] Click sentence để seek
- [ ] Sentence selector UI (optional: dropdown/list)
- [ ] Cancel current speech
- [ ] Jump to sentence + highlight
- [ ] Resume playback từ sentence mới

**5.6 TTS Controls UI**
- [ ] Sticky bottom control bar
- [ ] Prev/Pause/Next buttons
- [ ] Rate slider
- [ ] Voice selector
- [ ] Playback state indicator
- [ ] Loading state ("Preparing voice...")

**5.7 Progress Tracking (Local)**
- [ ] Save progress khi sentence starts (IndexedDB)
- [ ] Schema: `bookId, chapterId, sentenceIndex, markerId, ttsVoice, ttsRate, updatedAt`
- [ ] Debounce saves (không save mỗi sentence)
- [ ] Resume từ last sentence

**5.8 Keyboard Shortcuts**
- [ ] `Space`: Play/Pause
- [ ] `←` / `→`: Prev/Next sentence
- [ ] `↑` / `↓`: Scroll page
- [ ] `Esc`: Close settings

**5.9 Testing**
- [ ] Test TTS playback (multiple sentences)
- [ ] Test highlighting (light/dark mode)
- [ ] Test auto-scroll (same page, next page)
- [ ] Test seek (click sentence, prev/next)
- [ ] Test iOS (gesture requirement, voice loading)
- [ ] Test keyboard shortcuts
- [ ] Test error handling (TTS not available)

**Dependencies**: Milestone 3 (sentences API), Milestone 4 (reader)

**Deliverables**:
- Working TTS với Web Speech API
- Sentence highlighting
- Auto-scroll
- Seek functionality

---

### Milestone 6: IndexedDB Progress + Resume + PWA Caching
**Goal**: Local-first progress, resume functionality, PWA setup

**Duration**: 1-2 tuần

#### Tasks

**6.1 IndexedDB Setup**
- [ ] Install `dexie`
- [ ] Create Dexie database schema
- [ ] Table: `progress` (bookId, chapterId, sentenceIndex, markerId, readerCfi, ttsVoice, ttsRate, updatedAt)
- [ ] Indexes: `[bookId]`, `[bookId, chapterId]`

**6.2 Progress Persistence**
- [ ] Save progress khi sentence starts (onstart event)
- [ ] Debounce saves (2-5s) để tránh quá nhiều writes
- [ ] Handle IndexedDB errors gracefully
- [ ] Fallback to localStorage nếu IndexedDB fails

**6.3 Resume Functionality**
- [ ] Load progress từ IndexedDB khi mở app
- [ ] Load progress khi mở book
- [ ] Navigate to last chapter
- [ ] Jump to last sentence (markerId hoặc CFI)
- [ ] Restore TTS settings (voice, rate)

**6.4 Progress Sync (Optional)**
- [ ] `POST /api/books/:bookId/progress` endpoint (backend)
- [ ] `GET /api/books/:bookId/progress` endpoint (backend)
- [ ] Debounce sync (2-5s)
- [ ] Network error handling (không ảnh hưởng UX)
- [ ] Best-effort sync (không block UI)

**6.5 PWA Setup**
- [ ] Install `next-pwa` (hoặc Workbox)
- [ ] Create `manifest.json` (theo UI_UX_RECOMMENDATIONS.md)
- [ ] Generate icons (various sizes)
- [ ] Service worker configuration:
  - App shell: cache-first
  - Chapters: stale-while-revalidate
  - API: network-first với cache fallback

**6.6 Offline Support**
- [ ] Offline indicator (badge/bar)
- [ ] Disable upload khi offline
- [ ] Show cached books
- [ ] Handle offline errors gracefully

**6.7 iOS PWA Considerations**
- [ ] Viewport meta tag (`viewport-fit=cover`)
- [ ] Safe area insets cho bottom controls
- [ ] Web Speech API constraints (user gesture)
- [ ] IndexedDB storage limits handling

**6.8 Testing**
- [ ] Test progress save/load
- [ ] Test resume (mở lại app)
- [ ] Test offline mode
- [ ] Test PWA install (iOS/Android)
- [ ] Test service worker caching
- [ ] Test IndexedDB limits

**Dependencies**: Milestone 5 (TTS + progress tracking)

**Deliverables**:
- Local-first progress working
- Resume functionality
- PWA installable
- Offline support

---

## Technical Decisions

### Backend

**Framework**: NestJS (recommended) hoặc Fastify
- **Decision**: NestJS (better structure, guards, DI)
- **Rationale**: Easier ownership enforcement, module organization

**Password Hashing**: Argon2 (recommended) hoặc bcrypt
- **Decision**: Argon2
- **Rationale**: Better security, modern standard

**Auth Strategy**: JWT + refresh token (cookie) hoặc session cookie
- **Decision**: JWT access token + refresh token (httpOnly cookie)
- **Rationale**: Stateless, scalable, secure

**EPUB Parsing**: `yauzl` (streaming) hoặc `adm-zip`
- **Decision**: `yauzl` (streaming)
- **Rationale**: Better memory efficiency cho large EPUBs

**HTML Parsing**: `cheerio` hoặc `jsdom`
- **Decision**: `cheerio`
- **Rationale**: Lighter, faster, server-side friendly

### Frontend

**UI Library**: TailwindCSS + shadcn/ui hoặc chỉ Tailwind
- **Decision**: TailwindCSS + custom components
- **Rationale**: Full control, no dependency bloat

**Icons**: Heroicons hoặc Lucide
- **Decision**: Heroicons
- **Rationale**: Official, consistent, well-maintained

**State Management**: Context API hoặc Zustand
- **Decision**: Context API (auth, settings) + local state
- **Rationale**: Simple, no extra dependency

**PWA**: `next-pwa` hoặc Workbox manual
- **Decision**: `next-pwa`
- **Rationale**: Easier setup, good defaults

---

## Testing Strategy

### Backend Testing
- **Unit tests**: Services, utilities (sentence splitter)
- **Integration tests**: API endpoints, auth flow
- **E2E tests**: Upload → Process → API flow

### Frontend Testing
- **Unit tests**: Components, utilities
- **Integration tests**: Auth flow, reader interactions
- **E2E tests**: Full user journey (upload → read → TTS)

### Manual Testing Checklist
- [ ] Auth (register, login, logout)
- [ ] Upload EPUB (valid, invalid, large)
- [ ] Bookshelf (list, empty state)
- [ ] Reader (pagination, settings)
- [ ] TTS (play, pause, seek, highlight)
- [ ] Progress (save, resume)
- [ ] PWA (install, offline)
- [ ] iOS Safari (gestures, voices, safe area)
- [ ] Android Chrome (PWA, TTS)

---

## Deployment Plan

### Prerequisites
- [ ] VM setup (Ubuntu)
- [ ] PostgreSQL installed
- [ ] Node.js installed
- [ ] Nginx installed
- [ ] Domain + DNS configured

### Backend Deployment
1. Build TypeScript: `npm run build`
2. Setup PM2: `pm2 start dist/main.js --name epub-backend`
3. Setup systemd (alternative)
4. Configure environment variables
5. Run migrations: `npx prisma migrate deploy`

### Frontend Deployment
1. Build Next.js: `npm run build`
2. Start production server: `npm start` (hoặc PM2)
3. Configure environment variables (API URL)

### Nginx Configuration
1. Setup reverse proxy:
   - `/api/*` → backend (port 3001)
   - `/*` → frontend (port 3000)
2. SSL/TLS (Let's Encrypt)
3. Static file serving (nếu cần)

### Backup Strategy
1. PostgreSQL: `pg_dump` daily cron
2. File storage: `rsync` hoặc snapshot daily
3. Test restore procedure

---

## Risk Mitigation

### Technical Risks

**Risk**: EPUB parsing fails với complex EPUBs
- **Mitigation**: Test với nhiều EPUB samples, handle errors gracefully

**Risk**: Sentence splitting không chính xác (Vietnamese)
- **Mitigation**: Test với real Vietnamese text, iterate on rules

**Risk**: Web Speech API không available (iOS quirks)
- **Mitigation**: Graceful degradation, clear error messages

**Risk**: IndexedDB storage limits (iOS)
- **Mitigation**: Fallback to localStorage, limit stored data

**Risk**: Ingest performance (large EPUBs)
- **Mitigation**: Timeout, progress indicator, async processing (future)

### Timeline Risks

**Risk**: Milestone 3 (sentence splitting) mất nhiều thời gian
- **Mitigation**: Start early, test với real data, iterate

**Risk**: Milestone 5 (TTS) phức tạp hơn dự kiến
- **Mitigation**: Prototype early, test iOS constraints sớm

---

## Success Criteria

### MVP Complete Khi:
- [ ] User có thể register/login
- [ ] User có thể upload EPUB
- [ ] User có thể xem bookshelf
- [ ] User có thể đọc sách với pagination
- [ ] User có thể play TTS theo câu
- [ ] Sentence được highlight khi TTS play
- [ ] Auto-scroll hoạt động
- [ ] User có thể seek (click sentence, prev/next)
- [ ] Progress được lưu local
- [ ] App resume đúng vị trí
- [ ] PWA installable
- [ ] Offline mode hoạt động cơ bản

### Quality Gates:
- [ ] All tests passing
- [ ] No critical bugs
- [ ] Performance acceptable (ingest < 30s cho EPUB 5MB)
- [ ] iOS Safari tested
- [ ] Android Chrome tested

---

## Post-MVP Enhancements

### Phase 2 (Future)
- Remote TTS engine
- Bookmarks/notes
- Full-text search
- Multi-device sync
- Reading statistics
- Social features (share quotes)

---

## Notes

- **Estimate**: 8-12 tuần cho full MVP (1 developer)
- **Parallel work**: Frontend và Backend có thể làm song song từ Milestone 2
- **Iteration**: Sentence splitting và TTS có thể cần nhiều iteration
- **Testing**: Test trên iOS Safari sớm (constraints khác biệt)

---

**Last Updated**: [Date]
**Status**: Planning
