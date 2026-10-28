/**
 * Image type detection for uploads. The images themselves are stored in the database
 * (MediaAttachment.data), not on disk.
 */

/** Allowed image types, identified by their magic bytes (the client's Content-Type is ignored). */
const SIGNATURES: { mimeType: string; extension: string; matches: (b: Buffer) => boolean }[] = [
  {
    mimeType: 'image/jpeg',
    extension: 'jpg',
    matches: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mimeType: 'image/png',
    extension: 'png',
    matches: (b) =>
      b.length >= 8 &&
      b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mimeType: 'image/webp',
    extension: 'webp',
    matches: (b) =>
      b.length >= 12 &&
      b.subarray(0, 4).toString('ascii') === 'RIFF' &&
      b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
];

export function detectImageType(buffer: Buffer): { mimeType: string; extension: string } | null {
  const match = SIGNATURES.find((signature) => signature.matches(buffer));
  return match ? { mimeType: match.mimeType, extension: match.extension } : null;
}
