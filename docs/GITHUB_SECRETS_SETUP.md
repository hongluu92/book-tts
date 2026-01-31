# Hướng dẫn thiết lập Firebase Secrets cho GitHub Actions

Hướng dẫn này sẽ giúp bạn thêm Firebase configuration vào GitHub Secrets để build và deploy tự động.

## Bước 1: Lấy Firebase Configuration

1. Truy cập [Firebase Console](https://console.firebase.google.com/)
2. Chọn project của bạn
3. Vào **Project Settings** (biểu tượng bánh răng ⚙️)
4. Scroll xuống phần **Your apps**
5. Nếu chưa có web app, click **Web** (`</>`) để thêm
6. Copy các giá trị trong `firebaseConfig`:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",                    // NEXT_PUBLIC_FIREBASE_API_KEY
  authDomain: "project.firebaseapp.com", // NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
  projectId: "your-project-id",          // NEXT_PUBLIC_FIREBASE_PROJECT_ID
  storageBucket: "project.appspot.com",  // NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
  messagingSenderId: "123456789",        // NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
  appId: "1:123456789:web:abc123"        // NEXT_PUBLIC_FIREBASE_APP_ID
}
```

## Bước 2: Thêm Secrets vào GitHub Repository

### Cách 1: Qua GitHub Web Interface (Khuyến nghị)

1. **Truy cập repository trên GitHub**
   - Vào repository: `https://github.com/your-username/book-tts`

2. **Vào Settings**
   - Click tab **Settings** ở trên cùng repository

3. **Vào Secrets and variables**
   - Trong menu bên trái, click **Secrets and variables** > **Actions**

4. **Thêm từng Secret**
   - Click nút **New repository secret**
   - Thêm từng secret sau với giá trị tương ứng:

#### Secret 1: `FIREBASE_API_KEY`
- **Name**: `FIREBASE_API_KEY`
- **Value**: Giá trị `apiKey` từ firebaseConfig (ví dụ: `AIzaSy...`)
- Click **Add secret**

#### Secret 2: `FIREBASE_AUTH_DOMAIN`
- **Name**: `FIREBASE_AUTH_DOMAIN`
- **Value**: Giá trị `authDomain` từ firebaseConfig (ví dụ: `project.firebaseapp.com`)
- Click **Add secret**

#### Secret 3: `FIREBASE_PROJECT_ID`
- **Name**: `FIREBASE_PROJECT_ID`
- **Value**: Giá trị `projectId` từ firebaseConfig (ví dụ: `your-project-id`)
- Click **Add secret**

#### Secret 4: `FIREBASE_STORAGE_BUCKET`
- **Name**: `FIREBASE_STORAGE_BUCKET`
- **Value**: Giá trị `storageBucket` từ firebaseConfig (ví dụ: `project.appspot.com`)
- Click **Add secret**

#### Secret 5: `FIREBASE_MESSAGING_SENDER_ID`
- **Name**: `FIREBASE_MESSAGING_SENDER_ID`
- **Value**: Giá trị `messagingSenderId` từ firebaseConfig (ví dụ: `123456789`)
- Click **Add secret**

#### Secret 6: `FIREBASE_APP_ID`
- **Name**: `FIREBASE_APP_ID`
- **Value**: Giá trị `appId` từ firebaseConfig (ví dụ: `1:123456789:web:abc123`)
- Click **Add secret**

### Cách 2: Qua GitHub CLI (Nếu bạn dùng CLI)

```bash
# Cài đặt GitHub CLI nếu chưa có
# https://cli.github.com/

# Đăng nhập
gh auth login

# Thêm từng secret
gh secret set FIREBASE_API_KEY --body "AIzaSy..."
gh secret set FIREBASE_AUTH_DOMAIN --body "project.firebaseapp.com"
gh secret set FIREBASE_PROJECT_ID --body "your-project-id"
gh secret set FIREBASE_STORAGE_BUCKET --body "project.appspot.com"
gh secret set FIREBASE_MESSAGING_SENDER_ID --body "123456789"
gh secret set FIREBASE_APP_ID --body "1:123456789:web:abc123"
```

## Bước 3: Kiểm tra Secrets đã được thêm

1. Vào **Settings** > **Secrets and variables** > **Actions**
2. Bạn sẽ thấy danh sách 6 secrets:
   - ✅ `FIREBASE_API_KEY`
   - ✅ `FIREBASE_AUTH_DOMAIN`
   - ✅ `FIREBASE_PROJECT_ID`
   - ✅ `FIREBASE_STORAGE_BUCKET`
   - ✅ `FIREBASE_MESSAGING_SENDER_ID`
   - ✅ `FIREBASE_APP_ID`

## Bước 4: Test Build

1. **Push code lên GitHub** (nếu chưa push)
   ```bash
   git add .
   git commit -m "Add Firebase configuration"
   git push origin main
   ```

2. **Kiểm tra GitHub Actions**
   - Vào tab **Actions** trên GitHub repository
   - Bạn sẽ thấy workflow "Deploy to GitHub Pages" chạy
   - Build sẽ sử dụng Firebase secrets và không còn lỗi "Firebase is not initialized"

## Lưu ý quan trọng

### 🔒 Bảo mật
- **KHÔNG** commit Firebase config vào code
- **KHÔNG** chia sẻ secrets công khai
- Secrets chỉ hiển thị dạng `***` trong GitHub UI
- Chỉ người có quyền admin repository mới xem được secrets

### 🔄 Cập nhật Secrets
- Nếu thay đổi Firebase project, cần cập nhật lại tất cả secrets
- Vào **Settings** > **Secrets and variables** > **Actions**
- Click vào secret cần sửa > **Update** > Nhập giá trị mới

### ❌ Xóa Secrets
- Nếu muốn xóa secret: Click vào secret > **Delete**
- **CẢNH BÁO**: Xóa secrets sẽ làm build fail nếu workflow đang sử dụng

## Troubleshooting

### Lỗi: "Firebase is not initialized"
- ✅ Kiểm tra tất cả 6 secrets đã được thêm chưa
- ✅ Kiểm tra giá trị secrets có đúng không (copy từ Firebase Console)
- ✅ Kiểm tra workflow file có sử dụng đúng tên secrets không

### Lỗi: "Missing or insufficient permissions"
- ✅ Kiểm tra Firestore Security Rules đã được cấu hình (xem `docs/FIRESTORE_RULES.md`)
- ✅ Kiểm tra Authentication đã được enable chưa

### Build vẫn fail
- ✅ Kiểm tra logs trong GitHub Actions để xem lỗi cụ thể
- ✅ Đảm bảo tất cả secrets có giá trị (không để trống)
- ✅ Kiểm tra format của secrets (không có khoảng trắng thừa)

## Tóm tắt nhanh

1. Lấy Firebase config từ Firebase Console
2. Vào GitHub Repository > Settings > Secrets and variables > Actions
3. Thêm 6 secrets với tên và giá trị tương ứng
4. Push code và kiểm tra build

Sau khi hoàn thành, build trên GitHub Actions sẽ tự động sử dụng Firebase config và app sẽ có đầy đủ tính năng sync!
