import React from 'react';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {
    AuthProvider,
    Login,
    Logout,
    SetAccessToken,
    SetAuthChoice,
    SetAuthInfo,
    useAuth,
    useAuthDispatch,
} from '../AuthProvider';

// --- Mocks ---
jest.mock('../../eventSourceManager', () => ({updateEventSourceToken: jest.fn()}));
jest.mock('../../components/Login', () => ({decodeToken: jest.fn(), refreshToken: jest.fn()}));
jest.mock('../../utils/logger.js', () => ({
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    log: jest.fn()
}));

const {updateEventSourceToken} = require('../../eventSourceManager');
const {decodeToken, refreshToken} = require('../../components/Login');
const logger = require('../../utils/logger.js');

// --- OIDC mock ---
let tokenExpiredCallback = null;
const mockSigninSilent = jest.fn();
const mockAddAccessTokenExpired = jest.fn(cb => {
    tokenExpiredCallback = cb;
});
const mockRemoveAccessTokenExpired = jest.fn(cb => {
    if (cb === tokenExpiredCallback) tokenExpiredCallback = null;
});
const mockUserManager = {
    signinSilent: mockSigninSilent,
    events: {addAccessTokenExpired: mockAddAccessTokenExpired, removeAccessTokenExpired: mockRemoveAccessTokenExpired},
};
Object.defineProperty(window, 'oidcUserManager', {value: mockUserManager, writable: true});

// --- BroadcastChannel mock ---
global.BroadcastChannel = class {
    constructor() {
        this.onmessage = null;
        this._messages = [];
    }

    postMessage(msg) {
        this._messages.push(msg);
    }

    close() {
    }
};

// --- Test components ---
const TestAuth = () => {
    const auth = useAuth();
    return (
        <div>
            <div data-testid="user">{JSON.stringify(auth.user)}</div>
            <div data-testid="isAuthenticated">{auth.isAuthenticated.toString()}</div>
            <div data-testid="authChoice">{JSON.stringify(auth.authChoice)}</div>
            <div data-testid="authInfo">{JSON.stringify(auth.authInfo)}</div>
            <div data-testid="accessToken">{JSON.stringify(auth.accessToken)}</div>
        </div>
    );
};

const actions = [
    {testId: 'login', type: Login, data: 'testuser'},
    {testId: 'logout', type: Logout},
    {testId: 'setAccessToken', type: SetAccessToken, data: 'mock-token'},
    {testId: 'setAccessTokenNull', type: SetAccessToken, data: null},
    {testId: 'setAuthInfo', type: SetAuthInfo, data: {provider: 'openid'}},
    {testId: 'setAuthChoice', type: SetAuthChoice, data: 'sso'},
    {testId: 'setAuthChoiceOpenid', type: SetAuthChoice, data: 'openid'},
    {testId: 'unknownAction', type: 'UNKNOWN_ACTION', data: 'invalid'},
];

const TestDispatch = () => {
    const dispatch = useAuthDispatch();
    return (
        <div>
            {actions.map(({testId, type, data}) => (
                <button key={testId} data-testid={testId} onClick={() => dispatch({type, data})}>
                    {testId}
                </button>
            ))}
        </div>
    );
};

const ErrorTest = ({hook}) => {
    hook();
    return null;
};

// --- Helpers ---
let broadcastInstance;
beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    jest.useFakeTimers();
    tokenExpiredCallback = null;
    global.BroadcastChannel = class extends global.BroadcastChannel {
        constructor() {
            super();
            broadcastInstance = this;

        }
    };
    mockSigninSilent.mockReset();
    mockAddAccessTokenExpired.mockReset().mockImplementation(cb => {
        tokenExpiredCallback = cb;
    });
    mockRemoveAccessTokenExpired.mockReset().mockImplementation(cb => {
        if (cb === tokenExpiredCallback) tokenExpiredCallback = null;
    });
});

afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
});

const renderProvider = () =>
    render(
        <AuthProvider>
            <TestAuth/>
            <TestDispatch/>
        </AuthProvider>
    );

const click = (testId) => fireEvent.click(screen.getByTestId(testId));
const getText = (id) => screen.getByTestId(id).textContent;

// --- Tests ---
describe('AuthProvider', () => {
    test('initial state', () => {
        renderProvider();
        expect(getText('user')).toBe('null');
        expect(getText('isAuthenticated')).toBe('false');
        expect(getText('authChoice')).toBe('null');
        expect(getText('authInfo')).toBe('null');
        expect(getText('accessToken')).toBe('null');
    });

    test('renders children', () => {
        render(<AuthProvider>
            <div data-testid="child">Child</div>
        </AuthProvider>);
        expect(screen.getByTestId('child').textContent).toBe('Child');
    });

    test('useAuth and useAuthDispatch throw outside provider', () => {
        const spy = jest.spyOn(console, 'error').mockImplementation(() => {
        });
        expect(() => render(<ErrorTest hook={useAuth}/>)).toThrow('useAuth must be used within an AuthProvider');
        expect(() => render(<ErrorTest
            hook={useAuthDispatch}/>)).toThrow('useAuthDispatch must be used within an AuthProvider');
        spy.mockRestore();
    });

    describe('reducer actions', () => {
        test('handles all defined actions except unknown', () => {
            renderProvider();

            click('login');
            expect(getText('user')).toBe('"testuser"');
            expect(getText('isAuthenticated')).toBe('true');

            click('logout');
            expect(getText('user')).toBe('null');
            expect(getText('isAuthenticated')).toBe('false');
            expect(getText('accessToken')).toBe('null');

            click('setAccessToken');
            expect(getText('accessToken')).toBe('"mock-token"');
            expect(getText('isAuthenticated')).toBe('true');
            expect(updateEventSourceToken).toHaveBeenCalledWith('mock-token');

            click('setAuthInfo');
            expect(getText('authInfo')).toBe('{"provider":"openid"}');

            click('setAuthChoice');
            expect(getText('authChoice')).toBe('"sso"');
        });

        test('unknown action does not modify state', () => {
            renderProvider();
            // State should remain initial
            click('unknownAction');
            expect(getText('user')).toBe('null');
            expect(getText('isAuthenticated')).toBe('false');
            expect(getText('authChoice')).toBe('null');
            expect(getText('authInfo')).toBe('null');
            expect(getText('accessToken')).toBe('null');
        });

        test('SetAccessToken with null clears storage', () => {
            localStorage.setItem('authToken', 'old');
            localStorage.setItem('refreshToken', 'old-refresh');
            renderProvider();
            click('setAccessTokenNull');
            expect(localStorage.getItem('authToken')).toBeNull();
            expect(localStorage.getItem('refreshToken')).toBeNull();
            expect(getText('isAuthenticated')).toBe('false');
        });
    });

    describe('token refresh (non-OpenID)', () => {
        beforeEach(() => {
            // Default for most tests: valid token expiring in 60s
            decodeToken.mockReturnValue({exp: Math.floor(Date.now() / 1000) + 60});
            refreshToken.mockResolvedValue('new-token');
        });

        const setValidToken = () => click('setAccessToken');

        test('schedules refresh on valid token', async () => {
            renderProvider();
            setValidToken();
            expect(logger.info).toHaveBeenCalledWith('Token refresh scheduled in', expect.any(Number), 'seconds');
            expect(decodeToken).toHaveBeenCalledWith('mock-token');
            expect(updateEventSourceToken).toHaveBeenCalledWith('mock-token');

            await act(async () => {
                jest.runAllTimers();
                await Promise.resolve();
            });
            expect(refreshToken).toHaveBeenCalled();
        });

        test('broadcasts tokenUpdated on successful refresh', async () => {
            // Override decodeToken to expire in 10s so we can trigger with advanceTimersByTime
            decodeToken.mockReturnValue({exp: Math.floor(Date.now() / 1000) + 10});
            renderProvider();
            setValidToken();

            await act(async () => {
                jest.advanceTimersByTime(5100);
                await Promise.resolve();
            });
            expect(refreshToken).toHaveBeenCalled();
            expect(broadcastInstance._messages).toContainEqual({type: 'tokenUpdated', data: 'new-token'});
        });

        test('handles refresh error and broadcasts logout', async () => {
            refreshToken.mockRejectedValue(new Error('fail'));
            decodeToken.mockReturnValue({exp: Math.floor(Date.now() / 1000) + 10});
            renderProvider();
            setValidToken();
            expect(getText('accessToken')).toBe('"mock-token"');

            await act(async () => {
                jest.advanceTimersByTime(5100);
                await Promise.resolve();
            });
            await act(async () => {
                await Promise.resolve();
            });
            expect(logger.error).toHaveBeenCalledWith('Token refresh error:', expect.any(Error));
            expect(getText('accessToken')).toBe('null');
            expect(getText('isAuthenticated')).toBe('false');
            expect(broadcastInstance._messages).toContainEqual({type: 'logout'});
        });

        test('skips refresh when token updated by another tab', async () => {
            renderProvider();
            setValidToken();
            localStorage.setItem('authToken', 'different-token');
            await act(async () => {
                jest.runAllTimers();
                await Promise.resolve();
            });
            expect(logger.debug).toHaveBeenCalledWith('Refresh skipped, token already updated by another tab');
            expect(decodeToken).toHaveBeenCalledWith('different-token');
        });

        test('clears timeout on unmount', () => {
            const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
            const {unmount} = renderProvider();
            setValidToken();
            unmount();
            expect(clearTimeoutSpy).toHaveBeenCalled();
            clearTimeoutSpy.mockRestore();
        });

        test('does not schedule refresh for token with no exp field', () => {
            decodeToken.mockReturnValue({});
            renderProvider();
            setValidToken();
            expect(logger.info).not.toHaveBeenCalledWith('Token refresh scheduled in', expect.any(Number), 'seconds');
            expect(refreshToken).not.toHaveBeenCalled();
        });

        test('does not schedule refresh for expired token and logs out', () => {
            decodeToken.mockReturnValue({exp: Math.floor(Date.now() / 1000) - 10});
            renderProvider();
            setValidToken();
            expect(logger.warn).toHaveBeenCalledWith('Token already expired or too close to expiration, no refresh scheduled');
            expect(getText('isAuthenticated')).toBe('false');
            expect(refreshToken).not.toHaveBeenCalled();
        });

        test('does not schedule refresh when authChoice is openid', () => {
            renderProvider();
            click('setAuthChoiceOpenid');
            setValidToken();
            expect(logger.info).not.toHaveBeenCalledWith('Token refresh scheduled in', expect.any(Number), 'seconds');
            expect(refreshToken).not.toHaveBeenCalled();
        });

        test('does not schedule refresh for null token', () => {
            renderProvider();
            click('setAccessTokenNull');
            expect(logger.info).not.toHaveBeenCalledWith('Token refresh scheduled in', expect.any(Number), 'seconds');
        });
    });

    describe('BroadcastChannel', () => {
        test('does not initialize when undefined', () => {
            const orig = global.BroadcastChannel;
            delete global.BroadcastChannel;
            renderProvider();
            expect(logger.info).not.toHaveBeenCalled();
            global.BroadcastChannel = orig;
        });

        test('handles tokenUpdated message and schedules refresh', async () => {
            decodeToken.mockReturnValue({exp: Math.floor(Date.now() / 1000) + 60});
            renderProvider();
            click('setAccessToken');

            await act(async () => {
                broadcastInstance.onmessage({data: {type: 'tokenUpdated', data: 'updated-token'}});
            });
            expect(logger.info).toHaveBeenCalledWith('Token updated from another tab');
            expect(getText('accessToken')).toBe('"updated-token"');
            expect(decodeToken).toHaveBeenCalledWith('updated-token');
        });

        test('handles tokenUpdated with openid choice (no reschedule)', async () => {
            renderProvider();
            click('setAuthChoiceOpenid');
            await act(async () => {
                broadcastInstance.onmessage({data: {type: 'tokenUpdated', data: 'new-token'}});
            });
            expect(logger.info).toHaveBeenCalledWith('Token updated from another tab');
            expect(logger.info).not.toHaveBeenCalledWith('Token refresh scheduled in', expect.any(Number), 'seconds');
        });

        test('handles logout message', async () => {
            renderProvider();
            click('login');
            expect(getText('isAuthenticated')).toBe('true');
            await act(async () => {
                broadcastInstance.onmessage({data: {type: 'logout'}});
            });
            expect(logger.info).toHaveBeenCalledWith('Logout triggered from another tab');
            expect(getText('isAuthenticated')).toBe('false');
            expect(getText('accessToken')).toBe('null');
        });

        test.each([
            {data: undefined},
            {data: null},
        ])('ignores message with $data data', async ({data}) => {
            renderProvider();
            await act(async () => {
                broadcastInstance.onmessage({data});
            });
            expect(logger.info).not.toHaveBeenCalledWith('Token updated from another tab');
            expect(logger.info).not.toHaveBeenCalledWith('Logout triggered from another tab');
        });
    });

    describe('OpenID token refresh', () => {
        const setOpenid = () => click('setAuthChoiceOpenid');

        test('sets up and cleans up accessTokenExpired listener', async () => {
            const {unmount} = renderProvider();
            setOpenid();
            await waitFor(() => expect(mockAddAccessTokenExpired).toHaveBeenCalledWith(expect.any(Function)));
            unmount();
            expect(mockRemoveAccessTokenExpired).toHaveBeenCalledWith(expect.any(Function));
        });

        test('does not setup when userManager is null', async () => {
            const orig = window.oidcUserManager;
            window.oidcUserManager = null;
            renderProvider();
            setOpenid();
            await waitFor(() => expect(mockAddAccessTokenExpired).not.toHaveBeenCalled());
            window.oidcUserManager = orig;
        });

        test('handleTokenExpired success updates token and broadcasts', async () => {
            const mockUser = {access_token: 'oidc-token', expires_at: Math.floor(Date.now() / 1000) + 3600};
            mockSigninSilent.mockResolvedValue(mockUser);
            renderProvider();
            setOpenid();
            await waitFor(() => expect(mockAddAccessTokenExpired).toHaveBeenCalled());

            await act(async () => {
                tokenExpiredCallback();
            });
            expect(logger.warn).toHaveBeenCalledWith('OpenID token expired, attempting silent renew...');
            expect(mockSigninSilent).toHaveBeenCalled();
            await waitFor(() => expect(getText('accessToken')).toBe('"oidc-token"'));
            expect(localStorage.getItem('authToken')).toBe('oidc-token');
            expect(broadcastInstance._messages).toContainEqual({type: 'tokenUpdated', data: 'oidc-token'});
        });

        test('handleTokenExpired failure logs out and broadcasts', async () => {
            mockSigninSilent.mockRejectedValue(new Error('fail'));
            renderProvider();
            setOpenid();
            await waitFor(() => expect(mockAddAccessTokenExpired).toHaveBeenCalled());

            await act(async () => {
                tokenExpiredCallback();
            });
            expect(logger.warn).toHaveBeenCalledWith('OpenID token expired, attempting silent renew...');
            expect(logger.error).toHaveBeenCalledWith('Silent renew failed:', expect.any(Error));
            await waitFor(() => expect(getText('isAuthenticated')).toBe('false'));
            expect(broadcastInstance._messages).toContainEqual({type: 'logout'});
        });
    });
});
