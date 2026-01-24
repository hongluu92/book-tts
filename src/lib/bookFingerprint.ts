function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0')
  }
  return out
}

/**
 * Simple hash function fallback when crypto.subtle is not available.
 * Uses djb2 hash algorithm - not cryptographically secure but deterministic.
 */
function simpleHash(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data)
  let hash = 5381
  for (let i = 0; i < bytes.length; i++) {
    hash = ((hash << 5) + hash) + bytes[i]
    hash = hash & hash // Convert to 32-bit integer
  }
  // Convert to hex string (64 chars to match SHA-256 output length)
  return Math.abs(hash).toString(16).padStart(16, '0').repeat(4).slice(0, 64)
}

async function sha256(data: ArrayBuffer): Promise<string> {
  // Check if crypto.subtle is available (requires secure context - HTTPS)
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    console.warn(
      '[bookFingerprint] crypto.subtle is not available. ' +
      'This may occur in non-HTTPS contexts or older browsers. ' +
      'Using fallback hash function.'
    )
    return simpleHash(data)
  }

  try {
    const digest = await crypto.subtle.digest('SHA-256', data)
    return toHex(digest)
  } catch (error) {
    console.warn(
      '[bookFingerprint] crypto.subtle.digest failed, using fallback:',
      error
    )
    return simpleHash(data)
  }
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

