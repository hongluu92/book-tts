# Spec — Web app đọc EPUB + TTS theo câu (PWA, backend ingest, local-first)

## 1) Mục tiêu
Xây dựng web app đọc sách từ file **EPUB** với trải nghiệm:
- Render giống app đọc sách thật (**pagination**, chỉnh font/theme cơ bản).
- **Tự động đọc theo từng câu** (MVP dùng TTS sẵn của trình duyệt/OS thông qua Web Speech API).
- Khi play:
  - highlight **nguyên câu** đang đọc
  - tự cuộn/nhảy trang theo câu đang đọc
- Có thể **seek/tua** sang câu/đoạn khác nhanh.
- **Resume**: mở lại app quay về đúng vị trí đang nghe (local-first).

Yêu cầu hệ thống:
- Có **backend** (ingest EPUB, lưu trữ, API).
- Có **frontend** (PWA iOS/Android).
- Sách **private theo user**.
- Login **simple**.
- Local-first: tiến độ đọc lưu local trước; có thể sync backend tối giản.

---

## 2) Phạm vi MVP
### MVP có
- Đăng ký/đăng nhập email + password.
- Upload/import EPUB lên backend.
- Backend parse EPUB → chapters XHTML (đã inject/wrap câu).
- Frontend reader render pagination (epub.js hoặc tương đương).
- Play/Pause đọc theo câu bằng Web Speech API.
- Highlight nguyên câu, auto-scroll/auto-display đúng câu.
- Seek bằng click câu / chọn câu.
- Lưu progress local (IndexedDB) + resume.
- PWA: cache app shell + cache một phần nội dung.

### MVP chưa cần
- TTS backend (streaming audio) / model TTS ngoài.
- Ghi chú, bookmark, search full-text.
- Đồng bộ đa thiết bị hoàn chỉnh (có thể thêm sau).

---

## 3) Kiến trúc tổng quan
### Backend
- Nhận upload EPUB.
- Lưu file EPUB vào **local disk server**.
- Extract + parse OPF/spine/TOC.
- Chuẩn hóa từng chapter XHTML và **wrap mỗi câu** thành một span có id/marker.
- Lưu DB: book/chapter/sentence.
- Expose API để frontend lấy chapters + sentence map.

### Frontend (PWA)
- Login.
- Bookshelf (list/import).
- Reader view:
  - render chapter XHTML bằng engine reader (ưu tiên epub.js)
  - điều khiển font size/theme
- TTS controller:
  - đọc theo sentence index
  - highlight câu (bằng class)
  - auto-display câu (scroll/nhảy trang)
- Local-first progress:
  - lưu IndexedDB
  - optional: sync progress lên backend (best-effort)

---

## 4) Data model (đề xuất)
### 4.1 Backend tables/collections
#### `users`
- `id` (uuid)
- `email` (unique)
- `passwordHash`
- `createdAt`

#### `books`
- `id` (uuid)
- `ownerUserId` (fk users)
- `title`, `author`, `language`
- `coverPath` (optional)
- `epubPath` (local disk path)
- `createdAt`

#### `chapters`
- `id` (uuid)
- `bookId`
- `spineIndex` (int)
- `title` (nullable)
- `href` (original path in epub)
- `xhtmlPath` (local disk path of processed chapter)
- `createdAt`

#### `sentences`
- `id` (uuid)
- `chapterId`
- `sentenceIndex` (int)
- `text` (text)
- `markerId` (string, unique within chapter; ví dụ `s-000123`)

### 4.2 Local-first (IndexedDB)
#### `progress`
- `bookId`
- `chapterId`
- `sentenceIndex`
- `markerId` (hoặc derive từ sentenceIndex)
- `readerCfi` (optional: tăng tốc resume)
- `ttsVoice`, `ttsRate`
- `updatedAt`

---

## 5) API (MVP)
### 5.1 Auth
- `POST /api/auth/register`  
  Body: `{ email, password }`
- `POST /api/auth/login`  
  Body: `{ email, password }` → trả JWT (hoặc cookie)
- `GET /api/auth/me`

### 5.2 Books / Chapters
- `POST /api/books/import` (multipart upload epub) → `{ bookId }`
- `GET /api/books` → list sách của user
- `GET /api/books/:bookId` → metadata + toc/spine + chapters list
- `GET /api/books/:bookId/chapters/:chapterId` → `{ xhtmlUrl, title, spineIndex }`
- `GET /api/books/:bookId/chapters/:chapterId/sentences` → `{ sentences: [{ sentenceIndex, text, markerId }] }`

### 5.3 Progress sync (optional, best-effort)
- `POST /api/books/:bookId/progress` → lưu progress gần nhất
- `GET /api/books/:bookId/progress` → lấy progress gần nhất

### 5.4 Bảo mật/ownership
- Tất cả endpoints books/chapters/sentences/progress yêu cầu auth.
- Backend validate `book.ownerUserId === currentUser.id`.

---

## 6) Pipeline ingest EPUB (backend)
Mục tiêu: tạo XHTML đã **wrap nguyên câu** để frontend highlight/scroll ổn định.

### 6.1 Output chapter XHTML
Mỗi câu được wrap:
- `<span data-sent="{sentenceIndex}" id="{markerId}">...</span>`

Ví dụ:
- `id="s-000000" data-sent="0"`

### 6.2 Các bước ingest
1. Nhận EPUB → lưu vào `data/epubs/{bookId}/original.epub`
2. Extract + parse OPF/spine/TOC
3. Với từng chapter XHTML:
   - sanitize (remove script/unsafe)
   - parse DOM
   - duyệt text nodes theo thứ tự đọc
   - normalize whitespace
   - tách câu tiếng Việt
   - **wrap sentence** vào span marker
   - lưu file processed XHTML: `data/epubs/{bookId}/chapters/{spineIndex}.xhtml`
4. Ghi DB:
   - `chapters`
   - `sentences` (sentenceIndex, text, markerId)

### 6.3 Tách câu tiếng Việt (MVP rule-based)
- Split theo `. ? ! …` và xuống dòng
- Tránh tách nhầm:
  - viết tắt phổ biến: `TS.`, `PGS.`, `Dr.`, `Mr.`, `TP.`, ...
  - số thập phân: `3.14`
- Chuẩn hóa dấu ngoặc/quote để tránh tạo câu rỗng.

---

## 7) Frontend reader + highlight + auto-scroll
### 7.1 Reader
- Dùng epub.js (hoặc engine tương đương) để render XHTML theo pagination.
- Cho phép thay đổi:
  - font size
  - theme (light/dark)

### 7.2 Locate + highlight câu
- Khi cần highlight câu `markerId`:
  - lấy document trong iframe của rendition
  - `el = document.getElementById(markerId)`
  - add class highlight (vd: `.tts-active`)
  - đảm bảo câu hiện tại vào viewport (scrollIntoView hoặc rendition.display)

### 7.3 Playback/TTS controller (Web Speech API)
- Dữ liệu phát: `{ chapterId, sentenceIndex, text, markerId }`
- Loop:
  - tạo `SpeechSynthesisUtterance(text)`
  - `onstart`: highlight + persist progress local
  - `onend`: `sentenceIndex++` và phát tiếp
- Seek:
  - cancel speech
  - set `sentenceIndex` mới
  - display/highlight marker mới
  - phát tiếp

---

## 8) Resume & local-first
- Mỗi lần câu bắt đầu/hoặc kết thúc:
  - lưu `progress` vào IndexedDB
- Khi mở app:
  - đọc progress local
  - mở book/chapter
  - nhảy tới `markerId`/`readerCfi`

Sync backend (nếu bật):
- debounce (vd 2–5s) gửi progress
- lỗi network không ảnh hưởng UX

---

## 9) PWA (iOS/Android)
- Cache app shell (HTML/CSS/JS) bằng service worker.
- Cache API responses theo chiến lược:
  - `stale-while-revalidate` cho chapters/sentences
- Lưu ý iOS:
  - Web Speech cần user gesture để start
  - voices có thể load chậm → UI trạng thái loading
  - IndexedDB có thể bị hạn chế storage → cần fallback tối giản

---

## 10) Lộ trình nâng cấp (post-MVP)
### 10.1 Remote TTS engine
- Thêm abstraction `TtsEngine`:
  - `BrowserSpeechEngine` (MVP)
  - `RemoteTtsEngine` (backend TTS)
- API tương lai:
  - `POST /api/tts` `{ bookId, chapterId, sentenceIndex, voice, rate }` → audio
- Cache audio theo `sentenceHash + voice + rate`

### 10.2 Tính năng đọc nâng cao
- Bookmark/notes
- Search
- Đồng bộ đa thiết bị hoàn chỉnh

---

## 11) Milestones MVP (đề xuất)
1. Backend auth + ownership enforcement
2. Import EPUB + lưu local disk + DB book/chapter
3. Sentence wrap + sentences API
4. Frontend reader (pagination, theme/font) + bookshelf
5. Web Speech TTS + highlight + auto-scroll + seek
6. IndexedDB progress + resume + PWA caching
