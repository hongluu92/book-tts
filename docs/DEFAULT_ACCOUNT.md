# Tài Khoản Mặc Định

## 📋 Thông Tin Tài Khoản

Project **không có tài khoản mặc định** sẵn có. Bạn cần:

1. **Đăng ký tài khoản mới** qua API hoặc frontend
2. **Hoặc chạy seed script** để tạo tài khoản mặc định

## 🌱 Tạo Tài Khoản Mặc Định (Seed)

### Cách 1: Chạy Seed Script

```bash
cd backend
npm run prisma:seed
```

Script sẽ tạo tài khoản mặc định:
- **Email**: `admin@example.com`
- **Password**: `admin123`

### Cách 2: Đăng Ký Qua API

```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your-email@example.com",
    "password": "your-password"
  }'
```

### Cách 3: Đăng Ký Qua Frontend

1. Mở `http://localhost:3000/register`
2. Nhập email và password
3. Click "Register"

## ⚠️ Lưu Ý Bảo Mật

**QUAN TRỌNG**: Nếu sử dụng tài khoản mặc định từ seed script:
- ⚠️ **Đổi mật khẩu ngay** sau lần đăng nhập đầu tiên
- ⚠️ **Không sử dụng** trong môi trường production
- ⚠️ **Xóa tài khoản mặc định** nếu không cần thiết

## 🔧 Tùy Chỉnh Seed Script

Bạn có thể chỉnh sửa file `backend/prisma/seed.ts` để:
- Thay đổi email/password mặc định
- Tạo nhiều tài khoản
- Thêm dữ liệu mẫu (books, chapters, etc.)

```typescript
// backend/prisma/seed.ts
const defaultEmail = 'your-email@example.com';
const defaultPassword = 'your-password';
```

## 📝 Ví Dụ Sử Dụng

### 1. Chạy Seed để tạo tài khoản mặc định

```bash
cd backend
npm run prisma:seed
```

Output:
```
🌱 Seeding database...
✅ Created default user:
   Email: admin@example.com
   Password: admin123
   ID: abc123-def456-...
⚠️  IMPORTANT: Change the default password after first login!
```

### 2. Đăng nhập với tài khoản mặc định

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "admin123"
  }'
```

Response:
```json
{
  "user": {
    "id": "abc123-def456-...",
    "email": "admin@example.com",
    "createdAt": "2024-01-22T..."
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### 3. Sử dụng token để truy cập API

```bash
curl http://localhost:3001/api/books \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

## 🎯 Tóm Tắt

| Phương Pháp | Email | Password | Khi Nào Dùng |
|------------|-------|----------|--------------|
| Seed Script | `admin@example.com` | `admin123` | Development/Testing |
| API Register | Tùy chọn | Tùy chọn | Production |
| Frontend Register | Tùy chọn | Tùy chọn | Production |

---

**Last Updated**: [Current Date]
**Status**: ✅ Seed script available
