// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import DevPersonaSwitcher from "./DevPersonaSwitcher";

const personas = [
  { key: "admin", name: "Dev Admin", role: "System admin", scope: "Both labs" },
  { key: "incharge-vlsi", name: "Dev Incharge VLSI", role: "Lab incharge", scope: "DEV-VLSI" },
];
const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
const assign = vi.fn();

function stubFetch(loginStatus = 200, listStatus = 200) {
  const fetch = vi.fn(async (path: string) => {
    if (path === "/auth/dev/personas") return listStatus === 200 ? json({ personas }) : json({ error: "not_found" }, listStatus);
    if (path === "/auth/dev/login") return json({}, loginStatus);
    throw new Error(`Unexpected request ${path}`);
  });
  vi.stubGlobal("fetch", fetch);
  vi.stubGlobal("location", { ...window.location, assign });
  return fetch;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); assign.mockReset(); });

describe("DevPersonaSwitcher", () => {
  it("lists the personas returned by the API", async () => {
    stubFetch();
    render(<DevPersonaSwitcher />);
    const select = await screen.findByRole("combobox", { name: "Development sign-in" });
    expect(screen.getByText("DEV")).toBeTruthy();
    expect(Array.from(select.querySelectorAll("option")).map((option) => option.value)).toEqual(["", "admin", "incharge-vlsi"]);
  });

  it("shows the current user and a different accessible name when signed in", async () => {
    stubFetch();
    const user = { id: "u1", displayName: "Dev Incharge VLSI", email: null, accountType: "staff" as const };
    render(<DevPersonaSwitcher user={user} />);
    const select = await screen.findByRole("combobox", { name: "Sign in as someone else" });
    expect(select.querySelector("option")?.textContent).toBe("Dev Incharge VLSI · Lab incharge");
    expect(screen.queryByRole("combobox", { name: "Development sign-in" })).toBeNull();
  });

  it("explains the bypass in a tooltip and shows each option as name and role", async () => {
    stubFetch();
    render(<DevPersonaSwitcher />);
    const select = await screen.findByRole("combobox", { name: "Development sign-in" });
    expect(select.closest(".dev-switcher")?.getAttribute("title")).toMatch(/every permission is still resolved from the database/);
    expect(screen.getByRole("option", { name: "Dev Admin · System admin" }).getAttribute("title")).toBe("Both labs");
    expect(screen.getByRole("option", { name: "Development sign-in…" })).toBeTruthy();
  });

  it("logs in as the selected persona and navigates to /labs", async () => {
    const fetch = stubFetch();
    render(<DevPersonaSwitcher />);
    await userEvent.selectOptions(await screen.findByRole("combobox", { name: "Development sign-in" }), "incharge-vlsi");
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/labs"));
    const login = fetch.mock.calls.find(([path]) => path === "/auth/dev/login") as unknown as [string, RequestInit];
    expect(login[1].method).toBe("POST");
    expect(JSON.parse(login[1].body as string)).toEqual({ persona: "incharge-vlsi" });
  });

  it("renders nothing when the personas endpoint returns 404", async () => {
    const fetch = stubFetch(200, 404);
    const { container } = render(<DevPersonaSwitcher />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.innerHTML).toBe("");
  });

  it("shows an error and stays put when login fails", async () => {
    stubFetch(404);
    render(<DevPersonaSwitcher />);
    await userEvent.selectOptions(await screen.findByRole("combobox", { name: "Development sign-in" }), "admin");
    expect((await screen.findByRole("alert")).textContent).toMatch(/Could not sign in/);
    expect(assign).not.toHaveBeenCalled();
  });
});
