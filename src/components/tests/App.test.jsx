import React from 'react';
import {render, screen, waitFor, act} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import App from '../App';
import {DarkModeProvider} from '../../context/DarkModeContext';
import {ThemeProvider, createTheme} from '@mui/material/styles';
import {vi} from 'vitest';
import logger from '../../utils/logger.js';
import oidcConfiguration from '../../config/oidcConfiguration.js';
import {decodeToken} from '../Login';
import {__setMockRecreateUserManager, __setMockIsInitialized} from '../../context/OidcAuthContext.tsx';

vi.mock('../../styles/main.css', () => ({}));
vi.mock('../../utils/logger.js', () => ({
    default: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    },
}));
vi.mock('../NavBar', () => ({default: () => <div data-testid="navbar">NavBar</div>}));
vi.mock('../Cluster', () => ({default: () => <div data-testid="cluster">ClusterOverview</div>}));
vi.mock('../NodesTable', () => ({default: () => <div data-testid="nodes">NodesTable</div>}));
vi.mock('../Namespaces', () => ({default: () => <div data-testid="namespaces">Namespaces</div>}));
vi.mock('../Heartbeats', () => ({default: () => <div data-testid="heartbeats">Heartbeats</div>}));
vi.mock('../Pools', () => ({default: () => <div data-testid="pools">Pools</div>}));
vi.mock('../Objects', () => ({default: () => <div data-testid="objects">Objects</div>}));
vi.mock('../ObjectDetails', () => ({default: () => <div data-testid="object-details">ObjectDetails</div>}));
vi.mock('../Network', () => ({default: () => <div data-testid="network">Network</div>}));
vi.mock('../NetworkDetails', () => ({default: () => <div data-testid="network-details">NetworkDetails</div>}));
vi.mock('../WhoAmI', () => ({default: () => <div data-testid="whoami">WhoAmI</div>}));
vi.mock('../SilentRenew.jsx', () => ({default: () => <div data-testid="silent-renew">SilentRenew</div>}));
vi.mock('../AuthChoice.jsx', () => ({default: () => <div data-testid="auth-choice">AuthChoice</div>}));
vi.mock('../OidcCallback', () => ({default: () => <div data-testid="auth-callback">OidcCallback</div>}));
vi.mock('../Login', () => ({
    __esModule: true,
    default: () => <div data-testid="login">Login</div>,
    decodeToken: vi.fn(),
    refreshToken: vi.fn(),
}));
vi.mock('../../hooks/AuthInfo.jsx', () => ({
    default: vi.fn(() => ({
        openid: {issuer: 'https://test-issuer.com', client_id: 'test-client'},
    })),
}));
vi.mock('../../config/oidcConfiguration.js', () => ({
    default: vi.fn(() => Promise.resolve({
        client_id: 'test-client',
        authority: 'https://test-issuer.com',
        scope: 'openid profile email',
    })),
}));
vi.mock('../../context/AuthProvider', () => ({
    AuthProvider: ({children}) => <div>{children}</div>,
    useAuth: () => mockAuthState,
    useAuthDispatch: () => mockAuthDispatch,
    SetAccessToken: 'SetAccessToken',
    SetAuthChoice: 'SetAuthChoice',
    Login: 'Login',
}));
vi.mock('../../context/OidcAuthContext.tsx', () => ({
    OidcProvider: ({children}) => <div>{children}</div>,
    useOidc: () => ({
        userManager: mockUserManager,
        recreateUserManager: mockRecreateUserManager,
        isInitialized: mockIsInitialized,
    }),
    __setMockRecreateUserManager: (fn) => {
        mockRecreateUserManager = fn;
    },
    __setMockIsInitialized: (v) => {
        mockIsInitialized = v;
    },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

const mockAuthDispatch = vi.fn();
const mockAuthState = {user: null, isAuthenticated: false, authChoice: null, authInfo: null, accessToken: null};
let mockUserManager = {
    getUser: vi.fn(() => Promise.resolve(null)),
    signinSilent: vi.fn(() => Promise.resolve(null)),
    events: {
        addUserLoaded: vi.fn(),
        addAccessTokenExpiring: vi.fn(),
        addAccessTokenExpired: vi.fn(),
        addSilentRenewError: vi.fn(),
        removeUserLoaded: vi.fn(),
        removeAccessTokenExpired: vi.fn(),
        removeSilentRenewError: vi.fn(),
    },
};
let mockRecreateUserManager = vi.fn();
let mockIsInitialized = true;

const mockLocalStorage = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
};
Object.defineProperty(window, 'localStorage', {value: mockLocalStorage});

const consoleSpy = {
    log: vi.spyOn(console, 'log').mockImplementation(() => {
    }),
    error: vi.spyOn(console, 'error').mockImplementation(() => {
    }),
    warn: vi.spyOn(console, 'warn').mockImplementation(() => {
    }),
    debug: vi.spyOn(console, 'debug').mockImplementation(() => {
    }),
};

// --- Helpers ---
const makeTokenWithExp = (expSecondsFromNow) => {
    const payload = {exp: Math.floor(Date.now() / 1000) + expSecondsFromNow};
    return 'h.' + btoa(JSON.stringify(payload)) + '.s';
};

const renderApp = (initialEntries = ['/']) => {
    const theme = createTheme();
    return render(
        <DarkModeProvider>
            <ThemeProvider theme={theme}>
                <MemoryRouter initialEntries={initialEntries}>
                    <App/>
                </MemoryRouter>
            </ThemeProvider>
        </DarkModeProvider>
    );
};

const setupBasicAuth = (tokenExpOffset = 3600) => {
    const token = makeTokenWithExp(tokenExpOffset);
    mockLocalStorage.getItem.mockImplementation((k) =>
        k === 'authToken' ? token : k === 'authChoice' ? 'basic' : null
    );
    decodeToken.mockReturnValue({exp: Math.floor(Date.now() / 1000) + tokenExpOffset});
    return token;
};

const setupOidcAuth = (token = 'dummy') => {
    mockLocalStorage.getItem.mockImplementation((k) =>
        k === 'authToken' ? token : k === 'authChoice' ? 'openid' : null
    );
    mockAuthState.authChoice = 'openid';
};

// --- Tests ---
describe('App Component', () => {
    beforeEach(() => {
        mockAuthDispatch.mockClear();
        mockLocalStorage.getItem.mockClear().mockReturnValue(null);
        mockLocalStorage.setItem.mockClear().mockImplementation(() => {
        });
        mockLocalStorage.removeItem.mockClear();
        decodeToken.mockClear();
        mockNavigate.mockClear();
        oidcConfiguration.mockClear();
        Object.values(consoleSpy).forEach(spy => spy.mockClear());
        Object.values(logger).forEach(fn => fn.mockClear());
        mockAuthState.authChoice = null;
        mockAuthState.accessToken = null;
        mockAuthState.isAuthenticated = false;
        mockUserManager.getUser.mockResolvedValue(null);
        mockUserManager.signinSilent.mockResolvedValue(null);
        Object.values(mockUserManager.events).forEach(fn => fn.mockClear?.());
        mockRecreateUserManager = vi.fn();
        __setMockRecreateUserManager(mockRecreateUserManager);
        __setMockIsInitialized(true);
    });

    // --- Routing ---
    test('renders NavBar and redirects / to /cluster', async () => {
        setupBasicAuth();
        renderApp(['/']);
        expect(await screen.findByTestId('navbar')).toBeInTheDocument();
        expect(await screen.findByTestId('cluster')).toBeInTheDocument();
    });

    test('unknown route redirects to /cluster', async () => {
        setupBasicAuth();
        renderApp(['/unknown-route']);
        expect(await screen.findByTestId('cluster')).toBeInTheDocument();
    });

    test.each([
        ['/namespaces', 'namespaces'],
        ['/nodes', 'nodes'],
        ['/pools', 'pools'],
        ['/network', 'network'],
        ['/objects', 'objects'],
        ['/whoami', 'whoami'],
        ['/network/test-network', 'network-details'],
        ['/objects/test-object', 'object-details'],
    ])('protected route %s renders %s', async (path, testId) => {
        setupBasicAuth();
        const {unmount} = renderApp([path]);
        expect(await screen.findByTestId(testId)).toBeInTheDocument();
        unmount();
    });

    test.each([
        ['/heartbeats', 'heartbeats'],
        ['/silent-renew', 'silent-renew'],
        ['/auth-callback', 'auth-callback'],
        ['/auth-choice', 'auth-choice'],
        ['/auth/login', 'login'],
    ])('unprotected route %s renders %s', async (path, testId) => {
        const {unmount} = renderApp([path]);
        expect(await screen.findByTestId(testId)).toBeInTheDocument();
        unmount();
    });

    // --- ProtectedRoute ---
    test('ProtectedRoute: valid basic token shows content', async () => {
        setupBasicAuth();
        renderApp(['/cluster']);
        expect(await screen.findByTestId('cluster')).toBeInTheDocument();
    });

    test('ProtectedRoute: expired basic token redirects and clears storage', async () => {
        setupBasicAuth(-3600);
        renderApp(['/cluster']);
        expect(await screen.findByTestId('auth-choice')).toBeInTheDocument();
        expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('authToken');
        expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('tokenExpiration');
        expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('authChoice');
    });

    test('ProtectedRoute: null token + null authChoice redirects', async () => {
        renderApp(['/cluster']);
        expect(await screen.findByTestId('auth-choice')).toBeInTheDocument();
    });

    test('ProtectedRoute: OIDC without token redirects', async () => {
        mockLocalStorage.getItem.mockImplementation((k) =>
            k === 'authChoice' ? 'openid' : null
        );
        renderApp(['/cluster']);
        expect(await screen.findByTestId('auth-choice')).toBeInTheDocument();
    });

    test('ProtectedRoute: OIDC with malformed token still renders', async () => {
        setupOidcAuth('not-a-valid-jwt');
        decodeToken.mockReturnValue(null);
        renderApp(['/cluster']);
        expect(await screen.findByTestId('cluster')).toBeInTheDocument();
    });

    test('ProtectedRoute: null token + null authChoice clears storage', async () => {
        mockLocalStorage.getItem.mockImplementation((k) =>
            k === 'authToken' ? makeTokenWithExp(-3600) : k === 'authChoice' ? null : null
        );
        decodeToken.mockReturnValue({exp: Math.floor(Date.now() / 1000) - 3600});
        renderApp(['/cluster']);
        expect(await screen.findByTestId('auth-choice')).toBeInTheDocument();
        expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('authToken');
    });

    // --- OIDC Initialization ---
    test('initializeOidcOnStartup calls oidcConfiguration and recreateUserManager when not initialized', async () => {
        __setMockIsInitialized(false);
        setupOidcAuth(makeTokenWithExp(3600));
        decodeToken.mockReturnValue({exp: Math.floor(Date.now() / 1000) + 3600});
        renderApp(['/cluster']);
        await waitFor(() => expect(oidcConfiguration).toHaveBeenCalled());
        await waitFor(() => expect(mockRecreateUserManager).toHaveBeenCalled());
        __setMockIsInitialized(true);
    });

    test('initializeOidcOnStartup does not run if already initialized', async () => {
        setupOidcAuth(makeTokenWithExp(3600));
        renderApp(['/']);
        await waitFor(() => {
            expect(oidcConfiguration).not.toHaveBeenCalled();
            expect(mockRecreateUserManager).not.toHaveBeenCalled();
        });
    });

    test('initializeOidcOnStartup does not run without token', async () => {
        mockLocalStorage.getItem.mockImplementation((k) =>
            k === 'authChoice' ? 'openid' : null
        );
        mockAuthState.authChoice = 'openid';
        renderApp(['/']);
        await waitFor(() => expect(oidcConfiguration).not.toHaveBeenCalled());
    });

    test('initializeOidcOnStartup does not run for non-openid authChoice', async () => {
        setupBasicAuth();
        renderApp(['/']);
        await waitFor(() => expect(oidcConfiguration).not.toHaveBeenCalled());
    });

    test('initializeOidcOnStartup does not run if authInfo is null', async () => {
        __setMockIsInitialized(false);
        const AuthInfoMock = (await import('../../hooks/AuthInfo.jsx')).default;
        AuthInfoMock.mockImplementation(() => null);
        setupOidcAuth(makeTokenWithExp(3600));
        renderApp(['/']);
        await new Promise(r => setTimeout(r, 200));
        expect(oidcConfiguration).not.toHaveBeenCalled();
        AuthInfoMock.mockImplementation(() => ({
            openid: {issuer: 'https://test-issuer.com', client_id: 'test-client'}
        }));
        __setMockIsInitialized(true);
    });

    test('initializeOidcOnStartup handles oidcConfiguration rejection', async () => {
        __setMockIsInitialized(false);
        oidcConfiguration.mockImplementationOnce(() => Promise.reject(new Error('config failed')));
        setupOidcAuth(makeTokenWithExp(3600));
        renderApp(['/cluster']);
        await new Promise(r => setTimeout(r, 200));
        expect(oidcConfiguration).toHaveBeenCalled();
        expect(mockRecreateUserManager).not.toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalled();
        __setMockIsInitialized(true);
    });

    test('initializeOidcOnStartup handles recreateUserManager throwing', async () => {
        __setMockIsInitialized(false);
        oidcConfiguration.mockImplementationOnce(() => Promise.resolve({client_id: 'x'}));
        mockRecreateUserManager = vi.fn(() => {
            throw new Error('boom create');
        });
        __setMockRecreateUserManager(mockRecreateUserManager);
        setupOidcAuth(makeTokenWithExp(3600));
        renderApp(['/cluster']);
        await new Promise(r => setTimeout(r, 200));
        expect(mockRecreateUserManager).toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalled();
        __setMockIsInitialized(true);
    });

    // --- OIDC User Events ---
    test('valid user from getUser triggers SetAccessToken and Login dispatch', async () => {
        const validUser = {
            profile: {preferred_username: 'test-user'},
            access_token: 'new-token',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            expired: false,
        };
        mockUserManager.getUser.mockResolvedValue(validUser);
        setupOidcAuth();
        renderApp(['/cluster']);
        await waitFor(() => expect(mockAuthDispatch).toHaveBeenCalledWith({type: 'SetAccessToken', data: 'new-token'}));
        await waitFor(() => expect(mockAuthDispatch).toHaveBeenCalledWith({type: 'Login', data: 'test-user'}));
        await waitFor(() => expect(mockLocalStorage.setItem).toHaveBeenCalledWith('authToken', 'new-token'));
        await waitFor(() => expect(mockLocalStorage.setItem).toHaveBeenCalledWith('tokenExpiration', expect.any(String)));
    });

    test('expired user from getUser does not trigger SetAccessToken', async () => {
        mockUserManager.getUser.mockResolvedValue({profile: {preferred_username: 'x'}, expired: true});
        setupOidcAuth();
        renderApp(['/cluster']);
        await waitFor(() => expect(mockUserManager.getUser).toHaveBeenCalled());
        expect(mockAuthDispatch).not.toHaveBeenCalledWith(expect.objectContaining({type: 'SetAccessToken'}));
    });

    test('expired user triggers silent renew; success dispatches tokens', async () => {
        const refreshedUser = {
            profile: {preferred_username: 'refreshed-user'},
            access_token: 'refreshed-token',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            expired: false,
        };
        mockUserManager.getUser.mockResolvedValue({profile: {preferred_username: 'x'}, expired: true});
        mockUserManager.signinSilent.mockResolvedValue(refreshedUser);
        setupOidcAuth();
        renderApp(['/cluster']);
        await waitFor(() => expect(mockUserManager.signinSilent).toHaveBeenCalled());
        await waitFor(() => expect(mockAuthDispatch).toHaveBeenCalledWith({
            type: 'SetAccessToken',
            data: 'refreshed-token'
        }));
        await waitFor(() => expect(mockAuthDispatch).toHaveBeenCalledWith({type: 'Login', data: 'refreshed-user'}));
    });

    test('expired user silent renew failure logs error', async () => {
        mockUserManager.getUser.mockResolvedValue({profile: {preferred_username: 'x'}, expired: true});
        mockUserManager.signinSilent.mockRejectedValue(new Error('Renew failed'));
        setupOidcAuth();
        renderApp(['/cluster']);
        await waitFor(() => expect(mockUserManager.signinSilent).toHaveBeenCalled());
        expect(logger.error).toHaveBeenCalledWith('Silent renew failed:', expect.any(Error));
    });

    test('addAccessTokenExpired handler clears storage and navigates', async () => {
        setupOidcAuth();
        renderApp(['/cluster']);
        await waitFor(() => expect(mockUserManager.events.addAccessTokenExpired).toHaveBeenCalled());
        act(() => mockUserManager.events.addAccessTokenExpired.mock.calls[0][0]());
        await waitFor(() => expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('authToken'));
        await waitFor(() => expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('tokenExpiration'));
        await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/auth-choice', {replace: true}));
    });

    test('addSilentRenewError handler clears storage and navigates', async () => {
        setupOidcAuth();
        renderApp(['/cluster']);
        await waitFor(() => expect(mockUserManager.events.addSilentRenewError).toHaveBeenCalled());
        act(() => mockUserManager.events.addSilentRenewError.mock.calls[0][0](new Error('renew failed')));
        await waitFor(() => expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('authToken'));
        await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/auth-choice', {replace: true}));
    });

    test('addAccessTokenExpiring listener logs debug', async () => {
        setupOidcAuth();
        renderApp(['/cluster']);
        await waitFor(() => expect(mockUserManager.events.addAccessTokenExpiring).toHaveBeenCalled());
        act(() => mockUserManager.events.addAccessTokenExpiring.mock.calls[0][0]());
        expect(logger.debug).toHaveBeenCalled();
    });

    test('removes old event listeners before adding new ones', async () => {
        setupOidcAuth();
        renderApp(['/cluster']);
        await waitFor(() => expect(mockUserManager.events.removeUserLoaded).toHaveBeenCalled());
        await waitFor(() => expect(mockUserManager.events.removeAccessTokenExpired).toHaveBeenCalled());
        await waitFor(() => expect(mockUserManager.events.removeSilentRenewError).toHaveBeenCalled());
    });

    test('onUserRefreshed: user without profile does not dispatch Login', async () => {
        setupOidcAuth();
        mockUserManager.getUser.mockResolvedValue({
            access_token: 'new-token',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
        });
        renderApp(['/cluster']);
        await waitFor(() => expect(mockAuthDispatch).toHaveBeenCalledWith({type: 'SetAccessToken', data: 'new-token'}));
        expect(mockAuthDispatch).not.toHaveBeenCalledWith(expect.objectContaining({
            type: 'Login',
            data: expect.anything()
        }));
    });

    test('onUserRefreshed via addUserLoaded event fires correctly', async () => {
        setupOidcAuth();
        renderApp(['/cluster']);
        await waitFor(() => expect(mockUserManager.events.addUserLoaded).toHaveBeenCalled());
        act(() => mockUserManager.events.addUserLoaded.mock.calls[0][0]({
            profile: {preferred_username: 'event-user'},
            access_token: 'event-token',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
        }));
        await waitFor(() => expect(mockLocalStorage.setItem).toHaveBeenCalledWith('authToken', 'event-token'));
    });

    // --- Auth Choice Persistence ---
    test('saves auth.authChoice to localStorage', async () => {
        mockAuthState.authChoice = 'basic';
        renderApp(['/']);
        await waitFor(() => expect(mockLocalStorage.setItem).toHaveBeenCalledWith('authChoice', 'basic'));
    });

    test('does not save authChoice if null', async () => {
        renderApp(['/']);
        await waitFor(() => {
            expect(mockLocalStorage.setItem).not.toHaveBeenCalledWith('authChoice', expect.anything());
        });
    });

    // --- Auth Resume (visibility/focus) ---
    test('focus triggers redirect when basic token is expired', async () => {
        setupBasicAuth(-3600);
        renderApp(['/cluster']);
        act(() => window.dispatchEvent(new Event('focus')));
        await act(async () => {
            await new Promise(r => setTimeout(r, 600));
        });
        expect(await screen.findByTestId('auth-choice')).toBeInTheDocument();
    });

    test('focus does not redirect when OIDC token is present', async () => {
        setupOidcAuth('dummy-token');
        renderApp(['/cluster']);
        act(() => window.dispatchEvent(new Event('focus')));
        await act(async () => {
            await new Promise(r => setTimeout(r, 10));
        });
        expect(await screen.findByTestId('cluster')).toBeInTheDocument();
        expect(mockNavigate).not.toHaveBeenCalledWith('/auth-choice', {replace: true});
    });

    test('focus does not redirect when basic token is valid', async () => {
        setupBasicAuth();
        renderApp(['/cluster']);
        act(() => window.dispatchEvent(new Event('focus')));
        await act(async () => {
            await new Promise(r => setTimeout(r, 10));
        });
        expect(await screen.findByTestId('cluster')).toBeInTheDocument();
    });

    test('visibilitychange triggers auth check without redirect for valid token', async () => {
        setupBasicAuth();
        renderApp(['/cluster']);
        Object.defineProperty(document, 'visibilityState', {value: 'visible', configurable: true});
        act(() => document.dispatchEvent(new Event('visibilitychange')));
        expect(await screen.findByTestId('cluster')).toBeInTheDocument();
    });

    test('OIDC expired token on resume triggers silent renew and updates storage', async () => {
        setupOidcAuth(makeTokenWithExp(-3600));
        decodeToken.mockReturnValue({exp: Math.floor(Date.now() / 1000) - 3600});
        mockUserManager.signinSilent.mockResolvedValue({
            profile: {preferred_username: 'refreshed-user'},
            access_token: 'refreshed-token',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            expired: false,
        });
        renderApp(['/cluster']);
        act(() => window.dispatchEvent(new Event('focus')));
        await act(async () => {
            await new Promise(r => setTimeout(r, 600));
        });
        await waitFor(() => expect(mockUserManager.signinSilent).toHaveBeenCalled());
        await waitFor(() => expect(mockLocalStorage.setItem).toHaveBeenCalledWith('authToken', 'refreshed-token'));
    });

    test('OIDC with no token on resume redirects', async () => {
        mockLocalStorage.getItem.mockImplementation((k) =>
            k === 'authChoice' ? 'openid' : null
        );
        renderApp(['/cluster']);
        expect(await screen.findByTestId('auth-choice')).toBeInTheDocument();
    });

    test('handleCheckAuthOnResume: OIDC no token on focus redirects', async () => {
        setupOidcAuth();
        renderApp(['/cluster']);
        mockLocalStorage.getItem.mockImplementation((k) =>
            k === 'authChoice' ? 'openid' : null
        );
        act(() => window.dispatchEvent(new Event('focus')));
        await act(async () => {
            await new Promise(r => setTimeout(r, 600));
        });
        expect(mockNavigate).toHaveBeenCalledWith('/auth-choice', {replace: true});
    });

    test('handleCheckAuthOnResume: OIDC expired token without userManager redirects', async () => {
        __setMockIsInitialized(false);
        const expiredToken = makeTokenWithExp(-3600);
        setupOidcAuth(expiredToken);
        decodeToken.mockReturnValue({exp: Math.floor(Date.now() / 1000) - 3600});
        const oidcCtxModule = await import('../../context/OidcAuthContext.tsx');
        vi.spyOn(oidcCtxModule, 'useOidc').mockReturnValue({
            userManager: null,
            recreateUserManager: mockRecreateUserManager,
            isInitialized: false,
        });
        renderApp(['/cluster']);
        act(() => window.dispatchEvent(new Event('focus')));
        await act(async () => {
            await new Promise(r => setTimeout(r, 600));
        });
        expect(mockNavigate).toHaveBeenCalledWith('/auth-choice', {replace: true});
        vi.restoreAllMocks();
        __setMockIsInitialized(true);
    });

    test('handleCheckAuthOnResume: OIDC silent renew returns expired user redirects', async () => {
        const expiredToken = makeTokenWithExp(-3600);
        setupOidcAuth(expiredToken);
        decodeToken.mockReturnValue({exp: Math.floor(Date.now() / 1000) - 3600});
        mockUserManager.signinSilent.mockResolvedValue({expired: true});
        renderApp(['/cluster']);
        act(() => window.dispatchEvent(new Event('focus')));
        await act(async () => {
            await new Promise(r => setTimeout(r, 600));
        });
        await waitFor(() => expect(mockUserManager.signinSilent).toHaveBeenCalled());
        expect(mockNavigate).toHaveBeenCalledWith('/auth-choice', {replace: true});
    });

    test('expired user silent renew returns still-expired user logs warning', async () => {
        mockUserManager.getUser.mockResolvedValue({profile: {preferred_username: 'x'}, expired: true});
        mockUserManager.signinSilent.mockResolvedValue({expired: true, profile: {preferred_username: 'x'}});
        setupOidcAuth();
        renderApp(['/cluster']);
        await waitFor(() => expect(mockUserManager.signinSilent).toHaveBeenCalled());
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Silent renew failed or user still expired'));
    });

    test('handleCheckAuthOnResume handles storage errors gracefully', async () => {
        setupBasicAuth();
        renderApp(['/cluster']);
        mockLocalStorage.getItem.mockImplementation(() => {
            throw new Error('Storage error');
        });
        act(() => window.dispatchEvent(new Event('focus')));
        await waitFor(() =>
            expect(logger.error).toHaveBeenCalledWith('Error while checking auth on resume:', expect.any(Error))
        );
    });

    // --- Miscellaneous ---
    test('handles om3:auth-redirect event', async () => {
        renderApp(['/']);
        act(() => window.dispatchEvent(new CustomEvent('om3:auth-redirect', {detail: '/auth-choice'})));
        expect(mockNavigate).toHaveBeenCalledWith('/auth-choice', {replace: true});
    });

    test('storage event calls getItem to check new token', async () => {
        const newToken = makeTokenWithExp(3600);
        mockLocalStorage.getItem.mockImplementation((k) => k === 'authChoice' ? 'basic' : null);
        renderApp(['/auth-choice']);
        await screen.findByTestId('auth-choice');
        mockLocalStorage.getItem.mockImplementation((k) => k === 'authToken' ? newToken : null);
        act(() => window.dispatchEvent(new StorageEvent('storage', {key: 'authToken', newValue: newToken})));
        await waitFor(() => expect(mockLocalStorage.getItem).toHaveBeenCalledWith('authToken'));
    });

    test('event listeners are cleaned up on unmount', async () => {
        const removeListenerSpy = vi.spyOn(window, 'removeEventListener');
        const docRemoveListenerSpy = vi.spyOn(document, 'removeEventListener');
        setupBasicAuth();
        const {unmount} = renderApp(['/']);
        await screen.findByTestId('navbar');
        unmount();
        expect(removeListenerSpy).toHaveBeenCalledWith('storage', expect.any(Function));
        expect(removeListenerSpy).toHaveBeenCalledWith('focus', expect.any(Function));
        expect(removeListenerSpy).toHaveBeenCalledWith('om3:auth-redirect', expect.any(Function));
        expect(docRemoveListenerSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    });

    test('isTokenValid: null, empty, and malformed tokens fail', async () => {
        for (const token of [null, '', 'not.a.valid.jwt']) {
            mockLocalStorage.getItem.mockImplementation((k) =>
                k === 'authToken' ? token : k === 'authChoice' ? 'basic' : null
            );
            decodeToken.mockReturnValue(null);
            const {unmount} = renderApp(['/cluster']);
            expect(await screen.findByTestId('auth-choice')).toBeInTheDocument();
            unmount();
        }
    });
});
