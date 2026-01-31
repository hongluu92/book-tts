# Firestore Security Rules

Hướng dẫn cấu hình Firestore Security Rules cho ứng dụng.

## Cấu trúc dữ liệu

```
users/{userId}/
  ├── metadata (email, createdAt, syncMetadata)
  ├── settings (fontSize, fontFamily, theme)
  └── books/{bookFingerprint}/
      ├── metadata (title, author, fileName, etc.)
      ├── progress (chapterId, sentenceIndex, etc.)
      └── bookmarks (array of bookmarks)
```

## Security Rules

Copy và paste rules sau vào Firebase Console > Firestore Database > Rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only access their own data
    match /users/{userId} {
      // Allow read/write if user is authenticated and accessing their own data
      allow read, write: if request.auth != null && request.auth.uid == userId;
      
      // Settings subdocument
      match /settings {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
      
      // Books subcollection
      match /books/{bookId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
        
        // All fields in books are accessible if user owns the parent document
        // No need for additional rules here
      }
    }
  }
}
```

## Cách cấu hình

### Bước 1: Vào Firestore Rules

1. Mở [Firebase Console](https://console.firebase.google.com/)
2. Chọn project của bạn
3. Vào **Firestore Database** (menu bên trái)
4. Click tab **Rules**

### Bước 2: Paste Rules

1. Xóa toàn bộ rules cũ (nếu có)
2. Copy rules ở trên
3. Paste vào editor
4. Click **Publish**

### Bước 3: Verify

Sau khi publish, rules sẽ có hiệu lực ngay lập tức. Thử lại app để verify.

## Rules giải thích

- `request.auth != null`: User phải đã đăng nhập
- `request.auth.uid == userId`: User chỉ có thể truy cập data của chính mình
- `allow read, write`: Cho phép đọc và ghi

## Test Mode (Development)

Nếu đang trong giai đoạn development và muốn test nhanh, có thể dùng test mode:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.time < timestamp.date(2025, 12, 31);
    }
  }
}
```

**⚠️ CẢNH BÁO**: Test mode cho phép bất kỳ ai đọc/ghi data trong 30 ngày. Chỉ dùng cho development, không dùng cho production!

## Troubleshooting

### Lỗi "Missing or insufficient permissions"

1. **Kiểm tra user đã đăng nhập chưa**:
   - Rules yêu cầu `request.auth != null`
   - Đảm bảo user đã sign in trước khi truy cập Firestore

2. **Kiểm tra userId khớp không**:
   - Rules yêu cầu `request.auth.uid == userId`
   - Đảm bảo đang truy cập đúng user document của mình

3. **Kiểm tra rules đã publish chưa**:
   - Rules chỉ có hiệu lực sau khi click "Publish"
   - Có thể mất vài giây để propagate

4. **Kiểm tra Firestore đã được tạo chưa**:
   - Vào Firestore Database
   - Nếu chưa có database, click "Create database"
   - Chọn "Start in test mode" hoặc "Start in production mode"

### Debug Rules

Firebase Console có Rules Playground để test rules:

1. Vào Firestore > Rules
2. Click "Rules Playground" (góc trên bên phải)
3. Chọn operation (read/write)
4. Nhập path: `users/{userId}` hoặc `users/{userId}/books/{bookId}`
5. Chọn authentication (authenticated user với uid cụ thể)
6. Click "Run" để test

## Production Best Practices

1. **Luôn yêu cầu authentication**: `request.auth != null`
2. **Validate user ownership**: `request.auth.uid == userId`
3. **Validate data structure**: Kiểm tra fields có đúng format không
4. **Rate limiting**: Có thể thêm rules để giới hạn số lần write
5. **Audit logs**: Enable Firestore audit logs để track access

## Ví dụ Rules nâng cao

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      
      // Validate syncMetadata structure
      match /syncMetadata {
        allow read, write: if request.auth != null && request.auth.uid == userId
          && request.resource.data.keys().hasAll(['lastSyncAtMs', 'lastLocalChangeAtMs'])
          && request.resource.data.lastSyncAtMs is number
          && request.resource.data.lastLocalChangeAtMs is number;
      }
      
      match /books/{bookId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
        
        // Validate metadata structure
        match /metadata {
          allow read, write: if request.auth != null && request.auth.uid == userId
            && request.resource.data.keys().hasAll(['title', 'fileName', 'fileSize', 'addedAtMs', 'updatedAtMs']);
        }
      }
    }
  }
}
```
