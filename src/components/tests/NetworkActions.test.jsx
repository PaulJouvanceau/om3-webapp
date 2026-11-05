import React, {useState} from "react";
import {afterEach, beforeEach, describe, expect, test, vi} from "vitest";
import {fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {PanelHeaderContext} from "../../app/panel-header";
import {useActionTracker} from "../../app/action-tracker";
import {NetworkActions} from "../RecordPanels";

let grants = {root: [""]};
vi.mock("../../hooks/useGrants", () => ({useGrants: () => grants}));
vi.mock("../../hooks/useClusterNodeOrder", () => ({useClusterNodeOrder: () => ["dev2n1", "dev2n2"]}));

/** The title bar of a panel: the place its actions go. */
function Header({children}) {
    const [slot, setSlot] = useState(null);
    return (
        <>
            <div ref={setSlot} data-testid="actions"/>
            <PanelHeaderContext.Provider value={{title: null, actions: slot}}>{children}</PanelHeaderContext.Provider>
        </>
    );
}

beforeEach(() => {
    grants = {root: [""]};
    useActionTracker.setState({tracked: []});
    localStorage.setItem("authToken", "tok");
});

afterEach(() => {
    vi.restoreAllMocks();
    useActionTracker.setState({tracked: []});
});

describe("NetworkActions", () => {
    test("root sets the network up on every node, confirmed first, each followed in the tray", async () => {
        globalThis.fetch = vi.fn(() => Promise.resolve({ok: true, status: 204, json: () => Promise.resolve(null)}));
        render(<Header><NetworkActions name="br-prd"/></Header>);
        fireEvent.click(within(await screen.findByTestId("actions")).getByRole("button", {name: "Actions on the network br-prd"}));
        fireEvent.click(await screen.findByRole("menuitem", {name: /Network setup/}));
        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByText(/br-prd on the 2 nodes/)).toBeInTheDocument();
        expect(globalThis.fetch).not.toHaveBeenCalled();
        fireEvent.click(within(dialog).getByRole("button", {name: "Network setup"}));
        await waitFor(() => {
            expect(useActionTracker.getState().tracked.map((e) => [e.subject, e.state]).sort()).toEqual([
                ["br-prd on dev2n1", "succeeded"],
                ["br-prd on dev2n2", "succeeded"],
            ]);
        });
        const urls = vi.mocked(globalThis.fetch).mock.calls.map(([url]) => url).sort();
        expect(urls).toEqual([
            expect.stringMatching(/\/node\/name\/dev2n1\/network\/setup\?name=br-prd$/),
            expect.stringMatching(/\/node\/name\/dev2n2\/network\/setup\?name=br-prd$/),
        ]);
    });

    test("not root: offered, not to be run", async () => {
        grants = {admin: ["test"]};
        render(<Header><NetworkActions name="br-prd"/></Header>);
        fireEvent.click(within(await screen.findByTestId("actions")).getByRole("button", {name: "Actions on the network br-prd"}));
        const item = await screen.findByRole("menuitem", {name: /Network setup/});
        expect(item).toBeDisabled();
    });
});
