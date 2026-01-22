'use client'

import { useEffect, useRef, RefObject } from 'react'

export function useSentenceHighlight(
  contentRef: RefObject<HTMLDivElement>,
  markerId: string | null,
  active: boolean,
  scrollContainerRef?: RefObject<HTMLElement>,
) {
  useEffect(() => {
    if (!markerId || !contentRef.current) return

    // Remove previous highlights
    const previousActive = contentRef.current.querySelectorAll('.tts-active')
    previousActive.forEach((el) => el.classList.remove('tts-active'))

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
    
    if (!element) {
      console.warn(`[useSentenceHighlight] Could not find element with markerId: ${markerId}`)
      // Debug: log all available markerIds
      const allMarkers = contentRef.current.querySelectorAll('[id^="s-"], [data-sent]')
      console.log(`[useSentenceHighlight] Available markers:`, Array.from(allMarkers).slice(0, 10).map(el => ({
        id: el.id,
        dataSent: el.getAttribute('data-sent'),
        text: el.textContent?.substring(0, 50)
      })))
      return
    }

    // Add highlight class when active
    if (active) {
      element.classList.add('tts-active')
    }

    // Scroll to element (always scroll, even if not active yet)
    const scrollToElement = () => {
      if (scrollContainerRef?.current) {
        // Use scroll container if provided
        const container = scrollContainerRef.current
        const elementRect = element.getBoundingClientRect()
        const containerRect = container.getBoundingClientRect()
        
        // Calculate scroll position to center element in container
        const scrollTop = container.scrollTop + elementRect.top - containerRect.top - (containerRect.height / 2) + (elementRect.height / 2)
        
        container.scrollTo({
          top: scrollTop,
          behavior: 'smooth',
        })
      } else {
        // Fallback to scrollIntoView
        element.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        })
      }
    }

    // Scroll immediately when markerId changes (when TTS moves to new sentence)
    setTimeout(scrollToElement, 50)

    // Remove highlight when inactive
    return () => {
      if (!active) {
        element.classList.remove('tts-active')
      }
    }
  }, [markerId, active, contentRef, scrollContainerRef])
}
