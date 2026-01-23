function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0')
  }
  return out
}

async function sha256(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data)
  return toHex(digest)
}

export async function computeBookFingerprint(file: File): Promise<string> {
  // Recommended: sha256(fileSize + first64KB + last64KB)
  const size = file.size
  const firstChunk = await file.slice(0, Math.min(64 * 1024, size)).arrayBuffer()

  let lastChunk: ArrayBuffer | null = null
  if (size > 64 * 1024) {
    const start = Math.max(0, size - 64 * 1024)
    lastChunk = await file.slice(start, size).arrayBuffer()
  }

  const sizeBytes = new Uint8Array(8)
  // little-endian uint64
  let v = BigInt(size)
  for (let i = 0; i < 8; i++) {
    sizeBytes[i] = Number(v & BigInt(0xff))
    v >>= BigInt(8)
  }

  const first = new Uint8Array(firstChunk)
  const last = lastChunk ? new Uint8Array(lastChunk) : null

  const totalLen = sizeBytes.byteLength + first.byteLength + (last?.byteLength || 0)
  const combined = new Uint8Array(totalLen)
  combined.set(sizeBytes, 0)
  combined.set(first, sizeBytes.byteLength)
  if (last) combined.set(last, sizeBytes.byteLength + first.byteLength)

  return sha256(combined.buffer)
}

