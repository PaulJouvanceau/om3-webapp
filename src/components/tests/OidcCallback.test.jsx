import React from 'react';
import {render, screen, waitFor} from '@testing-library/react';
import {vi, describe, test, expect, beforeEach, afterEach} from 'vitest';
import OidcCallback from '../OidcCallback';

// ── Hoisted mock variables ────────────────────────────────────────────
const {
    mockNavigate,
    mockUseNavigate,
    mockAuthDispatch,
    mockUseAuthDispatch,
    mockRecreateUserManager,
    mockUseAuthInfo,
    mockUseOidc,
    mockOidcConfiguration,
    mockUserManager,
    mockBroadcastChannel,
} = vi.hoisted(() => {
    const mockNavigate = vi.fn();
    const mockUseNavigate = vi.fn(() => mockNavigate);
    const mockAuthDispatch = vi.fn();
    const mockUseAuthDispatch = vi.fn(() => mockAuthDispatch);
    const mockRecreateUserManager = vi.fn();
    const mockUseAuthInfo = vi.fn();
    const mockUseOidc = vi.fn();
    const mockOidcConfiguration = vi.fn();
    const mockUserManager = {
        signinRedirectCallback: vi.fn(),
        getUser: vi.fn(),
        events: {
            addUserLoaded: vi.fn(),
            addAccessTokenExpiring: vi.fn(),
            addAccessTokenExpired: vi.fn(),
            addSilentRenewError: vi.fn(),
            removeUserLoaded: vi.fn(),
            removeAccessTokenExpiring: vi.fn(),
            removeAccessTokenExpired: vi.fn(),
            removeSilentRenewError: vi.fn(),
        },
    };
    const mockBroadcastChannel = {
        postMessage: vi.fn(),
        close: vi.fn(),
        onmessage: null,
        addEventListener: vi.fn((event, handler) => {
            if (event === 'message') mockBroadcastChannel.onmessage = handler;
        }),
        removeEventListener: vi.fn(),
    };
    return {
        mockNavigate,
        mockUseNavigate,
        mockAuthDispatch,
        mockUseAuthDispatch,
        mockRecreateUserManager,
        mockUseAuthInfo,
        mockUseOidc,
        mockOidcConfiguration,
        mockUserManager,
        mockBroadcastChannel,
    };
});

// ── Mocks (all variables referenced are from hoisted) ─────────────────
vi.mock('react-router-dom', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        useNavigate: mockUseNavigate,
    };
});

vi.mock('../../context/AuthProvider.jsx', () => ({
    useAuthDispatch: mockUseAuthDispatch,
    SetAccessToken: 'SET_ACCESS_TOKEN',
    SetAuthChoice: 'SET_AUTH_CHOICE',
    Login: 'LOGIN',
}));

vi.mock('../../hooks/AuthInfo.jsx', () => ({
    default: mockUseAuthInfo,
}));

vi.mock('../../context/OidcAuthContext.tsx', () => ({
    useOidc: mockUseOidc,
}));

vi.mock('../../config/oidcConfiguration.js', () => ({
    default: mockOidcConfiguration,
}));

vi.mock('../../utils/logger.js', () => ({
    default: {
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

import logger from '../../utils/logger.js';

describe('OidcCallback Component', () => {
    const mockAuthInfo = {some: 'auth-info'};
    const mockUser = {
        access_token: 'mock-access-token',
        expires_at: 1234567890,
        profile: {preferred_username: 'testuser'},
        expired: false,
    };

    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();

        // Reset mock implementations (functions are already fresh after clearAllMocks)
        mockUseNavigate.mockReturnValue(mockNavigate);
        mockUseAuthDispatch.mockReturnValue(mockAuthDispatch);
        mockUseAuthInfo.mockReturnValue(null);
        mockUseOidc.mockReturnValue({
            userManager: null,
            recreateUserManager: mockRecreateUserManager,
        });
        mockOidcConfiguration.mockResolvedValue({some: 'config'});

        // Re-bind BroadcastChannel mock
        mockBroadcastChannel.onmessage = null;
        mockBroadcastChannel.addEventListener.mockImplementation((event, handler) => {
            if (event === 'message') mockBroadcastChannel.onmessage = handler;
        });
        global.BroadcastChannel = vi.fn(() => mockBroadcastChannel);
    });

    afterEach(() => {
        delete global.BroadcastChannel;
    });

    test('renders loading text', () => {
        render(<OidcCallback/>);
        expect(screen.getByText('Logging ...')).toBeInTheDocument();
    });

    test('calls recreateUserManager when authInfo exists and userManager is null', async () => {
        mockUseAuthInfo.mockReturnValue(mockAuthInfo);
        render(<OidcCallback/>);
        await waitFor(() => expect(mockRecreateUserManager).toHaveBeenCalled());
        expect(mockRecreateUserManager).toHaveBeenCalledWith({some: 'config'});
        expect(mockOidcConfiguration).toHaveBeenCalledWith(mockAuthInfo);
        expect(logger.info).toHaveBeenCalledWith('Initializing UserManager with authInfo');
    });

    test('does not call recreateUserManager when authInfo is null', async () => {
        render(<OidcCallback/>);
        await waitFor(() => expect(mockRecreateUserManager).not.toHaveBeenCalled());
        expect(mockOidcConfiguration).not.toHaveBeenCalled();
    });

    test('does not call recreateUserManager when userManager already exists', async () => {
        mockUseAuthInfo.mockReturnValue(mockAuthInfo);
        mockUseOidc.mockReturnValue({
            userManager: mockUserManager,
            recreateUserManager: mockRecreateUserManager,
        });
        mockUserManager.getUser.mockResolvedValue(mockUser);
        render(<OidcCallback/>);
        await waitFor(() => expect(mockRecreateUserManager).not.toHaveBeenCalled());
        expect(mockOidcConfiguration).not.toHaveBeenCalled();
    });

    test('handles oidcConfiguration error and navigates to auth-choice', async () => {
        mockUseAuthInfo.mockReturnValue(mockAuthInfo);
        const error = new Error('OIDC config failed');
        mockOidcConfiguration.mockRejectedValue(error);
        render(<OidcCallback/>);
        await waitFor(() => expect(mockOidcConfiguration).toHaveBeenCalled());
        expect(logger.error).toHaveBeenCalledWith('Failed to initialize OIDC config:', error);
        expect(mockNavigate).toHaveBeenCalledWith('/auth-choice');
    });

    test('calls signinRedirectCallback when getUser is not a function', async () => {
        mockUseOidc.mockReturnValue({
            userManager: {...mockUserManager, getUser: undefined},
            recreateUserManager: mockRecreateUserManager,
        });
        mockUserManager.signinRedirectCallback.mockResolvedValue(mockUser);
        render(<OidcCallback/>);
        await waitFor(() => expect(mockUserManager.signinRedirectCallback).toHaveBeenCalled());
        expect(logger.debug).toHaveBeenCalledWith('Handling OIDC callback or session check');
    });

    test('handles existing valid user from getUser', async () => {
        mockUseOidc.mockReturnValue({
            userManager: mockUserManager,
            recreateUserManager: mockRecreateUserManager,
        });
        mockUserManager.getUser.mockResolvedValue(mockUser);
        render(<OidcCallback/>);
        await waitFor(() => expect(mockUserManager.getUser).toHaveBeenCalled());
        expect(mockUserManager.signinRedirectCallback).not.toHaveBeenCalled();
        expect(mockAuthDispatch).toHaveBeenCalledWith({type: 'SET_ACCESS_TOKEN', data: mockUser.access_token});
        expect(mockNavigate).toHaveBeenCalledWith('/');
    });

    test('handles existing user with no expired property (treated as valid)', async () => {
        mockUseOidc.mockReturnValue({
            userManager: mockUserManager,
            recreateUserManager: mockRecreateUserManager,
        });
        const userWithoutExpired = {...mockUser, expired: undefined};
        mockUserManager.getUser.mockResolvedValue(userWithoutExpired);
        render(<OidcCallback/>);
        await waitFor(() => expect(mockUserManager.getUser).toHaveBeenCalled());
        expect(mockUserManager.signinRedirectCallback).not.toHaveBeenCalled();
        expect(mockAuthDispatch).toHaveBeenCalled();
    });

    test('handles expired user from getUser triggers signinRedirectCallback', async () => {
        mockUseOidc.mockReturnValue({
            userManager: mockUserManager,
            recreateUserManager: mockRecreateUserManager,
        });
        mockUserManager.getUser.mockResolvedValue({...mockUser, expired: true});
        mockUserManager.signinRedirectCallback.mockResolvedValue(mockUser);
        render(<OidcCallback/>);
        await waitFor(() => expect(mockUserManager.getUser).toHaveBeenCalled());
        await waitFor(() => expect(mockUserManager.signinRedirectCallback).toHaveBeenCalled());
    });

    test('handles getUser returning null → calls signinRedirectCallback', async () => {
        mockUseOidc.mockReturnValue({
            userManager: mockUserManager,
            recreateUserManager: mockRecreateUserManager,
        });
        mockUserManager.getUser.mockResolvedValue(null);
        mockUserManager.signinRedirectCallback.mockResolvedValue(mockUser);
        render(<OidcCallback/>);
        await waitFor(() => expect(mockUserManager.getUser).toHaveBeenCalled());
        await waitFor(() => expect(mockUserManager.signinRedirectCallback).toHaveBeenCalled());
    });

    test('handles getUser error → calls signinRedirectCallback', async () => {
        mockUseOidc.mockReturnValue({
            userManager: mockUserManager,
            recreateUserManager: mockRecreateUserManager,
        });
        const error = new Error('getUser failed');
        mockUserManager.getUser.mockRejectedValue(error);
        mockUserManager.signinRedirectCallback.mockResolvedValue(mockUser);
        render(<OidcCallback/>);
        await waitFor(() => expect(mockUserManager.getUser).toHaveBeenCalled());
        await waitFor(() => expect(mockUserManager.signinRedirectCallback).toHaveBeenCalled());
        expect(logger.error).toHaveBeenCalledWith('Failed to get user:', error);
    });

    test('successful signinRedirectCallback updates state and navigates', async () => {
        mockUseOidc.mockReturnValue({
            userManager: mockUserManager,
            recreateUserManager: mockRecreateUserManager,
        });
        mockUserManager.signinRedirectCallback.mockResolvedValue(mockUser);
        render(<OidcCallback/>);
        await waitFor(() => expect(mockUserManager.signinRedirectCallback).toHaveBeenCalled());
        expect(localStorage.getItem('authToken')).toBe('mock-access-token');
        expect(localStorage.getItem('tokenExpiration')).toBe('1234567890');
        expect(mockAuthDispatch).toHaveBeenCalledWith({type: 'SET_ACCESS_TOKEN', data: 'mock-access-token'});
        expect(mockAuthDispatch).toHaveBeenCalledWith({type: 'SET_AUTH_CHOICE', data: 'openid'});
        expect(mockAuthDispatch).toHaveBeenCalledWith({type: 'LOGIN', data: 'testuser'});
        expect(mockUserManager.events.addUserLoaded).toHaveBeenCalled();
        expect(mockUserManager.events.addAccessTokenExpiring).toHaveBeenCalled();
        expect(mockNavigate).toHaveBeenCalledWith('/');
        expect(mockBroadcastChannel.postMessage).toHaveBeenCalled();
    });

    test('failed signinRedirectCallback navigates to auth-choice', async () => {
        mockUseOidc.mockReturnValue({
            userManager: mockUserManager,
            recreateUserManager: mockRecreateUserManager,
        });
        const error = new Error('callback failed');
        mockUserManager.signinRedirectCallback.mockRejectedValue(error);
        render(<OidcCallback/>);
        await waitFor(() => expect(mockUserManager.signinRedirectCallback).toHaveBeenCalled());
        expect(mockNavigate).toHaveBeenCalledWith('/auth-choice');
        expect(logger.error).toHaveBeenCalledWith('signinRedirectCallback failed:', error);
    });

    test('adds event listeners only once', async () => {
        mockUseOidc.mockReturnValue({
            userManager: mockUserManager,
            recreateUserManager: mockRecreateUserManager,
        });
        mockUserManager.getUser.mockResolvedValue(mockUser);
        const {rerender} = render(<OidcCallback/>);
        await waitFor(() => expect(mockUserManager.events.addUserLoaded).toHaveBeenCalledTimes(1));
        rerender(<OidcCallback/>);
        expect(mockUserManager.events.addUserLoaded).toHaveBeenCalledTimes(1);
    });

    test('access token expired event triggers logout', async () => {
        mockUseOidc.mockReturnValue({
            userManager: mockUserManager,
            recreateUserManager: mockRecreateUserManager,
        });
        mockUserManager.getUser.mockResolvedValue(mockUser);
        render(<OidcCallback/>);
        await waitFor(() => expect(mockUserManager.events.addAccessTokenExpired).toHaveBeenCalled());
        const expiredHandler = mockUserManager.events.addAccessTokenExpired.mock.calls[0][0];
        expiredHandler();
        expect(logger.warn).toHaveBeenCalledWith('Access token expired, redirecting to /auth-choice');
        expect(localStorage.getItem('authToken')).toBeNull();
        expect(mockNavigate).toHaveBeenCalledWith('/auth-choice');
        expect(mockBroadcastChannel.postMessage).toHaveBeenCalledWith({type: 'logout'});
    });

    test('silent renew error event triggers logout', async () => {
        mockUseOidc.mockReturnValue({
            userManager: mockUserManager,
            recreateUserManager: mockRecreateUserManager,
        });
        mockUserManager.getUser.mockResolvedValue(mockUser);
        render(<OidcCallback/>);
        await waitFor(() => expect(mockUserManager.events.addSilentRenewError).toHaveBeenCalled());
        const errorHandler = mockUserManager.events.addSilentRenewError.mock.calls[0][0];
        const error = new Error('renew failed');
        errorHandler(error);
        expect(logger.error).toHaveBeenCalledWith('Silent renew failed:', error);
        expect(mockNavigate).toHaveBeenCalledWith('/auth-choice');
    });

    test('access token expiring logs debug message', async () => {
        mockUseOidc.mockReturnValue({
            userManager: mockUserManager,
            recreateUserManager: mockRecreateUserManager,
        });
        mockUserManager.getUser.mockResolvedValue(mockUser);
        render(<OidcCallback/>);
        await waitFor(() => expect(mockUserManager.events.addAccessTokenExpiring).toHaveBeenCalled());
        const expiringHandler = mockUserManager.events.addAccessTokenExpiring.mock.calls[0][0];
        expiringHandler();
        expect(logger.debug).toHaveBeenCalledWith('Access token is about to expire, attempting silent renew...');
    });

    test('BroadcastChannel tokenUpdated message updates token', async () => {
        mockUseOidc.mockReturnValue({
            userManager: mockUserManager,
            recreateUserManager: mockRecreateUserManager,
        });
        mockUserManager.getUser.mockResolvedValue(mockUser);
        render(<OidcCallback/>);
        await waitFor(() => expect(mockUserManager.getUser).toHaveBeenCalled());
        mockBroadcastChannel.onmessage({
            data: {type: 'tokenUpdated', data: 'new-token', expires_at: 9876543210},
        });
        expect(mockAuthDispatch).toHaveBeenCalledWith({type: 'SET_ACCESS_TOKEN', data: 'new-token'});
        expect(localStorage.getItem('authToken')).toBe('new-token');
        expect(localStorage.getItem('tokenExpiration')).toBe('9876543210');
        expect(logger.info).toHaveBeenCalledWith('Token updated from another tab');
    });

    test('BroadcastChannel logout message triggers logout', async () => {
        mockUseOidc.mockReturnValue({
            userManager: mockUserManager,
            recreateUserManager: mockRecreateUserManager,
        });
        mockUserManager.getUser.mockResolvedValue(mockUser);
        render(<OidcCallback/>);
        await waitFor(() => expect(mockUserManager.getUser).toHaveBeenCalled());
        mockBroadcastChannel.onmessage({data: {type: 'logout'}});
        expect(mockAuthDispatch).toHaveBeenCalledWith({type: 'SET_ACCESS_TOKEN', data: null});
        expect(localStorage.getItem('authToken')).toBeNull();
        expect(mockNavigate).toHaveBeenCalledWith('/auth-choice');
    });

    test('handles missing BroadcastChannel gracefully', async () => {
        delete global.BroadcastChannel;
        mockUseOidc.mockReturnValue({
            userManager: mockUserManager,
            recreateUserManager: mockRecreateUserManager,
        });
        mockUserManager.getUser.mockResolvedValue(mockUser);
        render(<OidcCallback/>);
        await waitFor(() => expect(mockUserManager.getUser).toHaveBeenCalled());
        expect(screen.getByText('Logging ...')).toBeInTheDocument();
    });

    test('onUserRefreshed works with null authDispatch', async () => {
        mockUseAuthDispatch.mockReturnValue(null);
        mockUseOidc.mockReturnValue({
            userManager: mockUserManager,
            recreateUserManager: mockRecreateUserManager,
        });
        mockUserManager.getUser.mockResolvedValue(mockUser);
        render(<OidcCallback/>);
        await waitFor(() => expect(mockUserManager.getUser).toHaveBeenCalled());
        expect(localStorage.getItem('authToken')).toBe('mock-access-token');
        expect(mockBroadcastChannel.postMessage).toHaveBeenCalled();
    });

    test('onUserRefreshed handles null profile', async () => {
        mockUseOidc.mockReturnValue({
            userManager: mockUserManager,
            recreateUserManager: mockRecreateUserManager,
        });
        const userNullProfile = {...mockUser, profile: null};
        mockUserManager.getUser.mockResolvedValue(userNullProfile);
        render(<OidcCallback/>);
        await waitFor(() => expect(mockUserManager.getUser).toHaveBeenCalled());
        expect(logger.info).toHaveBeenCalledWith('User refreshed:', undefined, 'expires_at:', 1234567890);
    });

    test('onUserRefreshed handles null expires_at', async () => {
        mockUseOidc.mockReturnValue({
            userManager: mockUserManager,
            recreateUserManager: mockRecreateUserManager,
        });
        const userNullExpires = {...mockUser, expires_at: null};
        mockUserManager.getUser.mockResolvedValue(userNullExpires);
        render(<OidcCallback/>);
        await waitFor(() => expect(mockUserManager.getUser).toHaveBeenCalled());
        expect(localStorage.getItem('tokenExpiration')).toBe('');
    });

    test('handleLogout with null authDispatch does not crash', async () => {
        mockUseAuthDispatch.mockReturnValue(null);
        mockUseOidc.mockReturnValue({
            userManager: mockUserManager,
            recreateUserManager: mockRecreateUserManager,
        });
        mockUserManager.getUser.mockResolvedValue(undefined);
        mockUserManager.signinRedirectCallback.mockResolvedValue(mockUser);
        render(<OidcCallback/>);
        await waitFor(() => expect(mockUserManager.signinRedirectCallback).toHaveBeenCalled());
        await waitFor(() => expect(mockUserManager.events.addAccessTokenExpired).toHaveBeenCalled());
        const expiredHandler = mockUserManager.events.addAccessTokenExpired.mock.calls[0][0];
        expiredHandler();
        expect(logger.warn).toHaveBeenCalled();
        expect(mockNavigate).toHaveBeenCalledWith('/auth-choice');
        expect(mockBroadcastChannel.postMessage).toHaveBeenCalledWith({type: 'logout'});
    });

    test('does not add event listeners when userManager is null', async () => {
        mockUseOidc.mockReturnValue({
            userManager: null,
            recreateUserManager: mockRecreateUserManager,
        });
        render(<OidcCallback/>);
        expect(mockUserManager.events.addUserLoaded).not.toHaveBeenCalled();
    });
});
