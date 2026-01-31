# Firebase Setup Guide

Hướng dẫn cấu hình Firebase cho ứng dụng và GitHub Actions.

## 1. Tạo Firebase Project

1. Truy cập [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" hoặc chọn project có sẵn
3. Điền tên project và làm theo hướng dẫn

## 2. Lấy Firebase Configuration

1. Vào **Project Settings** (biểu tượng bánh răng)
2. Scroll xuống phần **Your apps**
3. Click **Web** (biểu tượng `</>`) để thêm web app
4. Điền tên app và click **Register app**
5. Copy các giá trị trong `firebaseConfig`:

```javascript
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
}
```

## 3. Enable Authentication

1. Vào **Authentication** > **Sign-in method**
2. Enable **Email/Password**
3. Enable **Google** (nếu muốn dùng Google Sign-In)
   - Cần cấu hình OAuth consent screen trong Google Cloud Console

## 4. Tạo Firestore Database

1. Vào **Firestore Database**
2. Click **Create database**
3. Chọn **Start in test mode** (hoặc production mode với rules phù hợp)
4. Chọn location gần nhất

## 5. Cấu hình Firestore Security Rules

**⚠️ QUAN TRỌNG**: Phải cấu hình Rules này để tránh lỗi "Missing or insufficient permissions"

### Cách nhanh:

1. Vào **Firestore Database** > **Rules** trong Firebase Console
2. Copy và paste rules sau:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only read/write their own data
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      
      // Books subcollection
      match /books/{bookId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```

3. Click **Publish**

### Hướng dẫn chi tiết:

Xem file [docs/FIRESTORE_RULES.md](FIRESTORE_RULES.md) để biết:
- Giải thích chi tiết từng rule
- Cách debug rules
- Best practices cho production
- Troubleshooting

## 6. Cấu hình Local Development

Tạo file `.env.local` trong thư mục root:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key_here
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123
```

**Lưu ý**: File `.env.local` đã được gitignore, không commit lên repository.

## 7. Cấu hình GitHub Actions Secrets

Để deploy với Firebase config, cần thêm secrets vào GitHub repository:

### Cách thêm Secrets:

1. Vào GitHub repository
2. Click **Settings** > **Secrets and variables** > **Actions**
3. Click **New repository secret**
4. Thêm từng secret sau:

| Secret Name | Value | Mô tả |
|------------|-------|-------|
| `FIREBASE_API_KEY` | `AIza...` | Firebase API Key |
| `FIREBASE_AUTH_DOMAIN` | `your-project.firebaseapp.com` | Auth Domain |
| `FIREBASE_PROJECT_ID` | `your-project-id` | Project ID |
| `FIREBASE_STORAGE_BUCKET` | `your-project.appspot.com` | Storage Bucket |
| `FIREBASE_MESSAGING_SENDER_ID` | `123456789` | Messaging Sender ID |
| `FIREBASE_APP_ID` | `1:123456789:web:abc123` | App ID |

### Thêm Secrets bằng GitHub CLI (nếu có):

```bash
gh secret set FIREBASE_API_KEY --body "your_api_key"
gh secret set FIREBASE_AUTH_DOMAIN --body "your-project.firebaseapp.com"
gh secret set FIREBASE_PROJECT_ID --body "your-project-id"
gh secret set FIREBASE_STORAGE_BUCKET --body "your-project.appspot.com"
gh secret set FIREBASE_MESSAGING_SENDER_ID --body "123456789"
gh secret set FIREBASE_APP_ID --body "1:123456789:web:abc123"
```

## 8. Verify Setup

Sau khi cấu hình xong:

1. **Local**: Chạy `npm run dev` và kiểm tra console không có lỗi Firebase
2. **GitHub Actions**: Push code lên và kiểm tra workflow build thành công
3. **App**: Thử đăng ký/đăng nhập trong app để verify authentication

## 9. Troubleshooting

### Lỗi "Firebase config is missing"
- Kiểm tra file `.env.local` có đầy đủ biến môi trường
- Đảm bảo tên biến bắt đầu với `NEXT_PUBLIC_`
- Restart dev server sau khi thêm biến môi trường

### Lỗi "Permission denied" trong Firestore
- Kiểm tra Security Rules đã được cấu hình đúng
- Đảm bảo user đã đăng nhập (`request.auth != null`)

### Lỗi "Auth domain not authorized"
- Vào Firebase Console > Authentication > Settings
- Thêm domain vào **Authorized domains**

### GitHub Actions build fails
- Kiểm tra tất cả secrets đã được thêm vào repository
- Kiểm tra tên secrets chính xác (case-sensitive)
- Xem logs trong GitHub Actions để biết secret nào bị thiếu

## 10. Security Best Practices

1. **Không commit** `.env.local` hoặc file chứa credentials
2. **Sử dụng Secrets** cho production config
3. **Giới hạn Firestore Rules** để chỉ user có thể đọc/ghi data của mình
4. **Enable App Check** (optional) để bảo vệ API khỏi abuse
5. **Regular audit** Firestore rules và security settings

## 11. Optional: Firebase Storage (cho Book Covers)

Nếu muốn sync book covers qua Firebase Storage:

1. Vào **Storage** trong Firebase Console
2. Click **Get started**
3. Chọn **Start in test mode** hoặc cấu hình rules
4. Storage rules:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /users/{userId}/covers/{bookFingerprint} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```
