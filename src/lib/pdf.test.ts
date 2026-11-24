import assert from "node:assert/strict";
import test from "node:test";
import { isOrderPdf, pdfFilename, simplePdf } from "./pdf";

const pdf = simplePdf("Work order 26522", ["Invoice 20242"]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);

test("a PDF header counts when the type or the name says PDF", () => {
  assert.equal(isOrderPdf("20242.pdf", "application/pdf", pdf), true);
  assert.equal(isOrderPdf("20242.pdf", "", pdf), true);
  assert.equal(isOrderPdf("20242.pdf", "application/octet-stream", pdf), true);
  assert.equal(isOrderPdf("scan", "application/pdf", pdf), true);
  assert.equal(isOrderPdf("scan", "application/octet-stream", pdf), true);
});

test("a file that is not a PDF is rejected even if it is named like one", () => {
  assert.equal(isOrderPdf("20242.pdf", "application/pdf", jpeg), false);
  assert.equal(isOrderPdf("photo.png", "image/png", jpeg), false);
  assert.equal(isOrderPdf("notes.pdf", "application/pdf", Buffer.alloc(0)), false);
  assert.equal(isOrderPdf("photo.png", "image/png", pdf), false);
});

test("stored PDF names end in .pdf", () => {
  assert.equal(pdfFilename("20242.pdf"), "20242.pdf");
  assert.equal(pdfFilename("scan"), "scan.pdf");
});
