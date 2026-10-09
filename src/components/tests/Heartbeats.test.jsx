import React from "react";
import {render, screen, waitFor, within, fireEvent, act} from "@testing-library/react";
import {MemoryRouter} from "react-router-dom";
import userEvent from "@testing-library/user-event";
import Heartbeats from "../Heartbeats";
import i18n from "../../i18n";
import useEventStore from "../../hooks/useEventStore.js";
import {
    closeEventSource,
    startEventReception,
} from "../../eventSourceManager.jsx";
import {vi} from "vitest";

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

const mockLocalStorage = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
};
Object.defineProperty(window, "localStorage", {value: mockLocalStorage});

const renderWithRouter = (ui, {route = "/"} = {}) => {
    const Wrapper = ({children}) => (
        <MemoryRouter initialEntries={[route]}>
            {children}
        </MemoryRouter>
    );
    return render(ui, {wrapper: Wrapper});
};

const buildStatus = (streamDefs) => {
    const status = {};
    streamDefs.forEach(({node, streams}) => {
        status[node] = {streams: streams.map(s => ({...s}))};
    });
    return status;
};

// The view reads the MUI breakpoints it used through matchMedia: below md (900px) is
// mobile, from lg (1200px) wide.
const MOBILE_QUERY = "(max-width:899.95px)";
const WIDE_QUERY = "(min-width:1200px)";

const setMedia = ({mobile = false, wide = false} = {}) => {
    window.matchMedia = vi.fn((query) => ({
        matches: (query === MOBILE_QUERY && mobile) || (query === WIDE_QUERY && wide),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
    }));
};

const SELECT_LABEL = {running: "Running", beating: "Beating", node: "Node", id: "ID"};

const getFilter = (selectKey, options) =>
    screen.getByRole("combobox", {name: SELECT_LABEL[selectKey], ...options});

const selectFilterOption = async (user, selectKey, optionName) => {
    const select = getFilter(selectKey);
    await user.selectOptions(select, within(select).getByRole("option", {name: optionName}));
};

const EMPTY_MESSAGE = "No heartbeats found matching the current filters.";

/** The heartbeat rows of the body, without the row telling the table is empty. */
const getDataRows = () =>
    screen.getAllByRole("row").slice(1).filter(row => !row.textContent.includes(EMPTY_MESSAGE));

const getScrollContainer = () => screen.getByRole("table").parentElement;

const stoppedStreamWithCacheScenario = ({
                                            cachedPeer = {
                                                is_beating: true,
                                                desc: ":10011 ← peer1",
                                                changed_at: "t1",
                                                last_beating_at: "t2"
                                            },
                                            cachedType = "unicast",
                                            stoppedType = "unicast",
                                        } = {}) => {
    const initialStatus = buildStatus([{
        node: "node1",
        streams: [{
            id: "hb#1.rx",
            state: "running",
            type: cachedType,
            peers: {peer1: cachedPeer}
        }]
    }]);
    const stoppedStatus = buildStatus([{
        node: "node1",
        streams: [{id: "hb#1.rx", state: "stopped", type: stoppedType, peers: {}}]
    }]);
    return {initialStatus, stoppedStatus};
};

describe("Heartbeats Component", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockLocalStorage.getItem.mockReturnValue("valid-token");
        mockNavigate.mockClear();
        setMedia();
    });

    afterEach(() => {
        delete window.matchMedia;
    });

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
                    id: "hb#1.rx", state: "running", type: "unicast",
                    peers: {peer1: {is_beating: true, desc: ":10011 ← peer1"}}
                },
                {
                    id: "hb#2.rx", state: "stopped", type: "unicast",
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

        ["RUNNING", "BEATING", "ID", "NODE", "PEER", "TYPE", "DESC", "CHANGED_AT", "LAST_BEATING_AT"].forEach(name =>
            expect(within(headerRow).getByRole("button", {name})).toBeInTheDocument()
        );
        // Sorted by node, ascending, at first.
        expect(within(headerRow).getByRole("columnheader", {name: "NODE"})).toHaveAttribute("aria-sort", "ascending");
        expect(within(headerRow).getByRole("columnheader", {name: "ID"})).toHaveAttribute("aria-sort", "none");

        const dataRows = getDataRows();
        expect(dataRows).toHaveLength(2);
        expect(within(dataRows[0]).getByText("1.rx")).toBeInTheDocument();
        expect(within(dataRows[1]).getByText("2.rx")).toBeInTheDocument();
        expect(screen.queryByText(EMPTY_MESSAGE)).not.toBeInTheDocument();
    });

    test("speaks French to a French browser", async () => {
        mockHeartbeatStore(buildStatus([{
            node: "node1",
            streams: [{id: "hb#1.rx", state: "running", type: "unicast", peers: {}}],
        }]));
        await i18n.changeLanguage("fr");
        try {
            renderWithRouter(<Heartbeats/>);
            expect(screen.getByRole("columnheader", {name: "DERNIER BATTEMENT"})).toBeInTheDocument();
            expect(screen.getByText("Aucun heartbeat ne correspond aux filtres actuels.")).toBeInTheDocument();
        } finally {
            await i18n.changeLanguage("en");
        }
    });

    // ==================== STATE ICONS ====================
    test.each([
        ["running", "up", "text-state-up"],
        ["warning", "warn", "text-state-warn"],
        ["stopped", "down", "text-state-down"],
        ["failed", "down", "text-state-down"],
        ["unknown", "unknown", "text-state-unknown"],
        ["invalid-state", "unknown", "text-state-unknown"],
    ])("renders the %s state as the %s status mark of the objects", async (state, status, ink) => {
        mockHeartbeatStore(buildStatus([{
            node: "node1",
            streams: [{id: "hb#1.rx", state, type: "unicast", peers: {p: {is_beating: true, desc: "d"}}}],
        }]));
        renderWithRouter(<Heartbeats/>);
        const stateCell = within(screen.getAllByRole("row")[1]).getAllByRole("cell")[0];
        const mark = within(stateCell).getByTitle(`State ${state}`);
        expect(mark).toHaveAttribute("data-state", status);
        expect(within(mark).getByText(`State ${state}`)).toBeInTheDocument();
        expect(mark).toHaveClass(ink);
    });

    test("keeps the dates on one line", async () => {
        mockHeartbeatStore(buildStatus([{
            node: "node1",
            streams: [{
                id: "hb#1.rx", state: "running", type: "unicast",
                peers: {p: {is_beating: true, desc: "d", changed_at: "2025-06-03T04:25:31+00:00", last_beating_at: "2025-06-03T04:25:32+00:00"}},
            }],
        }]));
        renderWithRouter(<Heartbeats/>);
        expect(screen.getByRole("cell", {name: "2025-06-03T04:25:31+00:00"})).toHaveClass("whitespace-nowrap");
        expect(screen.getByRole("cell", {name: "2025-06-03T04:25:32+00:00"})).toHaveClass("whitespace-nowrap");
    });

    // ==================== BEATING ICON ====================
    test("renders the down status dot for a stale heartbeat in multi-node", async () => {
        mockHeartbeatStore(buildStatus([
            {
                node: "node1",
                streams: [{
                    id: "hb#1.rx", state: "running", type: "unicast",
                    peers: {peer1: {is_beating: false, desc: "desc1"}}
                }]
            },
            {
                node: "node2",
                streams: [{
                    id: "hb#2.rx", state: "running", type: "unicast",
                    peers: {peer2: {is_beating: true, desc: "desc2"}}
                }]
            }
        ]));
        renderWithRouter(<Heartbeats/>);
        const rows = getDataRows();
        const staleRow = rows.find(row => within(row).queryByText("1.rx"));
        expect(staleRow).toBeInTheDocument();
        const beatingCell = within(staleRow).getAllByRole("cell")[1];
        const mark = within(beatingCell).getByTitle("Stale");
        expect(mark).toHaveAttribute("data-state", "down");
        expect(mark).toHaveClass("text-state-down");
        const beatingRow = rows.find(row => within(row).queryByText("2.rx"));
        expect(within(within(beatingRow).getAllByRole("cell")[1]).getByTitle("Beating"))
            .toHaveAttribute("data-state", "up");
    });

    test("single node always shows healthy beating icon", async () => {
        mockHeartbeatStore(buildStatus([{
            node: "node1",
            streams: [{
                id: "hb#1.rx", state: "running", type: "unicast",
                peers: {
                    peer1: {
                        is_beating: false, desc: ":10011 ← peer1",
                        changed_at: "2025-06-03T04:25:31+00:00",
                        last_beating_at: "2025-06-03T04:25:31+00:00"
                    }
                }
            }]
        }]));
        renderWithRouter(<Heartbeats/>);
        const beatingCell = within(screen.getAllByRole("row")[1]).getAllByRole("cell")[1];
        const mark = within(beatingCell).getByTitle("Healthy (single node)");
        expect(mark).toHaveAttribute("data-state", "up");
    });

    // ==================== FILTERS FROM URL ====================
    const filterStreams = [
        {
            id: "hb#1.rx", state: "running", type: "unicast",
            peers: {
                peer1: {
                    is_beating: true, desc: ":10011 ← peer1",
                    changed_at: "2025-06-03T04:25:31+00:00",
                    last_beating_at: "2025-06-03T04:25:31+00:00"
                }
            }
        },
        {
            id: "hb#2.rx", state: "stopped", type: "unicast",
            peers: {
                peer2: {
                    is_beating: false, desc: ":10012 ← peer2",
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
        mockHeartbeatStore(buildStatus([{node: "node1", streams: filterStreams}]));
        renderWithRouter(<Heartbeats/>, {route});

        const dataRows = getDataRows();
        expect(dataRows).toHaveLength(expectedLength);
        if (expectedText) {
            expect(within(dataRows[0]).getByText(expectedText)).toBeInTheDocument();
        } else {
            expect(screen.getByText(EMPTY_MESSAGE)).toBeInTheDocument();
        }
    });

    test("filter by id with .tx suffix", async () => {
        mockHeartbeatStore(buildStatus([{
            node: "node1",
            streams: [{
                id: "hb#3.tx", state: "running", type: "unicast",
                peers: {
                    peer3: {
                        is_beating: true, desc: ":10013 ← peer3",
                        changed_at: "2025-06-03T04:25:31+00:00",
                        last_beating_at: "2025-06-03T04:25:31+00:00"
                    }
                }
            }]
        }]));
        renderWithRouter(<Heartbeats/>, {route: "/?id=3.tx"});
        expect(getDataRows()).toHaveLength(1);
        expect(screen.getByText("3.tx")).toBeInTheDocument();
    });

    test("filter by id without hb# prefix and without rx/tx suffix", async () => {
        mockHeartbeatStore(buildStatus([{
            node: "node1",
            streams: [{
                id: "hb#5.rx", state: "running", type: "unicast",
                peers: {p: {is_beating: true, desc: "d", changed_at: "t", last_beating_at: "t"}}
            }]
        }]));
        renderWithRouter(<Heartbeats/>, {route: "/?id=5"});
        expect(getDataRows()).toHaveLength(1);
        expect(screen.getByText("5.rx")).toBeInTheDocument();
    });

    test("invalid status defaults to all", async () => {
        mockHeartbeatStore(buildStatus([{
            node: "node1",
            streams: [{
                id: "hb#1.rx", state: "running", type: "unicast",
                peers: {
                    peer1: {
                        is_beating: true, desc: ":10011 ← peer1",
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

    test("updates URL and rows when node filter changes", async () => {
        const user = userEvent.setup();
        mockHeartbeatStore(buildStatus([
            {
                node: "node1",
                streams: [{
                    id: "hb#1.rx", state: "running", type: "unicast",
                    peers: {peer1: {is_beating: true, desc: "desc1"}}
                }]
            },
            {
                node: "node2",
                streams: [{
                    id: "hb#2.rx", state: "running", type: "unicast",
                    peers: {peer2: {is_beating: true, desc: "desc2"}}
                }]
            }
        ]));
        renderWithRouter(<Heartbeats/>);

        expect(getDataRows()).toHaveLength(2);
        await selectFilterOption(user, "node", "node2");

        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith("/?node=node2", {replace: true});
        }, {timeout: 1500});

        const rows = getDataRows();
        expect(rows).toHaveLength(1);
        expect(within(rows[0]).getByText("2.rx")).toBeInTheDocument();
    });

    test("changes state filter via UI and updates URL", async () => {
        const user = userEvent.setup();
        mockHeartbeatStore(buildStatus([{
            node: "node1",
            streams: [
                {id: "hb#1.rx", state: "running", type: "t", peers: {p1: {is_beating: true, desc: "d1"}}},
                {id: "hb#2.rx", state: "stopped", type: "t", peers: {p2: {is_beating: false, desc: "d2"}}}
            ]
        }]));
        renderWithRouter(<Heartbeats/>);

        await selectFilterOption(user, "running", "Stopped");

        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith("/?state=stopped", {replace: true});
        }, {timeout: 1500});
    });

    test("changes beating filter via UI and updates URL", async () => {
        const user = userEvent.setup();
        mockHeartbeatStore(buildStatus([{
            node: "node1",
            streams: [
                {id: "hb#1.rx", state: "running", type: "t", peers: {p1: {is_beating: true, desc: "d1"}}},
                {id: "hb#2.rx", state: "running", type: "t", peers: {p2: {is_beating: false, desc: "d2"}}}
            ]
        }]));
        renderWithRouter(<Heartbeats/>);

        await selectFilterOption(user, "beating", "Beating");

        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith("/?status=beating", {replace: true});
        }, {timeout: 1500});

        const rows = getDataRows();
        expect(rows).toHaveLength(1);
        expect(within(rows[0]).getByText("1.rx")).toBeInTheDocument();
    });

    test("changes id filter via UI and updates URL", async () => {
        const user = userEvent.setup();
        mockHeartbeatStore(buildStatus([{
            node: "node1",
            streams: [
                {id: "hb#1.rx", state: "running", type: "t", peers: {p1: {is_beating: true, desc: "d1"}}},
                {id: "hb#2.rx", state: "running", type: "t", peers: {p2: {is_beating: true, desc: "d2"}}}
            ]
        }]));
        renderWithRouter(<Heartbeats/>);

        await selectFilterOption(user, "id", "2");

        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith("/?id=2", {replace: true});
        }, {timeout: 1500});
    });

    test("clears URL when all filters are reset to all", async () => {
        const user = userEvent.setup();
        mockHeartbeatStore(buildStatus([{
            node: "node1",
            streams: [{
                id: "hb#1.rx", state: "running", type: "t",
                peers: {p: {is_beating: true, desc: "d"}}
            }]
        }]));
        renderWithRouter(<Heartbeats/>, {route: "/?node=node1"});

        await selectFilterOption(user, "node", "All");

        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith("/", {replace: true});
        }, {timeout: 1500});
    });

    test("multiple URL filters apply together", async () => {
        mockHeartbeatStore(buildStatus([{
            node: "node1",
            streams: [
                {id: "hb#1.rx", state: "running", type: "t", peers: {p1: {is_beating: true, desc: "d1"}}},
                {id: "hb#2.rx", state: "stopped", type: "t", peers: {p2: {is_beating: false, desc: "d2"}}}
            ]
        }]));
        renderWithRouter(<Heartbeats/>, {route: "/?status=beating&node=node1&state=running&id=1"});
        const rows = getDataRows();
        expect(rows).toHaveLength(1);
        expect(within(rows[0]).getByText("1.rx")).toBeInTheDocument();
    });

    // ==================== EDGE CASES: STOPPED STREAMS & CACHE ====================
    test("handles stopped stream with cached peers", async () => {
        const {initialStatus, stoppedStatus} = stoppedStreamWithCacheScenario();

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

    test("stopped stream with no cache and null type falls back to N/A", () => {
        mockHeartbeatStore(buildStatus([{
            node: "node1",
            streams: [{id: "hb#1.rx", state: "stopped", type: null, peers: {}}]
        }]));
        renderWithRouter(<Heartbeats/>);
        const cells = within(screen.getAllByRole("row")[1]).getAllByRole("cell");
        expect(cells[5]).toHaveTextContent("N/A");
    });

    test("stopped stream with cached peer missing fields shows N/A in timestamp columns", async () => {
        const {initialStatus, stoppedStatus} = stoppedStreamWithCacheScenario({
            cachedPeer: {is_beating: true}, // no desc, no changed_at, no last_beating_at
        });

        useEventStore.mockImplementation(selector => selector({heartbeatStatus: initialStatus}));
        const {rerender} = renderWithRouter(<Heartbeats/>);
        useEventStore.mockImplementation(selector => selector({heartbeatStatus: stoppedStatus}));
        rerender(<Heartbeats/>);

        await waitFor(() => {
            const cells = within(screen.getAllByRole("row")[1]).getAllByRole("cell");
            expect(cells[6]).toHaveTextContent("N/A");
            expect(cells[7]).toHaveTextContent("N/A");
            expect(cells[8]).toHaveTextContent("N/A");
        }, {timeout: 2000});
    });

    test("stopped stream without peers field", () => {
        mockHeartbeatStore(buildStatus([{
            node: "node1",
            streams: [{id: "hb#1.rx", state: "stopped", type: "unicast"}]
        }]));
        renderWithRouter(<Heartbeats/>);
        const cells = within(screen.getAllByRole("row")[1]).getAllByRole("cell");
        expect(cells[4]).toHaveTextContent("N/A");
    });

    test("running stream without peers field produces no rows", () => {
        mockHeartbeatStore(buildStatus([{
            node: "node1",
            streams: [{id: "hb#1.rx", state: "running", type: "unicast"}]
        }]));
        renderWithRouter(<Heartbeats/>);
        expect(getDataRows()).toHaveLength(0);
        expect(screen.getByText(EMPTY_MESSAGE)).toBeInTheDocument();
    });

    // ==================== EMPTY / MISSING DATA ====================
    test("handles empty or null streams", () => {
        mockHeartbeatStore({node1: {streams: []}, node2: {streams: null}});
        renderWithRouter(<Heartbeats/>);
        expect(getDataRows()).toHaveLength(0);
        expect(screen.getByText(EMPTY_MESSAGE)).toBeInTheDocument();
    });

    test("shows message when no heartbeats match filters", () => {
        mockHeartbeatStore(buildStatus([{
            node: "node1",
            streams: [{
                id: "hb#1.rx", state: "running",
                peers: {peer1: {is_beating: true, desc: "desc"}},
                type: "unicast"
            }]
        }]));
        renderWithRouter(<Heartbeats/>, {route: "/?node=nonexistent"});
        expect(screen.getByRole("cell", {name: EMPTY_MESSAGE})).toHaveAttribute("colspan", "9");
    });

    test("stream without state does not add empty entry to available states", () => {
        mockHeartbeatStore(buildStatus([{
            node: "node1",
            streams: [
                {id: "hb#1.rx", type: "unicast", peers: {p: {is_beating: true, desc: "d"}}}
            ]
        }]));
        renderWithRouter(<Heartbeats/>);
        const options = within(getFilter("running")).getAllByRole("option");
        expect(options.map(o => o.value)).toEqual(["all"]);
    });

    test("stream with id 'all' is skipped by availableIds", () => {
        mockHeartbeatStore(buildStatus([{
            node: "node1",
            streams: [
                {id: "all", state: "running", type: "unicast", peers: {p: {is_beating: true, desc: "d"}}},
                {id: "hb#1.rx", state: "running", type: "unicast", peers: {p: {is_beating: true, desc: "d"}}}
            ]
        }]));
        renderWithRouter(<Heartbeats/>);
        expect(screen.getAllByRole("combobox")).toHaveLength(4);
        const ids = within(getFilter("id")).getAllByRole("option").map(o => o.value);
        expect(ids).toEqual(["all", "1"]);
    });

    test("empty string peer key shows N/A for peer", () => {
        mockHeartbeatStore(buildStatus([{
            node: "node1",
            streams: [{
                id: "hb#1.rx", state: "running", type: "unicast",
                peers: {"": {is_beating: true, desc: "d", changed_at: "t", last_beating_at: "t"}}
            }]
        }]));
        renderWithRouter(<Heartbeats/>);
        const cells = within(screen.getAllByRole("row")[1]).getAllByRole("cell");
        expect(cells[4]).toHaveTextContent("N/A");
    });

    test("peer without desc/changed_at/last_beating_at shows N/A", () => {
        mockHeartbeatStore(buildStatus([{
            node: "node1",
            streams: [{
                id: "hb#1.rx", state: "running", type: "unicast",
                peers: {peer1: {}}
            }]
        }]));
        renderWithRouter(<Heartbeats/>);
        const cells = within(screen.getAllByRole("row")[1]).getAllByRole("cell");
        expect(cells[6]).toHaveTextContent("N/A");
        expect(cells[7]).toHaveTextContent("N/A");
        expect(cells[8]).toHaveTextContent("N/A");
    });

    test("stream without type or state falls back to N/A and unknown", () => {
        mockHeartbeatStore(buildStatus([{
            node: "node1",
            streams: [{
                id: "hb#1.rx",
                peers: {peer1: {is_beating: true, desc: "d", changed_at: "t", last_beating_at: "t"}}
            }]
        }]));
        renderWithRouter(<Heartbeats/>);
        const cells = within(screen.getAllByRole("row")[1]).getAllByRole("cell");
        expect(cells[5]).toHaveTextContent("N/A");
        expect(within(cells[0]).getByTitle("State unknown")).toHaveAttribute("data-state", "unknown");
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

        const header = screen.getByRole("button", {name: headerText});
        await userEvent.click(header);
        expect(header.closest("th")).toHaveAttribute("aria-sort", "ascending");
        let rows = getDataRows();
        expect(within(rows[0]).getByText(ascValue)).toBeInTheDocument();
        expect(within(rows[1]).getByText(descValue)).toBeInTheDocument();

        await userEvent.click(header);
        expect(header.closest("th")).toHaveAttribute("aria-sort", "descending");
        rows = getDataRows();
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

        const beatingHeader = screen.getByRole("button", {name: "BEATING"});
        await userEvent.click(beatingHeader);
        let rows = getDataRows();
        expect(within(rows[0]).getByText("2.rx")).toBeInTheDocument();
        expect(within(rows[1]).getByText("1.rx")).toBeInTheDocument();

        await userEvent.click(beatingHeader);
        rows = getDataRows();
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

        const stateHeader = screen.getByRole("button", {name: "RUNNING"});
        await userEvent.click(stateHeader);
        let rows = getDataRows();
        ["5.rx", "4.rx", "3.rx", "2.rx", "1.rx"].forEach((id, idx) =>
            expect(within(rows[idx]).getByText(id)).toBeInTheDocument()
        );

        await userEvent.click(stateHeader);
        rows = getDataRows();
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

        const beatingHeader = screen.getByRole("button", {name: "BEATING"});
        await userEvent.click(beatingHeader);
        await userEvent.click(beatingHeader);
        await userEvent.click(screen.getByRole("button", {name: "ID"}));
        const rows = getDataRows();
        expect(within(rows[0]).getByText("a.rx")).toBeInTheDocument();
    });

    test("third click on same header toggles direction back to ascending", async () => {
        mockHeartbeatStore({
            node1: {
                streams: [
                    {id: "hb#b.rx", state: "running", peers: {p: {is_beating: true}}, type: "t"},
                    {id: "hb#a.rx", state: "running", peers: {p: {is_beating: true}}, type: "t"},
                ],
            },
        });
        renderWithRouter(<Heartbeats/>);

        const idHeader = screen.getByRole("button", {name: "ID"});
        await userEvent.click(idHeader); // asc
        await userEvent.click(idHeader); // desc
        await userEvent.click(idHeader); // back to asc
        const rows = getDataRows();
        expect(within(rows[0]).getByText("a.rx")).toBeInTheDocument();
        expect(within(rows[1]).getByText("b.rx")).toBeInTheDocument();
    });

    test("sorts by node column", async () => {
        mockHeartbeatStore(buildStatus([
            {
                node: "nodeB",
                streams: [{id: "hb#1.rx", state: "running", type: "t", peers: {p: {is_beating: true, desc: "d"}}}]
            },
            {
                node: "nodeA",
                streams: [{id: "hb#2.rx", state: "running", type: "t", peers: {p: {is_beating: true, desc: "d"}}}]
            },
        ]));
        renderWithRouter(<Heartbeats/>);
        let rows = getDataRows();
        expect(within(rows[0]).getByText("nodeA")).toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", {name: "NODE"}));
        rows = getDataRows();
        expect(within(rows[0]).getByText("nodeB")).toBeInTheDocument();
    });

    // ==================== MULTIPLE NODES & SINGLE NODE ====================
    test("handles multiple nodes and ordering", async () => {
        mockHeartbeatStore(buildStatus([
            {
                node: "nodeB",
                streams: [{
                    id: "hb#2.rx", state: "running", type: "unicast",
                    peers: {
                        peer2: {
                            is_beating: true, desc: ":10012 ← peer2",
                            changed_at: "2025-06-03T04:25:31+00:00",
                            last_beating_at: "2025-06-03T04:25:31+00:00"
                        }
                    }
                }]
            },
            {
                node: "nodeA",
                streams: [{
                    id: "hb#1.rx", state: "running", type: "unicast",
                    peers: {
                        peer1: {
                            is_beating: true, desc: ":10011 ← peer1",
                            changed_at: "2025-06-03T04:25:31+00:00",
                            last_beating_at: "2025-06-03T04:25:31+00:00"
                        }
                    }
                }]
            },
        ]));
        renderWithRouter(<Heartbeats/>);
        const dataRows = getDataRows();
        expect(dataRows).toHaveLength(2);
        expect(within(dataRows[0]).getByText("nodeA")).toBeInTheDocument();
        expect(within(dataRows[1]).getByText("nodeB")).toBeInTheDocument();
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
    const makeManyStreams = (n = 50) => {
        const many = {};
        for (let i = 1; i <= n; i++) {
            many[`node${i}`] = {
                streams: [{
                    id: `hb#${i}.rx`, state: "running", type: "unicast",
                    peers: {
                        peer1: {
                            is_beating: true, desc: `desc${i}`,
                            changed_at: "2025-06-03T04:25:31+00:00",
                            last_beating_at: "2025-06-03T04:25:31+00:00"
                        }
                    },
                }],
            };
        }
        return many;
    };

    const attachScrollMetrics = (container, {scrollHeight = 1000, clientHeight = 200} = {}) => {
        Object.defineProperty(container, "scrollHeight", {value: scrollHeight, configurable: true});
        Object.defineProperty(container, "clientHeight", {value: clientHeight, configurable: true});
    };

    test("loads more rows when scrolling near bottom", async () => {
        mockHeartbeatStore(makeManyStreams(50));
        renderWithRouter(<Heartbeats/>);

        expect(getDataRows()).toHaveLength(30);

        const container = getScrollContainer();
        attachScrollMetrics(container);

        act(() => {
            container.scrollTop = 850;
        });
        fireEvent.scroll(container);
        expect(screen.getByText("Loading more heartbeats")).toBeInTheDocument();

        await waitFor(() => {
            expect(getDataRows().length).toBeGreaterThan(30);
        }, {timeout: 2000});
        expect(screen.queryByText("Loading more heartbeats")).not.toBeInTheDocument();
    });

    test("scroll while loading is ignored", async () => {
        mockHeartbeatStore(makeManyStreams(50));
        renderWithRouter(<Heartbeats/>);

        expect(getDataRows()).toHaveLength(30);

        const container = getScrollContainer();
        attachScrollMetrics(container);

        act(() => {
            container.scrollTop = 850;
        });
        fireEvent.scroll(container);
        fireEvent.scroll(container);

        await waitFor(() => {
            expect(getDataRows().length).toBeGreaterThan(30);
        }, {timeout: 2000});
    });

    test("scroll at bottom when all rows visible does not change count", async () => {
        mockHeartbeatStore(buildStatus([{
            node: "node1",
            streams: [{
                id: "hb#1.rx", state: "running", type: "unicast",
                peers: {peer1: {is_beating: true, desc: "desc1"}}
            }]
        }]));
        renderWithRouter(<Heartbeats/>);

        expect(getDataRows()).toHaveLength(1);

        const container = getScrollContainer();
        attachScrollMetrics(container);

        act(() => {
            container.scrollTop = 850;
        });
        fireEvent.scroll(container);

        await waitFor(() => {
            expect(getDataRows()).toHaveLength(1);
        });
        expect(screen.queryByText("Loading more heartbeats")).not.toBeInTheDocument();
    });

    // ==================== RESPONSIVE FILTERS ====================
    test.each([
        ["mobile", true, false, true, false],
        ["wide screen", false, true, false, true],
        ["desktop", false, false, false, true],
    ])("filter visibility on %s", async (_, isMobile, isWide, buttonExists, initiallyVisible) => {
        setMedia({mobile: isMobile, wide: isWide});
        mockHeartbeatStore({node1: {streams: []}});
        renderWithRouter(<Heartbeats/>);

        const filterButton = screen.queryByRole("button", {name: /filters/i});
        expect(!!filterButton).toBe(buttonExists);

        const nodeFilter = getFilter("node", {hidden: true});
        if (initiallyVisible) {
            expect(nodeFilter).toBeVisible();
        } else {
            expect(nodeFilter).not.toBeVisible();
            expect(filterButton).toHaveAttribute("aria-expanded", "false");
        }
    });

    test("mobile filter button toggles visibility", async () => {
        setMedia({mobile: true});
        mockHeartbeatStore({node1: {streams: []}});
        renderWithRouter(<Heartbeats/>);

        const filterButton = screen.getByRole("button", {name: "Show filters"});
        expect(filterButton).toHaveAttribute("aria-controls", "heartbeats-filters");
        expect(getFilter("node", {hidden: true})).not.toBeVisible();

        await userEvent.click(filterButton);
        expect(filterButton).toHaveAccessibleName("Hide filters");
        expect(filterButton).toHaveAttribute("aria-expanded", "true");
        expect(getFilter("node")).toBeVisible();

        await userEvent.click(filterButton);
        expect(filterButton).toHaveAccessibleName("Show filters");
        expect(getFilter("node", {hidden: true})).not.toBeVisible();
    });
});
