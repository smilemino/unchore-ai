import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { xlsxText } from "../lib/office-text";

// 10/1 review P1: a file that unpacks huge (zip bomb) is refused from the size table «before» unpacking, so it can't hold the server.
describe("zip bomb cap", () => {
  it("refuses when the declared unpacked size is over the cap", () => {
    const z = zipSync({ "xl/workbook.xml": strToU8("<workbook/>") }, { level: 0 });
    const v = new DataView(z.buffer, z.byteOffset, z.byteLength);
    for (let i = 0; i < z.length - 4; i++) if (v.getUint32(i, true) === 0x02014b50) v.setUint32(i + 24, 200 * 1024 * 1024, true);   // central directory: unpacked size → 200MB
    expect(() => xlsxText(z)).toThrow(/too large/);
  });
});
