import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { canEditBoard, isDiscontinuedPath } from "./access";
import { isRedoAlias, isRemovedList, listKey } from "./board-lists";
import { tidyContact } from "./contact";
import {
  codeKey,
  coerceStatus,
  defaultStatusFor,
  discontinuedStems,
  matchesDiscontinued,
  matOrderSizeLabel,
  resolveDimensions,
  statusFromSheet,
} from "./stock";

describe("retired lists", () => {
  test("matches David's six columns and not the columns that stay", () => {
    assert.equal(isRemovedList("Measure Stack"), true);
    assert.equal(isRemovedList("Measure Stacked Frame"), true);
    assert.equal(isRemovedList("Past Due - PRIORITY"), true);
    assert.equal(isRemovedList("Past Due Priority"), true);
    assert.equal(isRemovedList("Reed Projects"), true);
    assert.equal(isRemovedList("New List"), true);
    assert.equal(isRemovedList("Text Message"), true);
    assert.equal(isRemovedList("Text Messages"), true);
    assert.equal(isRemovedList("Estimate/Quote"), true);
    assert.equal(isRemovedList("Estimates/Quotes"), true);
    assert.equal(isRemovedList("New Work Orders"), false);
    assert.equal(isRemovedList("Re-do's"), false);
    assert.equal(isRemovedList("Stalled"), false);
    assert.equal(listKey("Past Due - PRIORITY"), "past due priority");
  });

  test("renames Jersey Reduce and Jersey Re-Do's only", () => {
    assert.equal(isRedoAlias("Jersey Reduce"), true);
    assert.equal(isRedoAlias("Jersey Re-Do's"), true);
    assert.equal(isRedoAlias("Re-do's"), false);
    assert.equal(isRedoAlias("Chop and Join"), false);
  });
});

describe("mat order size", () => {
  test("uses 32x40, then 40x60, then check size, in either orientation", () => {
    assert.equal(matOrderSizeLabel("16x20"), "32x40");
    assert.equal(matOrderSizeLabel("20 x 16"), "32x40");
    assert.equal(matOrderSizeLabel("32x40"), "32x40");
    assert.equal(matOrderSizeLabel("40x32"), "32x40");
    assert.equal(matOrderSizeLabel("32x41"), "40x60");
    assert.equal(matOrderSizeLabel("41×32"), "40x60");
    assert.equal(matOrderSizeLabel("40x60"), "40x60");
    assert.equal(matOrderSizeLabel("41x60"), "check size");
    assert.equal(matOrderSizeLabel("60x41"), "check size");
    assert.equal(matOrderSizeLabel("oval"), "check size");
  });
});

describe("discontinued mat codes", () => {
  test("matches with or without a trailing D and ignores hyphens", () => {
    const stems = discontinuedStems(["C-9893D", "WB123"]);
    assert.equal(matchesDiscontinued("C9893", stems), true);
    assert.equal(matchesDiscontinued("c9893d", stems), true);
    assert.equal(matchesDiscontinued("C-9893", stems), true);
    assert.equal(matchesDiscontinued("WB123D", stems), true);
    assert.equal(matchesDiscontinued("WB-123", stems), true);
    assert.equal(matchesDiscontinued("C9894", stems), false);
    assert.equal(codeKey(" c-9893d "), "C9893D");
  });

  test("never leaves a discontinued mat as To Order or On Order", () => {
    const stems = discontinuedStems(["C9893D"]);
    assert.equal(coerceStatus("top_mat", "C-9893", "not_in_stock", stems), "discontinued_attention");
    assert.equal(coerceStatus("top_mat", "C9893D", "ordered", stems), "discontinued_attention");
    assert.equal(coerceStatus("top_mat", "C9893", "in_stock", stems), "in_stock");
    assert.equal(coerceStatus("top_mat", "C9893", "here", stems), "here");
    assert.equal(coerceStatus("frame", "C9893", "not_in_stock", stems), "not_in_stock");
    assert.equal(coerceStatus("glazing", "Museum", "not_in_stock", stems), "in_stock");
    assert.equal(coerceStatus("backing", "Foam", "ordered", stems), "in_stock");
  });
});

describe("stock rules", () => {
  test("frames default to To Order and glass and foam default to In Stock", () => {
    assert.equal(defaultStatusFor("frame"), "not_in_stock");
    assert.equal(defaultStatusFor("inner_stacked_frame"), "not_in_stock");
    assert.equal(defaultStatusFor("glazing"), "in_stock");
    assert.equal(defaultStatusFor("backing"), "in_stock");
    assert.equal(defaultStatusFor("fillet"), "needs_human_check");
    assert.equal(defaultStatusFor("top_mat"), "needs_human_check");
  });

  test("a sheet re-check marks a mat In Stock even when it was On Order", () => {
    const inStock = discontinuedStems(["C9893"]);
    const stems = discontinuedStems([]);
    assert.equal(
      statusFromSheet({ kind: "top_mat", itemCode: "C-9893", current: "ordered", inStock, stems }),
      "in_stock",
    );
    assert.equal(
      statusFromSheet({ kind: "top_mat", itemCode: "C9999", current: "ordered", inStock, stems }),
      null,
    );
    assert.equal(
      statusFromSheet({ kind: "top_mat", itemCode: "C9999", current: "in_stock", inStock, stems }),
      "not_in_stock",
    );
    assert.equal(
      statusFromSheet({ kind: "frame", itemCode: "LJ-1", current: "in_stock", inStock, stems }),
      null,
    );
    assert.equal(
      statusFromSheet({ kind: "glazing", itemCode: "Museum", current: "not_in_stock", inStock, stems }),
      null,
    );
  });

  test("a discontinued mat missing from the sheet needs attention and never goes to To Order", () => {
    const inStock = discontinuedStems([]);
    const stems = discontinuedStems(["C9893D"]);
    assert.equal(
      statusFromSheet({ kind: "top_mat", itemCode: "C9893", current: "ordered", inStock, stems }),
      "discontinued_attention",
    );
    assert.equal(
      statusFromSheet({ kind: "top_mat", itemCode: "C9893", current: "in_stock", inStock: discontinuedStems(["C9893"]), stems }),
      null,
    );
  });
});

describe("dimensions and contact", () => {
  test("fills dimensions from the order size or the art description", () => {
    assert.equal(resolveDimensions({ size: "16 x 20" }), "16x20");
    assert.equal(resolveDimensions({ dimensions: "32×41" }), "32x41");
    assert.equal(resolveDimensions({ artDescription: "Oil, 11 x 14, signed." }), "11x14");
    assert.equal(resolveDimensions({ size: "16x20", artDescription: "11x14" }), "16x20");
  });

  test("keeps the email and drops only the duplicate customer phone", () => {
    const tidied = tidyContact("303-555-0199, maya@studio.test, spouse 720-555-0100", "303-555-0199", "");
    assert.equal(tidied.email, "maya@studio.test");
    assert.match(tidied.additional, /720-555-0100/);
    assert.doesNotMatch(tidied.additional, /303-555-0199/);
    assert.doesNotMatch(tidied.additional, /maya@studio.test/);
  });
});

describe("board access", () => {
  test("staff can edit the board and cannot open discontinued mats", () => {
    assert.equal(canEditBoard("staff"), true);
    assert.equal(canEditBoard("admin"), true);
    assert.equal(canEditBoard("guest"), false);
    assert.equal(isDiscontinuedPath("/discontinued"), true);
    assert.equal(isDiscontinuedPath("/discontinued/new"), true);
    assert.equal(isDiscontinuedPath("/"), false);
  });
});
