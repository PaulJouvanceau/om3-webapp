import React from 'react';
import {render, screen, fireEvent, waitFor, within} from '@testing-library/react';
import {MemoryRouter, Routes, Route} from 'react-router-dom';
import '@testing-library/jest-dom';
import {vi} from 'vitest';
import ObjectInstanceView from '../ObjectInstanceView';
import useEventStore from '../../hooks/useEventStore';
import {startEventReception} from '../../eventSourceManager';
import i18n from '../../i18n';

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
    default: (props) => <div data-testid="logs-viewer">{JSON.stringify(props)}</div>,
}));
// The terminal has its own tests: what the page hands it is what is checked
// here.
vi.mock('../ConsoleTerminal.jsx', () => ({
    default: ({open, target, onClose}) => open ? (
        <div>
            <span data-testid="console-terminal-target">{JSON.stringify(target)}</span>
            <button onClick={onClose}>close console</button>
        </div>
    ) : null,
}));

vi.mock('../../constants/actions', async (importOriginal) => ({
    actionLabel: (await importOriginal()).actionLabel,
    INSTANCE_ACTIONS: [
        {name: '', icon: 'EmptyIcon'},
        {name: 'start', icon: 'StartIcon', endpoint: 'start'},
        {name: 'stop', icon: 'StopIcon', endpoint: 'stop'},
        {name: 'freeze', icon: 'FreezeIcon', endpoint: 'freeze'},
        {name: 'unfreeze', icon: 'UnfreezeIcon', endpoint: 'unfreeze'},
        {name: 'restart', icon: 'RestartIcon', endpoint: 'restart'},
        {name: 'unprovision', icon: 'UnprovisionIcon', endpoint: 'unprovision'},
        {name: 'purge', icon: 'PurgeIcon', endpoint: 'purge'},
        // multi-word actions whose endpoint differs from the label
        {name: 'start standby', icon: 'StartStandbyIcon', endpoint: 'startstandby'},
        {name: 'pg reset', icon: 'PgResetIcon', endpoint: 'pg/reset'},
    ],
    RESOURCE_ACTIONS: [
        {name: 'start', icon: 'StartIcon'},
        {name: 'stop', icon: 'StopIcon'},
        {name: 'restart', icon: 'RestartIcon'},
        {name: 'run', icon: 'RunIcon'},
        {name: 'console', icon: 'ConsoleIcon'},
        {name: 'freeze', icon: 'FreezeIcon'},
        {name: 'unprovision', icon: 'UnprovisionIcon'},
        {name: 'purge', icon: 'PurgeIcon'},
    ],
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

const loadingStatus = () => screen.queryByRole('status', {name: 'Loading instance data...'});

const waitLoaded = () => waitFor(() => expect(loadingStatus()).not.toBeInTheDocument());

const instanceMenuButton = () => screen.getByRole('button', {name: 'Instance actions'});

const openInstanceMenu = async () => {
    await waitLoaded();
    fireEvent.click(instanceMenuButton());
};

const openResourceMenu = async (rid) => {
    fireEvent.click(screen.getByRole('button', {name: `Resource ${rid} actions`}));
};

const resourceRow = (rid) => screen.getByRole('row', {name: `Resource ${rid}`});

/** The fixed-width flags code of a resource (R M D O E P S restarts). */
const flagsOf = (rid) => screen.getByRole('img', {name: new RegExp(`^Resource ${rid} status: `)});

const triggerInstanceAction = async (actionLabel) => {
    await openInstanceMenu();
    fireEvent.click(screen.getByRole('menuitem', {name: actionLabel}));
};

const triggerConsoleFlow = async () => {
    await waitFor(() => expect(screen.getByText('container1')).toBeInTheDocument());
    await openResourceMenu('container1');
    fireEvent.click(screen.getByRole('menuitem', {name: 'Console'}));
    await waitFor(() => expect(screen.getByTestId('console-terminal-target')).toBeInTheDocument());
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
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete window.matchMedia;
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ObjectInstanceView', () => {

    // Loading & basic render
    test('renders loading state initially', () => {
        setup();
        expect(loadingStatus()).toBeInTheDocument();
    });

    test('subscribes to the instance events of this object', () => {
        setup();
        expect(startEventReception).toHaveBeenCalledWith(
            'mock-token',
            ['InstanceStatusUpdated', 'InstanceMonitorUpdated', 'InstanceConfigUpdated'],
            mockObjectName,
        );
    });

    test('renders instance data after loading', async () => {
        setupWithStatus({
            avail: 'up',
            frozen_at: null,
            provisioned: true,
            resources: {res1: {type: 'container', running: true, label: 'Resource 1'}},
        });
        await waitLoaded();
        expect(screen.getByRole('heading', {level: 1, name: mockObjectName})).toBeInTheDocument();
        expect(screen.getByText(`Node: ${mockNodeName}`)).toBeInTheDocument();
        expect(screen.getByRole('heading', {name: 'Resources (1)'})).toBeInTheDocument();
        expect(screen.getByRole('table', {name: 'Resources'})).toBeInTheDocument();
        const row = within(resourceRow('res1'));
        expect(row.getByText('res1')).toBeInTheDocument();
        expect(row.getByText('container')).toBeInTheDocument();
        expect(row.getByText('Resource 1')).toBeInTheDocument();
        expect(screen.getByTestId('event-logger')).toBeInTheDocument();
    });

    test('displays "No resources found" when resources is empty', async () => {
        setupWithStatus({avail: 'up', resources: {}});
        await waitFor(() =>
            expect(screen.getByText('No resources found on this instance.')).toBeInTheDocument()
        );
        expect(screen.getByRole('heading', {name: 'Resources (0)'})).toBeInTheDocument();
    });

    test('displays resource status as a mark with its label', async () => {
        setupWithStatus({
            avail: 'up',
            resources: {
                res1: {type: 'container', running: true, label: 'Resource 1', status: 'up'},
                res2: {type: 'fs', running: false, label: 'Resource 2', status: 'down'},
                res3: {type: 'fs', label: 'Resource 3', status: 'warn'},
                res4: {type: 'fs', label: 'Resource 4'},
            },
        });
        await waitFor(() => expect(screen.getByText('res1')).toBeInTheDocument());
        const markOf = (rid) => resourceRow(rid).querySelector('[data-state]');
        expect(markOf('res1')).toHaveAttribute('data-state', 'up');
        expect(markOf('res1')).toHaveAttribute('title', 'up');
        expect(markOf('res2')).toHaveAttribute('data-state', 'down');
        expect(markOf('res3')).toHaveAttribute('data-state', 'warn');
        expect(markOf('res4')).toHaveAttribute('data-state', 'unknown');
        expect(markOf('res4')).toHaveAttribute('title', 'unknown');
        expect(within(resourceRow('res2')).getAllByText('down').length).toBeGreaterThan(0);
    });

    test('shows the resource flags with their meaning as a tooltip', async () => {
        setupWithStatus({avail: 'up', resources: {res1: {type: 'fs', running: true, label: 'R1'}}});
        await waitFor(() => expect(screen.getByText('res1')).toBeInTheDocument());
        expect(flagsOf('res1')).toHaveTextContent('R.......');
        expect(flagsOf('res1')).toHaveAttribute('title', expect.stringContaining('Running'));
        expect(flagsOf('res1')).toHaveClass('font-mono');
    });

    test('shows frozen mark when instance is frozen', async () => {
        setupWithStatus({avail: 'up', frozen_at: '2024-01-01T00:00:00Z', resources: {}});
        await waitLoaded();
        expect(screen.getByTitle('frozen')).toBeInTheDocument();
    });

    test('shows no frozen mark when the frozen date is the zero date', async () => {
        setupWithStatus({avail: 'up', frozen_at: '0001-01-01T00:00:00Z', resources: {}});
        await waitLoaded();
        expect(screen.queryByTitle('frozen')).not.toBeInTheDocument();
    });

    test('shows the stopped mark, with the stop date, when the instance is stopped', async () => {
        setupWithStatus({avail: 'down', stopped_at: '2024-01-01T00:00:00Z', resources: {}});
        await waitLoaded();
        const mark = await screen.findByRole('img', {name: 'Instance is stopped'});
        expect(mark).toHaveAttribute('title', `stopped at ${new Date('2024-01-01T00:00:00Z').toLocaleString(i18n.language)}`);
        // A glyph goes with the mark, not a colour alone.
        expect(mark.querySelector('svg')).not.toBeNull();
    });

    test('shows no stopped mark when stopped_at is the zero sentinel', async () => {
        setupWithStatus({avail: 'up', stopped_at: '0001-01-01T00:00:00Z', resources: {}});
        await waitLoaded();
        expect(screen.queryByRole('img', {name: 'Instance is stopped'})).not.toBeInTheDocument();
    });

    test('shows the RPO breached mark when the instance is lagging', async () => {
        setupWithStatus({avail: 'up', rpo_breached_at: '2024-01-01T00:00:00Z', resources: {}});
        await waitLoaded();
        const mark = await screen.findByRole('img', {name: 'RPO breached'});
        expect(mark).toHaveAttribute('title', 'RPO breached');
        expect(mark.querySelector('svg')).not.toBeNull();
    });

    test('shows no RPO breached mark when rpo_breached_at is the zero sentinel', async () => {
        setupWithStatus({avail: 'up', rpo_breached_at: '0001-01-01T00:00:00Z', resources: {}});
        await waitLoaded();
        expect(screen.queryByRole('img', {name: 'RPO breached'})).not.toBeInTheDocument();
    });

    test('shows not-provisioned warning when instance is not provisioned', async () => {
        setupWithStatus({avail: 'up', provisioned: false, resources: {}});
        await waitLoaded();
        expect(screen.getAllByRole('img', {name: /not provisioned/i})).toHaveLength(1);
        expect(screen.getByRole('img', {name: 'Instance is not provisioned'})).toBeInTheDocument();
    });

    test('shows the instance status badge', async () => {
        setupWithStatus({avail: 'warn', resources: {}});
        await waitLoaded();
        expect(screen.getByText('warn')).toHaveClass('text-state-warn');
    });

    test('renders an unknown status for instance with undefined avail', async () => {
        setupWithStatus({resources: {}});
        await waitLoaded();
        expect(screen.getByText('unknown')).toHaveClass('text-state-unknown');
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
        const menu = await screen.findByRole('menu', {name: 'Instance actions'});
        expect(within(menu).getByRole('menuitem', {name: 'Start'})).toBeInTheDocument();
        expect(within(menu).getByRole('menuitem', {name: 'Stop'})).toBeInTheDocument();
        expect(within(menu).getByRole('menuitem', {name: 'Freeze'})).toBeInTheDocument();
        expect(within(menu).queryByRole('menuitem', {name: 'Unfreeze'})).not.toBeInTheDocument();
    });

    test('instance menu offers unfreeze rather than freeze on a frozen instance', async () => {
        setupWithStatus({avail: 'up', frozen_at: '2024-01-01T00:00:00Z', resources: {}});
        await openInstanceMenu();
        const menu = await screen.findByRole('menu', {name: 'Instance actions'});
        expect(within(menu).getByRole('menuitem', {name: 'Unfreeze'})).toBeInTheDocument();
        expect(within(menu).queryByRole('menuitem', {name: 'Freeze'})).not.toBeInTheDocument();
    });

    test('closes instance menu on click away', async () => {
        setupWithStatus({avail: 'up', resources: {}});
        await openInstanceMenu();
        await waitFor(() => expect(screen.getByText('Start')).toBeInTheDocument());
        fireEvent.pointerDown(document.body);
        await waitFor(() => expect(screen.queryByText('Start')).not.toBeInTheDocument());
    });

    test('opens resource action menu', async () => {
        setupWithStatus({avail: 'up', resources: {res1: {type: 'container', running: true, label: 'Resource 1'}}});
        await waitFor(() => expect(screen.getByText('res1')).toBeInTheDocument());
        await openResourceMenu('res1');
        const menu = await screen.findByRole('menu', {name: 'Resource res1 actions'});
        expect(within(menu).getByRole('menuitem', {name: 'Start'})).toBeInTheDocument();
        expect(within(menu).getByRole('menuitem', {name: 'Stop'})).toBeInTheDocument();
        expect(within(menu).getByRole('menuitem', {name: 'Console'})).toBeInTheDocument();
    });

    test('closes resource menu on click away', async () => {
        setupWithStatus({avail: 'up', resources: {res1: {type: 'container', running: true, label: 'Resource 1'}}});
        await waitFor(() => expect(screen.getByText('res1')).toBeInTheDocument());
        await openResourceMenu('res1');
        await waitFor(() => expect(screen.getByText('Console')).toBeInTheDocument());
        fireEvent.pointerDown(document.body);
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
        for (const label of present) expect(screen.getByRole('menuitem', {name: label})).toBeInTheDocument();
        for (const label of absent) expect(screen.queryByRole('menuitem', {name: label})).not.toBeInTheDocument();
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

    test('resource action is confirmed and posted with its rid', async () => {
        global.fetch.mockResolvedValue({ok: true, headers: new Map()});
        setupWithStatus({avail: 'up', resources: {fs1: {type: 'fs', running: true, label: 'FS 1'}}});
        await waitFor(() => expect(screen.getByText('fs1')).toBeInTheDocument());
        await openResourceMenu('fs1');
        fireEvent.click(screen.getByRole('menuitem', {name: 'Restart'}));
        const dialog = await screen.findByRole('dialog', {name: 'Confirm Restart'});
        expect(dialog).toHaveTextContent('on resource fs1');
        fireEvent.click(within(dialog).getByRole('button', {name: 'Confirm'}));
        await waitFor(() =>
            expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/action/restart?rid=fs1'), expect.anything())
        );
        await waitFor(() => expect(screen.getByText("Action 'restart' succeeded")).toBeInTheDocument());
    });

    test('displays encapsulated resources nested under their container', async () => {
        setupWithStatus({
            avail: 'up',
            resources: {container1: {type: 'container', running: true, label: 'C1'}},
            encap: {container1: {resources: {encap1: {type: 'fs', running: true, label: 'Enc FS'}}}},
        });
        await waitFor(() => expect(screen.getByText('container1')).toBeInTheDocument());
        expect(screen.getByText('encap1')).toBeInTheDocument();
        // The following row, indented in the rid cell, flagged E.
        expect(resourceRow('container1').nextElementSibling).toBe(resourceRow('encap1'));
        expect(within(resourceRow('encap1')).getByText('encap1')).toHaveClass('pl-6');
        expect(within(resourceRow('container1')).getByText('container1')).not.toHaveClass('pl-6');
        expect(flagsOf('encap1').textContent.charAt(4)).toBe('E');
        expect(flagsOf('container1').textContent.charAt(4)).toBe('.');
    });

    test('shows message when container has no encap data', async () => {
        setupWithStatus({
            avail: 'up',
            resources: {container1: {type: 'container', running: true, label: 'C1'}},
        });
        await waitFor(() => expect(screen.getByText('container1')).toBeInTheDocument());
        expect(screen.getByText('No encapsulated data available for container1.')).toBeInTheDocument();
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
        expect(screen.getByRole('img', {name: 'Resource container1 is not provisioned'})).toBeInTheDocument();
        expect(flagsOf('container1').textContent.charAt(5)).toBe('P');
    });

    test('no not-provisioned icon when encap has no provisioned field', async () => {
        setupWithStatus({
            avail: 'up',
            resources: {container1: {type: 'container', running: true, label: 'C1', provisioned: {state: 'true'}}},
            encap: {container1: {resources: {encap1: {type: 'fs', running: true, label: 'Enc FS'}}}},
        });
        await waitFor(() => expect(screen.getByText('container1')).toBeInTheDocument());
        expect(screen.queryByRole('img', {name: /not provisioned/i})).not.toBeInTheDocument();
    });

    test('displays resource logs with correct level formatting, in a row under the resource', async () => {
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
        expect(screen.getByText('error: Critical error')).toHaveClass('text-state-down');
        expect(screen.getByText('warn: Warning message')).toHaveClass('text-state-warn');
        expect(screen.getByText('info: Info message')).toHaveClass('text-ink-muted');
        const logs = screen.getByRole('list', {name: 'Logs of resource res1'});
        expect(resourceRow('res1').nextElementSibling).toBe(logs.closest('tr'));
    });

    test('displays info: actions disabled label', async () => {
        setupWithStatus({
            avail: 'up',
            resources: {res1: {type: 'fs', running: true, label: 'R1', info: {actions: 'disabled'}}},
        });
        await waitFor(() => expect(screen.getByText('res1')).toBeInTheDocument());
        expect(within(resourceRow('res1')).getByText('info: actions disabled')).toHaveClass('text-ink-muted');
    });

    test('shows N/A for a resource without label nor type', async () => {
        setupWithStatus({avail: 'up', resources: {res1: {running: true}}});
        await waitFor(() => expect(screen.getByText('res1')).toBeInTheDocument());
        expect(within(resourceRow('res1')).getAllByText('N/A')).toHaveLength(2);
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
        expect(flagsOf('res1').textContent).toContain(letter);
    });

    test('resource status string starts with . when running is undefined', async () => {
        setupWithStatus({avail: 'up', resources: {res1: {type: 'fs', label: 'R1'}}});
        await waitFor(() => expect(screen.getByText('res1')).toBeInTheDocument());
        expect(flagsOf('res1').textContent.charAt(0)).toBe('.');
    });

    test('optional resource shows O in status', async () => {
        setupWithStatus({avail: 'up', resources: {res1: {type: 'fs', running: true, optional: true, label: 'R1'}}});
        await waitFor(() => expect(screen.getByText('res1')).toBeInTheDocument());
        expect(flagsOf('res1').textContent).toContain('O');
    });

    test('provisioned=n/a shows P in status', async () => {
        setupWithStatus({
            avail: 'up',
            resources: {res1: {type: 'fs', running: true, label: 'R1', provisioned: {state: 'n/a'}}},
        });
        await waitFor(() => expect(screen.getByText('res1')).toBeInTheDocument());
        expect(flagsOf('res1').textContent).toContain('P');
        expect(screen.getByRole('img', {name: 'Resource res1 is not provisioned'})).toBeInTheDocument();
    });

    test('no P in status when resource has no provisioned field', async () => {
        setupWithStatus({avail: 'up', resources: {res1: {type: 'fs', running: true, label: 'R1'}}});
        await waitFor(() => expect(screen.getByText('res1')).toBeInTheDocument());
        expect(flagsOf('res1').textContent).not.toContain('P');
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
        expect(flagsOf('res1').textContent).toContain(expected);
    });

    test.each([
        ['0 remaining', 0, '.'],
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
        expect(flagsOf('res1').textContent.charAt(7)).toBe(expectedText);
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
        const statusText = flagsOf('res1').textContent;
        expect(statusText).toContain('M');
        expect(statusText).toContain('D');
        expect(statusText).toContain('S');
    });

    // Logs drawer
    test('opens and closes logs drawer', async () => {
        setupWithStatus({avail: 'up', resources: {}});
        await waitLoaded();
        expect(screen.queryByTestId('logs-viewer')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', {name: /view logs for instance test-namespace\/test-kind\/test-name/i}));
        await waitFor(() => {
            expect(screen.getByTestId('logs-viewer')).toBeInTheDocument();
        });
        const drawer = screen.getByRole('dialog', {name: `Instance Logs - ${mockNodeName}/${mockObjectName}`});
        expect(drawer).not.toHaveAttribute('inert');
        expect(within(drawer).getByText(`Instance Logs - ${mockNodeName}/${mockObjectName}`)).toBeInTheDocument();
        expect(JSON.parse(screen.getByTestId('logs-viewer').textContent)).toEqual({
            nodename: mockNodeName,
            type: 'instance',
            namespace: 'test-namespace',
            kind: 'test-kind',
            instanceName: 'test-name',
            height: '100%',
        });
        fireEvent.click(screen.getByRole('button', {name: 'Close instance logs'}));
        await waitFor(() => expect(screen.queryByTestId('logs-viewer')).not.toBeInTheDocument());
    });

    test('logs drawer is resizable by its handle', async () => {
        setupWithStatus({avail: 'up', resources: {}});
        await waitLoaded();
        expect(screen.queryByRole('separator', {name: 'Resize drawer'})).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', {name: /view logs for instance/i}));
        await waitFor(() => expect(screen.getByTestId('logs-viewer')).toBeInTheDocument());
        const handle = screen.getByRole('separator', {name: 'Resize drawer'});
        const before = handle.getAttribute('aria-valuenow');
        fireEvent.keyDown(handle, {key: 'ArrowLeft'});
        await waitFor(() => expect(handle.getAttribute('aria-valuenow')).not.toBe(before));
        // Enter gives the default width back, for the other tests.
        fireEvent.keyDown(handle, {key: 'Enter'});
        await waitFor(() => expect(handle.getAttribute('aria-valuenow')).toBe(before));
    });

    // API calls
    test('calls API for instance action (start)', async () => {
        global.fetch.mockResolvedValue({ok: true, headers: new Map()});
        setupWithStatus({avail: 'up', resources: {}});
        await triggerInstanceAction('Start');
        await waitFor(() => expect(screen.getByText('Confirm Start')).toBeInTheDocument());
        expect(screen.getByRole('dialog', {name: 'Confirm Start'})).toHaveTextContent('on this instance');
        fireEvent.click(screen.getByRole('button', {name: 'Confirm'}));
        await waitFor(() =>
            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining(`/instance/path/${mockParseObjectPathResult.namespace}/${mockParseObjectPathResult.kind}/${mockParseObjectPathResult.name}/action/start`),
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({Authorization: 'Bearer mock-token'}),
                })
            )
        );
        await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent("Action 'start' succeeded"));
        expect(screen.queryByRole('dialog', {name: 'Confirm Start'})).not.toBeInTheDocument();
    });

    test('calls API for restart action', async () => {
        global.fetch.mockResolvedValue({ok: true, headers: new Map()});
        setupWithStatus({avail: 'up', resources: {}});
        await triggerInstanceAction('Restart');
        await waitFor(() => expect(screen.getByText('Confirm Restart')).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', {name: 'Confirm'}));
        await waitFor(() =>
            expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/action/restart'), expect.anything())
        );
    });

    test('calls API for unfreeze action', async () => {
        global.fetch.mockResolvedValue({ok: true, headers: new Map()});
        setupWithStatus({avail: 'up', frozen_at: '2024-01-01T00:00:00Z', resources: {}});
        await triggerInstanceAction('Unfreeze');
        await waitFor(() => expect(screen.getByText('Confirm Unfreeze')).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', {name: 'Confirm'}));
        await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    });

    // ── endpoint mapping for multi-word instance actions ─────────────────
    test('instance action "start standby" uses endpoint "startstandby" in the URL', async () => {
        global.fetch.mockResolvedValue({ok: true, headers: new Map()});
        setupWithStatus({avail: 'up', resources: {}});
        await triggerInstanceAction('Start standby');
        const dialog = await screen.findByRole('dialog', {name: 'Confirm Start standby'});
        fireEvent.click(within(dialog).getByRole('button', {name: 'Confirm'}));
        await waitFor(() =>
            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringMatching(/\/action\/startstandby$/),
                expect.any(Object)
            )
        );
    });

    test('instance action "pg reset" uses endpoint "pg/reset" in the URL', async () => {
        global.fetch.mockResolvedValue({ok: true, headers: new Map()});
        setupWithStatus({avail: 'up', resources: {}});
        await triggerInstanceAction('Pg reset');
        const dialog = await screen.findByRole('dialog', {name: 'Confirm Pg reset'});
        fireEvent.click(within(dialog).getByRole('button', {name: 'Confirm'}));
        await waitFor(() =>
            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringMatching(/\/action\/pg\/reset$/),
                expect.any(Object)
            )
        );
    });

    test('freeze dialog: confirm button disabled until checkbox checked', async () => {
        setupWithStatus({avail: 'up', resources: {}});
        await triggerInstanceAction('Freeze');
        await waitFor(() => expect(screen.getByText('Confirm Freeze')).toBeInTheDocument());
        const confirmBtn = screen.getByRole('button', {name: /confirm/i});
        expect(confirmBtn).toBeDisabled();
        fireEvent.click(screen.getByRole('checkbox', {name: /orchestration will be paused/i}));
        expect(confirmBtn).not.toBeDisabled();
        fireEvent.click(screen.getByText('Cancel'));
    });

    test('stop dialog: confirms and calls API', async () => {
        global.fetch.mockResolvedValue({ok: true, headers: new Map()});
        setupWithStatus({avail: 'up', resources: {}});
        await triggerInstanceAction('Stop');
        await waitFor(() => expect(screen.getByText('Confirm Stop')).toBeInTheDocument());
        const stopBtn = screen.getByRole('button', {name: 'Stop'});
        expect(stopBtn).toBeDisabled();
        fireEvent.click(screen.getByRole('checkbox', {name: /may interrupt services/i}));
        fireEvent.click(stopBtn);
        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/action/stop'), expect.anything()));
    });

    test('unprovision dialog: requires both checkboxes', async () => {
        global.fetch.mockResolvedValue({ok: true, headers: new Map()});
        setupWithStatus({avail: 'up', resources: {}});
        await triggerInstanceAction('Unprovision');
        await waitFor(() => expect(screen.getByText('Confirm Unprovision')).toBeInTheDocument());
        const [cb1, cb2] = screen.getAllByRole('checkbox');
        const confirmBtn = screen.getByRole('button', {name: /confirm/i});
        fireEvent.click(cb1);
        expect(confirmBtn).toBeDisabled();
        fireEvent.click(cb2);
        expect(confirmBtn).not.toBeDisabled();
        fireEvent.click(confirmBtn);
        await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    });

    test('purge dialog: requires all three checkboxes', async () => {
        global.fetch.mockResolvedValue({ok: true, headers: new Map()});
        setupWithStatus({avail: 'up', resources: {}});
        await triggerInstanceAction('Purge');
        await waitFor(() => expect(screen.getByText('Confirm Purge')).toBeInTheDocument());
        const checkboxes = screen.getAllByRole('checkbox');
        expect(checkboxes).toHaveLength(3);
        const confirmBtn = screen.getByRole('button', {name: /confirm/i});
        fireEvent.click(checkboxes[0]);
        fireEvent.click(checkboxes[1]);
        expect(confirmBtn).toBeDisabled();
        fireEvent.click(checkboxes[2]);
        fireEvent.click(confirmBtn);
        await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    });

    test.each([
        ['Start', 'Confirm Start'],
        ['Stop', 'Confirm Stop'],
        ['Unprovision', 'Confirm Unprovision'],
        ['Purge', 'Confirm Purge'],
        ['Freeze', 'Confirm Freeze'],
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
        fireEvent.keyDown(screen.getByRole('dialog', {name: title}), {key: 'Escape', code: 'Escape'});
        await waitFor(() => expect(screen.queryByText(title)).not.toBeInTheDocument());
    });

    // Console action
    test('console: opens a terminal on the container resource, with nothing to confirm', async () => {
        setupWithStatus(containerStatus());
        await triggerConsoleFlow();

        expect(screen.getByTestId('console-terminal-target')).toHaveTextContent(
            JSON.stringify({node: mockNodeName, ...mockParseObjectPathResult, rid: 'container1'})
        );
        // The terminal asks for its ticket itself: the page posts nothing,
        // and shows no dialog to confirm.
        expect(global.fetch).not.toHaveBeenCalledWith(expect.stringContaining('/console'), expect.anything());
        expect(screen.queryByText(/Confirm/)).not.toBeInTheDocument();
    });

    test('console: the terminal is closed when it says so, and can be opened again', async () => {
        setupWithStatus(containerStatus());
        await triggerConsoleFlow();
        fireEvent.click(screen.getByText('close console'));
        await waitFor(() => expect(screen.queryByTestId('console-terminal-target')).not.toBeInTheDocument());

        await triggerConsoleFlow();
        expect(screen.getByTestId('console-terminal-target')).toBeInTheDocument();
    });

    // Error handling
    test('shows feedback on HTTP error with API message', async () => {
        global.fetch.mockResolvedValue({
            ok: false,
            status: 500,
            text: () => Promise.resolve(JSON.stringify({message: 'That is broken'})),
            headers: {get: () => 'application/json'},
        });
        setupWithStatus({avail: 'up', resources: {}});
        await triggerInstanceAction('Start');
        await waitFor(() => expect(screen.getByText('Confirm Start')).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', {name: 'Confirm'}));
        await waitFor(() => {
            expect(screen.getByRole('alert')).toHaveTextContent(/Failed: HTTP 500/i);
            expect(screen.getByRole('alert')).toHaveTextContent(/That is broken/i);
        });
    });

    test('shows feedback on fetch network error', async () => {
        global.fetch.mockRejectedValue(new Error('Network error'));
        setupWithStatus({avail: 'up', resources: {}});
        await triggerInstanceAction('Start');
        fireEvent.click(screen.getByRole('button', {name: 'Confirm'}));
        await waitFor(() => {
            const alerts = screen.getAllByRole('alert');
            expect(alerts.find(a => a.textContent?.includes('Error: Network error'))).toBeInTheDocument();
        });
    });

    test('shows feedback when auth token is missing', async () => {
        localStorageMock.getItem.mockReturnValue(null);
        setupWithStatus({avail: 'up', resources: {}});
        await triggerInstanceAction('Start');
        fireEvent.click(screen.getByRole('button', {name: 'Confirm'}));
        await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Auth token not found.'));
    });

    test('dismisses feedback on its close button', async () => {
        global.fetch.mockResolvedValue({ok: false, status: 500});
        setupWithStatus({avail: 'up', resources: {}});
        await triggerInstanceAction('Start');
        fireEvent.click(screen.getByRole('button', {name: 'Confirm'}));
        await waitFor(() => expect(screen.getByText(/Failed: HTTP 500/i)).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', {name: 'Dismiss'}));
        await waitFor(() => expect(screen.queryByText(/Failed: HTTP 500/i)).not.toBeInTheDocument());
    });

    test('feedback hides itself after a while', async () => {
        global.fetch.mockResolvedValue({ok: false, status: 500});
        setupWithStatus({avail: 'up', resources: {}});
        await triggerInstanceAction('Start');
        fireEvent.click(screen.getByRole('button', {name: 'Confirm'}));
        await waitFor(() => expect(screen.getByText(/Failed: HTTP 500/i)).toBeInTheDocument());
        await waitFor(
            () => expect(screen.queryByText(/Failed: HTTP 500/i)).not.toBeInTheDocument(),
            {timeout: 6000},
        );
    }, 10000);

    // In-progress state
    test('action in progress disables resource action buttons', async () => {
        global.fetch.mockImplementation(() => new Promise(() => {
        }));
        setupWithStatus({avail: 'up', resources: {res1: {type: 'container', running: true, label: 'R1'}}});
        await waitFor(() => expect(screen.getByText('res1')).toBeInTheDocument());
        await openInstanceMenu();
        fireEvent.click(screen.getByRole('menuitem', {name: 'Start'}));
        fireEvent.click(screen.getByRole('button', {name: 'Confirm'}));
        await waitFor(() => {
            expect(screen.getByRole('button', {name: 'Resource res1 actions'})).toBeDisabled();
            expect(instanceMenuButton()).toBeDisabled();
            expect(screen.getByRole('status', {name: 'Action in progress'})).toBeInTheDocument();
        });
        expect(screen.getByText('Executing start on instance...')).toBeInTheDocument();
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
        expect(resourceRow('encap1').nextElementSibling).toHaveTextContent('info: Encap log message');
    });

    test('resource actions open on a narrow screen too', async () => {
        window.matchMedia = vi.fn().mockImplementation(query => ({
            matches: !query.includes('min-width'),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        }));

        setupWithStatus({avail: 'up', resources: {res1: {type: 'container', running: true, label: 'Resource 1'}}});
        await waitFor(() => expect(screen.getByText('res1')).toBeInTheDocument());

        // The table keeps its columns and scrolls sideways rather than wrapping its rows.
        expect(screen.getByRole('table', {name: 'Resources'})).toHaveClass('min-w-[40rem]');
        const resourceActionBtns = screen.getAllByRole('button', {name: 'Resource res1 actions'});
        expect(resourceActionBtns).toHaveLength(1);
        fireEvent.click(resourceActionBtns[0]);

        await waitFor(() => expect(screen.getByText('Console')).toBeInTheDocument());
    });

    test('confirming an empty action triggers fallback warn and resets dialogs', async () => {
        setupWithStatus({avail: 'up', resources: {}});
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
        });

        await openInstanceMenu();
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

        await waitFor(() => expect(screen.queryByRole('dialog', {name: /Confirm/})).not.toBeInTheDocument());

        consoleWarnSpy.mockRestore();
    });

    test('resource menu goes away with its resource after data change', async () => {
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
            expect(screen.queryByRole('row', {name: 'Resource res1'})).not.toBeInTheDocument();
            expect(screen.queryByRole('menu')).not.toBeInTheDocument();
            expect(screen.getByText('No resources found on this instance.')).toBeInTheDocument();
        });
    });
});
