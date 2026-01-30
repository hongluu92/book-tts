# UI/UX Recommendations — EPUB Reader + Sentence-level TTS

> Tư vấn UI/UX dựa trên SPEC.md và best practices cho reading apps

---

## 1) Design System Overview

### 1.1 Product Type Analysis
- **Type**: Reading app / E-book reader / Content consumption PWA
- **Primary Use Case**: Đọc sách với TTS theo câu, focus vào trải nghiệm đọc liên tục
- **Key Differentiator**: Sentence-level highlighting + auto-scroll với TTS

### 1.2 Style Recommendations

**Core Style**: **Minimalist Reading-Focused**

| Aspect | Recommendation | Rationale |
|--------|---------------|----------|
| **Overall Style** | Clean, minimal, distraction-free | Tối ưu focus vào nội dung đọc |
| **Color Scheme** | High contrast, readable | Giảm mỏi mắt khi đọc lâu |
| **Typography** | Serif cho body (đọc sách), Sans-serif cho UI | Serif dễ đọc cho văn bản dài |
| **Spacing** | Generous padding, comfortable line-height | Tăng readability |
| **Effects** | Subtle transitions, no flashy animations | Không làm gián đoạn flow đọc |

**Color Palette (Light Mode)**:
- Background: `#FFFFFF` hoặc `#FAFAFA` (warm white)
- Text: `#1A1A1A` hoặc `#2C2C2C` (near black)
- Accent: `#2563EB` (blue-600) cho TTS controls
- Highlight (active sentence): `#FEF3C7` (yellow-100) với border `#FCD34D` (yellow-300)
- Muted text: `#6B7280` (gray-500)

**Color Palette (Dark Mode)**:
- Background: `#0F172A` hoặc `#1E293B` (slate-900/800)
- Text: `#F1F5F9` hoặc `#E2E8F0` (slate-100/200)
- Accent: `#60A5FA` (blue-400)
- Highlight (active sentence): `#78350F` (amber-900) với border `#F59E0B` (amber-500)
- Muted text: `#94A3B8` (slate-400)

**Typography**:
- **Body text (reader)**: 
  - Serif: `Crimson Text`, `Lora`, hoặc `Merriweather` (Google Fonts)
  - Fallback: `Georgia`, `serif`
- **UI elements**: 
  - Sans-serif: `Inter`, `System UI`, hoặc `-apple-system`
- **Font sizes (reader)**:
  - Base: `18px` (1.125rem) - tối thiểu cho readability
  - Range: `16px` - `24px` (user adjustable)
  - Line height: `1.6` - `1.8` (comfortable)

---

## 2) Reader View (Core Experience)

### 2.1 Layout Structure

```
┌─────────────────────────────────────────┐
│  [← Back]  [Book Title]  [⚙️ Settings] │  ← Minimal header (auto-hide)
├─────────────────────────────────────────┤
│                                         │
│         [epub.js pagination]            │
│         (full viewport)                 │
│                                         │
│         Content with sentence           │
│         <span id="s-000123">           │
│         highlighted on TTS              │
│         </span>                         │
│                                         │
├─────────────────────────────────────────┤
│  [⏮] [⏸] [⏭]  [Rate: ●●●○○]  [Voice] │  ← TTS controls (sticky bottom)
└─────────────────────────────────────────┘
```

### 2.2 Pagination & Navigation

**epub.js Integration**:
- Full viewport rendering (no sidebar)
- Swipe gestures: left/right để chuyển trang
- Tap center để toggle header/footer visibility
- Smooth page transitions (CSS `transition: transform 300ms ease`)

**Page Indicators**:
- Minimal progress bar ở bottom (optional, có thể ẩn)
- Format: `Chapter 3 / 12` hoặc `45%`
- Không hiển thị page numbers (EPUB không có fixed pages)

### 2.3 Sentence Highlighting

**Active Sentence Styling**:
```css
/* Light mode */
.tts-active {
  background-color: #FEF3C7;
  transition: background-color 200ms ease;
}

/* Dark mode */
.dark .tts-active {
  background-color: #78350F;
  border-left-color: #F59E0B;
}
```

**Highlight Behavior**:
- Highlight xuất hiện khi `onstart` của `SpeechSynthesisUtterance`
- Remove highlight khi sentence kết thúc (hoặc khi seek)
- Smooth transition (200ms) để không jarring
- **Auto-scroll**: `scrollIntoView({ behavior: 'smooth', block: 'center' })`

**Pagination Auto-Navigation**:
- Nếu sentence nằm ở trang tiếp theo:
  - Dùng `rendition.display(cfi)` để nhảy trang
  - Hoặc `rendition.next()` nếu cần
- Delay nhỏ (100-200ms) sau khi highlight để user thấy sentence hiện tại

### 2.4 Font & Theme Controls

**Settings Panel** (slide-up drawer hoặc modal):

```
┌─────────────────────────────┐
│  Reading Settings      [✕]  │
├─────────────────────────────┤
│  Font Size                  │
│  [A-]  ●●●○○  [A+]         │
│  16px  18px  20px  22px  24px│
│                             │
│  Theme                      │
│  [☀️ Light] [🌙 Dark]      │
│                             │
│  Line Height                │
│  [Tight] ●○○ [Comfortable] │
│                             │
│  Font Family                │
│  [Serif] [Sans-serif]       │
└─────────────────────────────┘
```

**Implementation**:
- Font size: slider hoặc buttons (16px - 24px)
- Theme: toggle button (light/dark)
- Line height: preset (1.4, 1.6, 1.8)
- Font family: radio buttons (Serif/Sans-serif)
- **Persist settings**: lưu vào IndexedDB + localStorage

---

## 3) TTS Controls

### 3.1 Control Bar (Sticky Bottom)

**Layout**:
```
┌─────────────────────────────────────────────────────┐
│  [⏮ Prev] [⏸ Pause] [⏭ Next]  [Rate: ●●●○○]  [🔊]│
└─────────────────────────────────────────────────────┘
```

**Buttons**:
- **⏮ Prev Sentence**: jump về câu trước, cancel TTS, highlight
- **⏸ Pause/▶ Play**: toggle TTS playback
- **⏭ Next Sentence**: skip câu hiện tại, play câu tiếp
- **Rate Slider**: `0.5x` - `2.0x` (default `1.0x`)
- **Voice Selector**: dropdown (load từ `speechSynthesis.getVoices()`)

### 3.2 Voice Selection

**UI Pattern**:
- Dropdown/select với danh sách voices
- Hiển thị: `[Language] [Name]` (vd: `Vietnamese - Mai`, `English - Alex`)
- Filter theo language (nếu có nhiều)
- **Loading state**: "Loading voices..." khi chưa ready (iOS có thể chậm)

**iOS Constraint Handling**:
- Show "Tap to enable TTS" button đầu tiên
- Require user gesture để start `speechSynthesis.speak()`
- Disable auto-play, chỉ play khi user click

### 3.3 Rate Control

**Slider Design**:
- Range: `0.5x` - `2.0x`
- Steps: `0.1x` increments
- Visual: dots hoặc slider với labels
- Default: `1.0x` (center)
- **Persist**: lưu vào progress (IndexedDB)

### 3.4 Playback State Indicators

**Visual Feedback**:
- Pause button → Play icon khi đang pause
- Active sentence highlight (đã nói ở trên)
- Optional: progress indicator cho chapter (sentence X / Y)

---

## 4) Bookshelf (Library View)

### 4.1 Layout Options

**Option A: Grid View** (recommended cho mobile):
```
┌──────────┬──────────┬──────────┐
│  [Cover] │  [Cover] │  [Cover] │
│  Title   │  Title   │  Title   │
│  Author  │  Author  │  Author  │
│  [45%]   │  [New]   │  [New]   │
└──────────┴──────────┴──────────┘
```

**Option B: List View** (desktop/tablet):
```
┌─────────────────────────────────────────┐
│  [Cover]  Title              [45%] [→] │
│           Author                        │
├─────────────────────────────────────────┤
│  [Cover]  Title              [New] [→]  │
│           Author                        │
└─────────────────────────────────────────┘
```

### 4.2 Book Card Components

**Elements**:
- **Cover image**: từ EPUB metadata hoặc placeholder
- **Title**: truncate nếu quá dài (max 2 lines)
- **Author**: single line, muted color
- **Progress indicator**: 
  - Progress bar (nếu đã đọc)
  - "New" badge (nếu chưa đọc)
  - Percentage: `45%` hoặc `Chapter 3/12`
- **Click action**: navigate to reader

**Hover/Active States**:
- Scale: `transform: scale(1.02)` (subtle)
- Shadow: `shadow-lg` (elevation)
- Cursor: `cursor-pointer`

### 4.3 Import/Upload Flow

**Upload Button**:
- Floating action button (FAB) ở bottom-right
- Icon: `+` hoặc `📤`
- Click → file picker (accept `.epub`)

**Upload Progress**:
- Modal/drawer với progress bar
- Status: "Uploading...", "Processing...", "Done"
- Error handling: hiển thị error message nếu fail

**Empty State**:
```
┌─────────────────────────┐
│        [📚 Icon]        │
│   No books yet          │
│                         │
│   [Upload EPUB]         │
└─────────────────────────┘
```

---

## 5) Authentication (Login/Register)

### 5.1 Design Approach

**Style**: Simple, clean, focused

**Layout**:
- Centered form (max-width: `400px`)
- Single column
- Clear labels, good spacing

**Form Fields**:
- Email: `type="email"`, autocomplete
- Password: `type="password"`, show/hide toggle
- Submit button: full-width, primary color

**Error Handling**:
- Inline error messages (red text below field)
- Clear, actionable messages
- "Forgot password?" link (optional, MVP có thể skip)

**Success States**:
- After register: "Account created! Redirecting..."
- After login: smooth redirect to bookshelf

---

## 6) Accessibility (A11y)

### 6.1 Keyboard Navigation

**Reader View**:
- `Space`: Play/Pause TTS
- `←` / `→`: Previous/Next sentence
- `↑` / `↓`: Scroll page
- `Esc`: Close settings/overlays

**Bookshelf**:
- `Tab`: Navigate between book cards
- `Enter`: Open book
- `+` key: Focus upload button

### 6.2 Screen Reader Support

**ARIA Labels**:
- TTS controls: `aria-label="Play TTS"`, `aria-label="Pause TTS"`
- Sentence highlight: `aria-live="polite"` khi sentence active
- Progress: `aria-label="Reading progress: 45 percent"`

**Semantic HTML**:
- Use `<button>` cho interactive elements
- Use `<nav>` cho navigation
- Use `<main>` cho reader content

### 6.3 Focus Management

**Focus Indicators**:
- Visible focus rings (Tailwind `focus:ring-2 focus:ring-blue-500`)
- Skip links cho keyboard users
- Focus trap trong modals

### 6.4 Reduced Motion

**Respect `prefers-reduced-motion`**:
```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 7) Mobile/PWA Specific

### 7.1 Touch Gestures

**Reader**:
- Swipe left/right: next/prev page
- Tap center: toggle UI visibility
- Long press sentence: context menu (future: bookmark/note)

**Bookshelf**:
- Pull to refresh (optional)
- Swipe to delete (future)

### 7.2 PWA Manifest

**Key Settings**:
```json
{
  "name": "EPUB Reader",
  "short_name": "Reader",
  "theme_color": "#2563EB",
  "background_color": "#FFFFFF",
  "display": "standalone",
  "orientation": "portrait",
  "start_url": "/",
  "icons": [...]
}
```

### 7.3 iOS Safari Considerations

**Viewport Meta**:
```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```

**Safe Area**:
- Use `safe-area-inset-*` cho notch/status bar
- Bottom controls: `padding-bottom: env(safe-area-inset-bottom)`

**Web Speech API**:
- Show loading state khi `speechSynthesis.getVoices()` chưa ready
- Require user gesture để start TTS
- Handle voice loading delay gracefully

### 7.4 Offline Experience

**Offline Indicator**:
- Badge/bar: "Offline - Reading from cache"
- Disable upload khi offline
- Show cached books với indicator

**Service Worker Strategy**:
- App shell: cache-first
- Chapters: stale-while-revalidate
- API: network-first với cache fallback

---

## 8) Performance & UX Optimizations

### 8.1 Loading States

**Bookshelf**:
- Skeleton loaders cho book cards
- Progressive image loading (blur-up)

**Reader**:
- Loading spinner khi load chapter
- Smooth transition khi chuyển chapter

**TTS**:
- "Preparing voice..." khi load voices
- Disable controls khi chưa ready

### 8.2 Error States

**Network Errors**:
- Toast notification: "Connection lost. Reading from cache."
- Retry button cho failed requests

**TTS Errors**:
- Fallback message: "TTS not available. Please check browser support."
- Graceful degradation (không crash app)

**Upload Errors**:
- Clear error message: "Upload failed. Please try again."
- File size validation: "File too large (max 50MB)"

### 8.3 Smooth Animations

**Transitions**:
- Page turn: `300ms ease`
- Highlight: `200ms ease`
- Modal/drawer: `250ms ease-out`

**Avoid**:
- Layout shifts (CLS)
- Flash of unstyled content (FOUC)
- Jarring animations (>500ms)

---

## 9) Implementation Checklist

### Visual Quality
- [ ] No emojis as icons (use SVG: Heroicons/Lucide)
- [ ] Consistent icon set (24x24 viewBox)
- [ ] Hover states don't cause layout shift
- [ ] Theme colors used directly (not var() wrapper)

### Reader Experience
- [ ] Sentence highlight visible in light/dark mode
- [ ] Auto-scroll smooth, không jarring
- [ ] Font size controls responsive
- [ ] Theme toggle works instantly
- [ ] Page transitions smooth

### TTS Controls
- [ ] All buttons have `cursor-pointer`
- [ ] Play/pause state clear
- [ ] Rate slider accessible (keyboard)
- [ ] Voice selector loads reliably
- [ ] iOS gesture requirement handled

### Mobile/PWA
- [ ] Touch gestures work (swipe, tap)
- [ ] Safe area respected (iOS)
- [ ] Offline indicator visible
- [ ] PWA installable
- [ ] Service worker caching works

### Accessibility
- [ ] Keyboard navigation complete
- [ ] Focus indicators visible
- [ ] ARIA labels on interactive elements
- [ ] Screen reader tested
- [ ] `prefers-reduced-motion` respected

---

## 10) Future Enhancements (Post-MVP)

### 10.1 Advanced Reader Features
- **Bookmarks**: Pin sentences/chapters
- **Notes**: Annotate sentences
- **Search**: Full-text search trong book
- **Table of Contents**: Sidebar navigation

### 10.2 TTS Enhancements
- **Remote TTS**: Backend TTS engine với better voices
- **Audio cache**: Cache TTS audio để play offline
- **Speed presets**: "Slow", "Normal", "Fast" buttons

### 10.3 Social/Sharing
- **Reading stats**: "Read 5 books this month"
- **Share quotes**: Share highlighted sentences
- **Reading streaks**: Gamification

---

## 11) Design Resources

### Icon Libraries
- **Heroicons**: https://heroicons.com (recommended)
- **Lucide**: https://lucide.dev
- **Simple Icons**: https://simpleicons.org (brand logos)

### Fonts
- **Google Fonts**: Crimson Text, Lora, Merriweather (serif)
- **System fonts**: `-apple-system`, `BlinkMacSystemFont` (fallback)

### Color Tools
- **Tailwind Colors**: https://tailwindcss.com/docs/customizing-colors
- **Contrast Checker**: https://webaim.org/resources/contrastchecker/

---

**Next Steps**: 
1. Tạo design system file (colors, typography, spacing tokens)
2. Implement reader view với epub.js
3. Build TTS controls component
4. Design bookshelf grid/list views
5. Test trên iOS Safari + Android Chrome
