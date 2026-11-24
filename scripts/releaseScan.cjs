'use strict';
const fs = require('node:fs');

/** Scan ASCII markers in text or binary files using bounded memory. */
function scanAsciiFile(filePath, visit, chunkSize = 8 * 1024 * 1024, overlapSize = 64 * 1024) {
  if (!Number.isInteger(chunkSize) || !Number.isInteger(overlapSize) ||
      overlapSize < 0 || chunkSize <= overlapSize) {
    throw new RangeError('Invalid scanner chunk or overlap size');
  }
  const descriptor = fs.openSync(filePath, 'r');
  const buffer = Buffer.allocUnsafe(chunkSize);
  let overlap = '';
  try {
    let bytesRead;
    while ((bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null)) > 0) {
      // Latin-1 preserves ASCII bytes in ASAR archives without decoding binary data as UTF-8.
      const text = overlap + buffer.subarray(0, bytesRead).toString('latin1');
      visit(text);
      overlap = overlapSize === 0 ? '' : text.slice(-overlapSize);
    }
  } finally {
    fs.closeSync(descriptor);
  }
}

module.exports = { scanAsciiFile };
