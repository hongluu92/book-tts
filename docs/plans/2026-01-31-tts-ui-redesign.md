# TTS UI/UX Redesign - Audiobook Player Style

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the TTS controls into a polished audiobook-player-style bottom bar with progress visualization, unified voice picker, and clear engine status.

**Architecture:** Replace single-row TtsControls with a two-row layout: progress bar + sentence counter on top, playback controls + voice/rate picker on bottom. Unified voice dropdown groups Piper voices (with badges) above browser voices. Download state shown via progress bar color change.

**Tech Stack:** React, Tailwind CSS, Lucide icons, existing custom UI components (Button, DropdownMenu)

---

### Task 1: Add new props and refactor TtsControls layout to two-row design

**Files:**
- Modify: `src/components/TtsControls.tsx`

**Step 1: Update the component layout**

Replace the current single-row `flex items-center justify-between` with a two-row structure:

```tsx
<div className="px-4 pt-2 pb-3 safe-area-bottom bg-background border-t border-border">
  <div className="max-w-6xl mx-auto space-y-2">
    {/* Row 1: Progress bar + sentence counter */}
    <div className="flex items-center gap-3">
      <div className="flex-1 relative h-1.5 bg-muted rounded-full overflow-hidden cursor-pointer"
           onClick={handleProgressClick}>
        {piperDownloading ? (
          <div className="absolute inset-y-0 left-0 bg-blue-500 rounded-full transition-all"
               style={{ width: `${downloadPercent}%` }} />
        ) : (
          <div className="absolute inset-y-0 left-0 bg-primary rounded-full transition-all"
               style={{ width: `${sentencePercent}%` }} />
        )}
      </div>
      <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
        {piperDownloading
          ? `Downloading... ${downloadPercent}%`
          : `${currentSentenceIndex + 1} / ${totalSentences}`}
      </span>
    </div>

    {/* Row 2: Playback controls */}
    <div className="flex items-center justify-between">
      {/* Left: chapter nav + play */}
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onPrevChapter} disabled={...}>
          <SkipBack className="h-4 w-4" />
        </Button>
        <Button size="icon" className="h-10 w-10 rounded-full" onClick={...}>
          {isPlaying ? <Pause /> : <Play />}
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onNextChapter} disabled={...}>
          <SkipForward className="h-4 w-4" />
        </Button>
      </div>

      {/* Right: rate + voice picker + engine badge */}
      <div className="flex items-center gap-2">
        <button className="text-xs ...">{rate}x</button>
        <VoicePickerButton />
        <EngineBadge />
      </div>
    </div>
  </div>
</div>
```

**Step 2: Add progress bar click handler**

```tsx
const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
  if (piperDownloading || totalSentences === 0) return
  const rect = e.currentTarget.getBoundingClientRect()
  const percent = (e.clientX - rect.left) / rect.width
  const targetIndex = Math.round(percent * (totalSentences - 1))
  onSeek?.(targetIndex)
}
```

Add `onSeek?: (index: number) => void` to the props interface.

**Step 3: Add new icon imports**

Replace `ChevronLeft`/`ChevronRight` with `SkipBack`/`SkipForward` from lucide-react for chapter navigation (more recognizable audiobook metaphor).

**Step 4: Verify it builds**

Run: `npx next build 2>&1 | tail -5`
Expected: Compiled successfully

**Step 5: Commit**

```bash
git add src/components/TtsControls.tsx
git commit -m "refactor: redesign TtsControls to two-row audiobook player layout"
```

---

### Task 2: Build the unified voice picker with Piper + browser grouping

**Files:**
- Modify: `src/components/TtsControls.tsx`
- Modify: `src/app/reader/page.tsx` (pass new props)

**Step 1: Update props to support Piper voice selection**

Add to TtsControlsProps:
```tsx
piperVoices?: PiperVoiceConfig[]
piperStoredVoices?: string[]   // voiceIds that are downloaded
activePiperVoiceId?: string | null
onPiperVoiceChange?: (voiceId: string) => void
onDownloadPiperVoice?: (voiceId: string) => void
```

**Step 2: Build the unified voice dropdown**

Replace the current voice search dropdown with a grouped list:

```tsx
{/* Piper Voices Section */}
<div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
  Piper Voices
</div>
{piperVoices.map(voice => (
  <DropdownMenuItem key={voice.voiceId} onSelect={() => onPiperVoiceChange(voice.voiceId)}>
    <div className="flex items-center justify-between w-full">
      <div className="flex items-center gap-2">
        {activePiperVoiceId === voice.voiceId && <Check className="h-3 w-3" />}
        <span>{voice.label}</span>
      </div>
      {!piperStoredVoices.includes(voice.voiceId) ? (
        <button onClick={(e) => { e.stopPropagation(); onDownloadPiperVoice(voice.voiceId) }}
                className="text-xs text-primary">
          Download
        </button>
      ) : (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">Piper</span>
      )}
    </div>
  </DropdownMenuItem>
))}

{/* Separator */}
<div className="h-px bg-border my-1" />

{/* Browser Voices Section */}
<div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
  Browser Voices
</div>
{filteredBrowserVoices.map(voice => (
  <DropdownMenuItem key={voice.name} onSelect={() => onVoiceChange(voice)}>
    ...
  </DropdownMenuItem>
))}
```

**Step 3: Show active voice summary on the trigger button**

```tsx
<DropdownMenuTrigger className="...">
  <span className="truncate">
    {activePiperVoiceId
      ? piperVoices.find(v => v.voiceId === activePiperVoiceId)?.label ?? 'Piper'
      : selectedVoice?.name ?? 'Select voice'}
  </span>
</DropdownMenuTrigger>
```

**Step 4: Wire new props from reader/page.tsx**

Pass Piper voice data from `usePiperTts` to TtsControls:
```tsx
piperVoices={PIPER_VOICES}
piperStoredVoices={storedVoices}
activePiperVoiceId={engineManager?.isPiperReady() ? 'vi_VN-vais1000-medium' : null}
onPiperVoiceChange={(voiceId) => { /* set preferred piper voice */ }}
onDownloadPiperVoice={(voiceId) => downloadVoice(voiceId)}
```

**Step 5: Build and verify**

Run: `npx next build 2>&1 | tail -5`
Expected: Compiled successfully

**Step 6: Commit**

```bash
git add src/components/TtsControls.tsx src/app/reader/page.tsx
git commit -m "feat: unified voice picker with Piper and browser voice groups"
```

---

### Task 3: Add engine badge and download/loading states

**Files:**
- Modify: `src/components/TtsControls.tsx`

**Step 1: Create engine badge component (inline)**

```tsx
const engineBadge = useMemo(() => {
  if (piperDownloading) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400">
        <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
        Loading
      </span>
    )
  }
  if (engineType === 'piper-wasm') {
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
        Piper
      </span>
    )
  }
  return (
    <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
      Browser
    </span>
  )
}, [engineType, piperDownloading])
```

**Step 2: Remove the `hidden sm:inline` from engine status**

The badge should always be visible, on all screen sizes.

**Step 3: Build and verify**

Run: `npx next build 2>&1 | tail -5`

**Step 4: Commit**

```bash
git add src/components/TtsControls.tsx
git commit -m "feat: add engine status badge with download/loading states"
```

---

### Task 4: Wire onSeek from reader page and test full flow

**Files:**
- Modify: `src/app/reader/page.tsx`

**Step 1: Pass onSeek to TtsControls**

```tsx
<TtsControls
  ...
  onSeek={(index) => {
    if (isPlaying) {
      playFrom(index)
    } else {
      setSentenceIndex(index)
    }
  }}
/>
```

**Step 2: Build production and visual test**

Run: `npx next build && npx serve out -l 3000`
- Open in browser
- Verify: progress bar shows sentence position
- Verify: clicking progress bar jumps to sentence
- Verify: voice picker shows grouped voices
- Verify: engine badge visible on mobile
- Verify: download progress shown in progress bar during model download

**Step 3: Commit**

```bash
git add src/app/reader/page.tsx
git commit -m "feat: wire progress bar seek and complete TTS UI integration"
```
