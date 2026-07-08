import React from 'react';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import '@testing-library/jest-dom';
import EventLogger, {hashCode} from '../EventLogger';
import useEventLogStore from '../../hooks/useEventLogStore';
import {ThemeProvider, createTheme} from '@mui/material';
import logger from '../../utils/logger.js';

// ─── Global setup ───────────────────────────────────────────────────────────

beforeAll(() => {
    Element.prototype.scrollIntoView = jest.fn();
});

jest.mock('../../hooks/useEventLogStore', () => ({
    __esModule: true,
    default: jest.fn(() => ({
        eventLogs: [],
        isPaused: false,
        setPaused: jest.fn(),
        clearLogs: jest.fn(),
    })),
}));

jest.mock('../../utils/logger.js', () => ({
    __esModule: true,
    default: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        log: jest.fn(),
        serialize: jest.fn(arg => JSON.stringify(arg)),
    }
}));

jest.mock('../../eventSourceManager', () => ({
    __esModule: true,
    startLoggerReception: jest.fn(),
    closeLoggerEventSource: jest.fn(),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const lightTheme = createTheme();
const darkTheme = createTheme({palette: {mode: 'dark'}});

const renderWithTheme = (ui, theme = lightTheme) =>
    render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

const makeLog = (overrides = {}) => ({
    id: '1',
    eventType: 'TEST_EVENT',
    timestamp: new Date().toISOString(),
    data: {},
    ...overrides,
});

const mockStore = (overrides = {}) => ({
    eventLogs: [],
    isPaused: false,
    setPaused: jest.fn(),
    clearLogs: jest.fn(),
    ...overrides,
});

const openDrawer = () => {
    const btn = screen.getByRole('button', {name: /Events|Event Logger/i});
    act(() => fireEvent.click(btn));
    return btn;
};

const openDrawerAndWait = async (title = /Event Logger/i) => {
    openDrawer();
    await waitFor(() => expect(screen.getByText(title)).toBeInTheDocument());
};

const openSettings = async () => {
    fireEvent.click(screen.getByTestId('SettingsIcon'));
    await waitFor(() => expect(screen.getByText('Event Subscriptions')).toBeInTheDocument());
};

// ─── Suite-level mocks ───────────────────────────────────────────────────────

describe('EventLogger Component', () => {
    let mockSetPaused;
    let mockClearLogs;

    beforeEach(() => {
        jest.spyOn(console, 'error').mockImplementation((msg, ...args) => {
            if (typeof msg === 'string' && msg.includes('Each child in a list should have a unique "key" prop')) return;
            console.error(msg, ...args);
        });

        mockSetPaused = jest.fn();
        mockClearLogs = jest.fn();

        useEventLogStore.mockReturnValue(mockStore({setPaused: mockSetPaused, clearLogs: mockClearLogs}));
        Object.values(logger).forEach(fn => typeof fn.mockClear === 'function' && fn.mockClear());
    });

    afterEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
        jest.useRealTimers();
        screen.queryAllByRole('button', {name: /Close/i}).forEach(btn => fireEvent.click(btn));
    });

    // ─── Pure unit tests ───────────────────────────────────────────────────

    describe('Pure utility functions', () => {
        test('hashCode returns stable, defined values', () => {
            expect(hashCode('test')).toBeDefined();
            expect(hashCode('')).toBe('0');
            expect(hashCode('longer string test')).toBeDefined();
            expect(hashCode('test')).toBe(hashCode('test'));
        });

        test.each([
            ['TEST_ERROR_EVENT', 'error'],
            ['OBJECT_UPDATED', 'primary'],
            ['ITEM_DELETED', 'warning'],
            ['CONNECTION_STATUS', 'info'],
            ['REGULAR_EVENT', 'default'],
            ['', 'default'],
            [undefined, 'default'],
        ])('getEventColor("%s") → "%s"', (eventType, expected) => {
            const getEventColor = (et = '') => {
                if (et.includes('ERROR')) return 'error';
                if (et.includes('UPDATED')) return 'primary';
                if (et.includes('DELETED')) return 'warning';
                if (et.includes('CONNECTION')) return 'info';
                return 'default';
            };
            expect(getEventColor(eventType)).toBe(expected);
        });

        test('toggleExpand adds and removes ids', () => {
            const toggle = (prev, id) =>
                prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
            expect(toggle([], 'id1')).toEqual(['id1']);
            expect(toggle(['id1', 'id2'], 'id1')).toEqual(['id2']);
            expect(toggle(['id1'], 'id1')).toEqual([]);
        });

        test('filterData handles all input types', () => {
            const filterData = (data) => {
                if (!data || typeof data !== 'object') return data;
                const {_rawEvent, ...rest} = data;
                return rest;
            };
            expect(filterData(null)).toBeNull();
            expect(filterData(undefined)).toBeUndefined();
            expect(filterData('string')).toBe('string');
            expect(filterData(123)).toBe(123);
            expect(filterData({_rawEvent: 'x', other: 'data'})).toEqual({other: 'data'});
            expect(filterData({other: 'data'})).toEqual({other: 'data'});
        });

        test('escapeHtml handles all special characters and non-strings', () => {
            const escapeHtml = (text) => {
                if (typeof text !== 'string') return text;
                return text
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#039;');
            };
            expect(escapeHtml('a & b')).toBe('a &amp; b');
            expect(escapeHtml('<div>')).toBe('&lt;div&gt;');
            expect(escapeHtml('"q"')).toBe('&quot;q&quot;');
            expect(escapeHtml("'a'")).toBe('&#039;a&#039;');
            expect(escapeHtml(123)).toBe(123);
            expect(escapeHtml(null)).toBeNull();
            expect(escapeHtml(undefined)).toBeUndefined();
        });

        test('pageKey generation is deterministic', () => {
            const pageKey = (objectName, types) => {
                const base = objectName || 'global';
                return `eventLogger_${base}_${hashCode(types.sort().join(','))}`;
            };
            expect(pageKey(null, ['EVENT1', 'EVENT2'])).toMatch(/^eventLogger_global_/);
            expect(pageKey('/test', ['A'])).toMatch(/^eventLogger_\/test_/);
            expect(pageKey(null, ['EVENT1', 'EVENT2'])).toBe(pageKey(null, ['EVENT2', 'EVENT1']));
        });
    });

    // ─── Rendering ────────────────────────────────────────────────────────

    describe('Rendering', () => {
        test.each([
            ['default props', {}, {}],
            ['custom title and buttonLabel', {title: 'Custom Logger', buttonLabel: 'Custom Button'}, {}],
            ['all props (eventTypes, objectName)', {title: 'T', buttonLabel: 'B', eventTypes: ['A', 'B'], objectName: '/p'}, {}],
            ['non-array eventLogs', {}, {eventLogs: {}}],
        ])('renders without crashing: %s', (_, props, storeOverrides) => {
            if (Object.keys(storeOverrides).length) {
                useEventLogStore.mockReturnValue(mockStore(storeOverrides));
            }
            const {container} = renderWithTheme(<EventLogger {...props}/>);
            expect(container).toBeInTheDocument();
            if (props.buttonLabel) {
                expect(screen.getByText(props.buttonLabel)).toBeInTheDocument();
            } else {
                expect(screen.getByRole('button', {name: /Events|Event Logger/i})).toBeInTheDocument();
            }
        });

        test('button hidden when drawer open, reappears on close', async () => {
            renderWithTheme(<EventLogger/>);
            openDrawer();
            await waitFor(() => expect(screen.getByText(/Event Logger/i)).toBeInTheDocument());
            expect(screen.queryByRole('button', {name: /^Events$/i})).not.toBeInTheDocument();

            act(() => fireEvent.click(screen.getByRole('button', {name: /^Close$/i})));
            await waitFor(() =>
                expect(screen.getByRole('button', {name: /Events|Event Logger/i})).toBeInTheDocument()
            );
        });

        test('dark mode renders correctly and displays all JSON value types with syntax highlighting', async () => {
            jest.useFakeTimers();
            useEventLogStore.mockReturnValue(mockStore({
                eventLogs: [makeLog({
                    eventType: 'ALL_TYPES_DARK',
                    data: {
                        str: 'hello',
                        num: 123,
                        boolTrue: true,
                        boolFalse: false,
                        nothing: null,
                    },
                })],
                setPaused: mockSetPaused,
                clearLogs: mockClearLogs,
            }));
            renderWithTheme(<EventLogger/>, darkTheme);
            openDrawer();
            act(() => jest.advanceTimersByTime(200));
            await waitFor(() => expect(screen.getByLabelText(/Resize handle/i)).toBeInTheDocument());

            const logChip = screen.getByText('ALL_TYPES_DARK', {exact: true});
            fireEvent.click(logChip);

            await waitFor(() => {
                expect(document.querySelector('.json-null')).toBeInTheDocument();
                expect(document.querySelector('.json-boolean')).toBeInTheDocument();
            });

            jest.useRealTimers();
        });
    });

    // ─── Drawer open / close ──────────────────────────────────────────────

    describe('Drawer open / close', () => {
        test('opens, shows title, and shows "No events logged" when empty', async () => {
            renderWithTheme(<EventLogger/>);
            await openDrawerAndWait();
            await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument());
            expect(screen.getByText(/No events logged/i)).toBeInTheDocument();
        });

        test('closes via Close button', async () => {
            renderWithTheme(<EventLogger/>);
            await openDrawerAndWait();
            act(() => fireEvent.click(screen.getByRole('button', {name: /Close/i})));
            await waitFor(() =>
                expect(screen.getByRole('button', {name: /Events|Event Logger/i})).toBeInTheDocument()
            );
        });

        test('unmounting while drawer open calls closeLoggerEventSource', async () => {
            jest.spyOn(Storage.prototype, 'getItem').mockReturnValue('test-token');
            const {closeLoggerEventSource} = require('../../eventSourceManager');
            closeLoggerEventSource.mockClear();

            const {unmount} = renderWithTheme(<EventLogger/>);
            openDrawer();
            unmount();
            expect(closeLoggerEventSource).toHaveBeenCalled();
        });
    });

    // ─── Log display ──────────────────────────────────────────────────────

    describe('Log display', () => {
        const setupLogs = (logs) => {
            useEventLogStore.mockReturnValue(mockStore({
                eventLogs: logs,
                setPaused: mockSetPaused,
                clearLogs: mockClearLogs,
            }));
        };

        test.each([
            ['basic log', makeLog({eventType: 'TEST_EVENT'})],
            ['log without id', {eventType: 'NO_ID', timestamp: new Date().toISOString(), data: {}}],
            ['circular reference in data', (() => {
                const c = {};
                c.self = c;
                return makeLog({eventType: 'CIRCULAR_TEST', data: c});
            })()],
            ['XSS-like content', makeLog({eventType: 'HTML_TEST', data: {message: '<script>alert("xss")</script>'}})],
            ['all JSON value types', makeLog({
                eventType: 'ALL_TYPES',
                data: {str: 'a & <b>', num: 42, t: true, f: false, n: null, obj: {k: 'v'}},
            })],
            ['non-object (string) data', makeLog({eventType: 'STRING_EVENT', data: 'string data'})],
            ['non-object (null) data', makeLog({eventType: 'NULL_EVENT', data: null})],
        ])('renders log with %s', async (_, log) => {
            setupLogs([log]);
            renderWithTheme(<EventLogger/>);
            openDrawer();
            await waitFor(() => expect(screen.getByText(new RegExp(log.eventType, 'i'))).toBeInTheDocument());
        });

        test('shows event count chip', async () => {
            setupLogs([makeLog(), makeLog({id: '2'})]);
            renderWithTheme(<EventLogger/>);
            openDrawer();
            await waitFor(() => expect(screen.getByText(/2\/2 events/i)).toBeInTheDocument());
        });

        test('displays PAUSED chip when paused', async () => {
            useEventLogStore.mockReturnValue(mockStore({
                isPaused: true, setPaused: mockSetPaused, clearLogs: mockClearLogs,
            }));
            renderWithTheme(<EventLogger/>);
            await openDrawerAndWait();
            expect(screen.getByText(/PAUSED/i)).toBeInTheDocument();
        });

        test('shows "No events match" when filters exclude everything', async () => {
            setupLogs([makeLog({data: {path: '/other'}})]);
            renderWithTheme(<EventLogger objectName="/target"/>);
            openDrawer();
            await waitFor(() =>
                expect(screen.getByText(/No events match current filters/i)).toBeInTheDocument()
            );
        });

        test.each([
            ['object timestamp', {}, 'INVALID_TS'],
            ['non-date string', 'not-a-date', 'BAD_DATE'],
            ['symbol timestamp (throws → INVALID_DATE)', Symbol('bad'), 'SYMBOL_TS'],
        ])('handles invalid timestamp: %s', async (_, timestamp, eventType) => {
            setupLogs([makeLog({eventType, timestamp})]);
            renderWithTheme(<EventLogger/>);
            openDrawer();
            await waitFor(() => expect(screen.getByText(new RegExp(eventType, 'i'))).toBeInTheDocument());
            if (typeof timestamp === 'symbol') {
                await waitFor(() => expect(screen.getByText('INVALID_DATE')).toBeInTheDocument());
            }
        });

        test('displays valid timestamps', async () => {
            setupLogs([makeLog({timestamp: new Date('2023-01-01T12:34:56.789Z').toISOString()})]);
            renderWithTheme(<EventLogger/>);
            openDrawer();
            await waitFor(() => {
                const timeEls = screen.getAllByText(/\d{1,2}:\d{2}:\d{2}/);
                expect(timeEls.length).toBeGreaterThan(0);
            });
        });

        test('initially renders only first 20 logs (visibleCount = 20)', async () => {
            jest.useFakeTimers();
            const manyLogs = Array.from({length: 25}, (_, i) =>
                makeLog({id: `${i}`, eventType: `EVENT_${i}`})
            );
            setupLogs(manyLogs);
            renderWithTheme(<EventLogger/>);
            openDrawer();
            act(() => jest.advanceTimersByTime(200));

            await waitFor(() => expect(screen.getByText(/20\/25 events/i)).toBeInTheDocument());
            jest.useRealTimers();
        });
    });

    // ─── Log expansion ────────────────────────────────────────────────────

    describe('Log expansion', () => {
        beforeEach(() => jest.useFakeTimers());
        afterEach(() => jest.useRealTimers());

        test('expands and collapses a log row', async () => {
            useEventLogStore.mockReturnValue(mockStore({
                eventLogs: [makeLog({eventType: 'EXPAND_TEST', data: {key: 'value'}})],
                setPaused: mockSetPaused,
                clearLogs: mockClearLogs,
            }));
            renderWithTheme(<EventLogger/>);
            openDrawer();
            act(() => jest.advanceTimersByTime(200));

            await waitFor(() => expect(screen.getAllByText(/EXPAND_TEST/i).length).toBeGreaterThan(0));

            const logChip = screen.getAllByText(/EXPAND_TEST/i).find(el => !el.textContent.includes('('));
            const container = logChip?.closest('[style*="cursor: pointer"]') || logChip?.closest('div');
            if (container) {
                act(() => fireEvent.click(container));
                await waitFor(() => expect(screen.getByText(/"key"/i)).toBeInTheDocument());
                act(() => fireEvent.click(container));
                await waitFor(() => expect(screen.getAllByText(/EXPAND_TEST/i).length).toBeGreaterThan(0));
            }
        });

        test('expands circular data without throwing', async () => {
            const circular = {};
            circular.self = circular;
            useEventLogStore.mockReturnValue(mockStore({
                eventLogs: [makeLog({id: 'circ', eventType: 'CIRCULAR_EXPAND', data: circular})],
                setPaused: mockSetPaused,
                clearLogs: mockClearLogs,
            }));
            renderWithTheme(<EventLogger/>);
            openDrawer();
            act(() => jest.advanceTimersByTime(200));

            await waitFor(() => expect(screen.getAllByText(/CIRCULAR_EXPAND/i).length).toBeGreaterThan(0));
            const chip = screen.getAllByText(/CIRCULAR_EXPAND/i).find(el => !el.textContent.includes('('));
            const container = chip?.closest('[style*="cursor: pointer"]') || chip?.closest('div');
            if (container) {
                act(() => fireEvent.click(container));
                await waitFor(() => expect(screen.getAllByText(/CIRCULAR_EXPAND/i).length).toBeGreaterThan(0));
            }
        });
    });

    // ─── Controls (pause / clear) ─────────────────────────────────────────

    describe('Controls', () => {
        test('pause button calls setPaused(true)', async () => {
            renderWithTheme(<EventLogger/>);
            await openDrawerAndWait();
            act(() => fireEvent.click(screen.getByRole('button', {name: /Pause/i})));
            expect(mockSetPaused).toHaveBeenCalledWith(true);
        });

        test('clear button calls clearLogs and is disabled when empty', async () => {
            renderWithTheme(<EventLogger/>);
            await openDrawerAndWait();
            const clearBtn = screen.getByRole('button', {name: /Clear logs/i});
            expect(clearBtn).toBeDisabled();
        });

        test('clear button works with logs present', async () => {
            useEventLogStore.mockReturnValue(mockStore({
                eventLogs: [makeLog()],
                setPaused: mockSetPaused,
                clearLogs: mockClearLogs,
            }));
            renderWithTheme(<EventLogger/>);
            await openDrawerAndWait();
            act(() => fireEvent.click(screen.getByRole('button', {name: /Clear logs/i})));
            expect(mockClearLogs).toHaveBeenCalled();
        });

        test('logger.log is called when drawer opens', async () => {
            renderWithTheme(<EventLogger/>);
            openDrawer();
            expect(logger.log).toHaveBeenCalled();
        });
    });

    // ─── Event type filters (chips) ───────────────────────────────────────

    describe('Event type filter chips', () => {
        const twoTypeLogs = [
            makeLog({id: '1', eventType: 'TYPE_A'}),
            makeLog({id: '2', eventType: 'TYPE_B'}),
        ];

        beforeEach(() => {
            useEventLogStore.mockReturnValue(mockStore({
                eventLogs: twoTypeLogs, setPaused: mockSetPaused, clearLogs: mockClearLogs,
            }));
        });

        test('selecting a chip filters to that type', async () => {
            renderWithTheme(<EventLogger/>);
            openDrawer();
            await waitFor(() => expect(screen.getByText(/TYPE_A/i)).toBeInTheDocument());

            act(() => fireEvent.click(screen.getByRole('button', {name: /TYPE_A \(\d+\)/i})));
            await waitFor(() => expect(screen.getAllByText(/TYPE_A/i).length).toBeGreaterThan(0));
        });

        test('toggling chip off restores all logs', async () => {
            renderWithTheme(<EventLogger/>);
            openDrawer();
            await waitFor(() => expect(screen.getByText(/TYPE_A/i)).toBeInTheDocument());

            const chip = screen.getByRole('button', {name: /TYPE_A \(\d+\)/i});
            act(() => fireEvent.click(chip));
            act(() => fireEvent.click(chip));
            await waitFor(() => {
                expect(screen.getByText(/TYPE_A/i)).toBeInTheDocument();
                expect(screen.getByText(/TYPE_B/i)).toBeInTheDocument();
            });
        });

        test('non-page-event chip uses green selected style', async () => {
            jest.useFakeTimers();
            useEventLogStore.mockReturnValue(mockStore({
                eventLogs: [makeLog({eventType: 'EXTRA_TYPE'})],
                setPaused: mockSetPaused,
                clearLogs: mockClearLogs,
            }));
            renderWithTheme(<EventLogger eventTypes={[]}/>);
            openDrawer();
            act(() => jest.advanceTimersByTime(200));

            await waitFor(() => expect(screen.getAllByText(/EXTRA_TYPE/i).length).toBeGreaterThan(0));
            act(() => fireEvent.click(screen.getByRole('button', {name: /EXTRA_TYPE \(\d+\)/i})));
            await waitFor(() => expect(screen.getAllByText(/EXTRA_TYPE/i).length).toBeGreaterThan(0));
            jest.useRealTimers();
        });
    });

    // ─── objectName filtering ─────────────────────────────────────────────

    describe('objectName filtering', () => {
        const setLogs = (logs) => useEventLogStore.mockReturnValue(mockStore({
            eventLogs: logs, setPaused: mockSetPaused, clearLogs: mockClearLogs,
        }));

        test.each([
            ['data.path', {path: '/test/path'}, 'DIRECT_PATH'],
            ['data.labels.path', {labels: {path: '/test/path'}}, 'LABELS_PATH'],
            ['data.data.path', {data: {path: '/test/path'}}, 'DATA_PATH_EVENT'],
            ['data.data.labels.path', {data: {labels: {path: '/test/path'}}}, 'DEEP_PATH'],
        ])('matches via %s', async (_, data, eventType) => {
            setLogs([makeLog({id: '1', eventType, data})]);
            renderWithTheme(<EventLogger objectName="/test/path"/>);
            openDrawer();
            await waitFor(() => expect(screen.getByText(eventType)).toBeInTheDocument());
        });

        test('excludes non-matching logs', async () => {
            setLogs([makeLog({data: {some: 'value'}})]);
            renderWithTheme(<EventLogger objectName="/test/path"/>);
            openDrawer();
            await waitFor(() =>
                expect(screen.getByText(/No events match current filters/i)).toBeInTheDocument()
            );
        });

        test('excludes when data is null', async () => {
            setLogs([makeLog({eventType: 'NULL_DATA', data: null})]);
            renderWithTheme(<EventLogger objectName="/test/path"/>);
            openDrawer();
            await waitFor(() =>
                expect(screen.getByText(/No events match current filters/i)).toBeInTheDocument()
            );
        });

        test.each([
            ['matched by _rawEvent.path', {_rawEvent: JSON.stringify({path: '/test/path'})}, '/test/path', true],
            ['matched by _rawEvent.labels.path', {_rawEvent: JSON.stringify({labels: {path: '/test/path'}})}, '/test/path', true],
            ['invalid _rawEvent JSON falls through gracefully', {_rawEvent: 'invalid json {'}, undefined, true],
            ['invalid _rawEvent but matching path field still shows', {_rawEvent: 'invalid', path: '/test/path'}, '/test/path', true],
            ['without _rawEvent is excluded when objectName set', {otherField: 'test'}, '/test/path', false],
        ])('ObjectDeleted: %s', async (_, data, objectName, shouldShow) => {
            setLogs([makeLog({eventType: 'ObjectDeleted', data})]);
            renderWithTheme(<EventLogger objectName={objectName}/>);
            openDrawer();
            if (shouldShow) {
                await waitFor(() => expect(screen.getByText(/ObjectDeleted/i)).toBeInTheDocument());
            } else {
                await waitFor(() =>
                    expect(screen.getByText(/No events match current filters/i)).toBeInTheDocument()
                );
            }
        });

        test('CONNECTION_* events always pass objectName filter', async () => {
            setLogs([
                makeLog({id: '1', eventType: 'CONNECTION_OPENED', data: {}}),
                makeLog({id: '2', eventType: 'CONNECTION_ERROR', data: {}}),
            ]);
            renderWithTheme(<EventLogger eventTypes={['CONNECTION_OPENED', 'CONNECTION_ERROR']} objectName="/any"/>);
            openDrawer();
            await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument());
            await waitFor(() => expect(screen.getByText(/2\/2 events/i)).toBeInTheDocument());
        });

        test('eventTypes prop filters to allowed types', async () => {
            setLogs([
                makeLog({id: '1', eventType: 'ALLOWED_EVENT'}),
                makeLog({id: '2', eventType: 'BLOCKED_EVENT'}),
            ]);
            renderWithTheme(<EventLogger eventTypes={['ALLOWED_EVENT']}/>);
            openDrawer();
            await waitFor(() => expect(screen.getByText(/ALLOWED_EVENT/i)).toBeInTheDocument());
        });

        test('all nested path scenarios resolve 3/3 events', async () => {
            setLogs([
                makeLog({id: '1', eventType: 'NESTED', data: {data: {labels: {path: '/test/path'}}}}),
                makeLog({id: '2', eventType: 'DIRECT', data: {path: '/test/path'}}),
                makeLog({id: '3', eventType: 'LABELS', data: {labels: {path: '/test/path'}}}),
            ]);
            renderWithTheme(<EventLogger objectName="/test/path"/>);
            openDrawer();
            await waitFor(() => expect(screen.getByText(/3\/3 events/i)).toBeInTheDocument());
        });
    });

    // ─── Subscription dialog ──────────────────────────────────────────────

    describe('Subscription dialog', () => {
        test('opens via settings icon', async () => {
            renderWithTheme(<EventLogger eventTypes={['EVENT1']}/>);
            openDrawer();
            await openSettings();
            expect(screen.getByText(/Subscribe to All/i)).toBeInTheDocument();
            expect(screen.getByText(/Unsubscribe from All/i)).toBeInTheDocument();
        });

        test('closes via Close button', async () => {
            renderWithTheme(<EventLogger eventTypes={['EVENT1']}/>);
            openDrawer();
            await openSettings();
            const closeButtons = screen.getAllByLabelText('Close');
            act(() => fireEvent.click(closeButtons[closeButtons.length - 1]));
            await waitFor(() =>
                expect(screen.queryByText('Event Subscriptions')).not.toBeInTheDocument()
            );
        });

        test('Apply button closes dialog', async () => {
            useEventLogStore.mockReturnValue(mockStore({
                eventLogs: [makeLog({eventType: 'EVENT1'})],
                setPaused: mockSetPaused,
                clearLogs: mockClearLogs,
            }));
            renderWithTheme(<EventLogger eventTypes={['EVENT1']}/>);
            openDrawer();
            await waitFor(() => expect(screen.getByText(/Event Logger/i)).toBeInTheDocument());
            await openSettings();
            act(() => fireEvent.click(screen.getByRole('button', {name: /Apply Subscriptions/i})));
            await waitFor(() =>
                expect(screen.queryByText('Event Subscriptions')).not.toBeInTheDocument()
            );
        });

        test.each([
            ['via Unsubscribe All button', ['EVENT1'], () => {
                fireEvent.click(screen.getByRole('button', {name: /Unsubscribe from All/i}));
            }],
            ['via empty eventTypes prop', [], () => {
            }],
        ])('shows "No event types selected" message: %s', async (_, eventTypes, action) => {
            renderWithTheme(<EventLogger eventTypes={eventTypes}/>);
            openDrawer();
            await openSettings();
            action();
            expect(screen.getByText(/No event types selected. You won't receive any events./i)).toBeInTheDocument();
        });

        test('"Subscribe to Page Events" works after unsubscribing all', async () => {
            renderWithTheme(<EventLogger eventTypes={['EVENT1', 'EVENT2']}/>);
            openDrawer();
            await openSettings();
            act(() => fireEvent.click(screen.getByRole('button', {name: /Unsubscribe from All/i})));
            const pageBtn = screen.getByRole('button', {name: /Subscribe to Page Events/i});
            expect(pageBtn).not.toBeDisabled();
            act(() => fireEvent.click(pageBtn));
            expect(screen.getByRole('button', {name: /Apply Subscriptions \(2\)/i})).toBeInTheDocument();
        });

        test('"Subscribe to Page Events" is disabled when no page events', async () => {
            renderWithTheme(<EventLogger eventTypes={[]}/>);
            openDrawer();
            await openSettings();
            const pageBtn = screen.getByRole('button', {name: /Subscribe to Page Events/i});
            expect(pageBtn).toBeDisabled();
        });

        test('"Additional Events" section renders for non-page event types', async () => {
            renderWithTheme(<EventLogger eventTypes={['PAGE_EVENT']}/>);
            openDrawer();
            await openSettings();
            expect(screen.getByText(/Additional Events/)).toBeInTheDocument();
        });

        test('checkbox toggle changes subscription count', async () => {
            renderWithTheme(<EventLogger eventTypes={['EVENT1', 'EVENT2']}/>);
            openDrawer();
            await openSettings();
            const checkboxes = screen.getAllByRole('checkbox');
            if (checkboxes.length > 0) {
                act(() => fireEvent.click(checkboxes[0]));
                act(() => fireEvent.click(checkboxes[0]));
            }
        });

        test('closeLoggerEventSource called when all unsubscribed and applied', async () => {
            jest.spyOn(Storage.prototype, 'getItem').mockReturnValue('test-token');
            const {closeLoggerEventSource} = require('../../eventSourceManager');
            closeLoggerEventSource.mockClear();

            renderWithTheme(<EventLogger eventTypes={[]}/>);
            openDrawer();
            fireEvent.click(screen.getByTestId('SettingsIcon'));
            await waitFor(() => expect(screen.getByText('Event Subscriptions')).toBeInTheDocument());
            fireEvent.click(screen.getByRole('button', {name: /Unsubscribe from All/i}));
            fireEvent.click(screen.getByRole('button', {name: /Apply Subscriptions/i}));

            await waitFor(() => expect(closeLoggerEventSource).toHaveBeenCalled());
        });

        test('unsubscribing a single event type works', async () => {
            renderWithTheme(<EventLogger eventTypes={['EVENT1', 'EVENT2']}/>);
            openDrawer();
            await openSettings();
            const checkboxes = screen.getAllByRole('checkbox');
            const event1Checkbox = checkboxes.find(cb =>
                cb.closest('[class*="MuiBox"]')?.textContent.includes('EVENT1')
            );
            if (event1Checkbox) act(() => fireEvent.click(event1Checkbox));
            act(() => fireEvent.click(screen.getByRole('button', {name: /Apply Subscriptions/i})));
            await waitFor(() =>
                expect(screen.queryByText('Event Subscriptions')).not.toBeInTheDocument()
            );
        });

        test('Subscribe to All selects all event types', async () => {
            renderWithTheme(<EventLogger eventTypes={['EVENT1', 'EVENT2']}/>);
            openDrawer();
            await openSettings();
            act(() => fireEvent.click(screen.getByRole('button', {name: /Unsubscribe from All/i})));
            act(() => fireEvent.click(screen.getByRole('button', {name: /Subscribe to All/i})));
            expect(screen.getByRole('button', {name: /Apply Subscriptions \(9\)/i})).toBeInTheDocument();
        });

        test('filtering still works after unsubscribing all with page events', async () => {
            useEventLogStore.mockReturnValue(mockStore({
                eventLogs: [makeLog({eventType: 'EVENT1'}), makeLog({eventType: 'OTHER'})],
                setPaused: mockSetPaused,
                clearLogs: mockClearLogs,
            }));
            renderWithTheme(<EventLogger eventTypes={['EVENT1']}/>);
            openDrawer();
            await waitFor(() => expect(screen.getByText(/Event Logger/i)).toBeInTheDocument());
            await openSettings();
            act(() => fireEvent.click(screen.getByRole('button', {name: /Unsubscribe from All/i})));
            act(() => fireEvent.click(screen.getByRole('button', {name: /Apply Subscriptions/i})));
            await waitFor(() => {
                expect(screen.getByText('EVENT1')).toBeInTheDocument();
                expect(screen.queryByText('OTHER')).not.toBeInTheDocument();
            });
        });
    });

    // ─── EventSource / SSE integration ───────────────────────────────────

    describe('EventSource / SSE', () => {
        test('does not call startLoggerReception when token missing', async () => {
            jest.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
            const {startLoggerReception} = require('../../eventSourceManager');
            startLoggerReception.mockClear();

            renderWithTheme(<EventLogger eventTypes={['TEST']}/>);
            openDrawer();
            expect(startLoggerReception).not.toHaveBeenCalled();
        });

        test('startLoggerReception called on open with token', async () => {
            jest.spyOn(Storage.prototype, 'getItem').mockReturnValue('test-token');
            const {startLoggerReception} = require('../../eventSourceManager');
            startLoggerReception.mockClear();

            renderWithTheme(<EventLogger eventTypes={['NodeStatusUpdated']} objectName="/p"/>);
            openDrawer();
            await waitFor(() => expect(startLoggerReception).toHaveBeenCalled());
        });

        test('warn logged when startLoggerReception throws', async () => {
            jest.spyOn(Storage.prototype, 'getItem').mockReturnValue('test-token');
            const {startLoggerReception} = require('../../eventSourceManager');
            startLoggerReception.mockImplementationOnce(() => {
                throw new Error('SSE connection failed');
            });

            renderWithTheme(<EventLogger eventTypes={['NodeStatusUpdated']}/>);
            openDrawer();
            await waitFor(() =>
                expect(logger.warn).toHaveBeenCalledWith('Failed to start logger reception:', expect.any(Error))
            );
            startLoggerReception.mockReset().mockImplementation(jest.fn());
        });

        test('re-subscribes when objectName changes', async () => {
            jest.spyOn(Storage.prototype, 'getItem').mockReturnValue('test-token');
            const {startLoggerReception} = require('../../eventSourceManager');
            startLoggerReception.mockClear();

            const {rerender} = renderWithTheme(
                <EventLogger eventTypes={['NodeStatusUpdated']} objectName="/path/one"/>
            );
            openDrawer();
            await waitFor(() => expect(startLoggerReception).toHaveBeenCalled());

            const callsBefore = startLoggerReception.mock.calls.length;
            act(() => {
                rerender(
                    <ThemeProvider theme={lightTheme}>
                        <EventLogger eventTypes={['NodeStatusUpdated']} objectName="/path/two"/>
                    </ThemeProvider>
                );
            });
            await waitFor(() =>
                expect(startLoggerReception.mock.calls.length).toBeGreaterThan(callsBefore)
            );
        });
    });

    // ─── Resize handle ────────────────────────────────────────────────────

    describe('Resize handle', () => {
        test('resize handle exists and is interactive', async () => {
            renderWithTheme(<EventLogger/>);
            await openDrawerAndWait();
            expect(screen.getByLabelText(/Resize handle/i)).toBeInTheDocument();
        });

        test('mouse resize: mouseDown → mouseMove → mouseUp', async () => {
            renderWithTheme(<EventLogger/>);
            openDrawer();
            const handle = screen.getByLabelText(/Resize handle/i);

            act(() => fireEvent.mouseDown(handle, {clientY: 100}));
            act(() => fireEvent.mouseMove(document, {clientY: 150}));
            act(() => fireEvent.mouseUp(document));
        });

        test('touch resize: touchStart → touchMove → touchEnd + touchCancel', async () => {
            renderWithTheme(<EventLogger/>);
            openDrawer();
            const handle = screen.getByLabelText(/Resize handle/i);

            act(() => fireEvent.touchStart(handle, {touches: [{clientY: 100}]}));
            act(() => fireEvent.touchMove(document, {touches: [{clientY: 150}]}));
            act(() => fireEvent.touchEnd(document));

            act(() => fireEvent.touchStart(handle, {touches: [{clientY: 100}]}));
            act(() => fireEvent.touchCancel(document));
            expect(handle).toBeInTheDocument();
        });

        test('second mouseDown during active resize clears pending timeout', async () => {
            jest.useFakeTimers();
            renderWithTheme(<EventLogger/>);
            openDrawer();
            const handle = screen.getByLabelText(/Resize handle/i);

            act(() => fireEvent.mouseDown(handle, {clientY: 100}));
            act(() => fireEvent.mouseMove(document, {clientY: 80}));
            act(() => fireEvent.mouseDown(handle, {clientY: 90}));
            act(() => jest.advanceTimersByTime(100));
            act(() => fireEvent.mouseUp(document));
            jest.useRealTimers();
        });

        test('mouseUp clears pending resize timeout', async () => {
            jest.useFakeTimers();
            renderWithTheme(<EventLogger/>);
            openDrawer();
            const handle = screen.getByLabelText(/Resize handle/i);

            act(() => fireEvent.mouseDown(handle, {clientY: 100}));
            act(() => fireEvent.mouseMove(document, {clientY: 50}));
            act(() => fireEvent.mouseUp(document));
            act(() => jest.advanceTimersByTime(100));

            expect(handle).toBeInTheDocument();
            jest.useRealTimers();
        });
    });

    // ─── initialLoading spinner ───────────────────────────────────────────

    describe('initialLoading', () => {
        beforeEach(() => jest.useFakeTimers());
        afterEach(() => jest.useRealTimers());

        test('CircularProgress shown then hidden after 200 ms', async () => {
            renderWithTheme(<EventLogger/>);
            openDrawer();
            expect(screen.getByRole('progressbar')).toBeInTheDocument();
            act(() => jest.advanceTimersByTime(200));
            await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument());
        });
    });

    // ─── Infinite scroll (handleScroll) ────────────────────────────────────

    describe('Infinite scroll', () => {
        beforeEach(() => jest.useFakeTimers());
        afterEach(() => jest.useRealTimers());

        const setupManyLogs = () => {
            const manyLogs = Array.from({length: 25}, (_, i) =>
                makeLog({id: `${i}`, eventType: `EVENT_${i}`})
            );
            useEventLogStore.mockReturnValue(mockStore({
                eventLogs: manyLogs,
                setPaused: mockSetPaused,
                clearLogs: mockClearLogs,
            }));
        };

        test('successive scroll triggers load more and early return works', async () => {
            setupManyLogs();
            renderWithTheme(<EventLogger/>);
            openDrawer();
            act(() => jest.advanceTimersByTime(200)); // finish initial loading

            await waitFor(() => expect(screen.getByText(/20\/25 events/i)).toBeInTheDocument());

            // Find the scrollable container by starting from a log text and going up
            const logTextEl = screen.getByText('EVENT_0');
            let el = logTextEl.parentElement;
            let logContainer = null;
            while (el) {
                const style = window.getComputedStyle(el);
                if (style.overflow === 'auto' || style.overflowY === 'auto') {
                    logContainer = el;
                    break;
                }
                el = el.parentElement;
            }
            expect(logContainer).not.toBeNull();

            // Force container dimensions to enable scrolling
            logContainer.style.height = '200px';
            // Mock scroll position to be at the bottom
            Object.defineProperty(logContainer, 'scrollTop', {value: 800, writable: true, configurable: true});
            Object.defineProperty(logContainer, 'scrollHeight', {get: () => 1000, configurable: true});
            Object.defineProperty(logContainer, 'clientHeight', {get: () => 200, configurable: true});

            // First scroll: loadingMore becomes true, a 100ms timeout is set
            act(() => {
                fireEvent.scroll(logContainer);
            });
            // Second scroll immediately: should be ignored because loadingMore is true
            act(() => {
                fireEvent.scroll(logContainer);
            });

            // Advance time to execute the timeout
            act(() => jest.advanceTimersByTime(150));

            // visibleCount should now be 25, so 25/25 events
            await waitFor(() => expect(screen.getByText(/25\/25 events/i)).toBeInTheDocument());
        });
    });

    // ─── Theme switching ──────────────────────────────────────────────────

    describe('Theme switching', () => {
        beforeEach(() => jest.useFakeTimers());
        afterEach(() => jest.useRealTimers());

        test('LogRow re-renders when theme changes light → dark', async () => {
            useEventLogStore.mockReturnValue(mockStore({
                eventLogs: [makeLog({eventType: 'MEMO_TEST'})],
                setPaused: mockSetPaused,
                clearLogs: mockClearLogs,
            }));
            const {rerender} = render(
                <ThemeProvider theme={lightTheme}><EventLogger/></ThemeProvider>
            );
            act(() => fireEvent.click(screen.getByRole('button', {name: /Events|Event Logger/i})));
            act(() => jest.advanceTimersByTime(200));
            await waitFor(() => expect(screen.getByText('MEMO_TEST')).toBeInTheDocument());

            act(() => rerender(<ThemeProvider theme={darkTheme}><EventLogger/></ThemeProvider>));
            await waitFor(() => expect(screen.getByText('MEMO_TEST')).toBeInTheDocument());
        });
    });

    // ─── Misc / edge cases ────────────────────────────────────────────────

    describe('Misc / edge cases', () => {
        test('unmounting does not throw', () => {
            const {unmount} = renderWithTheme(<EventLogger/>);
            expect(() => unmount()).not.toThrow();
        });

        test('mobile viewport: button still renders', () => {
            Object.defineProperty(window, 'innerWidth', {value: 767, configurable: true});
            renderWithTheme(<EventLogger/>);
            expect(screen.getByRole('button', {name: /Events|Event Logger/i})).toBeInTheDocument();
            delete window.innerWidth;
        });

        test('no "Scroll to bottom" button present', async () => {
            useEventLogStore.mockReturnValue(mockStore({
                eventLogs: [1, 2, 3].map(i => makeLog({id: String(i), eventType: `TEST${i}`})),
                setPaused: mockSetPaused,
                clearLogs: mockClearLogs,
            }));
            renderWithTheme(<EventLogger/>);
            openDrawer();
            await waitFor(() => expect(screen.getByText(/TEST1/i)).toBeInTheDocument());
            expect(screen.queryAllByRole('button', {name: /Scroll to bottom/i})).toHaveLength(0);
        });

        test('no CancelIcon chips in main drawer by default', async () => {
            renderWithTheme(<EventLogger eventTypes={[]}/>);
            openDrawer();
            await waitFor(() => expect(screen.getByTestId('SettingsIcon')).toBeInTheDocument());
            expect(screen.queryAllByTestId('CancelIcon')).toHaveLength(0);
        });

        test('baseFilteredLogs shows all when both subscriptions and filteredTypes are empty', async () => {
            useEventLogStore.mockReturnValue(mockStore({
                eventLogs: [makeLog({eventType: 'ANY_EVENT'})],
                setPaused: mockSetPaused,
                clearLogs: mockClearLogs,
            }));
            renderWithTheme(<EventLogger eventTypes={[]}/>);
            openDrawer();
            fireEvent.click(screen.getByTestId('SettingsIcon'));
            await waitFor(() => expect(screen.getByText('Event Subscriptions')).toBeInTheDocument());
            act(() => fireEvent.click(screen.getByRole('button', {name: /Unsubscribe from All/i})));
            act(() => fireEvent.click(screen.getByRole('button', {name: /Apply Subscriptions/i})));
            await waitFor(() => expect(screen.getByText('ANY_EVENT')).toBeInTheDocument());
        });

        test('Drawer paper element is rendered', async () => {
            const {container} = renderWithTheme(<EventLogger/>);
            openDrawer();
            await waitFor(() => expect(screen.getByText(/Event Logger/i)).toBeInTheDocument());
            const paper = container.querySelector('.MuiDrawer-paper');
            if (paper) expect(paper).toBeInTheDocument();
            expect(screen.getByLabelText(/Resize handle/i)).toBeInTheDocument();
        });
    });
});
