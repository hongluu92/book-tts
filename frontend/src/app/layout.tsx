import type { Metadata, Viewport } from 'next'
import { Inter, Crimson_Text } from 'next/font/google'
import './globals.css'
import DevServiceWorkerCleaner from '@/components/DevServiceWorkerCleaner'
import ServiceWorkerUpdate from '@/components/ServiceWorkerUpdate'
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister'
import PWACacheDebug from '@/components/PWACacheDebug'

const inter = Inter({ 
  subsets: ['latin'],
  variable: '--font-sans',
})

const crimsonText = Crimson_Text({ 
  weight: ['400', '600', '700'],
  subsets: ['latin'],
  variable: '--font-serif',
})

export const metadata: Metadata = {
  title: 'EPUB Reader',
  description: 'Read EPUB books with sentence-level TTS',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'EPUB Reader',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#2563EB',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="EPUB Reader" />
      </head>
      <body className={`${inter.variable} ${crimsonText.variable} font-sans`}>
        <DevServiceWorkerCleaner />
        <ServiceWorkerRegister />
        <ServiceWorkerUpdate />
        <PWACacheDebug />
        {children}
      </body>
    </html>
  )
}
