# Hướng Dẫn Chạy Project

## ✅ Trạng Thái

- ✅ Backend build thành công
- ✅ Frontend build thành công
- ✅ Dependencies đã được cài đặt
- ✅ Environment variables đã được tạo

## 🚀 Chạy Project

### 1. Setup Database (PostgreSQL)

**Quan trọng**: Cần có PostgreSQL database đang chạy.

```bash
# Kiểm tra PostgreSQL
psql --version

# Tạo database (nếu chưa có)
createdb epub_reader

# Hoặc sử dụng PostgreSQL client
psql -U postgres
CREATE DATABASE epub_reader;
```

### 2. Cấu Hình Environment Variables

#### Backend (.env)
File đã được tạo tại `backend/.env`:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/epub_reader?schema=public"
JWT_SECRET="your-super-secret-jwt-key-change-in-production"
JWT_EXPIRES_IN="7d"
JWT_REFRESH_SECRET="your-super-secret-refresh-key-change-in-production"
JWT_REFRESH_EXPIRES_IN="30d"
PORT=3001
FRONTEND_URL="http://localhost:3000"
DATA_DIR="./data"
```

**Cần chỉnh sửa**:
- `DATABASE_URL`: Thay đổi user, password, và database name theo cấu hình của bạn

#### Frontend (.env.local)
File đã được tạo tại `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

### 3. Setup Database Schema

```bash
cd backend

# Generate Prisma Client
npm run prisma:generate

# Run migrations
npm run prisma:migrate
```

### 4. Chạy Backend

```bash
cd backend
npm run start:dev
```

Backend sẽ chạy tại: `http://localhost:3001/api`

### 5. Chạy Frontend

Mở terminal mới:

```bash
cd frontend
npm run dev
```

Frontend sẽ chạy tại: `http://localhost:3000`

## 📋 Kiểm Tra

### Backend Health Check

```bash
# Test API
curl http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

### Frontend

Mở browser và truy cập: `http://localhost:3000`

## 🧪 Chạy Tests

### Backend Tests

```bash
cd backend

# Unit tests
npm test

# E2E tests (cần database)
npm run test:e2e

# Coverage
npm run test:cov
```

## ⚠️ Lưu Ý

1. **Database**: Cần PostgreSQL đang chạy và database đã được tạo
2. **Ports**: 
   - Backend: 3001
   - Frontend: 3000
3. **Data Directory**: Backend sẽ tạo `data/epubs/` để lưu EPUB files
4. **JWT Secret**: Nên thay đổi JWT_SECRET trong production

## 🔧 Troubleshooting

### Backend không start

1. Kiểm tra PostgreSQL đang chạy:
   ```bash
   pg_isready
   ```

2. Kiểm tra DATABASE_URL trong `.env`

3. Kiểm tra Prisma migrations:
   ```bash
   cd backend
   npm run prisma:migrate
   ```

### Frontend không kết nối được backend

1. Kiểm tra `NEXT_PUBLIC_API_URL` trong `.env.local`
2. Kiểm tra backend đang chạy tại port 3001
3. Kiểm tra CORS settings trong backend

### Database connection error

1. Kiểm tra PostgreSQL service:
   ```bash
   # macOS
   brew services list
   
   # Linux
   sudo systemctl status postgresql
   ```

2. Kiểm tra database exists:
   ```bash
   psql -l | grep epub_reader
   ```

## 📝 Next Steps

1. ✅ Setup database
2. ✅ Run migrations
3. ✅ Start backend
4. ✅ Start frontend
5. ✅ Test registration/login
6. ✅ Upload EPUB file
7. ✅ Test reader

---

**Last Updated**: [Current Date]
**Status**: ✅ Ready to run (cần database setup)
