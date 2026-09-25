import { describe, expect, it } from "vitest";

import { type ModifierGroup, toggleOption, validateSelection } from "./modifier-selection";

const sugar: ModifierGroup = {
  id: "sugar",
  name: "Level Gula",
  minSelect: 1,
  maxSelect: 1,
  options: [
    { id: "normal", name: "Normal", price: 0 },
    { id: "less", name: "Less Sugar", price: 0 },
  ],
};
const topping: ModifierGroup = {
  id: "topping",
  name: "Topping",
  minSelect: 0,
  maxSelect: 2,
  options: [
    { id: "boba", name: "Extra Boba", price: 5_000 },
    { id: "jelly", name: "Jelly", price: 3_000 },
    { id: "cheese", name: "Cheese Foam", price: 7_000 },
  ],
};

describe("validateSelection", () => {
  it("accepts a selection within every group's min and max", () => {
    expect(validateSelection([sugar, topping], ["less", "boba"])).toEqual([]);
  });

  it("reports a required group with nothing selected", () => {
    expect(validateSelection([sugar, topping], ["boba"])).toEqual([{ groupId: "sugar", reason: "BELOW_MIN" }]);
  });

  it("reports a group with too many options", () => {
    expect(validateSelection([sugar, topping], ["normal", "boba", "jelly", "cheese"])).toEqual([{ groupId: "topping", reason: "ABOVE_MAX" }]);
  });

  it("reports an option that belongs to no group of the product", () => {
    expect(validateSelection([sugar], ["normal", "boba"])).toEqual([{ optionId: "boba", reason: "UNKNOWN_OPTION" }]);
  });
});

describe("toggleOption", () => {
  it("replaces the choice in a single-choice group (radio)", () => {
    expect(toggleOption([sugar, topping], ["normal", "boba"], "less")).toEqual(["boba", "less"]);
  });

  it("adds and removes options in a multi-choice group (checkbox)", () => {
    expect(toggleOption([topping], ["boba"], "jelly")).toEqual(["boba", "jelly"]);
    expect(toggleOption([topping], ["boba", "jelly"], "boba")).toEqual(["jelly"]);
  });

  it("ignores a new option when the group is already at its max", () => {
    expect(toggleOption([topping], ["boba", "jelly"], "cheese")).toEqual(["boba", "jelly"]);
  });
});
