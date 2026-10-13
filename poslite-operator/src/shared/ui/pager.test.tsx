import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Pager } from "./pager";

describe("Pager", () => {
  it("shows the range and moves to the next page", async () => {
    const onPage = vi.fn();
    render(<Pager page={1} pageSize={20} total={42} onPage={onPage} />);

    expect(screen.getByText("21–40 dari 42")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Berikutnya" }));
    expect(onPage).toHaveBeenCalledWith(2);
  });

  it("disables next on the last page and previous on the first", () => {
    render(<Pager page={0} pageSize={20} total={3} onPage={() => {}} />);

    expect(screen.getByText("1–3 dari 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sebelumnya" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Berikutnya" })).toBeDisabled();
  });

  it("shows an empty range", () => {
    render(<Pager page={0} pageSize={20} total={0} onPage={() => {}} />);

    expect(screen.getByText("0–0 dari 0")).toBeInTheDocument();
  });
});
