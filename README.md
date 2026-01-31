# Book TTS - EPUB Reader with Text-to-Speech

A modern web application for reading EPUB files with built-in text-to-speech capabilities.
Demo: https://hongluu92.github.io/book-tts/

## ✅ Features

- 📖 **EPUB Reader**: Read EPUB files with customizable font, size, and theme
- 🎙️ **TTS Controls**: Text-to-speech with play/pause, speed control, and chapter navigation
- 🌙 **Dark Mode**: Eye-friendly reading experience
- 📱 **Responsive Design**: Works on desktop and mobile devices
- 🔧 **PWA Support**: Install as a standalone app
- ☁️ **Firebase Sync** (Optional): Sync bookshelf, reading progress, and bookmarks across devices

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- npm

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build for Production

```bash
# Build static export
npm run build

# Preview production build
npm run serve
```

## 📁 Project Structure

```
├── src/              # Source code
│   ├── app/         # Next.js App Router
│   ├── components/  # React components
│   └── lib/         # Utilities and helpers
├── public/          # Static assets
├── tests/           # Playwright E2E tests
└── docs/            # Documentation
```

## 🧪 Testing

```bash
# Run E2E tests
npm run test:e2e

# Run tests in UI mode
npm run test:ui
```

## 🚢 Deployment

This project uses GitHub Actions for automatic deployment to GitHub Pages.

**Deployment URL**: `https://hongluu92.github.io/book-tts/`

### GitHub Actions Setup

For Firebase sync to work in production, add these secrets to your GitHub repository:

1. Go to **Settings** > **Secrets and variables** > **Actions**
2. Add the following secrets:
   - `FIREBASE_API_KEY`
   - `FIREBASE_AUTH_DOMAIN`
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_STORAGE_BUCKET`
   - `FIREBASE_MESSAGING_SENDER_ID`
   - `FIREBASE_APP_ID`

See [docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md) for detailed instructions.

### Manual Deployment

Push to `main` branch to trigger automatic deployment.

## ⚙️ Configuration

### Environment Variables

Create a `.env.local` file in the project root:

```env
# Firebase Configuration (for sync features)
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123

# Optional: API URL (if you have a backend)
NEXT_PUBLIC_API_URL=https://your-api-url.com/api
```

### Firebase Setup

Firebase sync is **optional**. The app works offline-first without Firebase.

To enable sync features:

1. **Check configuration**: `npm run check:firebase`
2. **Follow setup guide**: See [docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md)
3. **Add secrets to GitHub**: For CI/CD, add Firebase secrets to GitHub repository

**Quick Setup**:
- Copy `.env.local.example` to `.env.local`
- Fill in your Firebase project values
- Run `npm run check:firebase` to verify

## 🛠️ Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **EPUB Parsing**: epub.js
- **Storage**: IndexedDB (Dexie)
- **Sync**: Firebase (Firestore, Auth, Storage)
- **Testing**: Playwright

## 📄 License

MIT

---

**Last Updated**: 2025-01-24
