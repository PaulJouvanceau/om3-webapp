import React from 'react';
import {render, screen, fireEvent, waitFor} from '@testing-library/react';
import '@testing-library/jest-dom';
import LogsViewer from '../LogsViewer';

// Suppress intentional console errors during tests
const originalConsoleError = console.error;
beforeAll(() => {
    console.error = jest.fn();
});
afterAll(() => {
    console.error = originalConsoleError;
});

// --- Mocks ---
jest.mock('@mui/material', () => ({
    ...jest.requireActual('@mui/material'),
    useTheme: () => ({
        palette: {
            background: {paper: '#fff', default: '#f5f5f5'},
            grey: {100: '#f5f5f5'},
            divider: '#e0e0e0',
            text: {primary: '#000', secondary: '#666'},
            error: {main: '#f44336'},
            warning: {main: '#ff9800'},
            info: {main: '#2196f3'},
            action: {hover: '#f0f0f0', selected: '#e0e0e0'},
        },
    }),
}));

jest.mock('../../context/DarkModeContext', () => ({
    useDarkMode: () => ({isDarkMode: false, toggleDarkMode: jest.fn()}),
}));

jest.mock('../../config/apiPath.js', () => ({URL_NODE: 'http://mock-api'}));

const mockLocalStorage = {
    getItem: jest.fn().mockReturnValue('mock-token'),
};
Object.defineProperty(window, 'localStorage', {value: mockLocalStorage});

jest.mock('../../utils/logger.js', () => ({warn: jest.fn(), error: jest.fn()}));

global.Blob = jest.fn();
global.URL.createObjectURL = jest.fn().mockReturnValue('blob-url');
global.URL.revokeObjectURL = jest.fn();

// Simulate a readable stream for testing SSE
class MockReadableStream {
    constructor(chunks, delay = 0) {
        this.chunks = chunks || [];
        this.cancelled = false;
        this.delay = delay;
    }

    getReader() {
        let index = 0;
        const {chunks, delay} = this;
        const stream = this;
        return {
            read: async () => {
                if (stream.cancelled) return {done: true};
                if (index < chunks.length) {
                    const chunk = chunks[index++];
                    if (delay > 0) await new Promise(r => setTimeout(r, delay));
                    return {value: new TextEncoder().encode(chunk), done: false};
                }
                return {done: true};
            },
            releaseLock: jest.fn(),
            cancel: jest.fn(() => {
                stream.cancelled = true;
                return Promise.resolve();
            }),
        };
    }

    cancel() {
        this.cancelled = true;
        return Promise.resolve();
    }
}

// --- Helpers ---
const mockSuccessfulFetch = (logData = [], delay = 0) => {
    const streamChunks = logData.map(log => `data: ${JSON.stringify(log)}\n\n`);
    global.fetch = jest.fn().mockResolvedValue({
        ok: true, status: 200,
        body: new MockReadableStream(streamChunks, delay),
    });
};

const mockErrorFetch = (status, message) => {
    global.fetch = jest.fn().mockRejectedValue(new Error(message));
};

const mockHttpErrorFetch = (status) => {
    global.fetch = jest.fn().mockResolvedValue({ok: false, status});
};

const renderComponent = (props = {}) =>
    render(<LogsViewer nodename="test-node" {...props} />);

const findLogsContainer = (container) => {
    const boxes = container.querySelectorAll('.MuiBox-root');
    for (const box of boxes) {
        const style = getComputedStyle(box);
        if (style.overflow === 'auto') {
            return box;
        }
    }
    return null;
};

// --- Tests ---
describe('LogsViewer', () => {
    beforeAll(() => {
        HTMLElement.prototype.scrollIntoView = jest.fn();
    });
    afterAll(() => {
        delete HTMLElement.prototype.scrollIntoView;
    });
    beforeEach(() => {
        jest.clearAllMocks();
        mockLocalStorage.getItem.mockReturnValue('mock-token');
    });

    describe('Rendering', () => {
        test('renders nodename subtitle for node type', async () => {
            mockSuccessfulFetch([]);
            renderComponent();
            expect(await screen.findByText('test-node', {exact: false})).toBeInTheDocument();
        });

        test('renders instance subtitle', async () => {
            mockSuccessfulFetch([]);
            renderComponent({type: 'instance', instanceName: 'test-instance', namespace: 'test-ns', kind: 'test-kind'});
            await screen.findByText('test-instance', {exact: false});
            expect(screen.getByText('test-node', {exact: false})).toBeInTheDocument();
        });

        test('shows error when instanceName missing for instance type', async () => {
            mockSuccessfulFetch([]);
            renderComponent({type: 'instance', instanceName: ''});
            expect(await screen.findByText('Instance name is required', {exact: false})).toBeInTheDocument();
        });

        test('shows loading spinner during fetch', async () => {
            global.fetch = jest.fn(() => new Promise(() => {
            }));
            renderComponent();
            expect(screen.getByRole('progressbar')).toBeInTheDocument();
        });

        test('displays "No logs available" when empty', async () => {
            mockSuccessfulFetch([]);
            renderComponent();
            await screen.findByText('No logs available');
        });
    });

    describe('Fetch URL and Headers', () => {
        test('fetches correct URL for node type', async () => {
            mockSuccessfulFetch([]);
            renderComponent();
            await waitFor(() => {
                expect(global.fetch).toHaveBeenCalledWith(
                    'http://mock-api/test-node/log?follow=true',
                    expect.objectContaining({
                        method: 'GET',
                        headers: expect.objectContaining({
                            Authorization: 'Bearer mock-token',
                            Accept: 'text/event-stream',
                        }),
                    })
                );
            });
        });

        test('fetches correct URL for instance type', async () => {
            mockSuccessfulFetch([]);
            renderComponent({type: 'instance', instanceName: 'inst', namespace: 'ns', kind: 'kind'});
            await waitFor(() => {
                expect(global.fetch).toHaveBeenCalledWith(
                    'http://mock-api/test-node/instance/path/ns/kind/inst/log?follow=true',
                    expect.objectContaining({
                        method: 'GET',
                        headers: expect.objectContaining({
                            Authorization: 'Bearer mock-token',
                            Accept: 'text/event-stream',
                        }),
                    })
                );
            });
        });
    });

    describe('Error handling', () => {
        test('shows authentication token error when token missing', async () => {
            mockLocalStorage.getItem.mockReturnValue(null);
            renderComponent();
            await screen.findByText('Authentication token not found');
        });

        test('handles HTTP error status 401', async () => {
            mockHttpErrorFetch(401);
            renderComponent();
            await screen.findByText('HTTP error! status: 401');
        });

        test('handles HTTP error status 500', async () => {
            mockHttpErrorFetch(500);
            renderComponent();
            await screen.findByText('HTTP error! status: 500');
        });

        test('shows node not found error for 404 in node type', async () => {
            mockErrorFetch(404, '404');
            renderComponent();
            await screen.findByText('Node logs endpoint not found for node test-node');
        });

        test('shows instance not found error for 404 in instance type', async () => {
            mockErrorFetch(404, '404');
            renderComponent({type: 'instance', instanceName: 'inst', namespace: 'ns', kind: 'kind'});
            await screen.findByText('Instance logs endpoint not found for inst on node test-node');
        });

        test('handles network error', async () => {
            mockErrorFetch(500, 'Network error');
            renderComponent();
            await screen.findByText('Failed to fetch logs: Network error');
        });

        test('handles response without body', async () => {
            global.fetch = jest.fn().mockResolvedValue({ok: true, status: 200, body: null});
            renderComponent();
            await screen.findByText('Response has no readable stream');
        });

        test('shows retry button on error and reconnects', async () => {
            mockHttpErrorFetch(401);
            renderComponent();
            await screen.findByText('HTTP error! status: 401');
            mockSuccessfulFetch([]);
            fireEvent.click(screen.getByText('Retry'));
            await screen.findByText('Connected');
        });

        test('shows authentication failed error when fetch rejects with 401', async () => {
            mockErrorFetch(401, '401 Unauthorized');
            renderComponent();
            await screen.findByText('Authentication failed. Please refresh your token.');
        });
    });

    describe('Log streaming and pause/resume', () => {
        test('shows connected status after fetch', async () => {
            mockSuccessfulFetch([]);
            renderComponent();
            await screen.findByText('Connected');
        });

        test('pauses and resumes streaming - covers abort during reading', async () => {
            const now = Date.now();
            const logs = [
                {__REALTIME_TIMESTAMP: now * 1000, MESSAGE: 'First log'},
                {__REALTIME_TIMESTAMP: (now + 100) * 1000, MESSAGE: 'Second log'},
            ];
            mockSuccessfulFetch(logs, 50);

            renderComponent();
            await screen.findByText('First log');

            const pauseBtn = screen.getByRole('button', {name: /pause/i});
            fireEvent.click(pauseBtn);

            const resumeBtn = await screen.findByRole('button', {name: /resume/i});
            expect(resumeBtn).toBeInTheDocument();

            await waitFor(() => {
                expect(screen.queryByText('Second log')).not.toBeInTheDocument();
            });

            mockSuccessfulFetch([{__REALTIME_TIMESTAMP: (now + 200) * 1000, MESSAGE: 'New log after resume'}]);
            fireEvent.click(resumeBtn);
            await screen.findByText('New log after resume');
        });

        test('does not update logs when paused', async () => {
            const now = Date.now() * 1000;
            mockSuccessfulFetch([{__REALTIME_TIMESTAMP: now, MESSAGE: 'Initial log'}]);
            renderComponent();
            await screen.findByText('Initial log');

            fireEvent.click(screen.getByRole('button', {name: /pause/i}));

            global.fetch = jest.fn().mockResolvedValue({
                ok: true, status: 200,
                body: new MockReadableStream([`data: ${JSON.stringify({
                    __REALTIME_TIMESTAMP: now + 1000,
                    MESSAGE: 'Buffered log'
                })}\n\n`]),
            });
            await expect(screen.findByText('Buffered log', {}, {timeout: 1000})).rejects.toThrow();
        });
    });

    describe('Log parsing', () => {
        const baseTs = Date.now();

        test('handles non-JSON log', async () => {
            mockSuccessfulFetch([{__REALTIME_TIMESTAMP: baseTs * 1000, MESSAGE: 'Plain message'}]);
            renderComponent();
            await screen.findByText('Plain message');
            expect(screen.getByText('[INFO]')).toBeInTheDocument();
        });

        test('parses JSON log with all fields', async () => {
            const log = {
                JSON: JSON.stringify({
                    time: baseTs, level: 'debug', message: 'JSON msg', method: 'GET', path: '/api/test',
                    node: 'test-node', request_uuid: 'uuid', pkg: 'test-pkg',
                }),
                __REALTIME_TIMESTAMP: baseTs * 1000,
            };
            mockSuccessfulFetch([log]);
            renderComponent();
            await screen.findByText('JSON msg');
            expect(screen.getByText('[DEBUG]')).toBeInTheDocument();
            expect(screen.getByText('GET')).toBeInTheDocument();
            expect(screen.getByText('/api/test')).toBeInTheDocument();
        });

        test('deduplicates logs by timestamp', async () => {
            const ts = baseTs * 1000;
            mockSuccessfulFetch([
                {__REALTIME_TIMESTAMP: ts, MESSAGE: 'dup'},
                {__REALTIME_TIMESTAMP: ts, MESSAGE: 'dup'},
                {__REALTIME_TIMESTAMP: ts + 1000, MESSAGE: 'unique'},
            ]);
            renderComponent();
            await screen.findByText('unique');
            expect(screen.getAllByText('dup', {exact: false}).length).toBe(1);
        });

        test('handles malformed JSON in parse', async () => {
            mockSuccessfulFetch([{__REALTIME_TIMESTAMP: baseTs * 1000, JSON: '{malformed'}]);
            renderComponent();
            await screen.findByText((content, element) => content.includes('{malformed'));
        });

        test('logs warning for invalid JSON line in stream', async () => {
            const logger = require('../../utils/logger.js');
            const streamChunks = [
                'data: not json\n\n',
                'data: {"__REALTIME_TIMESTAMP":1234567890, "MESSAGE": "valid"}\n\n'
            ];
            global.fetch = jest.fn().mockResolvedValue({
                ok: true, status: 200,
                body: new MockReadableStream(streamChunks),
            });
            renderComponent();
            await screen.findByText('valid');
            expect(logger.warn).toHaveBeenCalledWith(
                'Failed to parse log line:',
                expect.any(Error),
                'data: not json'
            );
        });

        test('processes partial lines across chunks', async () => {
            const chunk1 = 'data: {"__REALTIME_TIMESTAMP":1234567890, "MESSAGE": "Hello';
            const chunk2 = ' world"}\n\n';
            global.fetch = jest.fn().mockResolvedValue({
                ok: true, status: 200, body: new MockReadableStream([chunk1, chunk2]),
            });
            renderComponent();
            await screen.findByText('Hello world');
            expect(screen.queryByText('Hello')).not.toBeInTheDocument();
        });

        test('ignores non-data lines and empty data', async () => {
            global.fetch = jest.fn().mockResolvedValue({
                ok: true, status: 200,
                body: new MockReadableStream([
                    'event: log\n',
                    'data: \n\n',
                    'data: {"__REALTIME_TIMESTAMP":1234567890, "MESSAGE": "Valid"}\n\n',
                ]),
            });
            renderComponent();
            await screen.findByText('Valid');
        });
    });

    describe('Filters and search', () => {
        beforeEach(() => {
            const ts = Date.now();
            mockSuccessfulFetch([
                {__REALTIME_TIMESTAMP: ts * 1000, JSON: JSON.stringify({level: 'debug', message: 'Debug log'})},
                {__REALTIME_TIMESTAMP: (ts + 1) * 1000, JSON: JSON.stringify({level: 'error', message: 'Error log'})},
                {__REALTIME_TIMESTAMP: (ts + 2) * 1000, JSON: JSON.stringify({level: 'warn', message: 'Warn log'})},
            ]);
        });

        test('filters by search term', async () => {
            renderComponent();
            await screen.findByText('Debug log');
            await screen.findByText('Error log');

            fireEvent.change(screen.getByPlaceholderText('Search logs...'), {target: {value: 'debug'}});
            expect(await screen.findByText('Debug log')).toBeInTheDocument();
            await waitFor(() => expect(screen.queryByText('Error log')).not.toBeInTheDocument());
            expect(screen.getByText(/Filters active/)).toBeInTheDocument();
        });

        test('filters by log level', async () => {
            renderComponent();
            await screen.findByText('Debug log');

            const select = screen.getByLabelText('Select Log Levels');
            fireEvent.mouseDown(select);
            fireEvent.click(screen.getByText('Debug'));

            expect(await screen.findByText('Debug log')).toBeInTheDocument();
            await waitFor(() => expect(screen.queryByText('Error log')).not.toBeInTheDocument());
        });

        test('clicking a log clears filters', async () => {
            renderComponent();
            await screen.findByText('Debug log');

            fireEvent.mouseDown(screen.getByLabelText('Select Log Levels'));
            fireEvent.click(screen.getByText('Debug'));
            await screen.findByText('Debug log');

            fireEvent.click(screen.getByText('Debug log')); // click to clear
            await screen.findByText('Error log'); // unfiltered, both appear
            expect(screen.queryByText(/Filters active/)).not.toBeInTheDocument();
        });

        test('shows filtered log count', async () => {
            renderComponent();
            await screen.findByText('3 / 3 logs');

            fireEvent.mouseDown(screen.getByLabelText('Select Log Levels'));
            fireEvent.click(screen.getByText('Debug'));
            await screen.findByText('1 / 3 logs');
        });

        test('clicking filter chip delete clears all filters', async () => {
            renderComponent();
            await screen.findByText('Debug log');

            fireEvent.change(screen.getByPlaceholderText('Search logs...'), {target: {value: 'debug'}});
            await screen.findByText(/Filters active/);

            const chip = screen.getByText(/Filters active/i).closest('.MuiChip-root');
            const deleteIcon = chip.querySelector('.MuiChip-deleteIcon');
            fireEvent.click(deleteIcon);

            expect(screen.queryByText(/Filters active/)).not.toBeInTheDocument();
            expect(screen.getByPlaceholderText('Search logs...')).toHaveValue('');
            expect(screen.getByText('Debug log')).toBeInTheDocument();
            expect(screen.getByText('Error log')).toBeInTheDocument();
            expect(screen.getByText('Warn log')).toBeInTheDocument();
        });

        test('displays warning log with correct color', async () => {
            renderComponent();
            await screen.findByText('Warn log');
            const warnElement = screen.getByText('[WARN]');
            expect(warnElement).toBeInTheDocument();
        });
    });

    describe('Clear and Download', () => {
        test('clears logs', async () => {
            mockSuccessfulFetch([{__REALTIME_TIMESTAMP: Date.now() * 1000, MESSAGE: 'Test log'}]);
            renderComponent();
            await screen.findByText('Test log');

            fireEvent.click(screen.getByRole('button', {name: /clear/i}));
            await screen.findByText('No logs available');
        });

        test('disables clear and download when no logs', async () => {
            mockSuccessfulFetch([]);
            renderComponent();
            await screen.findByText('No logs available');
            expect(screen.getByRole('button', {name: /clear/i})).toBeDisabled();
            expect(screen.getByRole('button', {name: /download/i})).toBeDisabled();
        });

        test('download creates blob and triggers download', async () => {
            mockSuccessfulFetch([{__REALTIME_TIMESTAMP: Date.now() * 1000, MESSAGE: 'Download test'}]);
            renderComponent();
            await screen.findByText('Download test');

            fireEvent.click(screen.getByRole('button', {name: /download/i}));
            expect(global.URL.createObjectURL).toHaveBeenCalled();
            expect(global.URL.revokeObjectURL).toHaveBeenCalled();
        });

        test('downloads logs for instance type with correct filename', async () => {
            const now = Date.now();
            mockSuccessfulFetch([{__REALTIME_TIMESTAMP: now * 1000, MESSAGE: 'Instance log'}]);
            renderComponent({type: 'instance', instanceName: 'test-instance', namespace: 'ns', kind: 'kind'});
            await screen.findByText('Instance log');

            const originalCreateElement = document.createElement.bind(document);
            const createElementSpy = jest.spyOn(document, 'createElement');
            let anchorElement = null;
            createElementSpy.mockImplementation((tag) => {
                const element = originalCreateElement(tag);
                if (tag === 'a') {
                    anchorElement = element;
                }
                return element;
            });

            try {
                fireEvent.click(screen.getByRole('button', {name: /download/i}));
                expect(anchorElement).not.toBeNull();
                expect(anchorElement.download).toContain('test-instance-logs');
                expect(global.URL.createObjectURL).toHaveBeenCalled();
            } finally {
                createElementSpy.mockRestore();
            }
        });
    });

    describe('Scroll and selection', () => {
        test('highlights selected log and scrolls', async () => {
            const ts = Date.now() * 1000;
            const logs = Array.from({length: 10}, (_, i) => ({
                __REALTIME_TIMESTAMP: ts + i * 1000, MESSAGE: `Log ${i + 1}`,
            }));
            mockSuccessfulFetch(logs);
            renderComponent();
            await screen.findByText('Log 10');

            fireEvent.change(screen.getByPlaceholderText('Search logs...'), {target: {value: 'Log 5'}});
            await screen.findByText('Log 5');
            fireEvent.click(screen.getByText('Log 5'));

            await screen.findByText('Log 10');
            expect(screen.getByText('Log 5')).toBeInTheDocument();
        });

        test('scrolls to log and resets background after timeout, handles unmount', async () => {
            jest.useFakeTimers();

            const ts = Date.now() * 1000;
            const logs = Array.from({length: 5}, (_, i) => ({
                __REALTIME_TIMESTAMP: ts + i * 1000, MESSAGE: `Log ${i + 1}`,
            }));
            mockSuccessfulFetch(logs);
            const {container, unmount} = renderComponent();
            await screen.findByText('Log 5');

            const logsContainer = findLogsContainer(container);
            expect(logsContainer).toBeInTheDocument();
            logsContainer.scrollTo = jest.fn();

            fireEvent.change(screen.getByPlaceholderText('Search logs...'), {target: {value: 'Log 3'}});
            await screen.findByText('Log 3');
            fireEvent.click(screen.getByText('Log 3'));

            jest.advanceTimersByTime(100);
            expect(logsContainer.scrollTo).toHaveBeenCalledWith({
                top: expect.any(Number),
                behavior: 'smooth',
            });

            jest.advanceTimersByTime(2000);
            unmount();
            jest.useRealTimers();
        });

        test('Go to bottom button appears when not at bottom', async () => {
            mockSuccessfulFetch([{__REALTIME_TIMESTAMP: Date.now() * 1000, MESSAGE: 'Test'}]);
            renderComponent();
            await screen.findByText('Test');

            const goToBottomBtn = screen.getByText('Go to bottom');
            fireEvent.click(goToBottomBtn);
            expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
            expect(screen.queryByText('Go to bottom')).not.toBeInTheDocument();
        });

        test('handleScroll updates autoScroll when scrolling', async () => {
            mockSuccessfulFetch([{__REALTIME_TIMESTAMP: Date.now() * 1000, MESSAGE: 'Test'}]);
            const {container} = renderComponent();
            await screen.findByText('Test');

            const logsContainer = findLogsContainer(container);
            expect(logsContainer).toBeInTheDocument();

            Object.defineProperty(logsContainer, 'scrollHeight', {value: 1000, configurable: true});
            Object.defineProperty(logsContainer, 'clientHeight', {value: 500, configurable: true});
            logsContainer.scrollTop = 0;

            fireEvent.scroll(logsContainer);
            let goToBottomBtn = screen.getByText('Go to bottom');
            expect(goToBottomBtn).toBeInTheDocument();

            logsContainer.scrollTop = 500;
            fireEvent.scroll(logsContainer);
            await waitFor(() => {
                expect(screen.queryByText('Go to bottom')).not.toBeInTheDocument();
            });
        });
    });

    describe('Miscellaneous', () => {
        test('limits logs to maxLogs', async () => {
            const ts = Date.now() * 1000;
            const logs = Array.from({length: 5}, (_, i) => ({
                __REALTIME_TIMESTAMP: ts + i * 1000, MESSAGE: `Log ${i + 1}`,
            }));
            mockSuccessfulFetch(logs);
            renderComponent({maxLogs: 3});
            await screen.findByText('Log 5');
            await waitFor(() => {
                expect(screen.queryByText('Log 1')).not.toBeInTheDocument();
                expect(screen.queryByText('Log 2')).not.toBeInTheDocument();
            });
        });

        test('handles empty log message', async () => {
            mockSuccessfulFetch([{__REALTIME_TIMESTAMP: Date.now() * 1000, MESSAGE: ''}]);
            renderComponent();
            await screen.findByText('[INFO]');
        });
    });
});
