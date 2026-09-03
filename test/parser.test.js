import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { parseAd2cp, toNmea } from "../src/index.js";
import { records } from "./checksum.js";

const fixture = fileURLToPath(
  new URL("./fixtures/38-Sensor-Data.ad2cp", import.meta.url),
);
const buffer = fs.readFileSync(fixture);

// Suppress the "Did not consume whole record" warnings, but remember whether
// any fired so a test can assert on them.
let consumeWarnings = [];
const realWarn = console.warn;
console.warn = (msg, ...rest) => {
  if (typeof msg === "string" && msg.includes("Did not consume")) {
    consumeWarnings.push(msg);
    return;
  }
  realWarn(msg, ...rest);
};

function parse() {
  consumeWarnings = [];
  return parseAd2cp(buffer);
}

test("every record has valid header and data checksums", () => {
  let count = 0;
  for (const rec of records(buffer)) {
    assert.ok(
      rec.headerChecksumOk,
      `header checksum failed at offset ${rec.offset}`,
    );
    assert.ok(
      rec.dataChecksumOk,
      `data checksum failed for 0x${rec.dataSeriesId.toString(16)} at offset ${rec.offset}`,
    );
    count++;
  }
  assert.equal(count, 45);
});

test("parseAd2cp consumes every record with no leftover bytes", () => {
  const result = parse();
  assert.equal(result.length, 45);
  assert.deepEqual(consumeWarnings, []);
});

test("record composition matches the file", () => {
  const result = parse();
  const counts = result.reduce((acc, r) => {
    acc[r.dataSeriesId] = (acc[r.dataSeriesId] ?? 0) + 1;
    return acc;
  }, {});
  assert.equal(counts[0xa0], 1); // string / GETALL config
  assert.equal(counts[0x16], 22); // average data (DF3)
  assert.equal(counts[0x1f], 22); // avg altimeter raw
});

test("decoded fields cross-check against the GETALL config header", () => {
  const result = parse();
  const avg = result.find((r) => r.dataSeriesId === 0x16);

  assert.equal(avg.serialNumber, 105714); // ID SN=105714
  assert.equal(avg.familyIdLabel, "Signature");
  assert.equal(avg.numberOfBeams, 4);
  assert.equal(avg.numberOfCells, 21); // GETAVG NC=21
  assert.equal(avg.coordinateSystemLabel, "ENU"); // GETAVG CY="ENU"
  assert.ok(Math.abs(avg.cellSize - 1.0) < 1e-9); // GETAVG CS=1.00
  assert.equal(avg.dateTime.format("YYYY-MM-DD"), "2026-09-02");
});

// Regression guard for the DF3 STM-section / altimeter-raw fix.
test("0x1f altimeter raw record decodes fully", () => {
  const result = parse();
  const raw = result.find((r) => r.dataSeriesId === 0x1f);
  assert.equal(raw.altimeterRawData.numRawSamples, 833); // READALTIAVG NSAMP=833
  assert.equal(raw.altimeterRawData.dataSamples.length, 833);
  assert.ok(Math.abs(raw.altimeterRawData.samplesDistance - 0.012) < 1e-6);
  assert.ok(raw.altimeterData.altimeter > 0 && raw.altimeterData.altimeter < 100);
});

// Regression guard: velocity arrays are correctly sized (were misaligned when
// the 8-byte STM section was skipped for 0x16).
test("0x16 velocity/amplitude/correlation arrays are correctly sized", () => {
  const result = parse();
  const avg = result.find((r) => r.dataSeriesId === 0x16);
  const expected = avg.numberOfBeams * avg.numberOfCells;
  assert.equal(avg.velocityData.length, expected);
  assert.equal(avg.amplitudeData.length, expected);
  assert.equal(avg.correlationData.length, expected);
});

// Regression guards for the toNmea fixes (valid dates, optional std-dev).
test("toNmea produces valid dates and does not crash on missing std-dev", () => {
  const result = parse();
  const pnors = toNmea(result, ["PNORS"]).split("\n");
  assert.equal(pnors.length, 22);
  // MMDDYY for 2026-09-02 -> 090226; must not be "Invalid Date".
  assert.ok(pnors[0].startsWith("$PNORS,090226,"));

  const pnorc = toNmea(result, ["PNORC"]).split("\n");
  assert.equal(pnorc.length, 22 * 21); // one per cell
});
