# Book TTS - EPUB Reader with Text-to-Speech

A modern web application for reading EPUB files with built-in text-to-speech capabilities.

## ✅ Features

- 📖 **EPUB Reader**: Read EPUB files with customizable font, size, and theme
- 🎙️ **TTS Controls**: Text-to-speech with play/pause, speed control, and chapter navigation
- 🌙 **Dark Mode**: Eye-friendly reading experience
- 📱 **Responsive Design**: Works on desktop and mobile devices
- 🔧 **PWA Support**: Install as a standalone app

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

### Manual Deployment

Push to `develop` branch to trigger automatic deployment.

## ⚙️ Configuration

Environment variables:

```env
# .env.local
NEXT_PUBLIC_API_URL=https://your-api-url.com/api
```

## 🛠️ Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **EPUB Parsing**: epub.js
- **Storage**: IndexedDB (Dexie)
- **Testing**: Playwright

## 📄 License

MIT

---

**Last Updated**: 2025-01-24
