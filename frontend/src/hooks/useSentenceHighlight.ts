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

  useEffect(() => {
    // Clear any pending timeouts
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }

    if (!markerId || !contentRef.current) {
      elementRef.current = null
      return
    }

    console.log('[useSentenceHighlight] Looking for markerId:', markerId, 'active:', active)

    // Remove previous highlights first
    const previousActive = contentRef.current.querySelectorAll('.tts-active')
    previousActive.forEach((el) => el.classList.remove('tts-active'))
    elementRef.current = null

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
        for (const span of allSpans) {
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
          // Log available elements for debugging
          if (contentRef.current) {
            const allSpans = contentRef.current.querySelectorAll('span[id], span[data-sent]')
            console.warn(`[useSentenceHighlight] Total spans found: ${allSpans.length}`)
            console.warn(`[useSentenceHighlight] Available spans (first 10):`, Array.from(allSpans).slice(0, 10).map(s => ({
              id: s.id,
              dataSent: s.getAttribute('data-sent'),
              text: s.textContent?.substring(0, 50),
            })))
            // Also log the HTML structure
            console.warn(`[useSentenceHighlight] Content HTML preview:`, contentRef.current.innerHTML.substring(0, 500))
          }
          return
        }
      }

      // Element found - store reference and apply highlight
      elementRef.current = element
      console.log('[useSentenceHighlight] Found element:', element, 'active:', active)
      
      // Always add highlight class when element is found and active is true
      if (active) {
        element.classList.add('tts-active')
        console.log('[useSentenceHighlight] Applied highlight class to element')
      } else {
        console.log('[useSentenceHighlight] Not applying highlight (active is false)')
      }

      // Scroll to element (always scroll, even if not active yet)
      const scrollToElement = () => {
        const el = elementRef.current
        if (!el) return
        
        try {
          if (scrollContainerRef?.current) {
            // Use scroll container if provided
            const container = scrollContainerRef.current
            const elementRect = el.getBoundingClientRect()
            const containerRect = container.getBoundingClientRect()
            
            // Calculate scroll position to center element in container
            const scrollTop = container.scrollTop + elementRect.top - containerRect.top - (containerRect.height / 2) + (elementRect.height / 2)
            
            container.scrollTo({
              top: scrollTop,
              behavior: 'smooth',
            })
          } else {
            // Fallback to scrollIntoView
            el.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
            })
          }
        } catch (err) {
          console.warn('[useSentenceHighlight] Error scrolling to element:', err)
        }
      }

      // Scroll immediately when markerId changes (when TTS moves to new sentence)
      setTimeout(scrollToElement, 50)
    }

    // Start the find and highlight process after a small delay to ensure DOM is ready
    // Use requestAnimationFrame to wait for React to finish rendering
    requestAnimationFrame(() => {
      setTimeout(tryFindAndHighlight, 50)
    })

    // Cleanup: Remove highlight and clear timeouts
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      if (elementRef.current && !active) {
        elementRef.current.classList.remove('tts-active')
        elementRef.current = null
      }
    }
  }, [markerId, active, contentRef, scrollContainerRef])
}
