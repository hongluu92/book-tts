# Cơ Chế Phát Câu TTS - Giải Thích và Xử Lý Ngắt Quãng

## Tổng Quan

Hệ thống TTS phát từng câu một cách tuần tự. Khi một câu kết thúc, câu tiếp theo tự động được phát.

## Luồng Hoạt Động

### 1. Khởi Tạo Phát Câu (`playSentence`)

**File:** `src/hooks/useTts.ts`

```typescript
playSentence(index: number, isRetry: boolean = false)
```

**Các bước:**

1. **Kiểm tra và làm sạch text:**
   - Kiểm tra câu có rỗng không
   - Nếu rỗng → bỏ qua và chuyển sang câu tiếp theo

2. **Hủy phát hiện tại (Cancel):**
   ```typescript
   // Dòng 227-231
   if (usePiper && engineManager) {
     engineManager.cancel()
   } else if (engineRef.current) {
     engineRef.current.cancel()
   }
   ```

3. **Đợi sau khi cancel:**
   ```typescript
   // Dòng 234 - Delay 50ms
   await new Promise(resolve => setTimeout(resolve, 50))
   ```
   ⚠️ **VẤN ĐỀ:** 50ms có thể không đủ trên Windows Chrome

4. **Phát câu mới:**
   - Gọi `engine.speak(text, options)`
   - Options bao gồm:
     - `onStart`: Khi bắt đầu phát
     - `onEnd`: Khi kết thúc phát
     - `onError`: Khi có lỗi

5. **Theo dõi trạng thái:**
   - `speechStarted`: Đánh dấu đã bắt đầu phát
   - Timeout 2 giây để phát hiện nếu `onStart` không fire

### 2. Tự Động Phát Câu Tiếp Theo

**Khi câu kết thúc (`onEnd` callback):**

```typescript
// Dòng 150-176
utterance.onend = () => {
  // Chỉ phát câu tiếp theo nếu:
  // 1. Vẫn đang play (isPlayingRef.current === true)
  // 2. Speech đã thực sự bắt đầu (speechStarted === true)
  // 3. Chưa phải câu cuối cùng
  
  if (isPlayingRef.current && speechStarted && index < sentences.length - 1) {
    playSentence(index + 1) // Phát câu tiếp theo
  }
}
```

### 3. Xử Lý Lỗi và Retry

**Khi `onStart` không fire (timeout 2 giây):**

```typescript
// Dòng 238-279
startTimeout = setTimeout(() => {
  if (!speechStarted && isPlayingRef.current) {
    if (!isRetry) {
      // Thử lại 1 lần
      playSentence(index, true) // Retry với isRetry = true
    } else {
      // Nếu retry cũng fail → bỏ qua câu này, chuyển sang câu tiếp
      playSentence(index + 1, false)
    }
  }
}, 2000)
```

## Nguyên Nhân Ngắt Quãng

### 1. **Delay Sau Cancel Không Đủ (Windows)**

**Vấn đề:**
- Windows Chrome có bug với `speechSynthesis.cancel()`
- Cần thời gian để xử lý cancel trước khi phát câu mới
- Delay hiện tại: **50ms** - có thể không đủ

**Triệu chứng:**
- Câu bị cắt ngắn
- Câu tiếp theo không phát
- Có khoảng im lặng giữa các câu

**Giải pháp:**
- Tăng delay lên **100-150ms** trên Windows
- Kiểm tra `speechSynthesis.speaking === false` trước khi phát

### 2. **Race Condition Giữa Cancel và Speak**

**Vấn đề:**
- `cancel()` được gọi ngay trước `speak()`
- Trên một số trình duyệt, cancel chưa kịp xử lý xong
- Câu mới bị hủy ngay sau khi bắt đầu

**Triệu chứng:**
- Câu bắt đầu phát nhưng bị dừng ngay
- Chỉ nghe được vài từ đầu

**Giải pháp:**
- Đợi `speechSynthesis.speaking === false` sau khi cancel
- Thêm retry mechanism với exponential backoff

### 3. **onStart Callback Không Fire (Browser Bug)**

**Vấn đề:**
- Một số trình duyệt (đặc biệt Windows Chrome) không fire `onStart` đáng tin cậy
- Code hiện có timeout 2 giây để phát hiện, nhưng có thể không đủ

**Triệu chứng:**
- Câu không phát nhưng `onEnd` vẫn fire
- `speechStarted` vẫn là `false` → không chuyển sang câu tiếp

**Giải pháp:**
- Tăng timeout detection lên 3-4 giây
- Fallback: Giả định đã bắt đầu nếu `onEnd` fire mà `onStart` chưa fire

### 4. **Queueing Trong SpeechSynthesis**

**Vấn đề:**
- `speechSynthesis` có thể queue nhiều utterance
- Nếu cancel không kịp, câu cũ vẫn trong queue
- Câu mới bị delay hoặc không phát

**Triệu chứng:**
- Có khoảng im lặng dài giữa các câu
- Câu phát không đúng thứ tự

**Giải pháp:**
- Luôn check `speechSynthesis.speaking` trước khi phát
- Clear queue bằng cách cancel nhiều lần nếu cần

### 5. **Windows-Specific Bug**

**Vấn đề:**
- Windows Chrome có bug với `speechSynthesis.speaking`
- Property này có thể không update đúng
- Utterance có thể bị "stuck"

**Triệu chứng:**
- TTS dừng hoàn toàn sau vài câu
- Cần refresh trang để hoạt động lại

**Giải pháp:**
- Code đã có detection (dòng 213-226 trong `browser-speech-engine.ts`)
- Có thể cần thêm recovery mechanism

## Các Cải Tiến Đề Xuất

### 1. Tăng Delay Sau Cancel (Windows)

```typescript
// Trong useTts.ts, dòng 234
const delay = typeof window !== 'undefined' && 
              navigator.userAgent.includes('Windows') ? 150 : 50
await new Promise(resolve => setTimeout(resolve, delay))
```

### 2. Đợi SpeechSynthesis Sẵn Sàng

```typescript
// Sau khi cancel, đợi cho đến khi speaking === false
const waitForReady = async () => {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return
  }
  
  let attempts = 0
  while (speechSynthesis.speaking && attempts < 10) {
    await new Promise(resolve => setTimeout(resolve, 50))
    attempts++
  }
}

await waitForReady()
```

### 3. Cải Thiện Retry Logic

```typescript
// Thêm exponential backoff cho retry
const retryDelay = isRetry ? 200 : 100
setTimeout(() => {
  playSentence(index, true)
}, retryDelay)
```

### 4. Fallback Cho onStart

```typescript
// Trong onEnd callback
if (!speechStarted && !endFired) {
  // onStart chưa fire nhưng onEnd đã fire
  // Giả định đã bắt đầu và kết thúc
  speechStarted = true
  options.onStart?.()
  options.onEnd?.()
}
```

## Debugging

### Console Logs

Code đã có nhiều console logs:
- `[useTts]` - Logs từ useTts hook
- `[BrowserSpeechEngine]` - Logs từ browser engine
- `[TtsEngineManager]` - Logs từ engine manager

### Kiểm Tra Trạng Thái

Mở DevTools Console và theo dõi:
1. `speechSynthesis.speaking` - Có đang phát không?
2. `speechSynthesis.pending` - Có utterance đang chờ không?
3. `speechSynthesis.paused` - Có bị pause không?

### Test Cases

1. **Phát liên tục nhiều câu ngắn:**
   - Nếu bị ngắt → vấn đề với delay/cancel

2. **Phát câu dài:**
   - Nếu bị cắt giữa chừng → vấn đề với onEnd/onStart

3. **Thay đổi rate trong khi phát:**
   - Nếu bị ngắt → vấn đề với restart logic (dòng 452-472)

## Kết Luận

Cơ chế phát câu hoạt động theo nguyên tắc:
1. Phát từng câu một
2. Khi câu kết thúc → tự động phát câu tiếp
3. Có retry mechanism khi lỗi

**Nguyên nhân ngắt quãng chủ yếu:**
- Delay sau cancel không đủ (đặc biệt Windows)
- Race condition giữa cancel và speak
- Browser bugs với onStart callback

**Giải pháp ưu tiên:**
1. Tăng delay sau cancel trên Windows
2. Đợi `speechSynthesis.speaking === false` trước khi phát
3. Cải thiện retry logic với backoff
