const workspaceShareParam = 'sws'
const workspaceShareSchemaVersion = 1
const workspaceShareCompression = 'gzip'
const maxWorkspaceShareEncodedPayloadLength = 8192
const maxWorkspaceShareDecodedBytes = 1024 * 1024
const maxWorkspaceShareExpansionRatio = 100

const isNativeWorkspaceShareCodecSupported = () => {
  return (
    typeof CompressionStream === 'function' &&
    typeof DecompressionStream === 'function' &&
    typeof TextEncoder === 'function' &&
    typeof TextDecoder === 'function' &&
    typeof btoa === 'function' &&
    typeof atob === 'function'
  )
}

const uint8ArrayToBase64 = bytes => {
  let binary = ''
  const chunkSize = 0x8000

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize)
    binary += String.fromCharCode(...chunk)
  }

  return btoa(binary)
}

const base64ToUint8Array = base64 => {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}

const toBase64Url = bytes => {
  const base64 = uint8ArrayToBase64(bytes)
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

const fromBase64Url = value => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const remainder = normalized.length % 4
  const padded = remainder > 0 ? normalized + '='.repeat(4 - remainder) : normalized
  return base64ToUint8Array(padded)
}

const streamToUint8Array = async stream => {
  const buffer = await new Response(stream).arrayBuffer()
  return new Uint8Array(buffer)
}

const streamToUint8ArrayWithLimit = async ({
  stream,
  maxBytes,
  compressedBytesLength,
  maxExpansionRatio,
}) => {
  const reader = stream.getReader()
  const chunks = []
  let totalBytes = 0

  try {
    while (true) {
      // Sequential reads are required for Web Streams reader consumption.
      // eslint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read()
      if (done) {
        break
      }

      if (!(value instanceof Uint8Array)) {
        continue
      }

      totalBytes += value.byteLength
      if (totalBytes > maxBytes) {
        throw new Error('Workspace share payload exceeds maximum decoded size.')
      }

      if (
        typeof compressedBytesLength === 'number' &&
        compressedBytesLength > 0 &&
        typeof maxExpansionRatio === 'number' &&
        maxExpansionRatio > 0 &&
        totalBytes > compressedBytesLength * maxExpansionRatio
      ) {
        throw new Error('Workspace share payload expansion ratio is too large.')
      }

      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  return bytes
}

const compressText = async text => {
  const encoder = new TextEncoder()
  const sourceBytes = encoder.encode(text)
  const sourceStream = new Blob([sourceBytes]).stream()
  const compressedStream = sourceStream.pipeThrough(
    new CompressionStream(workspaceShareCompression),
  )

  return streamToUint8Array(compressedStream)
}

const decompressText = async bytes => {
  const sourceStream = new Blob([bytes]).stream()
  const decompressedStream = sourceStream.pipeThrough(
    new DecompressionStream(workspaceShareCompression),
  )
  const decompressedBytes = await streamToUint8ArrayWithLimit({
    stream: decompressedStream,
    maxBytes: maxWorkspaceShareDecodedBytes,
    compressedBytesLength: bytes?.byteLength ?? 0,
    maxExpansionRatio: maxWorkspaceShareExpansionRatio,
  })
  const decoder = new TextDecoder()
  return decoder.decode(decompressedBytes)
}

const encodeWorkspaceSharePayload = async snapshot => {
  if (!isNativeWorkspaceShareCodecSupported()) {
    throw new Error('Native compression is not supported in this browser context.')
  }

  if (!snapshot || typeof snapshot !== 'object') {
    throw new TypeError('Workspace snapshot must be an object.')
  }

  const envelope = {
    version: workspaceShareSchemaVersion,
    compression: workspaceShareCompression,
    createdAt: Date.now(),
    snapshot,
  }

  const serialized = JSON.stringify(envelope)
  const compressed = await compressText(serialized)
  const encoded = toBase64Url(compressed)
  if (encoded.length > maxWorkspaceShareEncodedPayloadLength) {
    throw new Error('Workspace share payload is too large.')
  }

  return encoded
}

const decodeWorkspaceSharePayload = async encodedPayload => {
  if (!isNativeWorkspaceShareCodecSupported()) {
    throw new Error('Native compression is not supported in this browser context.')
  }

  if (typeof encodedPayload !== 'string' || encodedPayload.trim().length === 0) {
    throw new TypeError('Workspace share payload must be a non-empty string.')
  }

  if (encodedPayload.trim().length > maxWorkspaceShareEncodedPayloadLength) {
    throw new Error('Workspace share payload exceeds maximum encoded length.')
  }

  let parsed = null
  try {
    const compressedBytes = fromBase64Url(encodedPayload.trim())
    const serialized = await decompressText(compressedBytes)
    parsed = JSON.parse(serialized)
  } catch {
    throw new Error('Workspace share payload is invalid or corrupted.')
  }

  const version = Number(parsed?.version)
  if (version !== workspaceShareSchemaVersion) {
    throw new Error('Workspace share payload schema is not supported.')
  }

  if (parsed?.compression !== workspaceShareCompression) {
    throw new Error('Workspace share payload compression is not supported.')
  }

  if (!parsed?.snapshot || typeof parsed.snapshot !== 'object') {
    throw new Error('Workspace share payload snapshot is invalid.')
  }

  return parsed.snapshot
}

export {
  decodeWorkspaceSharePayload,
  encodeWorkspaceSharePayload,
  isNativeWorkspaceShareCodecSupported,
  workspaceShareParam,
}
