'use client'

import { useEffect, useRef, RefObject } from 'react'

export function useSentenceHighlight(
  contentRef: RefObject<HTMLDivElement>,
  markerId: string | null,
  active: boolean,
  scrollContainerRef?: RefObject<HTMLElement>,
) {
  const elementRef = useRef<HTMLElement | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const prevMarkerIdRef = useRef<string | null>(null)

  useEffect(() => {
    // Clear any pending timeouts
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current)
      scrollTimeoutRef.current = null
    }

    if (!markerId || !contentRef.current) {
      // Remove highlight from previous element if exists ONLY when markerId becomes null
      if (elementRef.current && markerId === null) {
        elementRef.current.classList.remove('tts-active')
        elementRef.current = null
      }
      prevMarkerIdRef.current = markerId
      return
    }

    // Remove ALL previous highlights when markerId actually changes
    // This preserves highlight when only 'active' state changes (pause/stop)
    if (prevMarkerIdRef.current !== markerId && contentRef.current) {
      // Remove all previous highlights
      const previousActive = contentRef.current.querySelectorAll('.tts-active')
      previousActive.forEach((el) => el.classList.remove('tts-active'))
      elementRef.current = null
    }

    // Update previous markerId
    prevMarkerIdRef.current = markerId

    // Helper function to find element
    const findElement = (): HTMLElement | null => {
      if (!contentRef.current) return null

      // Try to find element by ID
      let element = contentRef.current.querySelector(`#${markerId}`) as HTMLElement

      // If not found, try with escaped ID (for special characters)
      if (!element) {
        try {
          element = contentRef.current.querySelector(`#${CSS.escape(markerId)}`) as HTMLElement
        } catch (e) {
          // CSS.escape might not be available in all browsers
        }
      }

      // If still not found, try data-sent attribute
      if (!element) {
        const sentenceIndex = markerId.match(/s-(\d+)/)?.[1]
        if (sentenceIndex) {
          element = contentRef.current.querySelector(`span[data-sent="${sentenceIndex}"]`) as HTMLElement
        }
      }

      // If still not found, try finding by any span with matching id pattern
      if (!element) {
        const allSpans = contentRef.current.querySelectorAll('span[id]')
        const spansArray = Array.from(allSpans)
        for (const span of spansArray) {
          if (span.id === markerId || span.id.endsWith(markerId)) {
            element = span as HTMLElement
            break
          }
        }
      }

      return element
    }

    // Try to find element with retry mechanism
    let retryCount = 0
    const maxRetries = 5

    const tryFindAndHighlight = () => {
      const element = findElement()

      if (!element) {
        if (retryCount < maxRetries) {
          retryCount++
          // Retry after a short delay to allow DOM to update
          timeoutRef.current = setTimeout(tryFindAndHighlight, 100)
          return
        } else {
          console.warn(`[useSentenceHighlight] Could not find element with markerId: ${markerId} after ${maxRetries} retries`)
          return
        }
      }

      // Element found - store reference and apply highlight
      elementRef.current = element

      // Always add highlight class when element is found
      element.classList.add('tts-active')

      // Debounced scroll to element (avoid jitter)
      const scrollToElement = () => {
        const el = elementRef.current
        if (!el) return

        try {
          if (scrollContainerRef?.current) {
            // Use scroll container if provided
            const container = scrollContainerRef.current
            const containerHeight = container.clientHeight
            const elementOffsetTop = el.offsetTop
            const elementHeight = el.offsetHeight
            const targetScrollTop = elementOffsetTop - containerHeight / 2 + elementHeight / 2

            const beforeScroll = container.scrollTop
            container.scrollTo({ top: Math.max(0, targetScrollTop), behavior: 'smooth' })

            // Windows Chrome fix: Check if scroll actually happened
            // If not, fall back to scrollIntoView after a delay
            setTimeout(() => {
              if (el && container && Math.abs(container.scrollTop - beforeScroll) < 10) {
                console.warn('[useSentenceHighlight] Scroll did not change, using scrollIntoView fallback')
                try {
                  el.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                    inline: 'nearest',
                  })
                } catch (e) {
                  // ignore
                }
              }
            }, 300)
          } else {
            // Fallback to scrollIntoView
            el.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
              inline: 'nearest',
            })
          }
        } catch (err) {
          console.warn('[useSentenceHighlight] Error scrolling to element:', err)
          try {
            el.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
              inline: 'nearest',
            })
          } catch (e) {
            // ignore
          }
        }
      }

      // Only scroll to element if active (playing)
      if (active) {
        // Windows Chrome fix: Use double requestAnimationFrame + longer delay
        // to ensure DOM layout is fully computed before scrolling
        scrollTimeoutRef.current = setTimeout(() => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              scrollToElement()
            })
          })
        }, 200) // Increased from 120ms to 200ms for Windows Chrome
      }
    }

    // Start the find and highlight process after a small delay to ensure DOM is ready
    // Use requestAnimationFrame to wait for React to finish rendering
    requestAnimationFrame(() => {
      setTimeout(tryFindAndHighlight, 50)
    })

    // Cleanup: Only clear timeouts, don't remove highlight
    // Highlight will be removed only when markerId changes (handled at the top of this effect)
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
        scrollTimeoutRef.current = null
      }
      // DO NOT remove highlight in cleanup
      // It will be removed when markerId changes to a different sentence
    }
  }, [markerId, active, contentRef, scrollContainerRef])
}
