import React from 'react';
import {render, screen, waitFor, fireEvent} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import WhoAmI from '../WhoAmI';
import {URL_AUTH_WHOAMI} from '../../config/apiPath';
import {DarkModeProvider} from '../../context/DarkModeContext';

// Mocks
jest.mock('react-router-dom', () => ({
    ...jest.requireActual('react-router-dom'),
    useNavigate: () => jest.fn(),
}));
jest.mock('../../context/OidcAuthContext.tsx', () => ({useOidc: jest.fn()}));
jest.mock('../../context/AuthProvider.jsx', () => ({
    useAuth: jest.fn(),
    useAuthDispatch: jest.fn(),
    Logout: 'LOGOUT',
}));
jest.mock('../../hooks/useFetchDaemonStatus');
jest.mock('../../utils/logger.js', () => ({error: jest.fn(), info: jest.fn()}));

const {
    useAuth,
    useAuthDispatch,
} = require('../../context/AuthProvider.jsx');
const {useOidc} = require('../../context/OidcAuthContext.tsx');
const useFetchDaemonStatus = require('../../hooks/useFetchDaemonStatus');

// Helper to render with providers
const renderWhoAmI = () =>
    render(
        <DarkModeProvider>
            <MemoryRouter>
                <WhoAmI/>
            </MemoryRouter>
        </DarkModeProvider>
    );

describe('WhoAmI', () => {
    const mockToken = 'auth-token';
    const defaultUser = {
        auth: 'user',
        name: 'testuser',
        raw_grant: 'root',
    };
    const defaultDaemon = {nodename: 'test-node'};
    const mockFetchNodes = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();

        // localStorage defaults
        Object.defineProperty(window, 'localStorage', {
            value: {
                getItem: jest.fn((key) => {
                    if (key === 'authToken') return mockToken;
                    if (key === 'darkMode') return 'false';
                    return null;
                }),
                setItem: jest.fn(),
                removeItem: jest.fn(),
                clear: jest.fn(),
            },
            writable: true,
        });

        // Auth mocks
        useAuth.mockReturnValue({authChoice: 'local'});
        useAuthDispatch.mockReturnValue(jest.fn());
        useOidc.mockReturnValue({
            userManager: {signoutRedirect: jest.fn(), removeUser: jest.fn()},
        });

        // Daemon mock
        useFetchDaemonStatus.mockReturnValue({
            daemon: defaultDaemon,
            fetchNodes: mockFetchNodes,
        });

        // Fetch default: GitHub returns version, WhoAmI returns user
        global.fetch = jest.fn((url) => {
            if (url === 'https://api.github.com/repos/opensvc/om3-webapp/releases') {
                return Promise.resolve({json: () => Promise.resolve([{tag_name: 'v2.0.0'}])});
            }
            if (url === URL_AUTH_WHOAMI) {
                return Promise.resolve({ok: true, json: () => Promise.resolve(defaultUser)});
            }
            return Promise.reject(new Error(`Unknown URL: ${url}`));
        });
    });

    test('shows loading indicator then user info', async () => {
        renderWhoAmI();
        expect(screen.getByRole('progressbar')).toBeInTheDocument();
        await waitFor(() => {
            expect(screen.getAllByText('My Information')[0]).toBeInTheDocument();
        });
    });

    test('displays error on fetch failure', async () => {
        global.fetch.mockImplementation((url) => {
            if (url === URL_AUTH_WHOAMI) return Promise.reject(new Error('Network error'));
            return Promise.resolve({json: () => Promise.resolve([])});
        });
        renderWhoAmI();
        await waitFor(() => {
            expect(screen.getByRole('alert')).toHaveTextContent('Network error');
        });
    });

    test('shows error on non‑ok WhoAmI response', async () => {
        global.fetch.mockImplementation((url) => {
            if (url === URL_AUTH_WHOAMI) return Promise.resolve({ok: false, status: 401});
            return Promise.resolve({json: () => Promise.resolve([])});
        });
        renderWhoAmI();
        await waitFor(() => {
            expect(screen.getByRole('alert')).toHaveTextContent('Failed to load user information');
        });
    });

    test('displays fetched user information', async () => {
        renderWhoAmI();
        await waitFor(() => {
            expect(screen.getByText('testuser')).toBeInTheDocument();
            expect(screen.getByText('user')).toBeInTheDocument(); // auth method
            expect(screen.getByText(/root/)).toBeInTheDocument(); // raw_grant
        });
    });

    describe.each([
        ['missing raw_grant', {...defaultUser, raw_grant: null}, 'None'],
        ['missing auth and name', {auth: null, name: null, raw_grant: null}, 'N/A'],
        ['empty object', {}, 'N/A'],
    ])('Missing fields: %s', (_, userResponse, expectedValue) => {
        test(`shows "${expectedValue}" when appropriate`, async () => {
            global.fetch.mockImplementation((url) => {
                if (url === URL_AUTH_WHOAMI) return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve(userResponse)
                });
                return Promise.resolve({json: () => Promise.resolve([])});
            });
            renderWhoAmI();
            await waitFor(() => {
                // At least one occurrence of the expected placeholder
                const allMatches = screen.getAllByText(expectedValue);
                expect(allMatches.length).toBeGreaterThan(0);
            });
        });
    });

    test('passes authToken from localStorage in WhoAmI request', async () => {
        renderWhoAmI();
        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith(URL_AUTH_WHOAMI, expect.objectContaining({
                headers: expect.objectContaining({Authorization: `Bearer ${mockToken}`}),
            }));
        });
    });

    test('sends "Bearer null" when token is missing', async () => {
        window.localStorage.getItem.mockImplementation((key) => (key === 'darkMode' ? 'false' : null));
        renderWhoAmI();
        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith(URL_AUTH_WHOAMI, expect.objectContaining({
                headers: expect.objectContaining({Authorization: 'Bearer null'}),
            }));
        });
    });


    test('fetches nodes when authToken exists', async () => {
        renderWhoAmI();
        await waitFor(() => {
            expect(mockFetchNodes).toHaveBeenCalledWith(mockToken);
        });
    });

    test('does not fetch nodes when authToken is null', async () => {
        window.localStorage.getItem.mockImplementation((key) => (key === 'darkMode' ? 'false' : null));
        renderWhoAmI();
        await waitFor(() => {
            expect(screen.getAllByText('My Information')[0]).toBeInTheDocument();
        });
        expect(mockFetchNodes).not.toHaveBeenCalled();
    });

    test('handles fetchNodes error gracefully', async () => {
        const logger = require('../../utils/logger.js');
        mockFetchNodes.mockRejectedValueOnce(new Error('Daemon failure'));
        renderWhoAmI();
        await waitFor(() => {
            expect(logger.error).toHaveBeenCalledWith('Error fetching daemon status:', expect.any(Error));
        });
    });

    test('shows "Loading..." when nodename is missing', async () => {
        useFetchDaemonStatus.mockReturnValue({daemon: {}, fetchNodes: mockFetchNodes});
        renderWhoAmI();
        await waitFor(() => {
            expect(screen.getByText('Loading...')).toBeInTheDocument();
        });
    });

    describe('App version', () => {
        const githubURL = 'https://api.github.com/repos/opensvc/om3-webapp/releases';

        test('uses cached version if fresh (<1h)', async () => {
            const cached = '1.2.3';
            const now = Date.now().toString();
            window.localStorage.getItem.mockImplementation((key) => {
                if (key === 'appVersion') return cached;
                if (key === 'appVersionTime') return now;
                if (key === 'authToken') return mockToken;
                if (key === 'darkMode') return 'false';
                return null;
            });
            renderWhoAmI();
            await waitFor(() => {
                expect(screen.getByText(`v${cached}`)).toBeInTheDocument();
            });
            expect(global.fetch).not.toHaveBeenCalledWith(githubURL);
        });

        test('fetches from GitHub when cache is expired', async () => {
            const old = (Date.now() - 4000000).toString();
            window.localStorage.getItem.mockImplementation((key) => {
                if (key === 'appVersion') return 'old';
                if (key === 'appVersionTime') return old;
                if (key === 'authToken') return mockToken;
                if (key === 'darkMode') return 'false';
                return null;
            });
            renderWhoAmI();
            await waitFor(() => {
                expect(screen.getByText('v2.0.0')).toBeInTheDocument();
            });
            expect(window.localStorage.setItem).toHaveBeenCalledWith('appVersion', '2.0.0');
        });

        test('falls back to cache on fetch error', async () => {
            const cached = 'cached-only';
            window.localStorage.getItem.mockImplementation((key) => {
                if (key === 'appVersion') return cached;
                if (key === 'appVersionTime') return (Date.now() - 5000000).toString();
                if (key === 'authToken') return mockToken;
                if (key === 'darkMode') return 'false';
                return null;
            });
            global.fetch = jest.fn((url) => {
                if (url === URL_AUTH_WHOAMI) return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve(defaultUser)
                });
                if (url === githubURL) return Promise.reject(new Error('GitHub down'));
            });
            renderWhoAmI();
            await waitFor(() => {
                expect(screen.getByText(`v${cached}`)).toBeInTheDocument();
            });
        });

        test('shows "vUnknown" when no cache and fetch fails', async () => {
            window.localStorage.getItem.mockImplementation((key) => {
                if (key === 'darkMode') return 'false';
                return null;
            });
            global.fetch = jest.fn((url) => {
                if (url === URL_AUTH_WHOAMI) return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve(defaultUser)
                });
                if (url === githubURL) return Promise.reject(new Error('GitHub down'));
            });
            renderWhoAmI();
            await waitFor(() => {
                expect(screen.getByText('vUnknown')).toBeInTheDocument();
            });
        });
    });

    describe('Logout', () => {
        const mockNavigate = require('react-router-dom').useNavigate();

        test('performs logout with local auth', async () => {
            const dispatch = jest.fn();
            useAuthDispatch.mockReturnValue(dispatch);
            renderWhoAmI();
            const logoutBtn = await screen.findByRole('button', {name: /logout/i});
            fireEvent.click(logoutBtn);

            expect(window.localStorage.removeItem).toHaveBeenCalledWith('authToken');
            expect(dispatch).toHaveBeenCalledWith({type: 'LOGOUT'});
            expect(mockNavigate).toHaveBeenCalledWith('/auth-choice');
            // OIDC methods not called
            expect(useOidc().userManager.signoutRedirect).not.toHaveBeenCalled();
        });

        test('performs logout with OIDC auth', async () => {
            useAuth.mockReturnValue({authChoice: 'openid'});
            const signoutRedirect = jest.fn().mockResolvedValue(undefined);
            const removeUser = jest.fn().mockResolvedValue(undefined);
            useOidc.mockReturnValue({userManager: {signoutRedirect, removeUser}});
            renderWhoAmI();
            const logoutBtn = await screen.findByRole('button', {name: /logout/i});
            fireEvent.click(logoutBtn);

            expect(signoutRedirect).toHaveBeenCalled();
            expect(removeUser).toHaveBeenCalled();
            expect(window.localStorage.removeItem).toHaveBeenCalledWith('authToken');
        });
    });


    test('renders dark mode button and toggles theme', async () => {
        renderWhoAmI();
        const toggleBtn = await screen.findByRole('button', {name: /dark mode/i});
        expect(toggleBtn).toBeInTheDocument();
        // Click does not throw; toggleDarkMode is called internally
        fireEvent.click(toggleBtn);
    });

$
    test('renders both Logout and Dark Mode buttons', async () => {
        renderWhoAmI();
        await waitFor(() => {
            expect(screen.getByRole('button', {name: /logout/i})).toBeInTheDocument();
            expect(screen.getByRole('button', {name: /dark mode/i})).toBeInTheDocument();
        });
    });
});
