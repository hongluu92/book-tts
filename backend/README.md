# EPUB Reader Backend

Backend API for EPUB Reader with sentence-level TTS support.

## Tech Stack

- **Framework**: NestJS + TypeScript
- **Database**: PostgreSQL + Prisma ORM
- **Auth**: JWT (access token + refresh token)
- **Password Hashing**: Argon2

## Setup

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- npm hoặc yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Setup environment variables:
```bash
cp .env.example .env
# Edit .env with your database URL and JWT secrets
```

3. Setup database:
```bash
# Generate Prisma Client
npm run prisma:generate

# Run migrations
npm run prisma:migrate
```

4. Start development server:
```bash
npm run start:dev
```

Server will run on `http://localhost:3001/api`

## API Endpoints

### Auth

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user (requires JWT)

## Testing

```bash
# Unit tests
npm test

# E2E tests
npm run test:e2e

# Coverage
npm run test:cov
```

## Project Structure

```
backend/
├── src/
│   ├── auth/           # Auth module (register, login, JWT)
│   ├── common/         # Shared guards, decorators
│   ├── prisma/         # Prisma service
│   └── main.ts         # Application entry point
├── prisma/
│   └── schema.prisma   # Database schema
└── test/               # E2E tests
```

## Milestone 1 Status

✅ Project Setup
✅ Database Schema
✅ Auth Module
✅ Ownership Guard
✅ Testing
