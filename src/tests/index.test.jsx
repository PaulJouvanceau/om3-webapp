import React from 'react';
import {describe, test, expect, vi, beforeEach, afterEach} from 'vitest';

const createRootMock = vi.fn();
const renderMock = vi.fn();

vi.mock('react-dom/client', () => ({
    default: {
        createRoot: (...args) => createRootMock(...args),
    },
}));

vi.mock('react-router-dom', () => ({
    BrowserRouter: ({children, basename}) => (
        <div data-testid="router" data-basename={basename}>
            {children}
        </div>
    ),
}));

vi.mock('../components/App', () => ({
    default: () => <div data-testid="app"/>,
}));

vi.mock('@mui/material/styles', () => ({
    ThemeProvider: ({children, theme}) => (
        <div data-testid="theme-provider" data-mode={theme?.palette?.mode}>
            {children}
        </div>
    ),
    createTheme: (options) => ({palette: options.palette}),
}));

vi.mock('@mui/material/colors', () => ({
    grey: {
        900: '#212121',
        600: '#757575',
    },
}));

vi.mock('../styles/main.css', () => ({}));

const loggerErrorMock = vi.fn();
vi.mock('../utils/logger.js', () => ({
    default: {
        error: (...args) => loggerErrorMock(...args),
        info: vi.fn(),
        warn: vi.fn(),
    },
}));

vi.mock('../context/DarkModeContext', () => ({
    DarkModeProvider: ({children}) => (
        <div data-testid="dark-mode-provider">{children}</div>
    ),
}));

/**
 * index.jsx runs its logic as soon as it is imported, and it reads
 * document.getElementById('root') and window.location.pathname at
 * import time. To test different scenarios we reset modules and
 * re-import the file for each test.
 */
async function importIndex() {
    vi.resetModules();
    return import('../index.jsx');
}

describe('index.jsx', () => {
    beforeEach(() => {
        createRootMock.mockReset();
        renderMock.mockReset();
        loggerErrorMock.mockReset();
        createRootMock.mockReturnValue({render: renderMock});
        document.body.innerHTML = '';
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    test('logs an error and does not create a root when the root element is missing', async () => {
        await importIndex();

        expect(loggerErrorMock).toHaveBeenCalledTimes(1);
        expect(loggerErrorMock).toHaveBeenCalledWith(
            "DOM element with id 'root' not found!"
        );
        expect(createRootMock).not.toHaveBeenCalled();
        expect(renderMock).not.toHaveBeenCalled();
    });

    test('creates a root and renders the app tree when the root element exists', async () => {
        const rootElement = document.createElement('div');
        rootElement.id = 'root';
        document.body.appendChild(rootElement);

        await importIndex();

        expect(createRootMock).toHaveBeenCalledTimes(1);
        expect(createRootMock).toHaveBeenCalledWith(rootElement);
        expect(renderMock).toHaveBeenCalledTimes(1);
        expect(loggerErrorMock).not.toHaveBeenCalled();
    });

    test('renders inside React.StrictMode', async () => {
        const rootElement = document.createElement('div');
        rootElement.id = 'root';
        document.body.appendChild(rootElement);

        await importIndex();

        const renderedTree = renderMock.mock.calls[0][0];
        expect(renderedTree.type).toBe(React.StrictMode);
        expect(typeof renderedTree.props.children).toBe('object');
    });

    test('uses "/ui" as the router basename when the pathname starts with /ui', async () => {
        const rootElement = document.createElement('div');
        rootElement.id = 'root';
        document.body.appendChild(rootElement);

        vi.stubGlobal('location', {pathname: '/ui/clusters'});

        await importIndex();

        expect(createRootMock).toHaveBeenCalledTimes(1);
        expect(renderMock).toHaveBeenCalledTimes(1);
    });

    test('uses "/" as the router basename when the pathname does not start with /ui', async () => {
        const rootElement = document.createElement('div');
        rootElement.id = 'root';
        document.body.appendChild(rootElement);

        vi.stubGlobal('location', {pathname: '/dashboard'});

        await importIndex();

        expect(createRootMock).toHaveBeenCalledTimes(1);
        expect(renderMock).toHaveBeenCalledTimes(1);
    });

    test('builds the theme with the light palette by default', async () => {
        const rootElement = document.createElement('div');
        rootElement.id = 'root';
        document.body.appendChild(rootElement);

        await importIndex();

        expect(createRootMock).toHaveBeenCalledTimes(1);
        expect(renderMock).toHaveBeenCalledTimes(1);
    });
});

describe('getDesignTokens', () => {
    test('returns the light palette when mode is "light"', async () => {
        const {getDesignTokens} = await importIndex();

        const tokens = getDesignTokens('light');

        expect(tokens).toEqual({
            palette: {
                mode: 'light',
                primary: {
                    main: '#212121',
                    contrastText: '#fff',
                },
                secondary: {
                    main: '#757575',
                    contrastText: '#fff',
                },
                background: {
                    default: '#ffffff',
                    paper: '#f5f5f5',
                },
            },
        });
    });

    test('returns the dark palette when mode is "dark"', async () => {
        const {getDesignTokens} = await importIndex();

        const tokens = getDesignTokens('dark');

        expect(tokens).toEqual({
            palette: {
                mode: 'dark',
                primary: {
                    main: '#90caf9',
                },
                secondary: {
                    main: '#f48fb1',
                },
                background: {
                    default: '#121212',
                    paper: '#1e1e1e',
                },
                text: {
                    primary: '#ffffff',
                    secondary: '#cccccc',
                },
            },
        });
    });

    test('does not include dark-only keys (text) when mode is "light"', async () => {
        const {getDesignTokens} = await importIndex();

        const tokens = getDesignTokens('light');

        expect(tokens.palette.text).toBeUndefined();
    });

    test('does not include light-only keys (contrastText) when mode is "dark"', async () => {
        const {getDesignTokens} = await importIndex();

        const tokens = getDesignTokens('dark');

        expect(tokens.palette.primary.contrastText).toBeUndefined();
        expect(tokens.palette.secondary.contrastText).toBeUndefined();
    });
});
