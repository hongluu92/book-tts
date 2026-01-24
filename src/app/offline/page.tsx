'use client'

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4 px-4">
        <h1 className="text-2xl font-bold text-foreground">Bạn đang offline</h1>
        <p className="text-muted-foreground">
          Vui lòng kiểm tra kết nối internet và thử lại.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
        >
          Thử lại
        </button>
      </div>
    </div>
  )
}
