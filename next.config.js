const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  buildExcludes: [
    /middleware-manifest\.json$/,
    /app-build-manifest\.json$/,
    /react-loadable-manifest\.json$/,
  ],
  fallbacks: {
    document: '/offline',
  },
  // Bật cache để app chạy offline, nhưng vẫn check update khi có code mới
  runtimeCaching: [
    // Navigation requests (HTML pages): NetworkFirst với fallback về cache
    // Quan trọng: Phải có fallback để app chạy offline
    {
      urlPattern: ({ request }) => request.mode === 'navigate',
      handler: 'NetworkFirst',
      options: {
        cacheName: 'pages-cache',
        networkTimeoutSeconds: 3,
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 24 * 60 * 60, // 24 hours
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
        plugins: [
          {
            cacheWillUpdate: async ({ response }) => {
              // Chỉ cache responses thành công
              return response && response.status === 200 ? response : null
            },
          },
        ],
      },
    },
    // HTML và JS files: NetworkFirst với fallback về cache (quan trọng cho offline)
    {
      urlPattern: /\.(?:html|js)$/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'html-js-cache',
        networkTimeoutSeconds: 2, // Giảm timeout để fallback nhanh hơn khi offline
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 24 * 60 * 60, // 24 hours
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
        plugins: [
          {
            cacheWillUpdate: async ({ response }) => {
              return response && response.status === 200 ? response : null
            },
          },
        ],
      },
    },
    // Next.js static assets: CacheFirst để ưu tiên cache (offline first)
    {
      urlPattern: /^\/_next\/static\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'next-static-assets',
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },
    // Images: CacheFirst để ưu tiên cache (offline first)
    {
      urlPattern: /\.(?:jpg|jpeg|gif|png|svg|ico|webp)$/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'image-cache',
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },
    // CSS files: CacheFirst để ưu tiên cache (offline first)
    {
      urlPattern: /\.(?:css)$/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'css-cache',
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },
    // API calls: NetworkFirst với timeout ngắn
    {
      urlPattern: /^https?:\/\/.*\/api\/.*/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'api-cache',
        networkTimeoutSeconds: 5,
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 5 * 60, // 5 minutes
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },
    // Tất cả các requests khác: NetworkFirst với fallback về cache
    {
      urlPattern: /^https?.*/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'offline-cache',
        networkTimeoutSeconds: 3,
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 24 * 60 * 60, // 24 hours
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },
  ],
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Static export for GitHub Pages
  output: 'export',
  // Base path for GitHub Pages (from env var)
  ...(process.env.BASE_PATH && {
    basePath: process.env.BASE_PATH,
    assetPrefix: process.env.BASE_PATH,
  }),
  // Disable image optimization for static export
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api',
  },
  // PWA needs trailingSlash for proper routing
  trailingSlash: true,
  webpack: (config, { isServer }) => {
    // Handle WASM files for onnxruntime-web
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      crypto: false,
    }

    // onnxruntime-web v1.18.0: Force browser bundle (avoid Node.js entry)
    const path = require('path')
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        'onnxruntime-web': path.join(__dirname, 'node_modules/onnxruntime-web/dist/esm/ort.min.js'),
      }
    }

    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    }

    // Ensure .wasm files are treated as assets
    config.module.rules.push({
      test: /\.wasm$/,
      type: 'asset/resource',
    })

    return config
  },
}

module.exports = withPWA(nextConfig)
