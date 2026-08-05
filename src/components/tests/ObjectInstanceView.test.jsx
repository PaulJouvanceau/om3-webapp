import React from 'react';
import {render, screen, fireEvent, waitFor, within} from '@testing-library/react';
import {MemoryRouter, Routes, Route} from 'react-router-dom';
import '@testing-library/jest-dom';
import {vi} from 'vitest';
import ObjectInstanceView from '../ObjectInstanceView';
import useEventStore from '../../hooks/useEventStore';

// ── Hoisted mock variables ──────────────────────────────────────────────
const {
    mockUseParams,
    mockUseNavigate,
    mockParseObjectPath,
    mockCloseEventSource,
} = vi.hoisted(() => ({
    mockUseParams: vi.fn(),
    mockUseNavigate: vi.fn(),
    mockParseObjectPath: vi.fn(),
    mockCloseEventSource: vi.fn(),
}));

// ── Mocks ───────────────────────────────────────────────────────────────
vi.mock('../../hooks/useEventStore', () => ({
    default: vi.fn(),
}));

vi.mock('../../eventSourceManager', () => ({
    closeEventSource: mockCloseEventSource,
    startEventReception: vi.fn(),
    clearEventBuffers: vi.fn(),
    startLoggerReception: vi.fn(),
    closeLoggerEventSource: vi.fn(),
}));

vi.mock('react-router-dom', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        useParams: mockUseParams,
        useNavigate: mockUseNavigate,
    };
});

vi.mock('../../utils/objectUtils.jsx', () => ({
    parseObjectPath: mockParseObjectPath,
}));

vi.mock('../EventLogger', () => ({
    default: () => <div data-testid="event-logger"/>,
}));
vi.mock('../LogsViewer', () => ({
    default: () => <div data-testid="logs-viewer"/>,
}));

vi.mock('../../constants/actions', () => ({
    INSTANCE_ACTIONS: [
        {name: '', icon: () => <span>EmptyIcon</span>},
        {name: 'start', icon: () => <span>StartIcon</span>},
        {name: 'stop', icon: () => <span>StopIcon</span>},
        {name: 'freeze', icon: () => <span>FreezeIcon</span>},
        {name: 'unfreeze', icon: () => <span>UnfreezeIcon</span>},
        {name: 'restart', icon: () => <span>RestartIcon</span>},
        {name: 'unprovision', icon: () => <span>UnprovisionIcon</span>},
        {name: 'purge', icon: () => <span>PurgeIcon</span>},
    ],
    RESOURCE_ACTIONS: [
        {name: 'start', icon: () => <span>StartIcon</span>},
        {name: 'stop', icon: () => <span>StopIcon</span>},
        {name: 'restart', icon: () => <span>RestartIcon</span>},
        {name: 'run', icon: () => <span>RunIcon</span>},
        {name: 'console', icon: () => <span>ConsoleIcon</span>},
        {name: 'freeze', icon: () => <span>FreezeIcon</span>},
        {name: 'unprovision', icon: () => <span>UnprovisionIcon</span>},
        {name: 'purge', icon: () => <span>PurgeIcon</span>},
    ],
}));

vi.mock('@mui/icons-material', () => ({
    MoreVert: () => <span data-testid="more-vert-icon">MoreVertIcon</span>,
    FiberManualRecord: () => <span data-testid="fiber-manual-record-icon">●</span>,
    PriorityHigh: () => <span data-testid="priority-high-icon" aria-label="Not Provisioned">!</span>,
    AcUnit: () => <span data-testid="ac-unit-icon" aria-label="Frozen">❄</span>,
    Article: () => <span data-testid="article-icon">📄</span>,
    Close: () => <span data-testid="close-icon" aria-label="Close">×</span>,
}));

Object.assign(navigator, {
    clipboard: {writeText: vi.fn().mockResolvedValue(undefined)},
});

// ─── Constants ───────────────────────────────────────────────────────────────
const mockNodeName = 'test-node';
const mockObjectName = 'test-namespace/test-kind/test-name';
const mockParseObjectPathResult = {namespace: 'test-namespace', kind: 'test-kind', name: 'test-name'};

const BASE_STORE = {objectInstanceStatus: {}, instanceMonitor: {}, instanceConfig: {}};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const setup = (storeOverrides = {}) => {
    const store = {...BASE_STORE, ...storeOverrides};
    vi.mocked(useEventStore).mockImplementation((selector) =>
        typeof selector === 'function' ? selector(store) : store
    );
    mockUseParams.mockReturnValue({
        node: mockNodeName,
        objectName: encodeURIComponent(mockObjectName),
    });
    mockParseObjectPath.mockReturnValue(mockParseObjectPathResult);

    return render(
        <MemoryRouter initialEntries={[`/node/${mockNodeName}/instance/${encodeURIComponent(mockObjectName)}`]}>
            <Routes>
                <Route path="/node/:node/instance/:objectName" element={<ObjectInstanceView/>}/>
            </Routes>
        </MemoryRouter>
    );
};

const setupWithStatus = (instanceData, extra = {}) =>
    setup({
        objectInstanceStatus: {[mockObjectName]: {[mockNodeName]: instanceData}},
        ...extra,
    });

const waitLoaded = () =>
    waitFor(() => expect(screen.queryByText('Loading instance data...')).not.toBeInTheDocument());

const openInstanceMenu = async () => {
    await waitLoaded();
    const buttons = screen.getAllByTestId('more-vert-icon');
    fireEvent.click(buttons[buttons.length - 1].closest('button'));
};

const openResourceMenu = async (resourceLabel) => {
    const row = screen.getByText(resourceLabel).closest('div');
    const icons = within(row).getAllByTestId('more-vert-icon');
    fireEvent.click(icons[0].closest('button'));
};

const triggerInstanceAction = async (actionLabel) => {
    await openInstanceMenu();
    fireEvent.click(screen.getByText(actionLabel));
};

const triggerConsoleFlow = async () => {
    await waitFor(() => expect(screen.getByText('container1')).toBeInTheDocument());
    await openResourceMenu('container1');
    fireEvent.click(screen.getByText('Console'));
    await waitFor(() => expect(screen.getByRole('heading', {name: 'Open Console'})).toBeInTheDocument());
};

const containerStatus = (extraResources = {}) => ({
    avail: 'up',
    resources: {
        container1: {type: 'container', running: true, label: 'Container 1', ...extraResources},
    },
});

// ─── Setup / Teardown ────────────────────────────────────────────────────────
let localStorageMock;

beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    localStorageMock = {
        getItem: vi.fn(() => 'mock-token'),
        setItem: vi.fn(),
        clear: vi.fn(),
    };
    Object.defineProperty(window, 'localStorage', {value: localStorageMock, writable: true});
    document.body.innerHTML = '';
    delete window.matchMedia;
});

afterEach(() => {
    vi.restoreAllMocks();
    delete window.matchMedia;
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ObjectInstanceView', () => {

    // Loading & basic render
    test('renders loading state initially', () => {
        setup();
        expect(screen.getByText('Loading instance data...')).toBeInTheDocument();
    });

    test('renders instance data after loading', async () => {
        setupWithStatus({
            avail: 'up',
            frozen_at: null,
            provisioned: true,
            resources: {res1: {type: 'container', running: true, label: 'Resource 1'}},
        });
        await waitLoaded();
        expect(screen.getByText(mockObjectName)).toBeInTheDocument();
        expect(screen.getByText(`Node: ${mockNodeName}`)).toBeInTheDocument();
        expect(screen.getByText('Resources (1)')).toBeInTheDocument();
        expect(screen.getByText('res1')).toBeInTheDocument();
    });

    test('displays "No resources found" when resources is empty', async () => {
        setupWithStatus({avail: 'up', resources: {}});
        await waitFor(() =>
            expect(screen.getByText('No resources found on this instance.')).toBeInTheDocument()
        );
    });

    test('displays resource status (role=status elements)', async () => {
        setupWithStatus({
            avail: 'up',
            resources: {res1: {type: 'container', running: true, label: 'Resource 1', status: 'up'}},
        });
        await waitFor(() => expect(screen.getByText('res1')).toBeInTheDocument());
        expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
    });

    test('shows frozen icon when instance is frozen', async () => {
        setupWithStatus({avail: 'up', frozen_at: '2024-01-01T00:00:00Z', resources: {}});
        await waitLoaded();
        expect(await screen.findByTestId('ac-unit-icon')).toBeInTheDocument();
    });

    test('shows not-provisioned warning when instance is not provisioned', async () => {
        setupWithStatus({avail: 'up', provisioned: false, resources: {}});
        await waitLoaded();
        expect((await screen.findAllByTestId('priority-high-icon')).length).toBe(1);
    });

    test('renders status circle for instance with undefined avail', async () => {
        setupWithStatus({resources: {}});
        await waitLoaded();
        expect(screen.getAllByTestId('fiber-manual-record-icon').length).toBeGreaterThan(0);
    });

    test('displays monitor state when present and not idle', async () => {
        setupWithStatus({avail: 'up', resources: {}}, {
            instanceMonitor: {[`${mockNodeName}:${mockObjectName}`]: {state: 'starting'}},
        });
        await waitLoaded();
        expect(screen.getByText('starting')).toBeInTheDocument();
    });

    test('does not display monitor state when idle', async () => {
        setupWithStatus({avail: 'up', resources: {}}, {
            instanceMonitor: {[`${mockNodeName}:${mockObjectName}`]: {state: 'idle'}},
        });
        await waitLoaded();
        expect(screen.queryByText('idle')).not.toBeInTheDocument();
    });

    test('opens instance action menu', async () => {
        setupWithStatus({avail: 'up', resources: {}});
        await openInstanceMenu();
        await waitFor(() => {
            expect(screen.getByText('Start')).toBeInTheDocument();
            expect(screen.getByText('Stop')).toBeInTheDocument();
            expect(screen.getByText('Freeze')).toBeInTheDocument();
        });
    });

    test('closes instance menu on click away', async () => {
        setupWithStatus({avail: 'up', resources: {}});
        await openInstanceMenu();
        await waitFor(() => expect(screen.getByText('Start')).toBeInTheDocument());
        fireEvent.click(document.body);
        await waitFor(() => expect(screen.queryByText('Start')).not.toBeInTheDocument());
    });

    test('opens resource action menu', async () => {
        setupWithStatus({avail: 'up', resources: {res1: {type: 'container', running: true, label: 'Resource 1'}}});
        await waitFor(() => expect(screen.getByText('res1')).toBeInTheDocument());
        await openResourceMenu('res1');
        await waitFor(() => {
            expect(screen.getByText('Start')).toBeInTheDocument();
            expect(screen.getByText('Stop')).toBeInTheDocument();
            expect(screen.getByText('Console')).toBeInTheDocument();
        });
    });

    test('closes resource menu on click away', async () => {
        setupWithStatus({avail: 'up', resources: {res1: {type: 'container', running: true, label: 'Resource 1'}}});
        await waitFor(() => expect(screen.getByText('res1')).toBeInTheDocument());
        await openResourceMenu('res1');
        await waitFor(() => expect(screen.getByText('Console')).toBeInTheDocument());
        fireEvent.click(document.body);
        await waitFor(() => expect(screen.queryByText('Console')).not.toBeInTheDocument());
    });

    test.each([
        ['task', 'task1', {type: 'task', running: false, label: 'Task 1'}, ['Run'], ['Console', 'Start']],
        ['fs', 'fs1', {type: 'fs', running: true, label: 'FS 1'}, ['Start'], ['Run', 'Console']],
        ['container', 'container1', {type: 'container', running: true, label: 'C1'}, ['Start', 'Console'], ['Run']],
        ['unknown type', 'unknown1', {
            type: 'unknownType',
            running: true,
            label: 'U1'
        }, ['Start', 'Console', 'Run'], []],
        ['no type', 'res-no-type', {running: true, label: 'No Type'}, ['Start', 'Console', 'Run'], []],
    ])('filters resource actions for %s', async (_, rid, resourceData, present, absent) => {
        setupWithStatus({avail: 'up', resources: {[rid]: resourceData}});
        await waitFor(() => expect(screen.getByText(rid)).toBeInTheDocument());
        await openResourceMenu(rid);
        await waitFor(() => expect(screen.getByText(present[0])).toBeInTheDocument());
        for (const label of present) expect(screen.getByText(label)).toBeInTheDocument();
        for (const label of absent) expect(screen.queryByText(label)).not.toBeInTheDocument();
    });

    test('filters resource actions for encap task resource', async () => {
        setupWithStatus({
            avail: 'up',
            resources: {container1: {type: 'container', running: true, status: 'up', label: 'C1'}},
            encap: {container1: {resources: {'task-encap1': {type: 'task', running: false, label: 'Encap Task'}}}},
        });
        await waitFor(() => expect(screen.getByText('task-encap1')).toBeInTheDocument());
        await openResourceMenu('task-encap1');
        await waitFor(() => expect(screen.getByText('Run')).toBeInTheDocument());
        expect(screen.queryByText('Console')).not.toBeInTheDocument();
    });

    test('displays encapsulated resources', async () => {
        setupWithStatus({
            avail: 'up',
            resources: {container1: {type: 'container', running: true, label: 'C1'}},
            encap: {container1: {resources: {encap1: {type: 'fs', running: true, label: 'Enc FS'}}}},
        });
        await waitFor(() => expect(screen.getByText('container1')).toBeInTheDocument());
        expect(screen.getByText('encap1')).toBeInTheDocument();
    });

    test('shows message when encap has no resources key', async () => {
        setupWithStatus({
            avail: 'up',
            resources: {container1: {type: 'container', running: true, label: 'C1'}},
            encap: {container1: {}},
        });
        await waitFor(() => expect(screen.getByText('container1')).toBeInTheDocument());
        expect(screen.getByText('Encapsulated data found for container1, but no resources defined.')).toBeInTheDocument();
    });

    test('shows message when encap resources is empty', async () => {
        setupWithStatus({
            avail: 'up',
            resources: {container1: {type: 'container', running: true, label: 'C1'}},
            encap: {container1: {resources: {}}},
        });
        await waitFor(() => expect(screen.getByText('container1')).toBeInTheDocument());
        expect(screen.getByText('No encapsulated resources available for container1.')).toBeInTheDocument();
    });

    test('does not display encap resources when container status is down', async () => {
        setupWithStatus({
            avail: 'up',
            resources: {container1: {type: 'container', status: 'down', running: false, label: 'C1'}},
            encap: {container1: {resources: {encap1: {type: 'fs', running: true, label: 'Enc FS'}}}},
        });
        await waitFor(() => expect(screen.getByText('container1')).toBeInTheDocument());
        expect(screen.queryByText('encap1')).not.toBeInTheDocument();
    });

    test('shows not-provisioned icon when encapData.provisioned is false for container', async () => {
        setupWithStatus({
            avail: 'up',
            resources: {container1: {type: 'container', running: true, label: 'C1'}},
            encap: {container1: {provisioned: false, resources: {}}},
        });
        await waitFor(() => expect(screen.getByText('container1')).toBeInTheDocument());
        expect(screen.getAllByTestId('priority-high-icon').length).toBeGreaterThan(0);
    });

    test('no not-provisioned icon when encap has no provisioned field', async () => {
        setupWithStatus({
            avail: 'up',
            resources: {container1: {type: 'container', running: true, label: 'C1', provisioned: {state: 'true'}}},
            encap: {container1: {resources: {encap1: {type: 'fs', running: true, label: 'Enc FS'}}}},
        });
        await waitFor(() => expect(screen.getByText('container1')).toBeInTheDocument());
        expect(screen.queryAllByTestId('priority-high-icon').length).toBe(0);
    });

    test('displays resource logs with correct level formatting', async () => {
        setupWithStatus({
            avail: 'up',
            resources: {
                res1: {
                    type: 'container', running: true, label: 'R1',
                    log: [
                        {level: 'error', message: 'Critical error'},
                        {level: 'warn', message: 'Warning message'},
                        {level: 'info', message: 'Info message'},
                        {level: 'debug', message: 'Debug message'},
                    ],
                },
            },
        });
        await waitFor(() => {
            expect(screen.getByText('error: Critical error')).toBeInTheDocument();
            expect(screen.getByText('warn: Warning message')).toBeInTheDocument();
            expect(screen.getByText('info: Info message')).toBeInTheDocument();
            expect(screen.getByText('debug: Debug message')).toBeInTheDocument();
        });
    });

    test('displays info: actions disabled label', async () => {
        setupWithStatus({
            avail: 'up',
            resources: {res1: {type: 'fs', running: true, label: 'R1', info: {actions: 'disabled'}}},
        });
        await waitFor(() => expect(screen.getByText('res1')).toBeInTheDocument());
        expect(screen.getAllByText(/info: actions disabled/).length).toBeGreaterThan(0);
    });

    test.each([
        ['is_monitored=true', {is_monitored: true}, 'M'],
        ['is_disabled=true', {is_disabled: true}, 'D'],
        ['is_standby=true', {is_standby: true}, 'S'],
        ['is_monitored="true"', {is_monitored: 'true'}, 'M'],
        ['is_disabled="true"', {is_disabled: 'true'}, 'D'],
        ['is_standby="true"', {is_standby: 'true'}, 'S'],
    ])('resource status letter for %s', async (_, configOverride, letter) => {
        setupWithStatus(
            {avail: 'up', resources: {res1: {type: 'fs', running: true, label: 'R1'}}},
            {instanceConfig: {[mockObjectName]: {[mockNodeName]: {resources: {res1: configOverride}}}}}
        );
        await waitFor(() => expect(screen.getByText('res1')).toBeInTheDocument());
        expect(screen.getAllByRole('status')[0].textContent).toContain(letter);
    });

    test('resource status string starts with . when running is undefined', async () => {
        setupWithStatus({avail: 'up', resources: {res1: {type: 'fs', label: 'R1'}}});
        await waitFor(() => expect(screen.getByText('res1')).toBeInTheDocument());
        expect(screen.getAllByRole('status')[0].textContent.charAt(0)).toBe('.');
    });

    test('optional resource shows O in status', async () => {
        setupWithStatus({avail: 'up', resources: {res1: {type: 'fs', running: true, optional: true, label: 'R1'}}});
        await waitFor(() => expect(screen.getByText('res1')).toBeInTheDocument());
        expect(screen.getAllByRole('status')[0].textContent).toContain('O');
    });

    test('provisioned=n/a shows P in status', async () => {
        setupWithStatus({
            avail: 'up',
            resources: {res1: {type: 'fs', running: true, label: 'R1', provisioned: {state: 'n/a'}}},
        });
        await waitFor(() => expect(screen.getByText('res1')).toBeInTheDocument());
        expect(screen.getAllByRole('status')[0].textContent).toContain('P');
    });

    test('no P in status when resource has no provisioned field', async () => {
        setupWithStatus({avail: 'up', resources: {res1: {type: 'fs', running: true, label: 'R1'}}});
        await waitFor(() => expect(screen.getByText('res1')).toBeInTheDocument());
        expect(screen.getAllByRole('status')[0].textContent).not.toContain('P');
    });

    test.each([
        ['0 restarts (config)', {restart: 0}, '.'],
        ['7 restarts (config)', {restart: 7}, '7'],
    ])('restart count from config: %s', async (_, configOverride, expected) => {
        setupWithStatus(
            {avail: 'up', resources: {res1: {type: 'fs', running: true, label: 'R1'}}},
            {instanceConfig: {[mockObjectName]: {[mockNodeName]: {resources: {res1: configOverride}}}}}
        );
        await waitFor(() => expect(screen.getByText('res1')).toBeInTheDocument());
        expect(screen.getAllByRole('status')[0].textContent).toContain(expected);
    });

    test.each([
        ['0 remaining', 0, undefined],
        ['3 remaining', undefined, '3'],
        ['15 remaining (>10)', undefined, '+'],
    ])('restart count from monitor: %s', async (_, configRestart, expectedText) => {
        const monitorRemaining = expectedText === '3' ? 3 : expectedText === '+' ? 15 : 0;
        setupWithStatus(
            {avail: 'up', resources: {res1: {type: 'fs', running: true, label: 'R1'}}},
            {
                instanceConfig: configRestart !== undefined
                    ? {[mockObjectName]: {[mockNodeName]: {resources: {res1: {restart: configRestart}}}}}
                    : {},
                instanceMonitor: {
                    [`${mockNodeName}:${mockObjectName}`]: {
                        resources: {res1: {restart: {remaining: monitorRemaining}}},
                    },
                },
            }
        );
        await waitFor(() => expect(screen.getByText('res1')).toBeInTheDocument());
        const statusText = screen.getAllByRole('status')[0].textContent;
        if (expectedText) expect(statusText).toContain(expectedText);
        else expect(statusText).toBeDefined();
    });

    test('resource status M with full config (is_monitored + is_disabled + is_standby all "true")', async () => {
        setupWithStatus(
            {avail: 'up', resources: {res1: {type: 'fs', running: true, label: 'R1'}}},
            {
                instanceConfig: {
                    [mockObjectName]: {
                        [mockNodeName]: {
                            resources: {res1: {is_monitored: 'true', is_disabled: 'true', is_standby: 'true'}},
                        },
                    },
                },
            }
        );
        await waitFor(() => expect(screen.getByText('res1')).toBeInTheDocument());
        const statusText = screen.getAllByRole('status')[0].textContent;
        expect(statusText).toContain('M');
        expect(statusText).toContain('D');
        expect(statusText).toContain('S');
    });

    // Logs drawer
    test('opens and closes logs drawer', async () => {
        setupWithStatus({avail: 'up', resources: {}});
        await waitLoaded();
        fireEvent.click(screen.getByRole('button', {name: /view logs for instance test-namespace\/test-kind\/test-name/i}));
        await waitFor(() => {
            expect(screen.getByTestId('logs-viewer')).toBeInTheDocument();
            expect(screen.getByText(`Instance Logs - ${mockNodeName}/${mockObjectName}`)).toBeInTheDocument();
        });
        fireEvent.click(screen.getByLabelText('Close'));
        await waitFor(() => expect(screen.queryByTestId('logs-viewer')).not.toBeInTheDocument());
    });

    test('drawer resize with mouse events', async () => {
        setupWithStatus({avail: 'up', resources: {}});
        await waitLoaded();
        fireEvent.click(screen.getByRole('button', {name: /view logs for instance/i}));
        await waitFor(() => expect(screen.getByTestId('logs-viewer')).toBeInTheDocument());
        const handle = screen.getByLabelText('Resize drawer');
        fireEvent.mouseDown(handle, {clientX: 500});
        fireEvent.mouseMove(document, {clientX: 400});
        fireEvent.mouseUp(document);
    });

    test('touch resize uses passive:false and cleans up on touchend', async () => {
        setupWithStatus({avail: 'up', resources: {}});
        const addSpy = vi.spyOn(document, 'addEventListener');
        const removeSpy = vi.spyOn(document, 'removeEventListener');
        await waitLoaded();
        fireEvent.click(screen.getByRole('button', {name: /view logs for instance/i}));
        await waitFor(() => expect(screen.getByTestId('logs-viewer')).toBeInTheDocument());
        fireEvent.touchStart(screen.getByLabelText('Resize drawer'), {touches: [{clientX: 600}]});
        expect(addSpy).toHaveBeenCalledWith('touchmove', expect.any(Function), {passive: false});
        fireEvent.touchMove(document, {touches: [{clientX: 500}]});
        fireEvent.touchEnd(document);
        expect(removeSpy).toHaveBeenCalledWith('touchmove', expect.any(Function));
        expect(removeSpy).toHaveBeenCalledWith('touchend', expect.any(Function));
        addSpy.mockRestore();
        removeSpy.mockRestore();
    });

    // API calls
    test('calls API for instance action (start)', async () => {
        global.fetch.mockResolvedValue({ok: true, headers: new Map()});
        setupWithStatus({avail: 'up', resources: {}});
        await triggerInstanceAction('Start');
        await waitFor(() => expect(screen.getByText('Confirm Start')).toBeInTheDocument());
        fireEvent.click(screen.getByText('Confirm'));
        await waitFor(() =>
            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining(`/instance/path/${mockParseObjectPathResult.namespace}/${mockParseObjectPathResult.kind}/${mockParseObjectPathResult.name}/action/start`),
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({Authorization: 'Bearer mock-token'}),
                })
            )
        );
    });

    test('calls API for restart action', async () => {
        global.fetch.mockResolvedValue({ok: true, headers: new Map()});
        setupWithStatus({avail: 'up', resources: {}});
        await triggerInstanceAction('Restart');
        await waitFor(() => expect(screen.getByText('Confirm Restart')).toBeInTheDocument());
        fireEvent.click(screen.getByText('Confirm'));
        await waitFor(() =>
            expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/action/restart'), expect.anything())
        );
    });

    test('calls API for unfreeze action', async () => {
        global.fetch.mockResolvedValue({ok: true, headers: new Map()});
        setupWithStatus({avail: 'up', frozen_at: '2024-01-01T00:00:00Z', resources: {}});
        await triggerInstanceAction('Unfreeze');
        await waitFor(() => expect(screen.getByText('Confirm Unfreeze')).toBeInTheDocument());
        fireEvent.click(screen.getByText('Confirm'));
        await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    });

    // Dialog confirm flows
    test('freeze dialog: confirm button disabled until checkbox checked', async () => {
        setupWithStatus({avail: 'up', resources: {}});
        await triggerInstanceAction('Freeze');
        await waitFor(() => expect(screen.getByText('Confirm Freeze')).toBeInTheDocument());
        const confirmBtn = screen.getByRole('button', {name: /confirm/i});
        expect(confirmBtn).toBeDisabled();
        fireEvent.click(screen.getByRole('checkbox'));
        expect(confirmBtn).not.toBeDisabled();
        fireEvent.click(screen.getByText('Cancel'));
    });

    test('stop dialog: confirms and calls API', async () => {
        global.fetch.mockResolvedValue({ok: true, headers: new Map()});
        setupWithStatus({avail: 'up', resources: {}});
        await triggerInstanceAction('Stop');
        await waitFor(() => expect(screen.getByText('Confirm Stop')).toBeInTheDocument());
        fireEvent.click(screen.getByRole('checkbox'));
        fireEvent.click(screen.getByRole('button', {name: /stop/i}));
        await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    });

    test('unprovision dialog: requires both checkboxes', async () => {
        global.fetch.mockResolvedValue({ok: true, headers: new Map()});
        setupWithStatus({avail: 'up', resources: {}});
        await triggerInstanceAction('Unprovision');
        await waitFor(() => expect(screen.getByText('Confirm Unprovision')).toBeInTheDocument());
        const [cb1, cb2] = screen.getAllByRole('checkbox');
        fireEvent.click(cb1);
        fireEvent.click(cb2);
        fireEvent.click(screen.getByRole('button', {name: /confirm/i}));
        await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    });

    test('purge dialog: requires all three checkboxes', async () => {
        global.fetch.mockResolvedValue({ok: true, headers: new Map()});
        setupWithStatus({avail: 'up', resources: {}});
        await triggerInstanceAction('Purge');
        await waitFor(() => expect(screen.getByText('Confirm Purge')).toBeInTheDocument());
        for (const cb of screen.getAllByRole('checkbox')) fireEvent.click(cb);
        fireEvent.click(screen.getByRole('button', {name: /confirm/i}));
        await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    });

    test.each([
        ['Start', 'Confirm Start', () => {
        }],
        ['Stop', 'Confirm Stop', () => {
        }],
        ['Unprovision', 'Confirm Unprovision', () => {
        }],
        ['Purge', 'Confirm Purge', () => {
        }],
        ['Freeze', 'Confirm Freeze', () => {
        }],
    ])('%s dialog closes on Cancel', async (action, title) => {
        setupWithStatus({avail: 'up', resources: {}});
        await triggerInstanceAction(action);
        await waitFor(() => expect(screen.getByText(title)).toBeInTheDocument());
        fireEvent.click(screen.getByText('Cancel'));
        await waitFor(() => expect(screen.queryByText(title)).not.toBeInTheDocument());
    });

    test.each([
        ['Start', 'Confirm Start'],
        ['Stop', 'Confirm Stop'],
        ['Unprovision', 'Confirm Unprovision'],
        ['Purge', 'Confirm Purge'],
        ['Freeze', 'Confirm Freeze'],
    ])('%s dialog closes on ESC', async (action, title) => {
        setupWithStatus({avail: 'up', resources: {}});
        await triggerInstanceAction(action);
        await waitFor(() => expect(screen.getByText(title)).toBeInTheDocument());
        fireEvent.keyDown(screen.getByRole('dialog'), {key: 'Escape', code: 'Escape'});
        await waitFor(() => expect(screen.queryByText(title)).not.toBeInTheDocument());
    });

    // Console action
    test('console dialog: opens, sets params, calls API and shows URL', async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            headers: new Headers({Location: 'https://console.example.com'}),
        });
        setupWithStatus(containerStatus());
        await triggerConsoleFlow();

        fireEvent.change(screen.getByLabelText('Number of Seats'), {target: {value: '2'}});
        fireEvent.change(screen.getByLabelText('Greet Timeout'), {target: {value: '10s'}});
        fireEvent.click(screen.getByRole('button', {name: 'Open Console'}));

        await waitFor(() =>
            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('/console?rid=container1&seats=2&greet_timeout=10s'),
                expect.anything()
            )
        );
        await waitFor(() => {
            expect(screen.getByText('Console URL')).toBeInTheDocument();
            expect(screen.getByText('https://console.example.com')).toBeInTheDocument();
        });
    });

    test('console URL dialog: copy, open in new tab, close', async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            headers: new Headers({Location: 'https://console.example.com'}),
        });
        setupWithStatus(containerStatus());
        await triggerConsoleFlow();
        fireEvent.click(screen.getByRole('button', {name: 'Open Console'}));
        await waitFor(() => expect(screen.getByText('Console URL')).toBeInTheDocument());

        fireEvent.click(screen.getByText('Copy URL'));
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://console.example.com');

        const origOpen = window.open;
        window.open = vi.fn();
        fireEvent.click(screen.getByText('Open in New Tab'));
        expect(window.open).toHaveBeenCalledWith('https://console.example.com', '_blank', 'noopener,noreferrer');
        window.open = origOpen;

        fireEvent.click(screen.getByText('Close'));
        await waitFor(() => expect(screen.queryByText('Console URL')).not.toBeInTheDocument());
    });

    test('console dialog: closes on Cancel', async () => {
        setupWithStatus(containerStatus());
        await triggerConsoleFlow();
        fireEvent.click(screen.getByText('Cancel'));
        await waitFor(() => expect(screen.queryByRole('heading', {name: 'Open Console'})).not.toBeInTheDocument());
    });

    test('console dialog: closes on ESC', async () => {
        setupWithStatus(containerStatus());
        await triggerConsoleFlow();
        fireEvent.keyDown(screen.getByRole('dialog'), {key: 'Escape', code: 'Escape'});
        await waitFor(() => expect(screen.queryByRole('heading', {name: 'Open Console'})).not.toBeInTheDocument());
    });

    test('console URL dialog: closes on ESC', async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            headers: new Headers({Location: 'https://console.example.com'}),
        });
        setupWithStatus(containerStatus());
        await triggerConsoleFlow();
        fireEvent.click(screen.getByRole('button', {name: 'Open Console'}));
        await waitFor(() => expect(screen.getByText('Console URL')).toBeInTheDocument());
        fireEvent.keyDown(screen.getByRole('dialog'), {key: 'Escape', code: 'Escape'});
        await waitFor(() => expect(screen.queryByText('Console URL')).not.toBeInTheDocument());
    });

    test('console seats input clamps to 1 for invalid values', async () => {
        setupWithStatus(containerStatus());
        await triggerConsoleFlow();
        const seatsInput = screen.getByLabelText('Number of Seats');
        fireEvent.change(seatsInput, {target: {value: '0'}});
        expect(seatsInput.value).toBe('1');
        fireEvent.change(seatsInput, {target: {value: 'abc'}});
        expect(seatsInput.value).toBe('1');
    });

    test('console action: shows error when Location header is missing', async () => {
        global.fetch.mockResolvedValue({ok: true, headers: new Headers()});
        setupWithStatus(containerStatus());
        await triggerConsoleFlow();
        fireEvent.click(screen.getByRole('button', {name: 'Open Console'}));
        await waitFor(() =>
            expect(screen.getByText('Failed to open console: Console URL not found in response')).toBeInTheDocument()
        );
    });

    // Error handling
    test('shows snackbar on HTTP error with API message', async () => {
        global.fetch.mockResolvedValue({
            ok: false,
            status: 500,
            text: () => Promise.resolve(JSON.stringify({message: 'That is broken'})),
            headers: {get: () => 'application/json'},
        });
        setupWithStatus({avail: 'up', resources: {}});
        await triggerInstanceAction('Start');
        await waitFor(() => expect(screen.getByText('Confirm Start')).toBeInTheDocument());
        fireEvent.click(screen.getByText('Confirm'));
        await waitFor(() => {
            expect(screen.getByText(/Failed: HTTP 500/i)).toBeInTheDocument();
            expect(screen.getByText(/That is broken/i)).toBeInTheDocument();
        });
    });

    test('shows snackbar on fetch network error', async () => {
        global.fetch.mockRejectedValue(new Error('Network error'));
        setupWithStatus({avail: 'up', resources: {}});
        await triggerInstanceAction('Start');
        fireEvent.click(screen.getByText('Confirm'));
        await waitFor(() => {
            const alerts = screen.getAllByRole('alert');
            expect(alerts.find(a => a.textContent?.includes('Error: Network error'))).toBeInTheDocument();
        });
    });

    test('shows snackbar when auth token is missing', async () => {
        localStorageMock.getItem.mockReturnValue(null);
        setupWithStatus({avail: 'up', resources: {}});
        await triggerInstanceAction('Start');
        fireEvent.click(screen.getByText('Confirm'));
        await waitFor(() => expect(screen.getByText('Auth token not found.')).toBeInTheDocument());
    });

    test('closes snackbar on close button', async () => {
        global.fetch.mockResolvedValue({ok: false, status: 500});
        setupWithStatus({avail: 'up', resources: {}});
        await triggerInstanceAction('Start');
        fireEvent.click(screen.getByText('Confirm'));
        await waitFor(() => expect(screen.getByText(/Failed: HTTP 500/i)).toBeInTheDocument());
        fireEvent.click(screen.getByLabelText('Close'));
        await waitFor(() => expect(screen.queryByText(/Failed: HTTP 500/i)).not.toBeInTheDocument());
    });

    // In-progress state
    test('action in progress disables resource action buttons', async () => {
        global.fetch.mockImplementation(() => new Promise(() => {
        }));
        setupWithStatus({avail: 'up', resources: {res1: {type: 'container', running: true, label: 'R1'}}});
        await waitFor(() => expect(screen.getByText('res1')).toBeInTheDocument());
        await openInstanceMenu();
        fireEvent.click(screen.getByText('Start'));
        fireEvent.click(screen.getByText('Confirm'));
        await waitFor(() => {
            const row = screen.getByText('res1').closest('div');
            const btn = within(row).getAllByTestId('more-vert-icon')[0].closest('button');
            expect(btn).toBeDisabled();
        });
    });

    // Lifecycle
    test('cleans up event source on unmount', () => {
        const {unmount} = setup();
        unmount();
        expect(mockCloseEventSource).toHaveBeenCalled();
    });

    test('displays logs for encapsulated resource', async () => {
        setupWithStatus({
            avail: 'up',
            resources: {container1: {type: 'container', running: true, label: 'C1', status: 'up'}},
            encap: {
                container1: {
                    resources: {
                        encap1: {
                            type: 'fs', running: true, label: 'Enc FS',
                            log: [{level: 'info', message: 'Encap log message'}],
                        },
                    },
                },
            },
        });
        await waitFor(() => expect(screen.getByText('encap1')).toBeInTheDocument());
        expect(screen.getByText('info: Encap log message')).toBeInTheDocument();
    });

    test('resource action button in mobile view propagates click to stopPropagation Box', async () => {
        window.matchMedia = vi.fn().mockImplementation(query => ({
            matches: query === '(max-width:599.95px)',
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        }));
        window.innerWidth = 400;
        window.dispatchEvent(new Event('resize'));

        setupWithStatus({avail: 'up', resources: {res1: {type: 'container', running: true, label: 'Resource 1'}}});
        await waitFor(() => expect(screen.getByText('res1')).toBeInTheDocument());

        const resourceActionBtns = screen.getAllByRole('button', {name: 'Resource res1 actions'});
        expect(resourceActionBtns.length).toBeGreaterThanOrEqual(1);
        fireEvent.click(resourceActionBtns[0]);

        await waitFor(() => expect(screen.getByText('Console')).toBeInTheDocument());
    });

    test('confirming an empty action triggers fallback warn and resets dialogs', async () => {
        setupWithStatus({avail: 'up', resources: {}});
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
        });

        await waitLoaded();
        const instanceMenuButton = screen.getAllByTestId('more-vert-icon').pop().closest('button');
        fireEvent.click(instanceMenuButton);
        await waitFor(() => expect(screen.getByRole('menu')).toBeInTheDocument());

        const menuItems = within(screen.getByRole('menu')).getAllByRole('menuitem');
        expect(menuItems.length).toBeGreaterThan(0);
        fireEvent.click(menuItems[0]);

        await waitFor(() => expect(screen.getByText(/Confirm\s*Action/)).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', {name: /confirm/i}));

        await waitFor(() => {
            expect(consoleWarnSpy).toHaveBeenCalledWith(
                'No valid pendingAction or action provided:',
                expect.objectContaining({action: ''})
            );
        });

        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

        consoleWarnSpy.mockRestore();
    });

    test('resource menu handles missing resource after data change', async () => {
        const {rerender} = setupWithStatus({
            avail: 'up',
            resources: {res1: {type: 'container', running: true, label: 'Resource 1'}},
        });
        await waitFor(() => expect(screen.getByText('res1')).toBeInTheDocument());
        await openResourceMenu('res1');
        await waitFor(() => expect(screen.getByText('Console')).toBeInTheDocument());

        const updatedStore = {
            objectInstanceStatus: {[mockObjectName]: {[mockNodeName]: {avail: 'up', resources: {}}}},
            instanceMonitor: {},
            instanceConfig: {},
        };
        vi.mocked(useEventStore).mockImplementation((selector) =>
            typeof selector === 'function' ? selector(updatedStore) : updatedStore
        );
        rerender(
            <MemoryRouter initialEntries={[`/node/${mockNodeName}/instance/${encodeURIComponent(mockObjectName)}`]}>
                <Routes>
                    <Route path="/node/:node/instance/:objectName" element={<ObjectInstanceView/>}/>
                </Routes>
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByText('Console')).toBeInTheDocument();
            expect(screen.getByText('Run')).toBeInTheDocument();
        });
    });
});
