# Cơ Chế Preload Audio cho TTS - Giảm Khoảng Im Lặng

## Tổng Quan

Để giảm khoảng im lặng giữa các câu, hệ thống sẽ **pre-generate audio buffer** cho câu tiếp theo trong khi đang phát câu hiện tại. Khi câu hiện tại kết thúc, câu tiếp theo có thể phát ngay lập tức mà không cần đợi generate audio.

## Cách Hoạt Động

### 1. Khi Câu Bắt Đầu Phát (`onStart`)

**File:** `src/hooks/useTts.ts` (dòng 131-175)

Khi một câu bắt đầu phát (`onStart` callback được fire), hệ thống sẽ:

1. **Cập nhật trạng thái:** Set `currentSentenceIndex`, `isPlaying`, etc.
2. **Preload câu tiếp theo:** Nếu có câu tiếp theo, gọi `preloadNext()` trong background

```typescript
onStart: () => {
  // ... update state ...
  
  // Preload next sentence in background
  if (index < sentences.length - 1) {
    const nextSentence = sentences[index + 1]
    if (nextSentence && nextSentence.text.trim()) {
      engineManager.preloadNext(nextSentence.text.trim(), detectedLang, options)
    }
  }
}
```

### 2. Preload Audio (Piper WASM)

**File:** `src/lib/tts/piper-wasm-engine.ts` (dòng 168-196)

Với Piper WASM engine:

1. **Generate audio buffer:** Gọi `session.predict(text)` để tạo audio blob
2. **Decode audio:** Convert blob thành `AudioBuffer`
3. **Lưu buffer:** Lưu vào `nextBuffer` và text vào `nextText`

```typescript
async preloadNext(text: string, options: TtsOptions): Promise<void> {
  // Normalize text
  const normalizedText = text.trim()
  
  // Generate audio in background
  const blob = await this.session.predict(normalizedText)
  const arrayBuffer = await blob.arrayBuffer()
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
  
  // Store for later use
  this.nextBuffer = audioBuffer
  this.nextText = normalizedText
}
```

### 3. Sử Dụng Preloaded Audio

**File:** `src/lib/tts/piper-wasm-engine.ts` (dòng 108-166)

Khi `speak()` được gọi cho câu tiếp theo:

1. **Check preloaded buffer:** So sánh text hiện tại với `nextText`
2. **Nếu match:** Sử dụng `nextBuffer` đã có sẵn
3. **Nếu không match:** Generate audio mới như bình thường

```typescript
async speak(text: string, options: TtsOptions): Promise<void> {
  const normalizedText = text.trim()
  
  // Check if we have preloaded audio for this text
  if (this.nextBuffer && this.nextText && this.nextText.trim() === normalizedText) {
    // Use preloaded buffer - NO WAITING!
    audioBuffer = this.nextBuffer
    this.nextBuffer = null
    this.nextText = null
  } else {
    // Generate new audio (normal flow)
    const blob = await this.session.predict(normalizedText)
    // ... decode ...
  }
  
  // Play immediately
  source.buffer = audioBuffer
  source.start(0)
}
```

## Lợi Ích

### 1. **Giảm Khoảng Im Lặng**

- **Trước:** Câu kết thúc → Đợi generate audio → Phát (có delay)
- **Sau:** Câu kết thúc → Phát ngay (audio đã sẵn sàng)

### 2. **Trải Nghiệm Mượt Mà Hơn**

- Các câu phát liên tục không bị ngắt quãng
- Đặc biệt hữu ích với câu ngắn (generate time có thể > playback time)

### 3. **Tận Dụng Thời Gian**

- Generate audio trong background trong khi đang phát câu hiện tại
- Không block UI thread

## Hạn Chế

### 1. **Chỉ Hoạt Động Với Piper WASM**

- **Browser Speech Synthesis:** Không hỗ trợ pre-generate audio
- **Piper WASM:** Có thể generate và lưu `AudioBuffer`

### 2. **Memory Usage**

- Mỗi preloaded buffer chiếm memory
- Tự động clear khi sử dụng hoặc khi cancel

### 3. **Text Matching**

- Text phải match chính xác (sau khi normalize)
- Nếu text thay đổi (do rate/voice change), sẽ generate lại

## Edge Cases

### 1. **Rate Thay Đổi**

- Preloaded buffer vẫn OK
- Rate được apply khi tạo `AudioBufferSourceNode`, không phải khi generate buffer
- Chỉ cần set `source.playbackRate.value = options.rate`

### 2. **Voice Thay Đổi**

- Nếu voice thay đổi, preloaded buffer sẽ không match
- Sẽ generate lại với voice mới

### 3. **Cancel/Pause**

- Preloaded buffer được giữ lại (không bị clear)
- Có thể sử dụng khi resume

### 4. **Empty/Invalid Text**

- Không preload nếu text rỗng
- Preload failure không break playback (catch và log warning)

## Debugging

### Console Logs

- `[PiperWasmEngine] Preloaded audio for: ...` - Khi preload thành công
- `[PiperWasmEngine] Using preloaded audio for: ...` - Khi sử dụng preloaded buffer
- `[PiperWasmEngine] Failed to preload audio: ...` - Khi preload fail

### Kiểm Tra Trạng Thái

```typescript
// Check if preloaded audio is available
if (engine.hasPreloaded()) {
  console.log('Preloaded audio ready!')
}
```

## Tương Lai

Có thể mở rộng để:
1. **Preload nhiều câu:** Preload 2-3 câu tiếp theo
2. **Smart preload:** Chỉ preload câu ngắn (generate time > playback time)
3. **Cache management:** LRU cache cho các câu thường dùng
