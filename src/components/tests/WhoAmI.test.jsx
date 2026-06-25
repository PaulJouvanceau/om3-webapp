import React from 'react';
import {render, screen, waitFor, fireEvent} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import WhoAmI from '../WhoAmI';
import {URL_AUTH_WHOAMI} from '../../config/apiPath';
import {DarkModeProvider} from '../../context/DarkModeContext';

// Mock external modules
jest.mock('../../context/OidcAuthContext.tsx', () => ({useOidc: jest.fn()}));
jest.mock('../../context/AuthProvider.jsx', () => ({
    useAuth: jest.fn(),
    useAuthDispatch: jest.fn(),
    Logout: 'LOGOUT',
}));
jest.mock('../../hooks/useFetchDaemonStatus', () => jest.fn());
jest.mock('../../utils/logger.js', () => ({error: jest.fn(), info: jest.fn()}));
jest.mock('react-router-dom', () => ({
    ...jest.requireActual('react-router-dom'),
    useNavigate: jest.fn(),
}));

global.fetch = jest.fn();

const mockLocalStorage = {
    getItem: jest.fn(),
    removeItem: jest.fn(),
    setItem: jest.fn(),
    clear: jest.fn(),
};
Object.defineProperty(window, 'localStorage', {value: mockLocalStorage});

describe('WhoAmI', () => {
    const mockToken = 'mock-token';
    const mockNavigate = jest.fn();
    const mockAuthDispatch = jest.fn();
    const mockToggleDarkMode = jest.fn();
    const mockSignoutRedirect = jest.fn();
    const mockRemoveUser = jest.fn();
    const mockFetchNodes = jest.fn();

    const defaultUserInfo = {
        auth: 'user',
        grant: {root: null},
        namespace: 'system',
        raw_grant: 'root',
        name: 'testuser',
    };

    const defaultDaemon = {nodename: 'test-node'};

    const setupMocks = (overrides = {}) => {
        jest.clearAllMocks();

        // Default localStorage
        mockLocalStorage.getItem.mockImplementation((key) => {
            if (key === 'authToken') {
                return 'authToken' in overrides ? overrides.authToken : mockToken;
            }
            if (key === 'darkMode') return 'false';
            if (key === 'appVersion') {
                return 'appVersion' in overrides ? overrides.appVersion : null;
            }
            if (key === 'appVersionTime') {
                return 'appVersionTime' in overrides ? overrides.appVersionTime : null;
            }
            return null;
        });

        // Navigation
        require('react-router-dom').useNavigate.mockReturnValue(mockNavigate);

        // Auth context
        require('../../context/AuthProvider.jsx').useAuth.mockReturnValue({
            authChoice: overrides.authChoice ?? 'local',
            authToken: mockToken,
        });
        require('../../context/AuthProvider.jsx').useAuthDispatch.mockReturnValue(mockAuthDispatch);

        // OIDC
        require('../../context/OidcAuthContext.tsx').useOidc.mockReturnValue({
            userManager: {
                signoutRedirect: mockSignoutRedirect,
                removeUser: mockRemoveUser,
            },
        });

        // Daemon status
        const useFetchDaemonStatus = require('../../hooks/useFetchDaemonStatus');
        useFetchDaemonStatus.mockReturnValue({
            daemon: overrides.daemon ?? defaultDaemon,
            fetchNodes: mockFetchNodes,
        });

        // Dark mode
        jest.spyOn(require('../../context/DarkModeContext'), 'useDarkMode').mockReturnValue({
            isDarkMode: overrides.isDarkMode ?? false,
            toggleDarkMode: mockToggleDarkMode,
        });

        // Fetch
        global.fetch.mockImplementation((url) => {
            if (url.includes('github')) {
                if (overrides.githubError) {
                    return Promise.reject(new Error('GitHub error'));
                }
                return Promise.resolve({
                    json: () => Promise.resolve([{tag_name: 'v1.2.3'}]),
                });
            }
            if (url === URL_AUTH_WHOAMI) {
                if (overrides.whoamiError) {
                    return Promise.reject(new Error('Failed to load user information'));
                }
                return Promise.resolve({
                    ok: overrides.whoamiOk ?? true,
                    json: () => Promise.resolve(overrides.whoamiData ?? defaultUserInfo),
                });
            }
            return Promise.reject(new Error(`Unknown URL: ${url}`));
        });
    };

    const renderComponent = () =>
        render(
            <DarkModeProvider>
                <MemoryRouter>
                    <WhoAmI/>
                </MemoryRouter>
            </DarkModeProvider>
        );

    test('shows loading state initially', () => {
        setupMocks();
        renderComponent();
        expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    test('displays error alert on fetch failure', async () => {
        setupMocks({whoamiError: true});
        renderComponent();
        await waitFor(() => {
            expect(screen.getByRole('alert')).toHaveTextContent('Failed to load user information');
        });
    });

    test('displays error alert on non‑OK response', async () => {
        setupMocks({whoamiOk: false});
        renderComponent();
        await waitFor(() => {
            expect(screen.getByRole('alert')).toHaveTextContent('Failed to load user information');
        });
    });

    test('renders all sections with user and server info', async () => {
        setupMocks();
        renderComponent();

        await waitFor(() => {
            expect(screen.getAllByText('My Information')[0]).toBeInTheDocument();
            expect(screen.getByText('testuser')).toBeInTheDocument();
            expect(screen.getByText('Auth Method')).toBeInTheDocument();
            expect(screen.getByText('user')).toBeInTheDocument();
            expect(screen.getByText('Permission Details')).toBeInTheDocument();
            expect(screen.getByText('root')).toBeInTheDocument();
            expect(screen.getByText('Server Information')).toBeInTheDocument();
            expect(screen.getByText('test-node')).toBeInTheDocument();
            expect(screen.getByText('v1.2.3')).toBeInTheDocument();
            expect(screen.getByRole('button', {name: /dark mode/i})).toBeInTheDocument();
            expect(screen.getByRole('button', {name: /logout/i})).toBeInTheDocument();
        });
    });

    test('shows "None" when raw_grant is missing', async () => {
        setupMocks({whoamiData: {...defaultUserInfo, raw_grant: null}});
        renderComponent();
        await waitFor(() => {
            expect(screen.getByText('None')).toBeInTheDocument();
        });
    });

    test('shows "N/A" for missing fields', async () => {
        setupMocks({whoamiData: {auth: null, name: null, raw_grant: null}});
        renderComponent();
        await waitFor(() => {
            const naElements = screen.getAllByText('N/A');
            expect(naElements.length).toBeGreaterThanOrEqual(2);
        });
    });

    test('uses authToken from localStorage in API call', async () => {
        setupMocks();
        renderComponent();
        await waitFor(() => {
            expect(fetch).toHaveBeenCalledWith(
                URL_AUTH_WHOAMI,
                expect.objectContaining({
                    headers: expect.objectContaining({
                        Authorization: `Bearer ${mockToken}`,
                    }),
                })
            );
        });
    });

    describe('app version', () => {
        const versionCases = [
            {
                name: 'uses cache when valid (<1h)',
                appVersion: '1.0.0',
                appVersionTime: String(Date.now()),
                expectedVersion: 'v1.0.0',
                githubCalled: false,
            },
            {
                name: 'fetches from GitHub when cache expired',
                appVersion: '1.0.0',
                appVersionTime: String(Date.now() - 4000000),
                expectedVersion: 'v1.2.3',
                githubCalled: true,
            },
            {
                name: 'falls back to cache when GitHub fails',
                appVersion: '1.0.0',
                appVersionTime: String(Date.now() - 4000000),
                githubError: true,
                expectedVersion: 'v1.0.0',
                githubCalled: true,
            },
            {
                name: 'shows Unknown when no cache and GitHub fails',
                appVersion: null,
                appVersionTime: null,
                githubError: true,
                expectedVersion: 'vUnknown',
                githubCalled: true,
            },
        ];

        it.each(versionCases)(
            '$name',
            async ({appVersion, appVersionTime, githubError, expectedVersion, githubCalled}) => {
                setupMocks({appVersion, appVersionTime, githubError});
                renderComponent();
                await waitFor(() => {
                    expect(screen.getByText(expectedVersion)).toBeInTheDocument();
                });
                if (!githubCalled) {
                    expect(fetch).not.toHaveBeenCalledWith(
                        expect.stringContaining('github')
                    );
                }
            }
        );
    });

    describe('daemon fetch', () => {
        test('calls fetchNodes when authToken exists', async () => {
            setupMocks();
            renderComponent();
            await waitFor(() => {
                expect(mockFetchNodes).toHaveBeenCalledWith(mockToken);
            });
        });

        test('does not call fetchNodes when no authToken', async () => {
            setupMocks({authToken: null});
            renderComponent();
            await waitFor(() => {
                const headings = screen.getAllByText('My Information');
                expect(headings.length).toBeGreaterThan(0);
            });
            expect(mockFetchNodes).not.toHaveBeenCalled();
        });

        test('logs error when fetchNodes fails', async () => {
            const logger = require('../../utils/logger.js');
            mockFetchNodes.mockRejectedValue(new Error('daemon error'));
            setupMocks();
            renderComponent();
            await waitFor(() => {
                expect(logger.error).toHaveBeenCalledWith(
                    'Error fetching daemon status:',
                    expect.any(Error)
                );
            });
        });

        test('displays "Loading..." when nodename is missing', async () => {
            setupMocks({daemon: {}});
            renderComponent();
            await waitFor(() => {
                expect(screen.getByText('Loading...')).toBeInTheDocument();
            });
        });
    });

    describe('dark mode toggle', () => {
        test('button toggles dark mode', async () => {
            setupMocks();
            renderComponent();
            const button = await screen.findByRole('button', {name: /dark mode/i});
            fireEvent.click(button);
            expect(mockToggleDarkMode).toHaveBeenCalled();
        });
    });

    describe('logout', () => {
        test.each([
            {
                authChoice: 'openid',
                shouldCallOidc: true,
            },
            {
                authChoice: 'local',
                shouldCallOidc: false,
            },
        ])('handles logout for $authChoice', async ({authChoice, shouldCallOidc}) => {
            setupMocks({authChoice});
            renderComponent();
            const button = await screen.findByRole('button', {name: /logout/i});
            fireEvent.click(button);

            if (shouldCallOidc) {
                expect(mockSignoutRedirect).toHaveBeenCalled();
                expect(mockRemoveUser).toHaveBeenCalled();
            } else {
                expect(mockSignoutRedirect).not.toHaveBeenCalled();
                expect(mockRemoveUser).not.toHaveBeenCalled();
            }

            expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('authToken');
            expect(mockAuthDispatch).toHaveBeenCalledWith({type: 'LOGOUT'});
            expect(mockNavigate).toHaveBeenCalledWith('/auth-choice');
        });
    });
});
