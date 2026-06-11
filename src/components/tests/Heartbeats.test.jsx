import React from "react";
import {
    render,
    screen,
    waitFor,
    within,
    fireEvent,
} from "@testing-library/react";
import {ThemeProvider, createTheme} from "@mui/material/styles";
import {MemoryRouter} from "react-router-dom";
import userEvent from "@testing-library/user-event";
import Heartbeats from "../Heartbeats";
import useEventStore from "../../hooks/useEventStore.js";
import {
    closeEventSource,
    startEventReception,
    startLoggerReception,
    closeLoggerEventSource,
} from "../../eventSourceManager.jsx";

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
    ...jest.requireActual("react-router-dom"),
    useNavigate: () => mockNavigate,
}));

jest.mock("../../hooks/useEventStore.js", () => ({
    __esModule: true,
    default: jest.fn(),
}));

jest.mock("../../eventSourceManager.jsx", () => ({
    startEventReception: jest.fn(),
    closeEventSource: jest.fn(),
    startLoggerReception: jest.fn(),
    closeLoggerEventSource: jest.fn(),
}));

jest.mock("@mui/material/useMediaQuery", () => jest.fn());

const mockLocalStorage = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
};
Object.defineProperty(window, "localStorage", {value: mockLocalStorage});

const theme = createTheme();

const renderWithRouter = (ui, {route = "/"} = {}) => {
    const wrapper = ({children}) => (
        <MemoryRouter initialEntries={[route]}>
            <ThemeProvider theme={theme}>{children}</ThemeProvider>
        </MemoryRouter>
    );
    return render(ui, {wrapper});
};

describe("Heartbeats Component", () => {
    const mockUseMediaQuery = jest.requireMock("@mui/material/useMediaQuery");

    beforeEach(() => {
        jest.clearAllMocks();
        mockLocalStorage.getItem.mockReturnValue("valid-token");
        startEventReception.mockImplementation(jest.fn());
        closeEventSource.mockImplementation(jest.fn());
        startLoggerReception.mockImplementation(jest.fn());
        closeLoggerEventSource.mockImplementation(jest.fn());
        mockNavigate.mockClear();

        mockUseMediaQuery.mockImplementation((query) => {
            if (query === theme.breakpoints.down("md")) return false;
            if (query === theme.breakpoints.up("lg")) return false;
            return false;
        });
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test("renders basic table structure", () => {
        useEventStore.mockReturnValue({heartbeatStatus: {}});
        renderWithRouter(<Heartbeats/>);
        expect(screen.getByRole("table")).toBeInTheDocument();
        const headerRow = within(screen.getByRole("table")).getByRole("row", {
            name: /RUNNING BEATING ID NODE PEER TYPE DESC CHANGED_AT LAST_BEATING_AT/i,
        });
        expect(within(headerRow).getByText("RUNNING")).toBeInTheDocument();
        expect(within(headerRow).getByText("BEATING")).toBeInTheDocument();
        expect(within(headerRow).getByText("NODE")).toBeInTheDocument();
    });

    test("renders heartbeat rows for all state types including invalid state", async () => {
        const mockHeartbeatStatus = {
            node1: {
                streams: [
                    createStream("hb#1.rx", "running", {peer1: {is_beating: true, desc: ":10011 ← peer1"}}, "unicast"),
                    createStream("hb#2.rx", "stopped", {peer2: {is_beating: false, desc: ":10012 ← peer2"}}, "unicast"),
                    createStream("hb#3.rx", "failed", {peer3: {is_beating: false, desc: ":10013 ← peer3"}}, "unicast"),
                    createStream("hb#4.rx", "warning", {peer4: {is_beating: false, desc: ":10014 ← peer4"}}, "unicast"),
                    createStream("hb#5.rx", "unknown", {peer5: {is_beating: false, desc: ":10015 ← peer5"}}, "unicast"),
                    createStream("hb#6.rx", "invalid-state", {
                        peer6: {
                            is_beating: true,
                            desc: ":10016 ← peer6"
                        }
                    }, "unicast"),
                ],
            },
        };
        useEventStore.mockImplementation((selector) => selector({heartbeatStatus: mockHeartbeatStatus}));

        renderWithRouter(<Heartbeats/>);

        const rows = await screen.findAllByRole("row");
        const dataRows = rows.slice(1);
        expect(dataRows).toHaveLength(6);

        dataRows.forEach((row, index) => {
            const cells = within(row).getAllByRole("cell");
            expect(cells[2]).toHaveTextContent(`${index + 1}.rx`);
            expect(cells[3]).toHaveTextContent("node1");
            expect(cells[4]).toHaveTextContent(`peer${index + 1}`);
            expect(cells[5]).toHaveTextContent("unicast");
            expect(cells[6]).toHaveTextContent(`:1001${index + 1} ← peer${index + 1}`);
        });

        const invalidRow = dataRows[5];
        const stateCell = within(invalidRow).getAllByRole("cell")[0];
        expect(within(stateCell).getByTestId("HelpIcon")).toBeInTheDocument();
    });

    test("filters heartbeats correctly via dropdowns and shows no-result message", async () => {
        const mockHeartbeatStatus = {
            nodeA: {
                streams: [
                    createStream("hb#1.rx", "running", {peer1: {is_beating: true, desc: "desc1"}}, "typeX"),
                    createStream("hb#2.rx", "stopped", {peer2: {is_beating: false, desc: "desc2"}}, "typeY"),
                ],
            },
            nodeB: {
                streams: [
                    createStream("hb#3.rx", "running", {peer3: {is_beating: false, desc: "desc3"}}, "typeX"),
                ],
            },
        };
        useEventStore.mockImplementation((selector) => selector({heartbeatStatus: mockHeartbeatStatus}));

        renderWithRouter(<Heartbeats/>);
        let rows = await screen.findAllByRole("row");
        expect(rows.slice(1)).toHaveLength(3);

        const user = userEvent.setup();

        const selectByIndex = async (index, optionName) => {
            const comboboxes = screen.getAllByRole("combobox");
            await user.click(comboboxes[index]);
            const option = screen.getByRole("option", {name: optionName});
            await user.click(option);
        };

        await selectByIndex(0, /^stopped$/i);
        rows = await screen.findAllByRole("row");
        expect(rows.slice(1)).toHaveLength(1);
        expect(within(rows[1]).getByText("2.rx")).toBeInTheDocument();

        await selectByIndex(0, /^all$/i);

        await selectByIndex(1, /^stale$/i);
        rows = await screen.findAllByRole("row");
        expect(rows.slice(1)).toHaveLength(2);
        expect(screen.queryByText("1.rx")).toBeNull();

        await selectByIndex(1, /^all$/i);

        await selectByIndex(2, "nodeB");
        rows = await screen.findAllByRole("row");
        expect(rows.slice(1)).toHaveLength(1);
        expect(within(rows[1]).getByText("3.rx")).toBeInTheDocument();

        await selectByIndex(2, /^all$/i);
        await selectByIndex(3, "1");
        rows = await screen.findAllByRole("row");
        expect(rows.slice(1)).toHaveLength(1);
        expect(within(rows[1]).getByText("1.rx")).toBeInTheDocument();

        await selectByIndex(2, "nodeB");
        await selectByIndex(3, "1");
        await waitFor(() => {
            expect(
                screen.getByText("No heartbeats found matching the current filters.")
            ).toBeInTheDocument();
        });
    });

    test("initializes filters from URL query parameters", async () => {
        const mockHeartbeatStatus = {
            node1: {
                streams: [
                    createStream("hb#1.rx", "running", {peer1: {is_beating: true, desc: "desc1"}}, "unicast"),
                    createStream("hb#2.rx", "running", {peer2: {is_beating: false, desc: "desc2"}}, "unicast"),
                ],
            },
            node2: {
                streams: [
                    createStream("hb#3.rx", "stopped", {peer3: {is_beating: false, desc: "desc3"}}, "unicast"),
                ],
            },
        };
        useEventStore.mockImplementation((selector) => selector({heartbeatStatus: mockHeartbeatStatus}));

        const testCases = [
            {route: "/?status=beating", expectedIds: ["1.rx"]},
            {route: "/?status=stale", expectedIds: ["2.rx", "3.rx"]},
            {route: "/?node=node1", expectedIds: ["1.rx", "2.rx"]},
            {route: "/?state=stopped", expectedIds: ["3.rx"]},
            {route: "/?id=1.rx", expectedIds: ["1.rx"]},
            {route: "/?id=hb%231.rx", expectedIds: ["1.rx"]},
            {route: "/?id=3.rx", expectedIds: ["3.rx"]},
            {route: "/?status=invalid", expectedIds: ["1.rx", "2.rx", "3.rx"]},
        ];

        for (const {route, expectedIds} of testCases) {
            const {unmount} = renderWithRouter(<Heartbeats/>, {route});
            const rows = await screen.findAllByRole("row");
            const dataRows = rows.slice(1);
            const foundIds = dataRows.map(
                (row) => within(row).getAllByRole("cell")[2].textContent
            );
            expect(foundIds.sort()).toEqual(expectedIds.sort());
            unmount();
        }
    });

    test("sorts rows by any column ascending and descending", async () => {
        const mockHeartbeatStatus = {
            node1: {
                streams: [
                    {
                        id: "hb#b.rx",
                        state: "warning",
                        peers: {
                            b_peer: {
                                is_beating: false,
                                desc: "z_desc",
                                changed_at: "2024-02-01",
                                last_beating_at: "2024-02-01",
                            },
                        },
                        type: "b_type",
                    },
                    {
                        id: "hb#a.rx",
                        state: "running",
                        peers: {
                            a_peer: {
                                is_beating: true,
                                desc: "a_desc",
                                changed_at: "2024-01-01",
                                last_beating_at: "2024-01-01",
                            },
                        },
                        type: "a_type",
                    },
                ],
            },
        };
        useEventStore.mockImplementation((selector) => selector({heartbeatStatus: mockHeartbeatStatus}));

        renderWithRouter(<Heartbeats/>);
        const user = userEvent.setup();

        const columns = [
            {label: "ID", key: "id", ascExpected: ["a.rx", "b.rx"], descExpected: ["b.rx", "a.rx"]},
            {label: "NODE", key: "node", ascExpected: ["node1", "node1"], descExpected: ["node1", "node1"]},
            {label: "PEER", key: "peer", ascExpected: ["a_peer", "b_peer"], descExpected: ["b_peer", "a_peer"]},
            {label: "TYPE", key: "type", ascExpected: ["a_type", "b_type"], descExpected: ["b_type", "a_type"]},
            {label: "DESC", key: "desc", ascExpected: ["a_desc", "z_desc"], descExpected: ["z_desc", "a_desc"]},
            {
                label: "CHANGED_AT",
                key: "changed_at",
                ascExpected: ["2024-01-01", "2024-02-01"],
                descExpected: ["2024-02-01", "2024-01-01"]
            },
            {
                label: "LAST_BEATING_AT",
                key: "last_beating_at",
                ascExpected: ["2024-01-01", "2024-02-01"],
                descExpected: ["2024-02-01", "2024-01-01"]
            },
        ];

        const colIndexMap = {
            id: 2,
            node: 3,
            peer: 4,
            type: 5,
            desc: 6,
            changed_at: 7,
            last_beating_at: 8,
        };

        for (const {label, ascExpected, descExpected, key} of columns) {
            const header = screen.getByText(label);
            const colIndex = colIndexMap[key];

            await user.click(header);
            let rows = await screen.findAllByRole("row");
            let values = rows.slice(1).map(
                (row) => within(row).getAllByRole("cell")[colIndex].textContent
            );
            expect(values).toEqual(ascExpected);

            await user.click(header);
            rows = await screen.findAllByRole("row");
            values = rows.slice(1).map(
                (row) => within(row).getAllByRole("cell")[colIndex].textContent
            );
            expect(values).toEqual(descExpected);
        }
    });

    test("sorts by state and beating columns correctly", async () => {
        const mockHeartbeatStatus = {
            node1: {
                streams: [
                    {id: "hb#1.rx", state: "running", peers: {p: {is_beating: true}}, type: "t"},
                    {id: "hb#2.rx", state: "warning", peers: {p: {is_beating: false}}, type: "t"},
                    {id: "hb#3.rx", state: "stopped", peers: {p: {is_beating: false}}, type: "t"},
                    {id: "hb#4.rx", state: "failed", peers: {p: {is_beating: false}}, type: "t"},
                    {id: "hb#5.rx", state: "unknown", peers: {p: {is_beating: false}}, type: "t"},
                ],
            },
        };
        useEventStore.mockImplementation((selector) => selector({heartbeatStatus: mockHeartbeatStatus}));

        renderWithRouter(<Heartbeats/>);
        const user = userEvent.setup();

        const stateHeader = screen.getByText("RUNNING");
        await user.click(stateHeader);
        let rows = await screen.findAllByRole("row");
        let ids = rows.slice(1).map((r) => within(r).getAllByRole("cell")[2].textContent);
        expect(ids).toEqual(["5.rx", "4.rx", "3.rx", "2.rx", "1.rx"]);

        await user.click(stateHeader);
        rows = await screen.findAllByRole("row");
        ids = rows.slice(1).map((r) => within(r).getAllByRole("cell")[2].textContent);
        expect(ids).toEqual(["1.rx", "2.rx", "3.rx", "4.rx", "5.rx"]);

        const beatingHeader = screen.getByText("BEATING");
        await user.click(beatingHeader);
        rows = await screen.findAllByRole("row");
        ids = rows.slice(1).map((r) => within(r).getAllByRole("cell")[2].textContent);
        expect(ids).toEqual(["2.rx", "3.rx", "4.rx", "5.rx", "1.rx"]);

        await user.click(beatingHeader);
        rows = await screen.findAllByRole("row");
        ids = rows.slice(1).map((r) => within(r).getAllByRole("cell")[2].textContent);
        expect(ids).toEqual(["1.rx", "2.rx", "3.rx", "4.rx", "5.rx"]);
    });

    test("shows healthy icon for single node regardless of beating", async () => {
        const mockHeartbeatStatus = {
            onlyNode: {
                streams: [
                    createStream("hb#1.rx", "running", {peer1: {is_beating: false, desc: "desc"}}, "unicast"),
                ],
            },
        };
        useEventStore.mockImplementation((selector) => selector({heartbeatStatus: mockHeartbeatStatus}));

        renderWithRouter(<Heartbeats/>);
        const rows = await screen.findAllByRole("row");
        expect(rows.slice(1)).toHaveLength(1);
        const beatingCell = within(rows[1]).getAllByRole("cell")[1];
        expect(within(beatingCell).getByTestId("CheckCircleIcon")).toBeInTheDocument();
    });

    test("uses cached peers for stopped stream with no peers and shows N/A when no cache", async () => {
        const initialStatus = {
            node1: {
                streams: [
                    {
                        id: "hb#1.rx",
                        state: "running",
                        peers: {
                            peer1: {is_beating: true, desc: ":10011 ← peer1", changed_at: "t1", last_beating_at: "t2"},
                        },
                        type: "unicast",
                    },
                ],
            },
        };
        useEventStore.mockImplementation((selector) => selector({heartbeatStatus: initialStatus}));
        const {rerender} = renderWithRouter(<Heartbeats/>);
        let rows = await screen.findAllByRole("row");
        expect(within(rows[1]).getByText("peer1")).toBeInTheDocument();

        const stoppedStatus = {
            node1: {
                streams: [{id: "hb#1.rx", state: "stopped", peers: {}, type: "unicast"}],
            },
        };
        useEventStore.mockImplementation((selector) => selector({heartbeatStatus: stoppedStatus}));
        rerender(<Heartbeats/>);
        await waitFor(() => {
            rows = screen.getAllByRole("row");
            const cells = within(rows[1]).getAllByRole("cell");
            expect(cells[4]).toHaveTextContent("peer1");
            expect(cells[6]).toHaveTextContent(":10011 ← peer1");
        }, {timeout: 1000});

        const noCacheStatus = {
            node1: {
                streams: [{id: "hb#2.rx", state: "stopped", peers: {}, type: "unicast"}],
            },
        };
        useEventStore.mockImplementation((selector) => selector({heartbeatStatus: noCacheStatus}));
        rerender(<Heartbeats/>);
        await waitFor(() => {
            rows = screen.getAllByRole("row");
            const cells = within(rows[1]).getAllByRole("cell");
            expect(cells[4]).toHaveTextContent("N/A");
            expect(cells[6]).toHaveTextContent("N/A");
        });
    });

    test("handles empty or null streams gracefully", () => {
        useEventStore.mockReturnValue({
            heartbeatStatus: {
                node1: {streams: []},
                node2: {streams: null},
            },
        });
        renderWithRouter(<Heartbeats/>);
        expect(screen.getByRole("table")).toBeInTheDocument();
        expect(screen.getAllByRole("row")).toHaveLength(1);
    });

    test("starts event reception with token and cleans up on unmount", () => {
        useEventStore.mockReturnValue({heartbeatStatus: {}});
        const {unmount} = renderWithRouter(<Heartbeats/>);
        expect(mockLocalStorage.getItem).toHaveBeenCalledWith("authToken");
        expect(startEventReception).toHaveBeenCalledWith("valid-token", expect.any(Array));

        unmount();
        expect(closeEventSource).toHaveBeenCalled();
    });

    test("does not start event reception without auth token", () => {
        mockLocalStorage.getItem.mockReturnValue(null);
        useEventStore.mockReturnValue({heartbeatStatus: {}});
        renderWithRouter(<Heartbeats/>);
        expect(startEventReception).not.toHaveBeenCalled();
    });

    test("loads more rows when scrolling near bottom", async () => {
        const manyStreams = {};
        for (let i = 1; i <= 60; i++) {
            manyStreams[`node${i}`] = {
                streams: [
                    createStream(`hb#${i}.rx`, "running", {
                        peer1: {is_beating: true, desc: `desc${i}`, changed_at: "t", last_beating_at: "t"},
                    }, "unicast"),
                ],
            };
        }
        useEventStore.mockImplementation((selector) => selector({heartbeatStatus: manyStreams}));

        renderWithRouter(<Heartbeats/>);

        await waitFor(() => {
            const rows = screen.getAllByRole("row");
            expect(rows.slice(1)).toHaveLength(30);
        });

        const container = document.querySelector(".MuiTableContainer-root");
        Object.defineProperty(container, "scrollHeight", {value: 1000, configurable: true});
        Object.defineProperty(container, "clientHeight", {value: 200, configurable: true});

        container.scrollTop = 850;
        fireEvent.scroll(container);

        await waitFor(
            () => {
                const rows = screen.getAllByRole("row");
                expect(rows.slice(1).length).toBeGreaterThan(30);
            },
            {timeout: 500}
        );

        await waitFor(
            () => {
                const rows = screen.getAllByRole("row");
                expect(rows.slice(1).length).toBe(60);
            },
            {timeout: 1000}
        );
    });

    test("shows/hides filter panel depending on screen size", async () => {
        const mockHeartbeatStatus = {node1: {streams: []}};
        useEventStore.mockReturnValue({heartbeatStatus: mockHeartbeatStatus});
        const user = userEvent.setup();

        mockUseMediaQuery.mockImplementation((query) => {
            if (query === theme.breakpoints.down("md")) return true;
            return false;
        });
        const {rerender} = renderWithRouter(<Heartbeats/>);

        let filterButton = screen.getByRole("button", {name: /filters/i});
        expect(filterButton).toBeInTheDocument();
        let collapse = document.querySelector(".MuiCollapse-root");
        expect(collapse).toHaveClass("MuiCollapse-hidden");

        await user.click(filterButton);
        await waitFor(() => {
            expect(collapse).not.toHaveClass("MuiCollapse-hidden");
        });

        mockUseMediaQuery.mockImplementation((query) => {
            if (query === theme.breakpoints.up("lg")) return true;
            return false;
        });
        rerender(<Heartbeats/>);

        await waitFor(() => {
            expect(screen.queryByRole("button", {name: /filters/i})).not.toBeInTheDocument();
        });
        collapse = document.querySelector(".MuiCollapse-root");
        expect(collapse).not.toHaveClass("MuiCollapse-hidden");
    });
});

function createStream(
    id,
    state,
    peers,
    type,
    changed_at = "2025-06-03T04:25:31+00:00",
    last_beating_at = "2025-06-03T04:25:31+00:00"
) {
    const enrichedPeers = {};
    for (const [key, val] of Object.entries(peers)) {
        enrichedPeers[key] = {
            ...val,
            changed_at: val.changed_at || changed_at,
            last_beating_at: val.last_beating_at || last_beating_at,
        };
    }
    return {id, state, peers: enrichedPeers, type};
}
