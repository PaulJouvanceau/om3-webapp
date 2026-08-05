import React from 'react';
import {render, screen, fireEvent, waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {ThemeProvider, createTheme} from '@mui/material/styles';
import AuthChoice from '../AuthChoice';
import {vi, describe, test, expect, beforeEach, afterEach} from 'vitest';

// ── Hoisted mock variables ──────────────────────────────────────────────
const {
    mockNavigate,
    mockUseNavigate,
    mockUseAuthInfo,
    mockUseOidc,
    mockOidcConfiguration,
    mockRecreateUserManager,
} = vi.hoisted(() => {
    const mockNavigate = vi.fn();
    const mockUseNavigate = vi.fn(() => mockNavigate);
    const mockUseAuthInfo = vi.fn();
    const mockUseOidc = vi.fn();
    const mockOidcConfiguration = vi.fn();
    const mockRecreateUserManager = vi.fn();
    return {
        mockNavigate,
        mockUseNavigate,
        mockUseAuthInfo,
        mockUseOidc,
        mockOidcConfiguration,
        mockRecreateUserManager,
    };
});

// ── Mocks ───────────────────────────────────────────────────────────────
vi.mock('react-router-dom', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        useNavigate: mockUseNavigate,
    };
});

vi.mock('../../hooks/AuthInfo', () => ({
    default: mockUseAuthInfo,
}));

vi.mock('../../context/OidcAuthContext', () => ({
    useOidc: mockUseOidc,
}));

vi.mock('../../config/oidcConfiguration', () => ({
    default: mockOidcConfiguration,
}));

describe('AuthChoice Component', () => {
    const theme = createTheme();

    beforeEach(() => {
        vi.clearAllMocks();

        // Mock console methods
        vi.spyOn(console, 'log').mockImplementation(() => {
        });
        vi.spyOn(console, 'error').mockImplementation(() => {
        });
        vi.spyOn(console, 'info').mockImplementation(() => {
        });

        // Default mock returns
        mockUseOidc.mockReturnValue({
            userManager: null,
            recreateUserManager: mockRecreateUserManager,
        });
        mockUseAuthInfo.mockReturnValue(null);
        mockOidcConfiguration.mockReturnValue({
            issuer: 'mock-issuer',
            client_id: 'mock-client',
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    const renderComponent = () => {
        return render(
            <MemoryRouter>
                <ThemeProvider theme={theme}>
                    <AuthChoice/>
                </ThemeProvider>
            </MemoryRouter>
        );
    };

    test('renders dialog with title and description', () => {
        renderComponent();
        expect(screen.getByText('Authentication Methods')).toBeInTheDocument();
        expect(screen.getByText('Please select one of the authentication methods the cluster advertises.')).toBeInTheDocument();
        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    test('renders no buttons when authInfo is null', () => {
        mockUseAuthInfo.mockReturnValue(null);
        renderComponent();
        expect(screen.queryByText('OpenID')).not.toBeInTheDocument();
        expect(screen.queryByText('Login')).not.toBeInTheDocument();
    });

    test('renders OpenID button when openid.issuer is defined', () => {
        mockUseAuthInfo.mockReturnValue({
            openid: {issuer: 'https://auth.example.com'},
            methods: [],
        });
        renderComponent();
        expect(screen.getByText('OpenID')).toBeInTheDocument();
        expect(screen.queryByText('Login')).not.toBeInTheDocument();
    });

    test('renders Login button when methods includes basic', () => {
        mockUseAuthInfo.mockReturnValue({
            openid: null,
            methods: ['basic'],
        });
        renderComponent();
        expect(screen.queryByText('OpenID')).not.toBeInTheDocument();
        expect(screen.getByText('Login')).toBeInTheDocument();
    });

    test('renders both buttons when both methods are available', () => {
        mockUseAuthInfo.mockReturnValue({
            openid: {issuer: 'https://auth.example.com'},
            methods: ['basic'],
        });
        renderComponent();
        expect(screen.getByText('OpenID')).toBeInTheDocument();
        expect(screen.getByText('Login')).toBeInTheDocument();
    });

    test('clicking OpenID button calls signinRedirect when userManager exists', () => {
        const mockSigninRedirect = vi.fn();
        const mockUserManager = {signinRedirect: mockSigninRedirect};

        mockUseAuthInfo.mockReturnValue({
            openid: {issuer: 'https://auth.example.com'},
            methods: [],
        });
        mockUseOidc.mockReturnValue({
            userManager: mockUserManager,
            recreateUserManager: mockRecreateUserManager,
        });

        renderComponent();
        fireEvent.click(screen.getByText('OpenID'));

        expect(mockSigninRedirect).toHaveBeenCalled();
        expect(console.log).not.toHaveBeenCalled();
    });

    test('clicking OpenID button logs message when userManager is null', () => {
        mockUseAuthInfo.mockReturnValue({
            openid: {issuer: 'https://auth.example.com'},
            methods: [],
        });
        mockUseOidc.mockReturnValue({
            userManager: null,
            recreateUserManager: mockRecreateUserManager,
        });

        renderComponent();
        fireEvent.click(screen.getByText('OpenID'));

        expect(console.info).toHaveBeenCalledWith(
            "handleAuthChoice openid skipped: can't create userManager"
        );
    });

    test('clicking Login button navigates to /auth/login', () => {
        mockUseAuthInfo.mockReturnValue({
            openid: null,
            methods: ['basic'],
        });

        renderComponent();
        fireEvent.click(screen.getByText('Login'));

        expect(mockNavigate).toHaveBeenCalledWith('/auth/login');
    });

    test('useEffect calls recreateUserManager when authInfo.openid.issuer exists and userManager is null', async () => {
        mockUseAuthInfo.mockReturnValue({
            openid: {issuer: 'https://auth.example.com'},
            methods: [],
        });
        mockUseOidc.mockReturnValue({
            userManager: null,
            recreateUserManager: mockRecreateUserManager,
        });

        renderComponent();

        await waitFor(() => {
            expect(mockOidcConfiguration).toHaveBeenCalledWith({
                openid: {issuer: 'https://auth.example.com'},
                methods: [],
            });
        });

        await waitFor(() => {
            expect(mockRecreateUserManager).toHaveBeenCalledWith({
                issuer: 'mock-issuer',
                client_id: 'mock-client',
            });
        });
    });

    test('useEffect does not call recreateUserManager when userManager exists', () => {
        const mockSigninRedirect = vi.fn();
        const mockUserManager = {signinRedirect: mockSigninRedirect};

        mockUseAuthInfo.mockReturnValue({
            openid: {issuer: 'https://auth.example.com'},
            methods: [],
        });
        mockUseOidc.mockReturnValue({
            userManager: mockUserManager,
            recreateUserManager: mockRecreateUserManager,
        });

        renderComponent();

        expect(mockRecreateUserManager).not.toHaveBeenCalled();
    });

    test('useEffect does not call recreateUserManager when authInfo.openid.issuer is undefined', () => {
        mockUseAuthInfo.mockReturnValue({
            openid: null,
            methods: ['basic'],
        });
        mockUseOidc.mockReturnValue({
            userManager: null,
            recreateUserManager: mockRecreateUserManager,
        });

        renderComponent();

        expect(mockRecreateUserManager).not.toHaveBeenCalled();
    });

    test('handles signinRedirect error', async () => {
        const mockSigninRedirect = vi.fn(() => Promise.reject(new Error('Signin failed')));
        const mockUserManager = {signinRedirect: mockSigninRedirect};

        mockUseAuthInfo.mockReturnValue({
            openid: {issuer: 'https://auth.example.com'},
            methods: [],
        });
        mockUseOidc.mockReturnValue({
            userManager: mockUserManager,
            recreateUserManager: mockRecreateUserManager,
        });

        renderComponent();

        fireEvent.click(screen.getByText('OpenID'));

        await waitFor(() => {
            expect(mockSigninRedirect).toHaveBeenCalled();
        });

        await waitFor(() => {
            expect(console.error).toHaveBeenCalledWith('handleAuthChoice signinRedirect:', expect.any(Error));
            expect(console.error.mock.calls[0][1].message).toBe('Signin failed');
        });
    });
});
