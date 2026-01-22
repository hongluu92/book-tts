# EPUB Reader Frontend

Frontend web app for EPUB Reader with sentence-level TTS support.

## Tech Stack

- **Framework**: Next.js 14 + TypeScript
- **Styling**: TailwindCSS
- **Reader**: Direct XHTML rendering (epub.js for future)
- **Icons**: Heroicons
- **Storage**: localStorage (auth tokens, settings)

## Setup

### Prerequisites

- Node.js 18+
- npm hoặc yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Setup environment variables:
```bash
# Create .env.local
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

3. Start development server:
```bash
npm run dev
```

App will run on `http://localhost:3000`

## Features

### ✅ Implemented (Milestone 4)

- **Auth**: Login/Register pages
- **Bookshelf**: Grid view với book cards
- **Upload**: EPUB file upload với progress
- **Reader**: Chapter XHTML rendering
- **Settings**: Font size (16-24px), Theme (light/dark)
- **Navigation**: Chapter prev/next

### 🚧 Future (Milestone 5-6)

- TTS controls
- Sentence highlighting
- Auto-scroll
- Progress tracking (IndexedDB)
- PWA support

## Project Structure

```
frontend/
├── src/
│   ├── app/              # Next.js app router
│   │   ├── login/        # Login page
│   │   ├── register/     # Register page
│   │   ├── bookshelf/    # Bookshelf page
│   │   └── reader/       # Reader page
│   ├── components/       # React components
│   └── lib/              # Utilities (api, auth)
└── public/               # Static assets
```

## API Integration

Frontend calls backend API at `NEXT_PUBLIC_API_URL`:

- `POST /api/auth/login`
- `POST /api/auth/register`
- `GET /api/books`
- `POST /api/books/import`
- `GET /api/books/:bookId`
- `GET /api/books/:bookId/chapters/:chapterId/xhtml`
- `GET /api/books/:bookId/chapters/:chapterId/sentences`

## Milestone 4 Status

✅ Next.js Setup
✅ Design System
✅ Auth Frontend
✅ Bookshelf UI
✅ Upload Flow
✅ Reader Setup
✅ Reader Controls
✅ Navigation
