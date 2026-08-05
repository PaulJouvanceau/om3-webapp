import React from "react";
import {render, screen, waitFor, within, fireEvent, act} from "@testing-library/react";
import {ThemeProvider, createTheme} from "@mui/material/styles";
import {MemoryRouter} from "react-router-dom";
import userEvent from "@testing-library/user-event";
import Heartbeats from "../Heartbeats";
import useEventStore from "../../hooks/useEventStore.js";
import {
    closeEventSource,
    startEventReception,
} from "../../eventSourceManager.jsx";
import {vi} from "vitest";

const {mockUseMediaQuery} = vi.hoisted(() => {
    return {mockUseMediaQuery: vi.fn()};
});

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

vi.mock("../../hooks/useEventStore.js", () => ({
    __esModule: true,
    default: vi.fn(),
}));

vi.mock("../../eventSourceManager.jsx", () => ({
    startEventReception: vi.fn(),
    closeEventSource: vi.fn(),
    startLoggerReception: vi.fn(),
    closeLoggerEventSource: vi.fn(),
}));

vi.mock("@mui/material", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        useMediaQuery: mockUseMediaQuery,
    };
});

vi.mock("@mui/icons-material/FilterList", () => ({
    default: () => <span data-testid="FilterListIcon"/>,
}));

const mockLocalStorage = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
};
Object.defineProperty(window, "localStorage", {value: mockLocalStorage});

const theme = createTheme();

const renderWithRouter = (ui, {route = "/"} = {}) => {
    const Wrapper = ({children}) => (
        <MemoryRouter initialEntries={[route]}>
            <ThemeProvider theme={theme}>{children}</ThemeProvider>
        </MemoryRouter>
    );
    return render(ui, {wrapper: Wrapper});
};

// Helper to build heartbeat status from stream definitions
const buildStatus = (streamDefs) => {
    const status = {};
    streamDefs.forEach(({node, streams}) => {
        status[node] = {streams: streams.map(s => ({...s}))};
    });
    return status;
};

// Default media query : desktop, filters always visible
const defaultMediaQuery = vi.fn(() => false);

describe("Heartbeats Component", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockLocalStorage.getItem.mockReturnValue("valid-token");
        mockNavigate.mockClear();
        mockUseMediaQuery.mockImplementation(defaultMediaQuery);
    });

    afterEach(() => {
        mockUseMediaQuery.mockImplementation(defaultMediaQuery);
    });

    // Helper to correctly mock useEventStore with a selector
    const mockHeartbeatStore = (heartbeatStatus) => {
        useEventStore.mockImplementation((selector) =>
            selector({heartbeatStatus})
        );
    };

    // ==================== STRUCTURE & BASIC RENDER ====================
    test("renders table structure and basic heartbeat rows", async () => {
        mockHeartbeatStore(buildStatus([{
            node: "node1",
            streams: [
                {
                    id: "hb#1.rx",
                    state: "running",
                    type: "unicast",
                    peers: {peer1: {is_beating: true, desc: ":10011 ← peer1"}}
                },
                {
                    id: "hb#2.rx",
                    state: "stopped",
                    type: "unicast",
                    peers: {peer2: {is_beating: false, desc: ":10012 ← peer2"}}
                },
            ],
        }]));

        renderWithRouter(<Heartbeats/>);

        const table = screen.getByRole("table");
        expect(table).toBeInTheDocument();
        const headerRow = within(table).getByRole("row", {name: /RUNNING BEATING ID NODE PEER TYPE DESC CHANGED_AT LAST_BEATING_AT/i});
        ["RUNNING", "BEATING", "ID", "NODE", "PEER", "TYPE", "DESC", "CHANGED_AT", "LAST_BEATING_AT"].forEach(text =>
            expect(within(headerRow).getByText(text)).toBeInTheDocument()
        );

        const dataRows = screen.getAllByRole("row").slice(1);
        expect(dataRows).toHaveLength(2);
        expect(within(dataRows[0]).getByText("1.rx")).toBeInTheDocument();
        expect(within(dataRows[1]).getByText("2.rx")).toBeInTheDocument();
    });

    // ==================== STATE ICONS ====================
    test.each([
        ["running", "CheckCircleIcon"],
        ["stopped", "PauseCircleIcon"],
        ["failed", "ErrorIcon"],
        ["warning", "WarningIcon"],
        ["unknown", "HelpIcon"],
        ["invalid-state", "HelpIcon"],
    ])("renders correct icon for state %s", async (state, iconTestId) => {
        mockHeartbeatStore(buildStatus([{
            node: "node1",
            streams: [{id: "hb#1.rx", state, type: "unicast", peers: {p: {is_beating: true, desc: "d"}}}],
        }]));
        renderWithRouter(<Heartbeats/>);
        const stateCell = within(screen.getAllByRole("row")[1]).getAllByRole("cell")[0];
        expect(within(stateCell).getByTestId(iconTestId)).toBeInTheDocument();
    });

    // ==================== FILTERS FROM URL ====================
    const filterStreams = [
        {
            id: "hb#1.rx",
            state: "running",
            type: "unicast",
            peers: {
                peer1: {
                    is_beating: true,
                    desc: ":10011 ← peer1",
                    changed_at: "2025-06-03T04:25:31+00:00",
                    last_beating_at: "2025-06-03T04:25:31+00:00"
                }
            }
        },
        {
            id: "hb#2.rx",
            state: "stopped",
            type: "unicast",
            peers: {
                peer2: {
                    is_beating: false,
                    desc: ":10012 ← peer2",
                    changed_at: "2025-06-03T04:25:31+00:00",
                    last_beating_at: "2025-06-03T04:25:31+00:00"
                }
            }
        },
    ];

    test.each([
        ["/?status=stale", 1, "2.rx"],
        ["/?status=beating", 1, "1.rx"],
        ["/?node=node1", 2, "1.rx"],
        ["/?state=stopped", 1, "2.rx"],
        ["/?id=1.rx", 1, "1.rx"],
        ["/?id=hb%231.rx", 1, "1.rx"],
        ["/?id=3.tx", 0, null],
    ])("filter from URL %s", async (route, expectedLength, expectedText) => {
        const status = buildStatus([{node: "node1", streams: filterStreams}]);
        mockHeartbeatStore(status);
        renderWithRouter(<Heartbeats/>, {route});

        const dataRows = screen.getAllByRole("row").slice(1);
        expect(dataRows).toHaveLength(expectedLength);
        if (expectedText) {
            expect(within(dataRows[0]).getByText(expectedText)).toBeInTheDocument();
        }
    });

    test("filter by id with .tx suffix", async () => {
        const status = buildStatus([{
            node: "node1",
            streams: [{
                id: "hb#3.tx",
                state: "running",
                type: "unicast",
                peers: {
                    peer3: {
                        is_beating: true,
                        desc: ":10013 ← peer3",
                        changed_at: "2025-06-03T04:25:31+00:00",
                        last_beating_at: "2025-06-03T04:25:31+00:00"
                    }
                }
            }]
        }]);
        mockHeartbeatStore(status);
        renderWithRouter(<Heartbeats/>, {route: "/?id=3.tx"});
        expect(screen.getAllByRole("row").slice(1)).toHaveLength(1);
        expect(screen.getByText("3.tx")).toBeInTheDocument();
    });

    test("invalid status defaults to all", async () => {
        mockHeartbeatStore(buildStatus([{
            node: "node1",
            streams: [{
                id: "hb#1.rx",
                state: "running",
                type: "unicast",
                peers: {
                    peer1: {
                        is_beating: true,
                        desc: ":10011 ← peer1",
                        changed_at: "2025-06-03T04:25:31+00:00",
                        last_beating_at: "2025-06-03T04:25:31+00:00"
                    }
                }
            }]
        }]));
        renderWithRouter(<Heartbeats/>, {route: "/?status=invalid"});
        await waitFor(() => expect(screen.getByText("1.rx")).toBeInTheDocument());
    });

    test("does not update URL if filter unchanged", async () => {
        mockHeartbeatStore(buildStatus([{
            node: "node1",
            streams: [{id: "hb#1.rx", state: "running", peers: {}, type: "t"}]
        }]));
        renderWithRouter(<Heartbeats/>, {route: "/?node=node1"});
        await waitFor(() => {
        }, {timeout: 500});
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    // ==================== EDGE CASES: STOPPED STREAMS & CACHE ====================
    test("handles stopped stream with cached peers", async () => {
        const initialStatus = buildStatus([{
            node: "node1",
            streams: [{
                id: "hb#1.rx",
                state: "running",
                type: "unicast",
                peers: {
                    peer1: {
                        is_beating: true,
                        desc: ":10011 ← peer1",
                        changed_at: "2025-06-03T04:25:31+00:00",
                        last_beating_at: "2025-06-03T04:25:31+00:00"
                    }
                }
            }]
        }]);
        const stoppedStatus = buildStatus([{
            node: "node1",
            streams: [{id: "hb#1.rx", state: "stopped", type: "unicast", peers: {}}]
        }]);

        useEventStore.mockImplementation(selector => selector({heartbeatStatus: initialStatus}));
        const {rerender} = renderWithRouter(<Heartbeats/>);

        let cells = within(screen.getAllByRole("row")[1]).getAllByRole("cell");
        expect(cells[4]).toHaveTextContent("peer1");

        useEventStore.mockImplementation(selector => selector({heartbeatStatus: stoppedStatus}));
        rerender(<Heartbeats/>);
        await waitFor(() => {
            const updatedCells = within(screen.getAllByRole("row")[1]).getAllByRole("cell");
            expect(updatedCells[4]).toHaveTextContent("peer1");
            expect(updatedCells[6]).toHaveTextContent(":10011 ← peer1");
        }, {timeout: 2000});
    });

    test("displays N/A for stopped stream with no cached peers", async () => {
        mockHeartbeatStore(buildStatus([{
            node: "node1",
            streams: [{id: "hb#1.rx", state: "stopped", type: "unicast", peers: {}}]
        }]));
        renderWithRouter(<Heartbeats/>);
        const cells = within(screen.getAllByRole("row")[1]).getAllByRole("cell");
        expect(cells[4]).toHaveTextContent("N/A");
        expect(cells[5]).toHaveTextContent("unicast");
        expect(cells[6]).toHaveTextContent("N/A");
        expect(cells[7]).toHaveTextContent("N/A");
        expect(cells[8]).toHaveTextContent("N/A");
    });

    // ==================== EMPTY / MISSING DATA ====================
    test("handles empty or null streams", () => {
        mockHeartbeatStore({node1: {streams: []}, node2: {streams: null}});
        renderWithRouter(<Heartbeats/>);
        expect(screen.getAllByRole("row")).toHaveLength(1);
    });

    test("shows message when no heartbeats match filters", () => {
        mockHeartbeatStore(buildStatus([{
            node: "node1",
            streams: [{
                id: "hb#1.rx",
                state: "running",
                peers: {peer1: {is_beating: true, desc: "desc"}},
                type: "unicast"
            }]
        }]));
        renderWithRouter(<Heartbeats/>, {route: "/?node=nonexistent"});
        expect(screen.getByText("No heartbeats found matching the current filters.")).toBeInTheDocument();
    });

    // ==================== SORTING ====================
    const sortTestData = [
        ["id", "ID", "a.rx", "b.rx"],
        ["peer", "PEER", "a_peer", "b_peer"],
        ["type", "TYPE", "a_type", "b_type"],
        ["desc", "DESC", "a_desc", "b_desc"],
        ["changed_at", "CHANGED_AT", "2024-01-01", "2024-02-01"],
        ["last_beating_at", "LAST_BEATING_AT", "2024-01-01", "2024-02-01"],
    ];

    test.each(sortTestData)("sorts by %s column", async (key, headerText, ascValue, descValue) => {
        const status = {
            node1: {
                streams: [
                    {
                        id: key === "id" ? "hb#b.rx" : "hb#1.rx",
                        state: "running",
                        peers: {
                            [key === "peer" ? "b_peer" : "peer1"]: {
                                is_beating: true,
                                desc: key === "desc" ? "b_desc" : "desc1",
                                changed_at: key === "changed_at" ? "2024-02-01" : "2024-01-01",
                                last_beating_at: key === "last_beating_at" ? "2024-02-01" : "2024-01-01",
                            },
                        },
                        type: key === "type" ? "b_type" : "type1",
                    },
                    {
                        id: key === "id" ? "hb#a.rx" : "hb#2.rx",
                        state: "running",
                        peers: {
                            [key === "peer" ? "a_peer" : "peer2"]: {
                                is_beating: true,
                                desc: key === "desc" ? "a_desc" : "desc2",
                                changed_at: key === "changed_at" ? "2024-01-01" : "2024-01-02",
                                last_beating_at: key === "last_beating_at" ? "2024-01-01" : "2024-01-02",
                            },
                        },
                        type: key === "type" ? "a_type" : "type2",
                    },
                ],
            },
        };
        mockHeartbeatStore(status);
        renderWithRouter(<Heartbeats/>);

        const header = screen.getByText(headerText);
        await userEvent.click(header);
        let rows = screen.getAllByRole("row").slice(1);
        expect(within(rows[0]).getByText(ascValue)).toBeInTheDocument();
        expect(within(rows[1]).getByText(descValue)).toBeInTheDocument();

        await userEvent.click(header);
        rows = screen.getAllByRole("row").slice(1);
        expect(within(rows[0]).getByText(descValue)).toBeInTheDocument();
        expect(within(rows[1]).getByText(ascValue)).toBeInTheDocument();
    });

    test("sorts by beating column", async () => {
        mockHeartbeatStore({
            node1: {
                streams: [
                    {id: "hb#1.rx", state: "running", peers: {peer1: {is_beating: true, desc: "desc1"}}, type: "type1"},
                    {
                        id: "hb#2.rx",
                        state: "running",
                        peers: {peer2: {is_beating: false, desc: "desc2"}},
                        type: "type2"
                    },
                ],
            },
        });
        renderWithRouter(<Heartbeats/>);

        const beatingHeader = screen.getByText("BEATING");
        await userEvent.click(beatingHeader);
        let rows = screen.getAllByRole("row").slice(1);
        expect(within(rows[0]).getByText("2.rx")).toBeInTheDocument();
        expect(within(rows[1]).getByText("1.rx")).toBeInTheDocument();

        await userEvent.click(beatingHeader);
        rows = screen.getAllByRole("row").slice(1);
        expect(within(rows[0]).getByText("1.rx")).toBeInTheDocument();
        expect(within(rows[1]).getByText("2.rx")).toBeInTheDocument();
    });

    test("sorting by state column", async () => {
        const states = ["running", "warning", "stopped", "failed", "unknown"];
        const status = {
            node1: {
                streams: states.map((s, i) => ({
                    id: `hb#${i + 1}.rx`,
                    state: s,
                    peers: {peer: {is_beating: false, desc: `desc${i + 1}`}},
                    type: `type${i + 1}`,
                })),
            },
        };
        mockHeartbeatStore(status);
        renderWithRouter(<Heartbeats/>);

        const stateHeader = screen.getByText("RUNNING");
        await userEvent.click(stateHeader);
        let rows = screen.getAllByRole("row").slice(1);
        ["5.rx", "4.rx", "3.rx", "2.rx", "1.rx"].forEach((id, idx) =>
            expect(within(rows[idx]).getByText(id)).toBeInTheDocument()
        );

        await userEvent.click(stateHeader);
        rows = screen.getAllByRole("row").slice(1);
        ["1.rx", "2.rx", "3.rx", "4.rx", "5.rx"].forEach((id, idx) =>
            expect(within(rows[idx]).getByText(id)).toBeInTheDocument()
        );
    });

    test("sorting different column resets direction to asc", async () => {
        mockHeartbeatStore({
            node1: {
                streams: [
                    {id: "hb#b.rx", state: "running", peers: {p: {is_beating: true}}, type: "t"},
                    {id: "hb#a.rx", state: "running", peers: {p: {is_beating: true}}, type: "t"},
                ],
            },
        });
        renderWithRouter(<Heartbeats/>);

        const beatingHeader = screen.getByText("BEATING");
        await userEvent.click(beatingHeader);
        await userEvent.click(beatingHeader);
        await userEvent.click(screen.getByText("ID"));
        const rows = screen.getAllByRole("row").slice(1);
        expect(within(rows[0]).getByText("a.rx")).toBeInTheDocument();
    });

    // ==================== MULTIPLE NODES & SINGLE NODE ====================
    test("handles multiple nodes and ordering", async () => {
        mockHeartbeatStore(buildStatus([
            {
                node: "nodeB",
                streams: [{
                    id: "hb#2.rx",
                    state: "running",
                    type: "unicast",
                    peers: {
                        peer2: {
                            is_beating: true,
                            desc: ":10012 ← peer2",
                            changed_at: "2025-06-03T04:25:31+00:00",
                            last_beating_at: "2025-06-03T04:25:31+00:00"
                        }
                    }
                }]
            },
            {
                node: "nodeA",
                streams: [{
                    id: "hb#1.rx",
                    state: "running",
                    type: "unicast",
                    peers: {
                        peer1: {
                            is_beating: true,
                            desc: ":10011 ← peer1",
                            changed_at: "2025-06-03T04:25:31+00:00",
                            last_beating_at: "2025-06-03T04:25:31+00:00"
                        }
                    }
                }]
            },
        ]));
        renderWithRouter(<Heartbeats/>);
        const dataRows = screen.getAllByRole("row").slice(1);
        expect(dataRows).toHaveLength(2);
        expect(within(dataRows[0]).getByText("nodeA")).toBeInTheDocument();
        expect(within(dataRows[1]).getByText("nodeB")).toBeInTheDocument();
    });

    test("single node always shows healthy beating icon", async () => {
        mockHeartbeatStore(buildStatus([{
            node: "node1",
            streams: [{
                id: "hb#1.rx",
                state: "running",
                type: "unicast",
                peers: {
                    peer1: {
                        is_beating: false,
                        desc: ":10011 ← peer1",
                        changed_at: "2025-06-03T04:25:31+00:00",
                        last_beating_at: "2025-06-03T04:25:31+00:00"
                    }
                }
            }]
        }]));
        renderWithRouter(<Heartbeats/>);
        const beatingCell = within(screen.getAllByRole("row")[1]).getAllByRole("cell")[1];
        expect(within(beatingCell).getByTestId("CheckCircleIcon")).toBeInTheDocument();
    });

    // ==================== AUTH & CLEANUP ====================
    test("initializes with auth token and cleans up on unmount", () => {
        mockHeartbeatStore({});
        const {unmount} = renderWithRouter(<Heartbeats/>);
        expect(mockLocalStorage.getItem).toHaveBeenCalledWith("authToken");
        expect(startEventReception).toHaveBeenCalledWith("valid-token", expect.any(Array));
        unmount();
        expect(closeEventSource).toHaveBeenCalled();
    });

    test("does not start event reception without auth token", () => {
        mockLocalStorage.getItem.mockReturnValue(null);
        mockHeartbeatStore({});
        renderWithRouter(<Heartbeats/>);
        expect(startEventReception).not.toHaveBeenCalled();
    });

    // ==================== LAZY LOADING (SCROLL) ====================
    test("loads more rows when scrolling near bottom", async () => {
        const manyStreams = {};
        for (let i = 1; i <= 50; i++) {
            manyStreams[`node${i}`] = {
                streams: [{
                    id: `hb#${i}.rx`,
                    state: "running",
                    type: "unicast",
                    peers: {
                        peer1: {
                            is_beating: true,
                            desc: `desc${i}`,
                            changed_at: "2025-06-03T04:25:31+00:00",
                            last_beating_at: "2025-06-03T04:25:31+00:00"
                        }
                    },
                }],
            };
        }
        mockHeartbeatStore(manyStreams);
        renderWithRouter(<Heartbeats/>);

        expect(screen.getAllByRole("row").slice(1)).toHaveLength(30);

        const container = document.querySelector(".MuiTableContainer-root");
        Object.defineProperty(container, "scrollHeight", {value: 1000, configurable: true});
        Object.defineProperty(container, "clientHeight", {value: 200, configurable: true});

        act(() => {
            container.scrollTop = 850;
        });
        fireEvent.scroll(container);

        await waitFor(() => {
            expect(screen.getAllByRole("row").slice(1).length).toBeGreaterThan(30);
        }, {timeout: 2000});
    });

    // ==================== RESPONSIVE FILTERS ====================
    test.each([
        ["mobile", true, false, true, false],
        ["wide screen", false, true, false, true],
        ["desktop", false, false, false, true],
    ])("filter visibility on %s", async (_, isMobile, isWide, buttonExists, initiallyVisible) => {
        mockUseMediaQuery.mockImplementation((query) => {
            if (query === theme.breakpoints.down("md")) return isMobile;
            if (query === theme.breakpoints.up("lg")) return isWide;
            return false;
        });
        mockHeartbeatStore({node1: {streams: []}});
        renderWithRouter(<Heartbeats/>);

        const filterIcon = screen.queryByTestId("FilterListIcon");
        expect(!!filterIcon).toBe(buttonExists);

        const collapse = document.querySelector('.MuiCollapse-root');
        expect(collapse).toBeInTheDocument();
        if (initiallyVisible) {
            await waitFor(() => {
                expect(collapse).not.toHaveClass('MuiCollapse-hidden');
            });
        } else {
            await waitFor(() => {
                expect(collapse).toHaveClass('MuiCollapse-hidden');
            });
        }
    });

    test("mobile filter button toggles visibility", async () => {
        mockUseMediaQuery.mockImplementation((query) => {
            if (query === theme.breakpoints.down("md")) return true;
            return false;
        });
        mockHeartbeatStore({node1: {streams: []}});
        renderWithRouter(<Heartbeats/>);

        const collapse = document.querySelector('.MuiCollapse-root');
        const filterIcon = screen.getByTestId("FilterListIcon");
        const filterButton = filterIcon.closest("button");

        await waitFor(() => expect(collapse).toHaveClass('MuiCollapse-hidden'));

        await userEvent.click(filterButton);
        await waitFor(() => expect(collapse).not.toHaveClass('MuiCollapse-hidden'));

        await userEvent.click(filterButton);
        await waitFor(() => expect(collapse).toHaveClass('MuiCollapse-hidden'));
    });
});
