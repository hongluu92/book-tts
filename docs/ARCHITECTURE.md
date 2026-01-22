# ARCHITECTURE — EPUB Reader + Sentence-level TTS (MVP)

## 1) Goals & Constraints
- **Product**: Web app đọc EPUB (pagination) + **TTS theo từng câu**.
- **MVP TTS**: dùng **Web Speech API** (TTS trên trình duyệt/OS), highlight câu và auto-scroll/nhảy trang theo câu.
- **Backend bắt buộc**: ingest EPUB, lưu trữ, API.
- **Private per-user**: sách thuộc về user, endpoint enforce ownership.
- **Auth**: email + password.
- **Local-first**: tiến độ đọc lưu local (IndexedDB) trước; sync backend best-effort.
- **Scale dự kiến**: 10–1000 users.
- **Platform**: web app trước; sau mở rộng đa nền tảng.
- **Không dùng Docker**.
- **Chưa cần CI/build pipeline**.

## 2) Recommended Tech Stack (MVP)

### 2.1 Frontend (Web/PWA)
- **Next.js (React) + TypeScript**
- **Reader engine**: `epub.js`
- **Local DB**: IndexedDB qua `Dexie`
- **TTS**: Web Speech API (`speechSynthesis`, `SpeechSynthesisUtterance`)
- **PWA**: Service Worker (Workbox/next-pwa)

**Notes**:
- iOS có constraint: Web Speech cần user gesture để bắt đầu; voices load chậm → UI cần trạng thái "loading voices".

### 2.2 Backend
- **Node.js + TypeScript**
- **Framework**: **NestJS** (hoặc Fastify). Mục tiêu: REST API rõ ràng, guard/middleware ownership.
- **DB**: PostgreSQL
- **ORM**: Prisma
- **Password hashing**: Argon2 (khuyến nghị)
- **Auth**: JWT (access token) + refresh token (cookie httpOnly) hoặc session cookie.

### 2.3 Storage
- **File storage**: local disk (theo spec)
  - `data/epubs/{bookId}/original.epub`
  - `data/epubs/{bookId}/chapters/{spineIndex}.xhtml`
- **Backup**: định kỳ backup `data/` + PostgreSQL.

## 3) High-Level Architecture

### 3.1 Components
- **Web Client (PWA)**
  - Login / Bookshelf / Reader
  - TTS Controller (sentence loop)
  - IndexedDB progress store
- **Backend API**
  - Auth
  - Books API
  - Ingest pipeline
  - Ownership enforcement
- **PostgreSQL**
  - metadata + sentences index
- **File Store (local disk)**
  - EPUB + processed XHTML

### 3.2 Separation of Concerns (Code-Level)
- **Backend modules**:
  - `AuthModule`: register/login/me
  - `BooksModule`: import/list/get book
  - `ChaptersModule`: serve chapter metadata + xhtml
  - `SentencesModule`: sentences map endpoint
  - `IngestModule`: unzip/parse/sanitize/sentence-wrap
- **Frontend modules**:
  - `auth/*`: token/cookie handling
  - `books/*`: list/import
  - `reader/*`: epub.js rendition + highlight helpers
  - `tts/*`: `TtsEngine` abstraction + browser implementation
  - `storage/*`: Dexie schema + progress sync client

## 4) Data Model
Theo spec, các bảng chính:
- `users(id, email, passwordHash, createdAt)`
- `books(id, ownerUserId, title, author, language, coverPath, epubPath, createdAt)`
- `chapters(id, bookId, spineIndex, title, href, xhtmlPath, createdAt)`
- `sentences(id, chapterId, sentenceIndex, text, markerId)`
- (optional) `progress(userId, bookId, chapterId, sentenceIndex, markerId, readerCfi, ttsVoice, ttsRate, updatedAt)`

**Indexes khuyến nghị**:
- `books(ownerUserId)`
- `chapters(bookId, spineIndex)`
- `sentences(chapterId, sentenceIndex)`

## 5) Backend Ingest Pipeline (EPUB → Sentence-Wrapped XHTML)

### 5.1 Output XHTML Contract
Mỗi câu được wrap:
```html
<span data-sent="{sentenceIndex}" id="{markerId}">...</span>
```
Trong đó `markerId` dạng `s-000000` tăng dần theo chapter.

### 5.2 Ingest Flow (Synchronous MVP)
1. Upload EPUB → lưu `data/epubs/{bookId}/original.epub`
2. Extract EPUB
3. Parse OPF/spine/TOC
4. Với mỗi chapter XHTML:
   - sanitize (remove script/unsafe)
   - parse DOM
   - traverse text nodes theo order
   - normalize whitespace
   - tách câu tiếng Việt (rule-based)
   - wrap câu thành `<span ...>`
   - ghi file processed `data/epubs/{bookId}/chapters/{spineIndex}.xhtml`
5. Persist DB: `books`, `chapters`, `sentences`

### 5.3 Sentence Splitting (Vietnamese, Rule-Based MVP)
- Split theo `. ? ! …` và xuống dòng
- Tránh tách nhầm:
  - viết tắt: `TS.`, `PGS.`, `Dr.`, `Mr.`, `TP.`...
  - số thập phân: `3.14`

### 5.4 Performance Considerations
- Với scale 10–1000 users, ingest có thể chạy inline nhưng cần:
  - giới hạn dung lượng EPUB upload
  - timeout hợp lý
  - logging/trace ingest để debug lỗi parse
- **Nâng cấp sau**: đưa ingest sang job queue (BullMQ/Redis) nếu ingest chậm.

## 6) Frontend Reader + Highlight + TTS

### 6.1 Reader
- `epub.js` render pagination trong iframe.
- Theme/font size: áp CSS qua rendition themes.

### 6.2 Highlight + Auto-Display Sentence
- Khi sentence active:
  - lấy document trong iframe
  - `getElementById(markerId)`
  - add class `.tts-active`
  - đảm bảo element vào viewport:
    - ưu tiên `scrollIntoView({ block: "center" })`
    - nếu pagination cần, dùng `rendition.display(...)`/CFI nếu có.

### 6.3 TTS Controller
- Input queue: `{ chapterId, sentenceIndex, text, markerId }`
- Loop:
  - tạo `SpeechSynthesisUtterance(text)`
  - `onstart`: highlight + persist progress local
  - `onend`: tăng index phát tiếp
- Seek:
  - `speechSynthesis.cancel()`
  - set index mới
  - display + highlight
  - play tiếp

## 7) Local-First Progress + Optional Sync

### 7.1 Local Progress (IndexedDB)
- Persist ở các thời điểm:
  - `onstart` mỗi câu (ổn định resume)
  - và/hoặc debounce khi đang play
- Schema theo spec: `bookId, chapterId, sentenceIndex, markerId, readerCfi?, ttsVoice, ttsRate, updatedAt`.

### 7.2 Sync (Best-Effort)
- Debounce 2–5s gọi `POST /api/books/:bookId/progress`
- Network lỗi không ảnh hưởng UX.

## 8) API Surface (MVP)
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`

- `POST /api/books/import` (multipart)
- `GET /api/books`
- `GET /api/books/:bookId`
- `GET /api/books/:bookId/chapters/:chapterId`
- `GET /api/books/:bookId/chapters/:chapterId/sentences`

- Optional:
  - `POST /api/books/:bookId/progress`
  - `GET /api/books/:bookId/progress`

**Ownership rule**:
- Mọi endpoint books/chapters/sentences/progress đều require auth và kiểm tra `book.ownerUserId === currentUser.id`.

## 9) Deployment (No Docker, Single VM)

### 9.1 Topology
- **1 VM** (Ubuntu)
  - Nginx (reverse proxy)
  - Backend Node process (PM2/systemd)
  - Postgres (local)
  - Disk: `data/` cho EPUB + chapters

### 9.2 Process Management
- **Backend**:
  - build TypeScript → chạy Node
  - quản lý bằng **PM2** hoặc **systemd**
- **Frontend**:
  - Next.js có thể chạy Node server (`next start`) phía sau Nginx.

### 9.3 Nginx
- Terminate TLS (Let's Encrypt)
- Route:
  - `/api/*` → backend
  - `/*` → frontend
- Static/stream files:
  - có thể proxy endpoint backend serve XHTML để enforce auth.

### 9.4 Backups
- PostgreSQL: `pg_dump` hằng ngày
- `data/`: rsync/snapshot định kỳ

## 10) Future Upgrades (Post-MVP)
- Object storage (S3/R2/MinIO) + CDN cho chapters
- Job queue cho ingest
- Remote TTS engine + cache audio
- Multi-device sync hoàn chỉnh
- Search full-text (Postgres FTS / Meilisearch)
