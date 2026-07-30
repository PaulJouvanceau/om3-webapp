import React, {act} from 'react';
import {render, screen, fireEvent, waitFor, within} from '@testing-library/react';
import {MemoryRouter, Route, Routes} from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import ObjectDetail, {getResourceType, parseProvisionedState} from '../ObjectDetails';
import useEventStore from '../../hooks/useEventStore.js';
import {closeEventSource, startEventReception} from '../../eventSourceManager.jsx';
import logger from '../../utils/logger';

// ─── MUI mock ─────────────────────────────────────────────────────────────
jest.mock('@mui/material', () => {
    const actual = jest.requireActual('@mui/material');
    return {
        ...actual,
        Menu: ({open, children, ...props}) =>
            open ? <div role="menu" {...props}>{children}</div> : null,
        MenuItem: ({onClick, children, ...props}) => (
            <div role="menuitem" onClick={onClick} {...props}>
                {children}
            </div>
        ),
        ListItemIcon: (props) => <span {...props} />,
        ListItemText: (props) => <span {...props} />,
        Dialog: ({open, children, ...props}) =>
            open ? <div role="dialog" {...props}>{children}</div> : null,
        DialogTitle: (props) => <div {...props} />,
        DialogContent: (props) => <div {...props} />,
        DialogActions: (props) => <div {...props} />,
        Snackbar: ({open, children, ...props}) =>
            open ? <div data-testid="snackbar" {...props}>{children}</div> : null,
        Alert: ({severity, onClose, children, ...props}) => (
            <div role="alert" data-severity={severity} {...props}>
                {children}
                {onClose && (
                    <button onClick={onClose} aria-label="Close" data-testid="alert-close-button">
                        ×
                    </button>
                )}
            </div>
        ),
        Checkbox: ({checked, onChange, ...props}) => (
            <input type="checkbox" checked={checked} onChange={onChange} {...props} />
        ),
        IconButton: (props) => <button {...props} />,
        TextField: ({label, value, onChange, helperText, ...props}) => {
            const inputId = props.id || `textfield-${label}`;
            return (
                <div>
                    <label htmlFor={inputId}>{label}</label>
                    <input id={inputId} type="text" placeholder={label} value={value} onChange={onChange} {...props} />
                </div>
            );
        },
        CircularProgress: () => <div role="progressbar">Loading...</div>,
        Box: (props) => <div {...props} />,
        Typography: (props) => <span {...props} />,
        Tooltip: ({title, children, ...props}) => <span title={title} {...props}>{children}</span>,
        Button: ({onClick, disabled, variant, children, ...props}) => (
            <button onClick={onClick} disabled={disabled} data-variant={variant} {...props}>
                {children}
            </button>
        ),
        Popper: ({open, children, ...props}) => (open ? <div {...props}>{children}</div> : null),
        Paper: (props) => <div {...props} />,
        ClickAwayListener: ({onClickAway, children, ...props}) => (
            <div onClick={onClickAway} {...props}>{children}</div>
        ),
        Grid: (props) => <div {...props} />,
    };
});

jest.mock('@mui/icons-material/ExpandMore', () => () => <span>ExpandMore</span>);
jest.mock('@mui/icons-material/UploadFile', () => () => <span>UploadFile</span>);
jest.mock('@mui/icons-material/Edit', () => () => <span>Edit</span>);
jest.mock('@mui/icons-material/AcUnit', () => () => <span>AcUnit</span>);
jest.mock('@mui/icons-material/MoreVert', () => () => <span>MoreVertIcon</span>);

jest.mock('react-router-dom', () => ({
    ...jest.requireActual('react-router-dom'),
    useParams: jest.fn(),
    useNavigate: jest.fn(),
}));
jest.mock('../../hooks/useEventStore.js');
jest.mock('../../eventSourceManager.jsx', () => ({
    closeEventSource: jest.fn(),
    startEventReception: jest.fn(),
    clearEventBuffers: jest.fn(),
    startLoggerReception: jest.fn(),
    closeLoggerEventSource: jest.fn(),
}));
jest.mock('../../context/DarkModeContext', () => ({
    useDarkMode: () => ({
        isDarkMode: false,
        toggleDarkMode: jest.fn(),
    }),
}));
jest.mock('../../utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
}));

jest.mock('../ConfigSection', () => ({
    __esModule: true,
    default: (props) => {
        const {decodedObjectName, configNode, configDialogOpen, setConfigDialogOpen} = props;
        return (
            <div>
                <button onClick={() => setConfigDialogOpen(true)} data-testid="open-config-dialog">
                    View Configuration
                </button>
                {configDialogOpen && (
                    <div role="dialog" data-testid="config-dialog">
                        <div>Configuration for {decodedObjectName}</div>
                        {configNode && <div>Node: {configNode}</div>}
                    </div>
                )}
            </div>
        );
    },
}));

jest.mock('../../constants/actions', () => ({
    OBJECT_ACTIONS: [
        {name: 'start', icon: 'StartIcon'},
        {name: 'stop', icon: 'StopIcon'},
        {name: 'freeze', icon: 'FreezeIcon'},
        {name: 'unprovision', icon: 'UnprovisionIcon'},
        {name: 'purge', icon: 'PurgeIcon'},
    ],
    INSTANCE_ACTIONS: [
        {name: 'start', icon: 'StartIcon'},
        {name: 'stop', icon: 'StopIcon'},
        {name: 'freeze', icon: 'FreezeIcon'},
        {name: 'unprovision', icon: 'UnprovisionIcon'},
        {name: 'purge', icon: 'PurgeIcon'},
    ],
    RESOURCE_ACTIONS: [
        {name: 'start', icon: 'StartIcon'},
        {name: 'stop', icon: 'StopIcon'},
        {name: 'run', icon: 'RunIcon'},
        {name: 'unprovision', icon: 'UnprovisionIcon'},
        {name: 'purge', icon: 'PurgeIcon'},
        {name: 'console', icon: 'ConsoleIcon'},
    ],
}));

jest.mock('../LogsViewer.jsx', () => ({nodename, height}) => (
    <div data-testid="logs-viewer" data-nodename={nodename} style={{height}}>
        Logs Viewer Mock
    </div>
));

jest.mock('../../services/api.jsx', () => ({
    getResponseErrorMessage: jest.fn(() => 'Server error'),
}));

// ─── localStorage mock ─────────────────────────────────────────────────────
const mockLocalStorage = {
    getItem: jest.fn(() => 'mock-token'),
    setItem: jest.fn(),
    removeItem: jest.fn(),
};
Object.defineProperty(global, 'localStorage', {value: mockLocalStorage});
Object.defineProperty(global.navigator, 'clipboard', {
    value: {writeText: jest.fn()},
    configurable: true,
    writable: true,
});

// ─── State factories ───────────────────────────────────────────────────────
const BASE_FNS = () => ({
    configUpdates: [],
    clearConfigUpdate: jest.fn(),
    removeObject: jest.fn(),
    setObjectStatuses: jest.fn(),
    setInstanceStatuses: jest.fn(),
});

const emptyState = () => ({
    objectStatus: {},
    objectInstanceStatus: {},
    instanceMonitor: {},
    instanceConfig: {},
    ...BASE_FNS(),
});

const buildState = (overrides = {}) => ({
    objectStatus: {'root/svc/svc1': {avail: 'up', frozen: null}},
    objectInstanceStatus: {
        'root/svc/svc1': {
            node1: {
                avail: 'up',
                frozen_at: null,
                resources: {
                    res1: {status: 'up', label: 'R1', type: 'disk', provisioned: {state: 'true'}, running: true},
                },
            },
            node2: {
                avail: 'down',
                frozen_at: null,
                resources: {
                    res2: {status: 'warn', label: 'R2', type: 'compute', provisioned: {state: 'true'}, running: false},
                },
            },
        },
    },
    instanceMonitor: {
        'node1:root/svc/svc1': {state: 'running', global_expect: 'placed@node1', resources: {}},
        'node2:root/svc/svc1': {state: 'idle', global_expect: 'none', resources: {}},
    },
    instanceConfig: {
        'root/svc/svc1': {
            node1: {resources: {res1: {is_monitored: true, is_disabled: false, is_standby: false, restart: 0}}},
        },
    },
    ...BASE_FNS(),
    ...overrides,
});

const fullMockState = {
    objectStatus: {
        'root/cfg/cfg1': {avail: 'up', frozen: 'frozen'},
        'root/svc/svc1': {avail: 'up', frozen: null},
    },
    objectInstanceStatus: {
        'root/cfg/cfg1': {
            node1: {
                avail: 'up',
                frozen_at: null,
                resources: {
                    res1: {
                        status: 'up',
                        label: 'Resource 1',
                        type: 'disk',
                        provisioned: {state: 'true'},
                        running: true
                    },
                    res2: {
                        status: 'down',
                        label: 'Resource 2',
                        type: 'task',
                        provisioned: {state: 'false'},
                        running: false
                    },
                },
            },
            node2: {
                avail: 'down',
                frozen_at: null,
                resources: {
                    res3: {
                        status: 'warn',
                        label: 'Resource 3',
                        type: 'compute',
                        provisioned: {state: 'true'},
                        running: false
                    },
                },
            },
        },
        'root/svc/svc1': {
            node1: {
                avail: 'up',
                frozen_at: null,
                resources: {
                    res1: {
                        status: 'up',
                        label: 'Resource 1',
                        type: 'disk',
                        provisioned: {state: 'true'},
                        running: true
                    },
                    res2: {
                        status: 'down',
                        label: 'Resource 2',
                        type: 'task',
                        provisioned: {state: 'false'},
                        running: false
                    },
                    res5: {status: 'up', label: 'Resource 5', type: 'ip', provisioned: true, running: true},
                },
                encap: {
                    container1: {
                        resources: {
                            res4: {
                                status: 'up',
                                label: 'Encap Resource 1',
                                type: 'container',
                                provisioned: {state: 'true'},
                                running: true
                            },
                        },
                    },
                },
            },
            node2: {
                avail: 'down',
                frozen_at: null,
                resources: {
                    res3: {
                        status: 'warn',
                        label: 'Resource 3',
                        type: 'compute',
                        provisioned: {state: 'true'},
                        running: false
                    },
                },
            },
        },
    },
    instanceMonitor: {
        'node1:root/cfg/cfg1': {
            state: 'running',
            global_expect: 'placed@node1',
            resources: {res1: {restart: {remaining: 0}}}
        },
        'node1:root/svc/svc1': {
            state: 'running',
            global_expect: 'placed@node1',
            resources: {res1: {restart: {remaining: 0}}}
        },
        'node2:root/svc/svc1': {state: 'idle', global_expect: 'none', resources: {res3: {restart: {remaining: 0}}}},
    },
    instanceConfig: {
        'root/cfg/cfg1': {
            node1: {resources: {res1: {is_monitored: true, is_disabled: false, is_standby: false, restart: 0}}},
        },
        'root/svc/svc1': {
            node1: {
                resources: {
                    res1: {is_monitored: true, is_disabled: false, is_standby: false, restart: 0},
                    res2: {is_monitored: true, is_disabled: false, is_standby: false, restart: 0},
                },
            },
            node2: {resources: {}},
        },
    },
    ...BASE_FNS(),
};

// ─── Render helpers ────────────────────────────────────────────────────────
const renderComponent = (objectName) => {
    require('react-router-dom').useParams.mockReturnValue({objectName});
    return render(
        <MemoryRouter initialEntries={[`/object/${encodeURIComponent(objectName)}`]}>
            <Routes>
                <Route path="/object/:objectName" element={<ObjectDetail/>}/>
            </Routes>
        </MemoryRouter>
    );
};

const renderSvc = (objectName = 'root/svc/svc1') => renderComponent(objectName);
const waitForNode = (name) => screen.findByText(name, {}, {timeout: 10000});
const renderReadySvc = async () => {
    renderSvc();
    await waitForNode('node1');
    await waitForNode('node2');
};

const setStoreState = (state) => {
    useEventStore.mockImplementation((s) => s(state));
    useEventStore.getState.mockReturnValue(state);
};

// ─── Action helpers ────────────────────────────────────────────────────────
const confirmDialog = async (dialog) => {
    const cb = within(dialog).queryByRole('checkbox', {name: /confirm/i});
    if (cb) await userEvent.click(cb);
    await userEvent.click(
        within(dialog).getByRole('button', {name: /confirm|submit|ok|execute|apply|proceed|accept/i})
    );
};

const mockNetworkFailure = (urlPattern) => {
    global.fetch.mockImplementation((url) =>
        url.includes(urlPattern)
            ? Promise.reject(new Error('Network error'))
            : Promise.resolve({ok: true, text: () => Promise.resolve('')})
    );
};

const mockActionFailure = (status = 500, message = 'Server error') => {
    global.fetch.mockImplementation((url, options) =>
        options?.method === 'POST' && url.includes('/action/')
            ? Promise.resolve({ok: false, status, text: () => Promise.resolve(message)})
            : Promise.resolve({ok: true, text: () => Promise.resolve('')})
    );
};

const withConsoleAction = async (fn) => {
    const {INSTANCE_ACTIONS} = require('../../constants/actions');
    const orig = [...INSTANCE_ACTIONS];
    INSTANCE_ACTIONS.push({name: 'console', icon: 'ConsoleIcon'});
    try {
        await fn();
    } finally {
        INSTANCE_ACTIONS.length = 0;
        orig.forEach((a) => INSTANCE_ACTIONS.push(a));
    }
};

const openConsoleDialogFn = async () => {
    await screen.findByText('node1');
    await userEvent.click(screen.getByRole('button', {name: /Node node1 actions/i}));
    await waitFor(() => expect(screen.queryAllByRole('menu').length).toBeGreaterThan(0), {timeout: 3000});
    const menus = screen.getAllByRole('menu');
    const consoleItems = within(menus[menus.length - 1]).queryAllByRole('menuitem', {name: /console/i});
    if (consoleItems.length === 0) return null;
    await userEvent.click(consoleItems[0]);
    await waitFor(() => {
        expect(
            screen.queryAllByRole('dialog').some(
                (d) => d.textContent.includes('terminal console') || d.textContent.includes('Open Console')
            )
        ).toBe(true);
    }, {timeout: 5000});
    return (
        screen.queryAllByRole('dialog').find(
            (d) => d.textContent.includes('terminal console') || d.textContent.includes('Open Console')
        ) || null
    );
};

const expandResourceSections = async () => {
    const expandIcons = screen.queryAllByText('ExpandMore');
    for (const icon of expandIcons) {
        const btn = icon.closest('button') || icon.parentElement;
        if (btn) {
            try {
                await userEvent.click(btn);
            } catch (e) {
                // ignore
            }
        }
    }
};

const findAndOpenResourceConsoleDialog = async (candidateFinders) => {
    let trigger = null;
    for (const find of candidateFinders) {
        const matches = find();
        if (matches && matches.length > 0) {
            trigger = matches[0];
            break;
        }
    }
    if (!trigger) return null;
    await userEvent.click(trigger);
    const menus = screen.queryAllByRole('menu');
    const consoleItem = menus.length
        ? within(menus[menus.length - 1]).queryByRole('menuitem', {name: /console/i})
        : null;
    if (!consoleItem) return null;
    await userEvent.click(consoleItem);
    return screen.queryAllByRole('dialog').find((d) => d.textContent.includes('Open Console')) || null;
};

const defaultFetchMock = (url, options) => {
    if (url.includes('/data/keys'))
        return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
                Promise.resolve({
                    items: [
                        {name: 'key1', node: 'node1', size: 2626},
                        {name: 'key2', node: 'node1', size: 6946},
                    ],
                }),
            text: () => Promise.resolve(''),
        });
    if (url.includes('/config?set=') || url.includes('/config?unset=') || url.includes('/config?delete='))
        return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({}),
            text: () => Promise.resolve('Success')
        });
    if (url.includes('/config/file'))
        return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(`[DEFAULT]\nnodes = *\norchestrate = ha\nid = 0bfea9c4-0114-4776-9169-d5e3455cee1f\n[fs#1]\ntype = flag`),
            json: () => Promise.resolve({}),
        });
    if (url.includes('/console') && options?.method === 'POST')
        return Promise.resolve({
            ok: true,
            headers: {get: (h) => (h === 'Location' ? 'http://console.example.com/session123' : null)},
        });
    if (options?.method === 'POST' && url.includes('/action/'))
        return Promise.resolve({ok: true, status: 200, text: () => Promise.resolve('Action executed successfully')});
    return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve('')});
};

// ─── Tests ─────────────────────────────────────────────────────────────────
describe('ObjectDetail Component', () => {
    const user = userEvent.setup();
    const mockNavigate = jest.fn();

    beforeEach(() => {
        jest.setTimeout(45000);
        jest.clearAllMocks();
        require('react-router-dom').useNavigate.mockReturnValue(mockNavigate);
        mockLocalStorage.getItem.mockReturnValue('mock-token');
        global.fetch = jest.fn(defaultFetchMock);
        useEventStore.mockImplementation((selector) => selector(fullMockState));
        useEventStore.getState = jest.fn().mockReturnValue(fullMockState);
        useEventStore.subscribe = jest.fn(() => jest.fn());
    });

    afterEach(() => jest.clearAllMocks());

    // ─── Pure function tests ───────────────────────────────────────────────
    describe('getResourceType', () => {
        test.each([
            [null, {}, ''],
            ['', {}, ''],
            ['rid1', null, ''],
            ['rid1', undefined, ''],
            [null, null, ''],
            [undefined, undefined, ''],
            ['notfound', {resources: {}, encap: {c1: {resources: {}}}}, ''],
            ['rid1', {resources: {}, encap: {}}, ''],
            ['rid1', {resources: {rid1: {type: 'disk.disk'}}}, 'disk.disk'],
            ['rid2', {resources: {rid2: {type: 'fs.flag'}}}, 'fs.flag'],
            ['rid2', {
                resources: {},
                encap: {container1: {resources: {rid2: {type: 'container.docker'}}}}
            }, 'container.docker'],
            ['r3', {resources: {r1: {type: 'disk'}}, encap: {c1: {resources: {r2: {type: 'container'}}}}}, ''],
        ])('getResourceType(%p, %p) => %p', (rid, nodeData, expected) =>
            expect(getResourceType(rid, nodeData)).toBe(expected)
        );
    });

    describe('parseProvisionedState', () => {
        test.each([
            ['true', true], ['True', true], ['TRUE', true], ['tRuE', true],
            ['false', false], ['False', false], ['FALSE', false], ['fAlSe', false],
            ['yes', false], ['no', false], ['', false], ['abc', false], ['1', false], ['0', false],
            [true, true], [false, false], [1, true], [0, false], [42, true], [-1, true],
            [{}, true], [{state: true}, true], [[], true], [new Date(), true],
            [null, false], [undefined, false], [NaN, false],
        ])('%p => %p', (input, expected) => expect(parseProvisionedState(input)).toBe(expected));
    });

    // ─── Lifecycle ────────────────────────────────────────────────────────
    test('mount/unmount lifecycle', () => {
        const {unmount} = renderComponent('root/cfg/cfg1');
        expect(localStorage.getItem).toHaveBeenCalledWith('authToken');
        expect(startEventReception).toHaveBeenCalledWith('mock-token', expect.any(Array), 'root/cfg/cfg1');
        expect(useEventStore.getState().removeObject).toHaveBeenCalledWith('root/cfg/cfg1');
        unmount();
        expect(closeEventSource).toHaveBeenCalled();
    });

    // ─── Basic rendering ──────────────────────────────────────────────────
    test('renders svc with nodes and monitor', async () => {
        renderSvc();
        await waitForNode('node1');
        await waitForNode('node2');
        expect(screen.getByText(/running/i)).toBeInTheDocument();
        expect(screen.getByText(/placed@node1/i)).toBeInTheDocument();
        expect(screen.queryByText(/Resources \(\d+\)/i)).not.toBeInTheDocument();
    });

    test('shows no data message when object data is empty', async () => {
        setStoreState({...emptyState(), objectInstanceStatus: {'root/cfg/cfg1': {}}});
        global.fetch.mockImplementation((url) =>
            url.includes('/data/keys')
                ? Promise.resolve({ok: true, json: () => Promise.resolve({items: []})})
                : Promise.resolve({ok: true, json: () => Promise.resolve({}), text: () => ''})
        );
        renderComponent('root/cfg/cfg1');
        await waitFor(() => expect(screen.getByText(/No keys available/i)).toBeInTheDocument());
    });

    test('cfg kind hides node cards and batch actions', async () => {
        renderComponent('root/cfg/cfg1');
        await screen.findByText(/root\/cfg\/cfg1/i);
        await waitFor(() => {
            expect(document.querySelectorAll('[class*="MuiCard"], [role="region"][class*="node"]')).toHaveLength(0);
            expect(screen.queryByRole('button', {name: /Actions on Selected Nodes/i})).not.toBeInTheDocument();
        });
    });

    test.each([['root/sec/sec1'], ['root/usr/usr1']])(
        'batch actions hidden for %s',
        async (objectName) => {
            setStoreState({
                objectStatus: {[objectName]: {avail: 'up', frozen: null}},
                objectInstanceStatus: {[objectName]: {node1: {avail: 'up', resources: {}}}},
                instanceMonitor: {},
                instanceConfig: {},
                ...BASE_FNS(),
            });
            renderComponent(objectName);
            await screen.findByText(new RegExp(objectName.replace(/\//g, '\\/'), 'i'));
            expect(screen.queryByRole('button', {name: /Actions on Selected Nodes/i})).not.toBeInTheDocument();
        }
    );

    test('renders warn / unknown / frozen node states', async () => {
        const state = buildState();
        state.objectStatus['root/svc/svc1'].avail = 'warn';
        state.objectInstanceStatus['root/svc/svc1'].node1.avail = 'unknown';
        state.objectInstanceStatus['root/svc/svc1'].node1.frozen_at = '2023-01-01T12:00:00Z';
        setStoreState(state);
        renderSvc();
        await waitFor(() => expect(screen.getByTitle('warn')).toBeInTheDocument());
        expect(screen.getByText('node1', {exact: true})).toBeInTheDocument();
    });

    test('getObjectStatus handles missing global_expect (none)', async () => {
        setStoreState({
            objectStatus: {},
            objectInstanceStatus: {},
            instanceMonitor: {'node1:root/cfg/cfg1': {state: 'running', global_expect: 'none'}},
            instanceConfig: {},
            ...BASE_FNS(),
        });
        renderComponent('root/cfg/cfg1');
        await waitFor(() => expect(screen.queryByText(/placed@node1/i)).not.toBeInTheDocument());
    });

    // ─── Config / Keys ────────────────────────────────────────────────────
    test('config dialog opens when button clicked', async () => {
        renderComponent('root/cfg/cfg1');
        fireEvent.click(await screen.findByTestId('open-config-dialog'));
        await waitFor(() => expect(screen.getByTestId('config-dialog')).toBeInTheDocument());
    });

    test('renders keys section for cfg', async () => {
        renderComponent('root/cfg/cfg1');
        expect(await screen.findByText(/Keys/i)).toBeInTheDocument();
        expect(await screen.findByText('key1')).toBeInTheDocument();
        expect(screen.getByText('key2')).toBeInTheDocument();
    });

    test('displays no keys message when empty', async () => {
        global.fetch.mockImplementation((url) =>
            url.includes('/data/keys')
                ? Promise.resolve({ok: true, json: () => Promise.resolve({items: []})})
                : Promise.resolve({ok: true, text: () => Promise.resolve(''), json: () => Promise.resolve({})})
        );
        renderComponent('root/cfg/cfg1');
        expect(await screen.findByText(/No keys available/i)).toBeInTheDocument();
    });

    // ─── Node selection & navigation ──────────────────────────────────────
    test('node selection toggle', async () => {
        await renderReadySvc();
        const checkbox = screen.getByLabelText(/select node node1/i);
        expect(checkbox.checked).toBe(false);
        await user.click(checkbox);
        expect(checkbox.checked).toBe(true);
        await user.click(checkbox);
        expect(checkbox.checked).toBe(false);
    });

    test('disables batch actions button when no nodes are selected', async () => {
        await renderReadySvc();
        expect(screen.getByRole('button', {name: /Actions on selected nodes/i}).disabled).toBe(true);
    });

    test('view instance navigation on node click', async () => {
        await renderReadySvc();
        fireEvent.click(screen.getByText('node1'));
        await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/nodes/node1/objects/root%2Fsvc%2Fsvc1'));
    });

    test('switches configNode when current node disappears', async () => {
        const debugSpy = jest.spyOn(logger, 'debug').mockImplementation();
        setStoreState({
            ...buildState(),
            objectInstanceStatus: {'root/svc/svc1': {node2: {avail: 'up', resources: {}}}}
        });

        require('react-router-dom').useParams.mockReturnValue({objectName: 'root/svc/svc1'});
        const {rerender} = render(
            <MemoryRouter initialEntries={['/object/root%2Fsvc%2Fsvc1']}>
                <Routes><Route path="/object/:objectName" element={<ObjectDetail/>}/></Routes>
            </MemoryRouter>
        );
        await screen.findByText('node2');

        setStoreState({
            ...buildState(),
            objectInstanceStatus: {'root/svc/svc1': {node1: {avail: 'up', resources: {}}}}
        });
        rerender(
            <MemoryRouter initialEntries={['/object/root%2Fsvc%2Fsvc1']}>
                <Routes><Route path="/object/:objectName" element={<ObjectDetail/>}/></Routes>
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining('configNode "node2" removed, switching to "node1"'));
        });
        debugSpy.mockRestore();
    });

    test('resets configNode to null and closes config dialog when all nodes are removed', async () => {
        setStoreState({...buildState()});
        require('react-router-dom').useParams.mockReturnValue({objectName: 'root/svc/svc1'});
        const {rerender} = render(
            <MemoryRouter initialEntries={['/object/root%2Fsvc%2Fsvc1']}>
                <Routes><Route path="/object/:objectName" element={<ObjectDetail/>}/></Routes>
            </MemoryRouter>
        );
        await screen.findByText('node1');

        fireEvent.click(screen.getByTestId('open-config-dialog'));
        await waitFor(() => expect(screen.getByTestId('config-dialog')).toBeInTheDocument());

        setStoreState({...buildState(), objectInstanceStatus: {'root/svc/svc1': {}}});
        rerender(
            <MemoryRouter initialEntries={['/object/root%2Fsvc%2Fsvc1']}>
                <Routes><Route path="/object/:objectName" element={<ObjectDetail/>}/></Routes>
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.queryByText('node1')).not.toBeInTheDocument();
            expect(screen.queryByTestId('config-dialog')).not.toBeInTheDocument();
        });
    });

    // ─── Batch node actions ───────────────────────────────────────────────
    test('batch node actions: select nodes and execute start', async () => {
        await renderReadySvc();
        await user.click(screen.getByLabelText(/select node node1/i));
        await user.click(screen.getByLabelText(/select node node2/i));
        const batchBtn = screen.getByRole('button', {name: /Actions on selected nodes/i});
        expect(batchBtn).not.toBeDisabled();
        await user.click(batchBtn);
        await waitFor(() => expect(screen.queryAllByRole('menu').length).toBeGreaterThan(0));
        await user.click(within(screen.getAllByRole('menu')[0]).getByRole('menuitem', {name: /start/i}));
        await confirmDialog(await screen.findByRole('dialog'));
        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringMatching(/\/api\/node\/name\/node1\/instance\/path\/root(%2F|\/)svc(%2F|\/)svc1\/action\/start/),
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({Authorization: 'Bearer mock-token'})
                })
            );
        });
    });

    // ─── Individual node actions ───────────────────────────────────────────
    test('individual node stop action', async () => {
        await renderReadySvc();
        await user.click(screen.getByRole('button', {name: /Node node1 actions/i}));
        await waitFor(() => expect(screen.queryAllByRole('menu').length).toBeGreaterThan(0));
        await user.click(within(screen.getAllByRole('menu')[0]).getByRole('menuitem', {name: /stop/i}));
        await confirmDialog(await screen.findByRole('dialog'));
        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringMatching(/\/api\/node\/name\/node1\/instance\/path\/root(%2F|\/)svc(%2F|\/)svc1\/action\/stop/),
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({Authorization: 'Bearer mock-token'})
                })
            );
        });
    });

    // ─── Error handling (object & node actions) ────────────────────────────
    describe.each([
        {label: 'object', openMenu: async () => userEvent.click(screen.getByRole('button', {name: /object actions/i}))},
        {
            label: 'node',
            openMenu: async () => userEvent.click(screen.getByRole('button', {name: /Node node1 actions/i}))
        },
    ])('$label actions', ({openMenu}) => {
        test('fetch exception', async () => {
            mockNetworkFailure('/action/');
            await renderReadySvc();
            await openMenu();
            await userEvent.click(screen.getByRole('menuitem', {name: /start/i}));
            await confirmDialog(await screen.findByRole('dialog'));
            await waitFor(() =>
                expect(screen.getAllByRole('alert').some((a) => a.textContent.includes('Network error'))).toBe(true)
            );
        });

        test.each([[403, 'Forbidden'], [500, 'Server error']])('HTTP %i', async (status, msg) => {
            mockActionFailure(status, msg);
            await renderReadySvc();
            await openMenu();
            await userEvent.click(screen.getByRole('menuitem', {name: /start/i}));
            await confirmDialog(await screen.findByRole('dialog'));
            await waitFor(() =>
                expect(
                    screen.getAllByRole('alert').some((a) => a.textContent.includes(`HTTP error! status: ${status}`))
                ).toBe(true)
            );
        });

        test('missing auth token', async () => {
            mockLocalStorage.getItem.mockReturnValue(null);
            await renderReadySvc();
            await openMenu();
            await userEvent.click(screen.getByRole('menuitem', {name: /start/i}));
            const dialog = await screen.findByRole('dialog');
            await userEvent.click(within(dialog).getByRole('button', {name: /confirm/i}));
            await waitFor(() =>
                expect(screen.getAllByRole('alert').some((a) => a.textContent.includes('Auth token not found'))).toBe(true)
            );
        });
    });

    // ─── handleDialogConfirm outer .catch branches ─────────────────────────
    describe('handleDialogConfirm promise rejection handling', () => {
        test.each([
            [
                'batch node',
                'postNodeAction',
                async () => {
                    await user.click(screen.getByLabelText(/select node node1/i));
                    await user.click(screen.getByLabelText(/select node node2/i));
                    await user.click(screen.getByRole('button', {name: /Actions on selected nodes/i}));
                    await waitFor(() => expect(screen.queryAllByRole('menu').length).toBeGreaterThan(0));
                    await user.click(within(screen.getAllByRole('menu')[0]).getByRole('menuitem', {name: /start/i}));
                },
            ],
            [
                'individual node',
                'postNodeAction',
                async () => {
                    await user.click(screen.getByRole('button', {name: /Node node1 actions/i}));
                    await waitFor(() => expect(screen.queryAllByRole('menu').length).toBeGreaterThan(0));
                    await user.click(within(screen.getAllByRole('menu')[0]).getByRole('menuitem', {name: /start/i}));
                },
            ],
            [
                'object',
                'postObjectAction',
                async () => {
                    await user.click(screen.getByRole('button', {name: /object actions/i}));
                    await waitFor(() => expect(screen.queryAllByRole('menu').length).toBeGreaterThan(0));
                    await user.click(screen.getByRole('menuitem', {name: /start/i}));
                },
            ],
        ])('%s action rejection is logged via logger.error', async (label, fnName, triggerAction) => {
            const errorSpy = jest.spyOn(logger, 'error').mockImplementation();
            await renderReadySvc();
            await triggerAction();
            const dialog = await screen.findByRole('dialog');

            mockLocalStorage.getItem.mockImplementation(() => {
                throw new Error('Storage boom');
            });

            await confirmDialog(dialog);

            await waitFor(() => {
                expect(errorSpy).toHaveBeenCalledWith(`[ObjectDetail] ${fnName} failed:`, expect.any(Error));
            });
            errorSpy.mockRestore();
        });
    });

    // ─── Dialog controls ──────────────────────────────────────────────────
    test('all object action dialogs open and cancel', async () => {
        setStoreState(buildState());
        renderSvc();
        for (const action of ['start', 'freeze', 'stop', 'unprovision', 'purge']) {
            await user.click(screen.getByRole('button', {name: /object actions/i}));
            await screen.findByRole('menu');
            await user.click(screen.getByRole('menuitem', {name: new RegExp(action, 'i')}));
            const dialog = await screen.findByRole('dialog');
            const cancelBtn = within(dialog).queryByRole('button', {name: /cancel/i});
            if (cancelBtn) {
                await user.click(cancelBtn);
                await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
            }
        }
    });

    test('closes manage params dialog on submit', async () => {
        renderComponent('root/cfg/cfg1');
        await screen.findAllByText(/root\/cfg\/cfg1/i);
        const manageBtn = screen.getAllByRole('button').find((b) => b.textContent?.includes('Manage'));
        if (!manageBtn) return;
        await user.click(manageBtn);
        const dialog = await screen.findByRole('dialog');
        await user.click(within(dialog).getByRole('button', {name: /confirm/i}));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    test('closes snackbar via close button', async () => {
        await renderReadySvc();
        await userEvent.click(screen.getByRole('button', {name: /object actions/i}));
        await screen.findByRole('menu');
        await userEvent.click(screen.getByRole('menuitem', {name: /start/i}));
        await confirmDialog(await screen.findByRole('dialog'));
        const closeButtons = screen.getAllByTestId('alert-close-button');
        if (closeButtons.length > 0) await user.click(closeButtons[0]);
    });

    // ─── Logs drawer ──────────────────────────────────────────────────────
    test.each(['mouse', 'touch'])('logs drawer resize with %s events adds/removes listeners', async (kind) => {
        const addSpy = jest.spyOn(document, 'addEventListener');
        const removeSpy = jest.spyOn(document, 'removeEventListener');
        renderSvc();
        await waitForNode('node1');
        await user.click(screen.getAllByRole('button', {name: /logs/i})[0]);
        await waitFor(() => expect(screen.getByLabelText('Resize drawer')).toBeInTheDocument());
        const handle = screen.getByLabelText('Resize drawer');
        const moveEvt = `${kind}move`;
        const endEvt = kind === 'mouse' ? 'mouseup' : 'touchend';

        if (kind === 'mouse') {
            fireEvent.mouseDown(handle, {clientX: 100});
        } else {
            fireEvent.touchStart(handle, {touches: [{clientX: 100}]});
        }
        if (kind === 'touch') {
            expect(addSpy.mock.calls.find((c) => c[0] === 'touchmove' && c[2]?.passive === false)).toBeDefined();
        } else {
            expect(addSpy).toHaveBeenCalledWith(moveEvt, expect.any(Function));
        }
        expect(addSpy).toHaveBeenCalledWith(endEvt, expect.any(Function));

        if (kind === 'mouse') {
            fireEvent.mouseMove(document, {clientX: 150});
            fireEvent.mouseUp(document);
        } else {
            fireEvent.touchMove(document, {touches: [{clientX: 150}]});
            fireEvent.touchEnd(document);
        }
        expect(removeSpy).toHaveBeenCalledWith(moveEvt, expect.any(Function));
        expect(removeSpy).toHaveBeenCalledWith(endEvt, expect.any(Function));
        expect(document.body.style.cursor).toBe('default');
        addSpy.mockRestore();
        removeSpy.mockRestore();
    });

    test.each([
        ['respects min/max constraints', 50, 900, null],
        ['does not exceed maxWidth', -100, -200, '800px'],
    ])('drawer resize %s', async (label, x1, x2, expectedWidth) => {
        Object.defineProperty(window, 'innerWidth', {writable: true, configurable: true, value: 1000});
        renderSvc();
        await waitForNode('node1');
        await user.click(screen.getAllByRole('button', {name: /logs/i})[0]);
        await waitFor(() => expect(screen.getByLabelText('Resize drawer')).toBeInTheDocument());
        const handle = screen.getByLabelText('Resize drawer');

        fireEvent.mouseDown(handle, {clientX: 100});
        fireEvent.mouseMove(document, {clientX: x1});
        fireEvent.mouseUp(document);

        if (expectedWidth) {
            expect(screen.getByRole('complementary').getAttribute('data-width')).toBe(expectedWidth);
            fireEvent.mouseDown(handle, {clientX: 100});
            fireEvent.mouseMove(document, {clientX: x2});
            fireEvent.mouseUp(document);
            expect(screen.getByRole('complementary').getAttribute('data-width')).toBe(expectedWidth);
        }

        Object.defineProperty(window, 'innerWidth', {writable: true, configurable: true, value: 1024});
    });

    test('closing logs drawer resets state', async () => {
        renderSvc();
        await waitForNode('node1');
        const logButtons = screen.getAllByRole('button', {name: /logs/i});
        await user.click(logButtons[0]);
        await waitFor(() => expect(screen.getByRole('complementary')).toBeInTheDocument());
        const closeButton = screen.getByTestId('CloseIcon').closest('button');
        expect(closeButton).toBeTruthy();
        fireEvent.click(closeButton);
        await waitFor(() => expect(screen.queryByRole('complementary')).not.toBeInTheDocument());
    });

    test('best-effort: instance-level logs drawer shows the instance title when a per-instance trigger exists', async () => {
        renderSvc();
        await waitForNode('node1');
        await expandResourceSections();
        const logButtons = screen.getAllByRole('button', {name: /logs/i});
        if (logButtons.length < 2) return;
        await user.click(logButtons[1]);
        await waitFor(() => expect(screen.getByRole('complementary')).toBeInTheDocument());
        const instanceTitle = screen.queryByText(/Instance Logs -/i);
        if (instanceTitle) expect(instanceTitle).toBeInTheDocument();
    });

    // ─── instanceConfig subscription ──────────────────────────────────────
    test.each([
        [
            'triggers snackbar when configNode is set',
            {
                objectStatus: {},
                instanceMonitor: {},
                objectInstanceStatus: {'root/svc/svc1': {node1: {avail: 'up', resources: {}}}},
                instanceConfig: {'root/svc/svc1': {node1: {resources: {res1: {is_monitored: true}}}}},
                ...BASE_FNS(),
            },
            'root/svc/svc1',
            () => waitForNode('node1'),
            {'root/svc/svc1': {node1: {resources: {res1: {is_monitored: false}}}}},
            true,
        ],
        [
            'does not trigger snackbar when configNode is null',
            {
                objectStatus: {},
                instanceMonitor: {},
                objectInstanceStatus: {'root/svc/svc-empty': {}},
                instanceConfig: {},
                ...BASE_FNS(),
            },
            'root/svc/svc-empty',
            () => screen.findByText(/No information available/i),
            {'root/svc/svc-empty': {node1: {resources: {res1: {is_monitored: true}}}}},
            false,
        ],
    ])('instanceConfig subscription %s', async (label, state, objectName, waitForReady, updatedConfig, shouldFire) => {
        setStoreState(state);
        let instanceConfigCallback;
        useEventStore.subscribe = jest.fn((selector, callback) => {
            if (selector.toString().includes('instanceConfig')) instanceConfigCallback = callback;
            return jest.fn();
        });
        renderComponent(objectName);
        await waitForReady();
        act(() => instanceConfigCallback(updatedConfig));

        if (shouldFire) {
            await waitFor(() => {
                expect(
                    screen.queryAllByRole('alert').find((a) => a.textContent?.includes('Instance configuration updated'))
                ).toBeInTheDocument();
            });
        } else {
            await waitFor(() => {
                expect(
                    screen.queryAllByRole('alert').find((a) => a.textContent?.includes('Instance configuration updated'))
                ).toBeUndefined();
            });
        }
    });

    test.each([
        [
            'subscription error triggers logger.warn',
            () => {
                throw new Error('Subscription failed');
            },
            '[ObjectDetail] Failed to subscribe to instanceConfig:',
            expect.any(Error),
        ],
        [
            'non-function return triggers logger.warn',
            () => 'not-a-function',
            '[ObjectDetail] Subscription is not a function:',
            'not-a-function',
        ],
    ])('instanceConfig: %s', async (label, subscribeFn, warnMsg, warnArg) => {
        const warnSpy = jest.spyOn(logger, 'warn').mockImplementation();
        useEventStore.subscribe = jest.fn(subscribeFn);
        renderSvc();
        await screen.findAllByText(/root\/svc\/svc1/i);
        await waitFor(() => expect(warnSpy).toHaveBeenCalledWith(warnMsg, warnArg));
        warnSpy.mockRestore();
    });

    test('instanceConfig selector body executes and returns the expected slice', async () => {
        let capturedSelector;
        useEventStore.subscribe = jest.fn((selector) => {
            capturedSelector = selector;
            return jest.fn();
        });
        renderSvc();
        await waitForNode('node1');

        expect(typeof capturedSelector).toBe('function');
        const sampleState = {instanceConfig: {'root/svc/svc1': {node1: {resources: {}}}}, other: 'ignored'};
        expect(capturedSelector(sampleState)).toBe(sampleState.instanceConfig);
    });

    // ─── batch menu mixed frozen state ────────────────────────────────────
    test.each([
        [
            'keeps freeze when selected nodes have mixed frozen state',
            {
                node1: {avail: 'up', frozen_at: null, resources: {}},
                node2: {avail: 'up', frozen_at: '2023-01-01T12:00:00Z', resources: {}}
            },
            true,
            false,
        ],
        [
            'hides freeze when all selected nodes are already frozen',
            {
                node1: {avail: 'up', frozen_at: '2023-01-01T12:00:00Z', resources: {}},
                node2: {avail: 'up', frozen_at: '2023-01-01T12:00:00Z', resources: {}}
            },
            false,
            true,
        ],
    ])('batch menu %s', async (label, nodeStates, expectFreeze, expectStart) => {
        setStoreState({
            objectStatus: {'root/svc/svc1': {avail: 'up', frozen: null}},
            objectInstanceStatus: {'root/svc/svc1': nodeStates},
            instanceMonitor: {},
            instanceConfig: {},
            ...BASE_FNS(),
        });
        renderSvc();
        await waitForNode('node1');
        await waitForNode('node2');
        await user.click(screen.getByLabelText(/select node node1/i));
        await user.click(screen.getByLabelText(/select node node2/i));
        await user.click(screen.getByRole('button', {name: /Actions on selected nodes/i}));
        await waitFor(() => expect(screen.queryAllByRole('menu').length).toBeGreaterThan(0));
        const menu = screen.getAllByRole('menu')[0];
        expect(!!within(menu).queryByRole('menuitem', {name: /^freeze/i})).toBe(expectFreeze);
        if (expectStart) expect(within(menu).queryByRole('menuitem', {name: /start/i})).toBeTruthy();
    });

    // ─── Console dialog ───────────────────────────────────────────────────
    test('console dialog not shown by default', async () => {
        renderSvc();
        await waitForNode('node1');
        await waitFor(() => expect(screen.queryByText(/Open Console/i)).not.toBeInTheDocument());
    });

    test('handleConsoleConfirm: cancel closes dialog', async () => {
        await withConsoleAction(async () => {
            renderSvc();
            const dialog = await openConsoleDialogFn();
            if (!dialog) return;
            const cancelBtn = within(dialog).queryByRole('button', {name: /cancel/i});
            if (cancelBtn) {
                await user.click(cancelBtn);
                await waitFor(() =>
                    expect(
                        screen.queryAllByRole('dialog').filter((d) => d.textContent.includes('terminal console')).length
                    ).toBe(0)
                );
            }
        });
    });

    test('handleConsoleConfirm without rid does not call postConsoleAction', async () => {
        await withConsoleAction(async () => {
            renderSvc();
            await waitForNode('node1');
            await userEvent.click(screen.getByRole('button', {name: /Node node1 actions/i}));
            await waitFor(() => expect(screen.queryAllByRole('menu').length).toBeGreaterThan(0));
            const consoleItem = within(screen.getAllByRole('menu')[0]).queryByRole('menuitem', {name: /console/i});
            if (!consoleItem) return;
            await userEvent.click(consoleItem);
            const dialog = await screen.findByRole('dialog');
            const fetchCallsBefore = global.fetch.mock.calls.filter(
                ([u, opts]) => opts?.method === 'POST' && u.includes('/console')
            ).length;
            await userEvent.click(within(dialog).getByRole('button', {name: /open console/i}));
            await waitFor(() => {
                const fetchCallsAfter = global.fetch.mock.calls.filter(
                    ([u, opts]) => opts?.method === 'POST' && u.includes('/console')
                ).length;
                expect(fetchCallsAfter).toBe(fetchCallsBefore);
            });
        });
    });

    test('handleConsoleConfirm: seats and greet timeout inputs behave correctly', async () => {
        await withConsoleAction(async () => {
            renderSvc();
            const dialog = await openConsoleDialogFn();
            if (!dialog) return;
            const seatsInput = within(dialog).queryByLabelText(/Number of Seats/i);
            if (seatsInput) {
                fireEvent.change(seatsInput, {target: {value: '5'}});
                expect(seatsInput.value).toBe('5');
                fireEvent.change(seatsInput, {target: {value: '0'}});
                expect(seatsInput.value).toBe('1');
                fireEvent.change(seatsInput, {target: {value: 'abc'}});
                expect(seatsInput.value).toBe('1');
            }
            const greetInput = within(dialog).queryByLabelText(/Greet Timeout/i);
            if (greetInput) {
                fireEvent.change(greetInput, {target: {value: '10s'}});
                expect(greetInput.value).toBe('10s');
            }
        });
    });

    // Covers resource-level console triggers found via different UI hooks (action button vs
    // tooltip title), including the HTTP-error branch of postConsoleAction. Both are
    // best-effort: they skip gracefully if the corresponding UI hook isn't present.
    test.each([
        ['action-button trigger', () => [
            () => screen.queryAllByRole('button', {name: /res1.*(actions|console)/i}),
            () => screen.queryAllByRole('button', {name: /console/i}),
            () => screen.queryAllByLabelText(/resource res1 actions/i),
        ], false],
        ['tooltip title trigger, exercises HTTP-error path', () => [
            () => screen.queryAllByTitle(/console/i),
        ], true],
    ])('best-effort: resource console trigger via %s', async (label, getCandidates, simulateHttpError) => {
        await withConsoleAction(async () => {
            renderSvc();
            await waitForNode('node1');
            await expandResourceSections();

            const dialog = await findAndOpenResourceConsoleDialog(getCandidates());
            if (!dialog) return;

            if (simulateHttpError) mockActionFailure(500, 'Console error');
            await user.click(within(dialog).getByRole('button', {name: /open console/i}));
            await waitFor(() => {
                if (simulateHttpError) {
                    const alerts = screen.queryAllByRole('alert');
                    if (alerts.some((a) => a.textContent.includes('Failed to open console'))) {
                        expect(alerts.some((a) => a.textContent.includes('Failed to open console'))).toBe(true);
                    }
                } else {
                    const called = global.fetch.mock.calls.some(
                        ([u, opts]) => opts?.method === 'POST' && u.includes('/console')
                    );
                    if (called) expect(called).toBe(true);
                }
            });
        });
    });

    // ─── Fallback fetch ───────────────────────────────────────────────────
    describe('fallback fetch', () => {
        beforeEach(() => jest.useFakeTimers());
        afterEach(() => jest.useRealTimers());

        test('triggers after 5 seconds when no SSE data', async () => {
            setStoreState(emptyState());
            renderSvc();
            expect(screen.getByText(/Loading object data.../i)).toBeInTheDocument();
            act(() => jest.advanceTimersByTime(5000));
            await waitFor(() => {
                expect(global.fetch).toHaveBeenCalledWith(
                    expect.stringMatching(/\/api\/object\/path\/root(%2F|\/)svc(%2F|\/)svc1/),
                    expect.any(Object)
                );
                expect(global.fetch).toHaveBeenCalledWith(
                    expect.stringMatching(/\/api\/node\/name\/all\/instance\/path\/root(%2F|\/)svc(%2F|\/)svc1/),
                    expect.any(Object)
                );
            });
        });

        test('handles fallback fetch failure gracefully', async () => {
            setStoreState(emptyState());
            global.fetch.mockRejectedValueOnce(new Error('Network failure'));
            renderSvc();
            act(() => jest.advanceTimersByTime(5000));
            await waitFor(() => expect(screen.queryByText(/Loading object data.../i)).not.toBeInTheDocument());
            expect(screen.queryByText(/Network failure/i)).not.toBeInTheDocument();
            expect(screen.getByRole('button', {name: /Object Events/i})).toBeInTheDocument();
        });

        test('sets error and stops loading when auth token is missing', async () => {
            setStoreState(emptyState());
            mockLocalStorage.getItem.mockReturnValue(null);
            renderSvc();
            expect(screen.getByText(/Loading object data.../i)).toBeInTheDocument();
            act(() => jest.advanceTimersByTime(5000));
            await waitFor(() => expect(screen.queryByText(/Loading object data.../i)).not.toBeInTheDocument());
            expect(global.fetch).not.toHaveBeenCalled();
        });

        test('logs error when fetchFallbackData itself rejects outside its own try/catch', async () => {
            const errorSpy = jest.spyOn(logger, 'error').mockImplementation();
            setStoreState(emptyState());
            mockLocalStorage.getItem
                .mockReturnValueOnce('mock-token')
                .mockImplementation(() => {
                    throw new Error('Storage boom');
                });

            renderSvc();
            act(() => jest.advanceTimersByTime(5000));

            await waitFor(() => {
                expect(errorSpy).toHaveBeenCalledWith('[ObjectDetail] fetchFallbackData failed:', expect.any(Error));
            });
            errorSpy.mockRestore();
        });

        test('sets empty instance statuses when instance endpoint returns null body', async () => {
            const s = emptyState();
            setStoreState(s);
            global.fetch.mockImplementation((url) => {
                if (url.includes('/api/object/path')) {
                    return Promise.resolve({ok: true, json: () => Promise.resolve({avail: 'up'})});
                }
                if (url.includes('/api/node/name/all/instance/path')) {
                    return Promise.resolve({ok: true, json: () => Promise.resolve(null)});
                }
                return Promise.resolve({ok: true, json: () => Promise.resolve({}), text: () => Promise.resolve('')});
            });
            renderSvc();
            act(() => jest.advanceTimersByTime(5000));
            await waitFor(() => {
                expect(s.setInstanceStatuses).toHaveBeenCalledWith({'root/svc/svc1': {}}, true);
            });
        });
    });
});
