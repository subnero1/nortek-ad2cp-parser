// Nortek AD2CP checksum, per the Integrator's Guide section 10.3.
// A 16-bit unsigned running sum seeded with 0xB58C. An odd trailing byte is
// added shifted left by 8.
export function checksum(buffer, start, length) {
  let sum = 0xb58c;
  let i = start;
  const end = start + length;
  for (; i + 1 < end; i += 2) {
    sum = (sum + buffer.readUInt16LE(i)) & 0xffff;
  }
  if (i < end) {
    sum = (sum + (buffer[i] << 8)) & 0xffff;
  }
  return sum;
}

// Walk every record in an AD2CP buffer, yielding its framing and both checksum
// results. Header layout: sync(0xA5), headerSize, dataSeriesId, familyId,
// dataSize (uint16 if headerSize==10, else uint32), dataChecksum, headerChecksum.
export function* records(buffer) {
  let offset = 0;
  while (offset + 10 <= buffer.length) {
    if (buffer[offset] !== 0xa5) {
      offset++;
      continue;
    }
    const headerSize = buffer[offset + 1];
    const dataSeriesId = buffer[offset + 2];
    let dataSize;
    if (headerSize === 10) {
      dataSize = buffer.readUInt16LE(offset + 4);
    } else if (headerSize === 12) {
      dataSize = buffer.readUInt32LE(offset + 4);
    } else {
      offset++;
      continue;
    }
    const dataChecksum = buffer.readUInt16LE(offset + (headerSize === 10 ? 6 : 8));
    const headerChecksum = buffer.readUInt16LE(offset + (headerSize === 10 ? 8 : 10));
    const dataStart = offset + headerSize;

    yield {
      offset,
      headerSize,
      dataSeriesId,
      dataSize,
      dataStart,
      headerChecksumOk:
        headerChecksum === checksum(buffer, offset, headerSize - 2),
      dataChecksumOk: dataChecksum === checksum(buffer, dataStart, dataSize),
    };

    offset = dataStart + dataSize;
  }
}
