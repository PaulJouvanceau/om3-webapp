import React from 'react';
import {render, screen, waitFor, act, within, fireEvent} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import KeysSection from '../KeysSection';

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('../../hooks/useEventStore.js', () => jest.fn());
jest.mock('../../eventSourceManager.jsx', () => ({
    closeEventSource: jest.fn(),
    startEventReception: jest.fn(),
    configureEventSource: jest.fn(),
}));

jest.mock('@mui/material', () => {
    const mockReact = require('react');
    const actual = jest.requireActual('@mui/material');
    return {
        ...actual,
        Button: ({children, onClick, disabled, variant, component, htmlFor, ...props}) => (
            <button onClick={onClick} disabled={disabled} data-variant={variant}
                    {...(component === 'label' ? {htmlFor} : {})} {...props}>
                {children}
            </button>
        ),
        CircularProgress: () => <div role="progressbar">Loading...</div>,
        Typography: ({children, ...props}) => <span {...props}>{children}</span>,
        Dialog: ({children, open, maxWidth, fullWidth, fullScreen, onClose, ...props}) =>
            open ? (
                <div role="dialog" data-fullscreen={fullScreen ? 'true' : 'false'}
                     onKeyDown={(e) => {
                         if (e.key === 'Escape') onClose();
                     }} {...props}>
                    {children}
                </div>
            ) : null,
        DialogTitle: ({children, ...props}) => <div {...props}>{children}</div>,
        DialogContent: ({children, ...props}) => <div {...props}>{children}</div>,
        DialogActions: ({children, ...props}) => <div {...props}>{children}</div>,
        Snackbar: ({children, open, ...props}) => open ? <div role="alertdialog" {...props}>{children}</div> : null,
        Alert: ({children, severity, ...props}) => <div role="alert"
                                                        data-severity={severity} {...props}>{children}</div>,
        TextField: ({label, value, onChange, disabled, multiline, rows, ...props}) => (
            <input type="text" placeholder={label} value={value} onChange={onChange} disabled={disabled}
                   {...(multiline ? {'data-multiline': true, rows} : {})} {...props}/>
        ),
        Box: ({children, component, ...props}) => <div {...props}>{children}</div>,
        Tooltip: ({children, title, ...props}) => <div data-tooltip={title} {...props}>{children}</div>,
        IconButton: ({children, onClick, disabled, 'aria-label': ariaLabel, ...props}) => (
            <button onClick={onClick} disabled={disabled} aria-label={ariaLabel} {...props}>{children}</button>
        ),
        TableContainer: ({children, component, ...props}) => <div {...props}>{children}</div>,
        Table: ({children, 'aria-label': ariaLabel, ...props}) => (
            <table aria-label={ariaLabel} {...props}>{children}</table>
        ),
        TableHead: ({children, ...props}) => <thead {...props}>{children}</thead>,
        TableBody: ({children, ...props}) => <tbody {...props}>{children}</tbody>,
        TableRow: ({children, ...props}) => <tr {...props}>{children}</tr>,
        TableCell: ({children, component, scope, sx, ...props}) => <td {...props}>{children}</td>,
        Paper: ({children, sx, ...props}) => <div {...props}>{children}</div>,
        FormControl: ({children, ...props}) => <div {...props}>{children}</div>,
        FormLabel: ({children, ...props}) => <label {...props}>{children}</label>,
        RadioGroup: ({children, value, onChange, ...props}) => (
            <div role="radiogroup" data-value={value} {...props}>
                {mockReact.Children.map(children, child => mockReact.cloneElement(child, {onChange}))}
            </div>
        ),
        FormControlLabel: ({value, control, label, disabled, onChange, ...props}) => (
            <label {...props}>
                <input type="radio" value={value} disabled={disabled}
                       onChange={(e) => onChange?.(e)} data-label={label}/>
                {label}
            </label>
        ),
        Radio: () => null,
    };
});

jest.mock('@mui/icons-material/UploadFile', () => () => <span/>);
jest.mock('@mui/icons-material/Edit', () => () => <span/>);
jest.mock('@mui/icons-material/Delete', () => () => <span/>);
jest.mock('@mui/icons-material/Add', () => () => <span/>);
jest.mock('@mui/icons-material/Fullscreen', () => () => <span data-testid="fullscreen-icon"/>);
jest.mock('@mui/icons-material/FullscreenExit', () => () => <span data-testid="fullscreen-exit-icon"/>);
jest.mock('@mui/icons-material/Visibility', () => () => <span/>);

// ─── localStorage mock ────────────────────────────────────────────────────────

const mockLocalStorage = {
    getItem: jest.fn(() => 'mock-token'),
    setItem: jest.fn(),
    removeItem: jest.fn(),
};
Object.defineProperty(global, 'localStorage', {value: mockLocalStorage});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const encodeText = (text) => new TextEncoder().encode(text);

const makeMockBlob = (uint8Array) => {
    const ab = uint8Array.buffer.slice(uint8Array.byteOffset, uint8Array.byteOffset + uint8Array.byteLength);
    return {
        arrayBuffer: () => Promise.resolve(ab),
        size: uint8Array.byteLength,
        type: 'application/octet-stream',
    };
};

/** Build a fetch mock that handles /data/keys and /data/key routes. */
const buildFetchMock = ({
                            keysItems = [{name: 'key1', node: 'node1', size: 2626}],
                            keyBlob = null,
                            methodOverrides = {},  // { POST: fn, PUT: fn, DELETE: fn }
                        } = {}) => jest.fn((url, options = {}) => {
    const method = options.method || 'GET';

    if (methodOverrides[method]) {
        const override = methodOverrides[method](url, options);
        if (override !== undefined) return override;
    }

    if (url.includes('/data/keys')) {
        return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({items: keysItems}),
        });
    }
    if (url.includes('/data/key')) {
        const blob = keyBlob ?? makeMockBlob(encodeText('hello world'));
        return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({}),
            text: () => Promise.resolve(''),
            blob: () => Promise.resolve(blob),
        });
    }
    return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve('')});
});

/** Render component and wait for keys count to appear. */
const renderAndWait = async (objectName, expectedCount, openSnackbar) => {
    render(<KeysSection decodedObjectName={objectName} openSnackbar={openSnackbar}/>);
    if (expectedCount !== null) {
        await waitFor(() => {
            expect(screen.getByText((c) => new RegExp(`Object Keys \\(${expectedCount}\\)`, 'i').test(c))).toBeInTheDocument();
        }, {timeout: 15000});
    }
};

/** Open the create-key dialog. */
const openCreateDialog = async (user) => {
    const addButton = screen.getByRole('button', {name: /add new key/i});
    await act(async () => {
        await user.click(addButton);
    });
    return screen.findByRole('dialog');
};

/** Open the edit dialog for a given key name. */
const openEditDialog = async (user, keyName) => {
    const buttons = await screen.findAllByRole('button', {name: new RegExp(`Edit key ${keyName}`, 'i')});
    await act(async () => {
        await user.click(buttons[0]);
    });
    return screen.findByRole('dialog');
};

/** Open the delete dialog for a given key name. */
const openDeleteDialog = async (user, keyName) => {
    const buttons = await screen.findAllByRole('button', {name: new RegExp(`Delete key ${keyName}`, 'i')});
    await act(async () => {
        await user.click(buttons[0]);
    });
    return screen.findByRole('dialog');
};

/** Select an input mode radio button inside a dialog. */
const selectInputMode = async (user, dialog, mode) => {
    const radioGroup = within(dialog).getByRole('radiogroup');
    const radioButton = within(radioGroup).getByDisplayValue(mode);
    await act(async () => {
        await user.click(radioButton);
    });
};

/** Find the hidden file input inside a dialog. */
const findFileInput = (dialog, type = 'create') => {
    const inputId = type === 'create' ? 'create-key-file-upload' : 'update-key-file-upload';
    return within(dialog).queryByTestId(inputId)
        ?? within(dialog).queryAllByDisplayValue('').find(i => i.type === 'file')
        ?? null;
};

/** Upload a file inside a dialog. Always switches to file mode first. */
const uploadFile = async (user, dialog, type = 'create') => {
    await selectInputMode(user, dialog, 'file');
    let fileInput;
    await waitFor(() => {
        fileInput = findFileInput(dialog, type);
        expect(fileInput).toBeTruthy();
    });
    await user.upload(fileInput, new File(['test content'], 'test.txt', {type: 'text/plain'}));
    return fileInput;
};

const getFullscreenButton = (dialog) => within(dialog).getByTestId('fullscreen-icon').closest('button');
const getExitFullscreenButton = (dialog) => within(dialog).getByTestId('fullscreen-exit-icon').closest('button');

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('KeysSection Component', () => {
    const user = userEvent.setup();
    const openSnackbar = jest.fn();

    beforeEach(() => {
        jest.setTimeout(30000);
        jest.clearAllMocks();
        mockLocalStorage.getItem.mockReturnValue('mock-token');
        global.fetch = buildFetchMock({
            keysItems: [
                {name: 'key1', node: 'node1', size: 2626},
                {name: 'key2', node: 'node1', size: 6946},
            ],
        });
    });

    afterEach(() => {
        jest.resetAllMocks();
    });

    // ── Rendering / display ──────────────────────────────────────────────────

    test('does not render when kind is not cfg or sec', async () => {
        render(<KeysSection decodedObjectName="root/svc/service1" openSnackbar={openSnackbar}/>);
        await waitFor(() => {
            expect(screen.queryByText(/Object Keys/i)).not.toBeInTheDocument();
        });
    });

    test.each([
        ['null objectName', null],
        ['single-part objectName', 'cluster'],
    ])('does not render for invalid path: %s', async (_label, objectName) => {
        render(<KeysSection decodedObjectName={objectName} openSnackbar={openSnackbar}/>);
        await waitFor(() => {
            expect(screen.queryByText(/Object Keys/i)).not.toBeInTheDocument();
        });
    });

    test('handles invalid kind (not cfg/sec/svc)', async () => {
        render(<KeysSection decodedObjectName="root/invalid/test" openSnackbar={openSnackbar}/>);
        await waitFor(() => {
            expect(screen.queryByText(/Object Keys/i)).not.toBeInTheDocument();
        });
    });

    test('displays keys count and table content', async () => {
        await renderAndWait('root/cfg/cfg1', 2, openSnackbar);

        expect(screen.getByText('key1')).toBeInTheDocument();
        expect(screen.getByText('key2')).toBeInTheDocument();
        expect(screen.getByText('2626 bytes')).toBeInTheDocument();
        expect(screen.getByText('6946 bytes')).toBeInTheDocument();
        const node1Elements = screen.getAllByText('node1');
        expect(node1Elements).toHaveLength(2);
        node1Elements.forEach(el => expect(el.tagName.toLowerCase()).toBe('td'));
    });

    test('displays all expected column headers', async () => {
        await renderAndWait('root/cfg/cfg1', 2, openSnackbar);
        ['Name', 'Node', 'Size', 'Actions'].forEach(h => expect(screen.getByText(h)).toBeInTheDocument());
    });

    test('displays "No keys available" when keys array is empty', async () => {
        global.fetch = buildFetchMock({keysItems: []});
        await renderAndWait('root/cfg/cfg1', 0, openSnackbar);
        await waitFor(() => {
            expect(screen.getByText(/No keys available/i)).toBeInTheDocument();
        });
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    test('displays "No keys available" when response has no items field', async () => {
        global.fetch = jest.fn((url) => url.includes('/data/keys')
            ? Promise.resolve({ok: true, json: () => Promise.resolve({})})
            : Promise.resolve({ok: true, json: () => Promise.resolve({})}));
        await renderAndWait('root/cfg/cfg1', 0, openSnackbar);
        await waitFor(() => {
            expect(screen.getByText(/No keys available/i)).toBeInTheDocument();
        });
    });

    test('displays "No keys available" for non-array items', async () => {
        global.fetch = buildFetchMock({keysItems: 'not an array'});
        await renderAndWait('root/cfg/cfg1', 0, openSnackbar);
        await waitFor(() => {
            expect(screen.getByText(/No keys available/i)).toBeInTheDocument();
        });
    });

    test('handles sec object type', async () => {
        global.fetch = buildFetchMock({keysItems: [{name: 'secret1', node: 'node1', size: 1024}]});
        await renderAndWait('root/sec/secret1', 1, openSnackbar);
        await waitFor(() => {
            expect(screen.getByText('secret1')).toBeInTheDocument();
        });
    });

    test('supports two-part path (cfg/cfg1)', async () => {
        global.fetch = buildFetchMock({keysItems: []});
        await renderAndWait('cfg/cfg1', 0, openSnackbar);
        await waitFor(() => {
            expect(screen.getByText(/No keys available/i)).toBeInTheDocument();
        });
    });

    test('shows loading indicator while fetching', async () => {
        global.fetch = jest.fn(() => new Promise(() => {
        }));
        render(<KeysSection decodedObjectName="root/cfg/cfg1" openSnackbar={openSnackbar}/>);
        await waitFor(() => {
            expect(screen.getByRole('progressbar')).toBeInTheDocument();
        });
    });

    test('does not fetch keys when no auth token on mount', async () => {
        mockLocalStorage.getItem.mockReturnValue(null);
        await renderAndWait('root/cfg/cfg1', 0, openSnackbar);
        expect(global.fetch).not.toHaveBeenCalledWith(expect.stringContaining('/data/keys'));
    });

    test('add new key button is rendered, accessible, and has tooltip', async () => {
        global.fetch = buildFetchMock({keysItems: []});
        await renderAndWait('root/cfg/cfg1', 0, openSnackbar);
        const addButton = screen.getByRole('button', {name: /add new key/i});
        expect(addButton).toBeInTheDocument();
        expect(addButton).not.toBeDisabled();
        expect(addButton.closest('[data-tooltip]')).toHaveAttribute('data-tooltip', 'Add new key');
    });

    // ── Fetch errors ─────────────────────────────────────────────────────────

    test('displays error when fetch rejects', async () => {
        global.fetch = jest.fn(() => Promise.reject(new Error('Failed to fetch keys')));
        await renderAndWait('root/cfg/cfg1', 0, openSnackbar);
        await waitFor(() => {
            expect(screen.getByText(/Failed to fetch keys/i)).toBeInTheDocument();
        });
    });

    test('displays error when fetch returns not-ok', async () => {
        global.fetch = jest.fn(() => Promise.resolve({ok: false, status: 500}));
        await renderAndWait('root/cfg/cfg1', 0, openSnackbar);
        await waitFor(() => {
            expect(screen.getByText(/Failed to fetch keys: 500/i)).toBeInTheDocument();
        });
    });

    // ── Auth-token guards ────────────────────────────────────────────────────

    test.each([
        ['create', async (u, snackbar) => {
            mockLocalStorage.getItem.mockReturnValue(null);
            global.fetch = buildFetchMock({keysItems: []});
            await renderAndWait('root/cfg/cfg1', 0, snackbar);
            const dialog = await openCreateDialog(u);
            const nameInput = within(dialog).getByPlaceholderText('Key Name');
            await act(async () => {
                await u.type(nameInput, 'newKey');
                await uploadFile(u, dialog, 'create');
            });
            await act(async () => {
                await u.click(within(dialog).getByRole('button', {name: /Create/i}));
            });
        }],
        ['update', async (u, snackbar) => {
            global.fetch = buildFetchMock({keysItems: [{name: 'key1', node: 'node1', size: 2626}]});
            await renderAndWait('root/cfg/cfg1', 1, snackbar);
            const dialog = await openEditDialog(u, 'key1');
            const nameInput = within(dialog).getByPlaceholderText('Key Name');
            await act(async () => {
                await u.clear(nameInput);
                await u.type(nameInput, 'updatedKey');
                await uploadFile(u, dialog, 'update');
            });
            mockLocalStorage.getItem.mockReturnValue(null);
            await act(async () => {
                await u.click(within(dialog).getByRole('button', {name: /Update/i}));
            });
        }],
        ['delete', async (u, snackbar) => {
            global.fetch = buildFetchMock({keysItems: [{name: 'key1', node: 'node1', size: 2626}]});
            await renderAndWait('root/cfg/cfg1', 1, snackbar);
            const dialog = await openDeleteDialog(u, 'key1');
            mockLocalStorage.getItem.mockReturnValue(null);
            await act(async () => {
                await u.click(within(dialog).getByRole('button', {name: /Delete/i}));
            });
        }],
        ['view', async (u, snackbar) => {
            global.fetch = buildFetchMock({keysItems: [{name: 'key1', node: 'node1', size: 100}]});
            await renderAndWait('root/cfg/cfg1', 1, snackbar);
            mockLocalStorage.getItem.mockReturnValue(null);
            const viewButton = await screen.findByRole('button', {name: /View key key1/i});
            await act(async () => {
                await u.click(viewButton);
            });
        }],
        ['fetchKeyContent for edit', async (u, snackbar) => {
            global.fetch = buildFetchMock({keysItems: [{name: 'key1', node: 'node1', size: 100}]});
            await renderAndWait('root/cfg/cfg1', 1, snackbar);
            mockLocalStorage.getItem.mockReturnValue(null);
            const editButton = await screen.findByRole('button', {name: /Edit key key1/i});
            await act(async () => {
                await u.click(editButton);
            });
        }],
    ])('shows "Auth token not found" error for %s', async (_label, setup) => {
        await setup(user, openSnackbar);
        await waitFor(() => {
            expect(openSnackbar).toHaveBeenCalledWith('Auth token not found.', 'error');
        });
    });

    // ── CRUD success ─────────────────────────────────────────────────────────

    test('handles key creation', async () => {
        await renderAndWait('root/cfg/cfg1', 2, openSnackbar);
        const dialog = await openCreateDialog(user);
        expect(dialog).toHaveTextContent(/Create New Key/i);

        await selectInputMode(user, dialog, 'file');
        const fileInput = await waitFor(() => {
            const fi = findFileInput(dialog, 'create');
            expect(fi).toBeTruthy();
            return fi;
        });

        await act(async () => {
            await user.type(within(dialog).getByPlaceholderText('Key Name'), 'newKey');
            await user.upload(fileInput, new File(['content'], 'test.txt'));
        });
        await act(async () => {
            await user.click(within(dialog).getByRole('button', {name: /Create/i}));
        });

        await waitFor(() => {
            expect(openSnackbar).toHaveBeenCalledWith('Creating key newKey…', 'info');
        });
        await waitFor(() => {
            expect(openSnackbar).toHaveBeenCalledWith("Key 'newKey' created successfully");
        });
    });

    test('handles key update', async () => {
        global.fetch = buildFetchMock({keysItems: [{name: 'key1', node: 'node1', size: 2626}]});
        await renderAndWait('root/cfg/cfg1', 1, openSnackbar);
        const dialog = await openEditDialog(user, 'key1');
        expect(dialog).toHaveTextContent(/Update Key/i);

        const nameInput = within(dialog).getByPlaceholderText('Key Name');
        await act(async () => {
            await user.clear(nameInput);
            await user.type(nameInput, 'updatedKey');
            await uploadFile(user, dialog, 'update');
        });
        await act(async () => {
            await user.click(within(dialog).getByRole('button', {name: /Update/i}));
        });

        await waitFor(() => {
            expect(openSnackbar).toHaveBeenCalledWith('Updating key updatedKey…', 'info');
        });
        await waitFor(() => {
            expect(openSnackbar).toHaveBeenCalledWith("Key 'updatedKey' updated successfully");
        });
    });

    test('handles key deletion', async () => {
        await renderAndWait('root/cfg/cfg1', 2, openSnackbar);
        const dialog = await openDeleteDialog(user, 'key1');
        expect(dialog).toHaveTextContent(/Confirm Key Deletion/i);
        expect(dialog).toHaveTextContent(/key1/);

        await act(async () => {
            await user.click(within(dialog).getByRole('button', {name: /Delete/i}));
        });

        await waitFor(() => {
            expect(openSnackbar).toHaveBeenCalledWith('Deleting key key1…', 'info');
        });
        await waitFor(() => {
            expect(openSnackbar).toHaveBeenCalledWith("Key 'key1' deleted successfully");
        });
    });

    test('create key with text mode does not require file', async () => {
        global.fetch = buildFetchMock({keysItems: [], methodOverrides: {POST: () => Promise.resolve({ok: true})}});
        await renderAndWait('root/cfg/cfg1', 0, openSnackbar);
        const dialog = await openCreateDialog(user);
        await selectInputMode(user, dialog, 'text');
        await act(async () => {
            await user.type(within(dialog).getByPlaceholderText('Key Name'), 'myTextKey');
        });
        await act(async () => {
            await user.click(within(dialog).getByRole('button', {name: /Create/i}));
        });

        await waitFor(() => {
            expect(openSnackbar).toHaveBeenCalledWith('Creating key myTextKey…', 'info');
        });
        await waitFor(() => {
            expect(openSnackbar).toHaveBeenCalledWith("Key 'myTextKey' created successfully");
        });
    });

    test('creates key with empty content mode', async () => {
        global.fetch = buildFetchMock({keysItems: [], methodOverrides: {POST: () => Promise.resolve({ok: true})}});
        await renderAndWait('root/cfg/cfg1', 0, openSnackbar);
        const dialog = await openCreateDialog(user);
        await act(async () => {
            await user.type(within(dialog).getByPlaceholderText('Key Name'), 'emptyKey');
        });
        await selectInputMode(user, dialog, 'empty');

        const createButton = within(dialog).getByRole('button', {name: /Create/i});
        expect(createButton).not.toBeDisabled();
        await act(async () => {
            await user.click(createButton);
        });

        await waitFor(() => {
            expect(openSnackbar).toHaveBeenCalledWith('Creating key emptyKey…', 'info');
        });
        await waitFor(() => {
            expect(openSnackbar).toHaveBeenCalledWith("Key 'emptyKey' created successfully");
        });
    });

    test('handles key update with empty text content', async () => {
        global.fetch = buildFetchMock({keysItems: [{name: 'key1', node: 'node1', size: 100}]});
        await renderAndWait('root/cfg/cfg1', 1, openSnackbar);
        const dialog = await openEditDialog(user, 'key1');
        await selectInputMode(user, dialog, 'text');
        await act(async () => {
            await user.click(within(dialog).getByRole('button', {name: /Update/i}));
        });

        await waitFor(() => {
            expect(openSnackbar).toHaveBeenCalledWith('Updating key key1…', 'info');
        });
        await waitFor(() => {
            expect(openSnackbar).toHaveBeenCalledWith("Key 'key1' updated successfully");
        });
    });

    // ── Validation / disabled states ─────────────────────────────────────────

    test('prevents key creation without name and file (button disabled)', async () => {
        global.fetch = buildFetchMock({keysItems: []});
        await renderAndWait('root/cfg/cfg1', 0, openSnackbar);
        const dialog = await openCreateDialog(user);
        await selectInputMode(user, dialog, 'file');
        const createButton = within(dialog).getByRole('button', {name: /Create/i});
        expect(createButton).toBeDisabled();
        await act(async () => {
            await user.click(createButton);
        });
        expect(openSnackbar).not.toHaveBeenCalled();
    });

    test('prevents key creation with name but no file (button disabled)', async () => {
        global.fetch = buildFetchMock({keysItems: []});
        await renderAndWait('root/cfg/cfg1', 0, openSnackbar);
        const dialog = await openCreateDialog(user);
        await selectInputMode(user, dialog, 'file');
        await act(async () => {
            await user.type(within(dialog).getByPlaceholderText('Key Name'), 'newKey');
        });
        const createButton = within(dialog).getByRole('button', {name: /Create/i});
        expect(createButton).toBeDisabled();
        await act(async () => {
            await user.click(createButton);
        });
        expect(openSnackbar).not.toHaveBeenCalled();
    });

    test('prevents key update without name (button disabled)', async () => {
        global.fetch = buildFetchMock({
            keysItems: [{name: 'key1', node: 'node1', size: 2626}],
            keyBlob: makeMockBlob(encodeText('dummy content')),
        });
        await renderAndWait('root/cfg/cfg1', 1, openSnackbar);
        const dialog = await openEditDialog(user, 'key1');
        await act(async () => {
            await user.clear(within(dialog).getByPlaceholderText('Key Name'));
        });
        const updateButton = within(dialog).getByRole('button', {name: /Update/i});
        expect(updateButton).toBeDisabled();
        await act(async () => {
            await user.click(updateButton);
        });
        expect(openSnackbar).not.toHaveBeenCalled();
    });

    test('disables buttons during key creation', async () => {
        global.fetch = buildFetchMock({
            keysItems: [{name: 'key1', node: 'node1', size: 2626}, {name: 'key2', node: 'node1', size: 6946}],
            methodOverrides: {
                POST: () => new Promise(() => {
                })
            },
        });
        await renderAndWait('root/cfg/cfg1', 2, openSnackbar);
        const dialog = await openCreateDialog(user);

        await selectInputMode(user, dialog, 'file');
        const fileInput = await waitFor(() => {
            const fi = findFileInput(dialog, 'create');
            expect(fi).toBeTruthy();
            return fi;
        });
        await act(async () => {
            await user.type(within(dialog).getByPlaceholderText('Key Name'), 'newKey');
            await user.upload(fileInput, new File(['content'], 'key.txt'));
        });
        const createButton = within(dialog).getByRole('button', {name: /Create/i});
        await act(async () => {
            await user.click(createButton);
        });

        await waitFor(() => {
            expect(createButton).toBeDisabled();
        });
        await waitFor(() => {
            expect(within(dialog).getByRole('button', {name: /Cancel/i})).toBeDisabled();
        });
        await waitFor(() => {
            expect(fileInput).toBeDisabled();
        });
    }, 20000);

    test('disables buttons during key update', async () => {
        global.fetch = buildFetchMock({
            keysItems: [{name: 'key1', node: 'node1', size: 2626}],
            methodOverrides: {
                PUT: () => new Promise(() => {
                })
            },
        });
        await renderAndWait('root/cfg/cfg1', 1, openSnackbar);
        const dialog = await openEditDialog(user, 'key1');

        // Wait for prefetch to complete (default mock returns text, so dialog opens in text mode)
        await waitFor(() => {
            expect(within(dialog).queryByRole('progressbar')).not.toBeInTheDocument();
        });
        // Switch to file mode so file input appears
        await selectInputMode(user, dialog, 'file');

        const fileInput = await waitFor(() => {
            const fi = findFileInput(dialog, 'update');
            expect(fi).toBeTruthy();
            return fi;
        });
        await act(async () => {
            await user.type(within(dialog).getByPlaceholderText('Key Name'), 'updatedKey');
            await user.upload(fileInput, new File(['content'], 'key.txt'));
        });
        const updateButton = within(dialog).getByRole('button', {name: /Update/i});
        await act(async () => {
            await user.click(updateButton);
        });

        await waitFor(() => {
            expect(updateButton).toBeDisabled();
        });
        await waitFor(() => {
            expect(within(dialog).getByRole('button', {name: /Cancel/i})).toBeDisabled();
        });
        await waitFor(() => {
            expect(fileInput).toBeDisabled();
        });
        expect(screen.getByRole('button', {name: /add new key/i})).toBeDisabled();
        expect(screen.getByRole('button', {name: /Edit key key1/i})).toBeDisabled();
        expect(screen.getByRole('button', {name: /Delete key key1/i})).toBeDisabled();
    }, 20000);

    test('disables buttons during key deletion', async () => {
        global.fetch = buildFetchMock({
            keysItems: [{name: 'key1', node: 'node1', size: 2626}],
            methodOverrides: {
                DELETE: () => new Promise(() => {
                })
            },
        });
        await renderAndWait('root/cfg/cfg1', 1, openSnackbar);
        const dialog = await openDeleteDialog(user, 'key1');
        const confirmButton = within(dialog).getByRole('button', {name: /Delete/i});
        const cancelButton = within(dialog).getByRole('button', {name: /Cancel/i});

        await act(async () => {
            await user.click(confirmButton);
        });

        await waitFor(() => {
            expect(confirmButton).toBeDisabled();
        });
        await waitFor(() => {
            expect(cancelButton).toBeDisabled();
        });
    });

    // ── HTTP / network error pairs ────────────────────────────────────────────

    test.each([
        ['deletion', 'DELETE', 'Deleting key key1…', "Key 'key1' deleted", 'Failed to delete key: 400', 'Network error'],
        ['creation', 'POST', 'Creating key newKey…', "Key 'newKey' created", 'Failed to create key: 400', 'Network error'],
        ['update', 'PUT', 'Updating key updatedKey…', "Key 'updatedKey' updated", 'Failed to update key: 400', 'Network error'],
    ])('handles failed %s due to not-ok response', async (action, method, infoMsg, _successMsg, errorMsg) => {
        global.fetch = buildFetchMock({
            keysItems: [{name: 'key1', node: 'node1', size: 2626}],
            methodOverrides: {[method]: () => Promise.resolve({ok: false, status: 400})},
        });
        await renderAndWait('root/cfg/cfg1', 1, openSnackbar);

        if (action === 'creation') {
            const dialog = await openCreateDialog(user);
            await act(async () => {
                await user.type(within(dialog).getByPlaceholderText('Key Name'), 'newKey');
                await uploadFile(user, dialog, 'create');
            });
            await act(async () => {
                await user.click(within(dialog).getByRole('button', {name: /Create/i}));
            });
        } else if (action === 'update') {
            const dialog = await openEditDialog(user, 'key1');
            await act(async () => {
                await user.clear(within(dialog).getByPlaceholderText('Key Name'));
                await user.type(within(dialog).getByPlaceholderText('Key Name'), 'updatedKey');
                await uploadFile(user, dialog, 'update');
            });
            await act(async () => {
                await user.click(within(dialog).getByRole('button', {name: /Update/i}));
            });
        } else {
            const dialog = await openDeleteDialog(user, 'key1');
            await act(async () => {
                await user.click(within(dialog).getByRole('button', {name: /Delete/i}));
            });
        }

        await waitFor(() => {
            expect(openSnackbar).toHaveBeenCalledWith(infoMsg, 'info');
        });
        await waitFor(() => {
            expect(openSnackbar).toHaveBeenCalledWith(errorMsg, 'error');
        });
    });

    test.each([
        ['deletion', 'DELETE', 'Deleting key key1…'],
        ['creation', 'POST', 'Creating key newKey…'],
        ['update', 'PUT', 'Updating key updatedKey…'],
    ])('handles %s error due to network failure', async (action, method, infoMsg) => {
        global.fetch = buildFetchMock({
            keysItems: [{name: 'key1', node: 'node1', size: 2626}],
            methodOverrides: {[method]: () => Promise.reject(new Error('Network error'))},
        });
        await renderAndWait('root/cfg/cfg1', 1, openSnackbar);

        if (action === 'creation') {
            const dialog = await openCreateDialog(user);
            await act(async () => {
                await user.type(within(dialog).getByPlaceholderText('Key Name'), 'newKey');
                await uploadFile(user, dialog, 'create');
            });
            await act(async () => {
                await user.click(within(dialog).getByRole('button', {name: /Create/i}));
            });
        } else if (action === 'update') {
            const dialog = await openEditDialog(user, 'key1');
            await act(async () => {
                await user.clear(within(dialog).getByPlaceholderText('Key Name'));
                await user.type(within(dialog).getByPlaceholderText('Key Name'), 'updatedKey');
                await uploadFile(user, dialog, 'update');
            });
            await act(async () => {
                await user.click(within(dialog).getByRole('button', {name: /Update/i}));
            });
        } else {
            const dialog = await openDeleteDialog(user, 'key1');
            await act(async () => {
                await user.click(within(dialog).getByRole('button', {name: /Delete/i}));
            });
        }

        await waitFor(() => {
            expect(openSnackbar).toHaveBeenCalledWith(infoMsg, 'info');
        });
        await waitFor(() => {
            expect(openSnackbar).toHaveBeenCalledWith('Error: Network error', 'error');
        });
    });

    // ── Cancel dialogs ───────────────────────────────────────────────────────

    test.each([
        ['create', async (u) => openCreateDialog(u)],
        ['delete', async (u) => {
            global.fetch = buildFetchMock({keysItems: [{name: 'key1', node: 'node1', size: 2626}]});
            await renderAndWait('root/cfg/cfg1', 1, openSnackbar);
            return openDeleteDialog(u, 'key1');
        }],
        ['update', async (u) => {
            global.fetch = buildFetchMock({keysItems: [{name: 'key1', node: 'node1', size: 2626}]});
            await renderAndWait('root/cfg/cfg1', 1, openSnackbar);
            return openEditDialog(u, 'key1');
        }],
    ])('cancels %s dialog via Cancel button', async (action, setup) => {
        if (action === 'create') await renderAndWait('root/cfg/cfg1', 0, openSnackbar);
        const dialog = await setup(user);
        await act(async () => {
            await user.click(within(dialog).getByRole('button', {name: /Cancel/i}));
        });
        await waitFor(() => {
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });
    });

    // ── Escape key ───────────────────────────────────────────────────────────

    test.each([
        ['create', async () => {
            await renderAndWait('root/cfg/cfg1', 0, openSnackbar);
            return openCreateDialog(user);
        }],
        ['update', async () => {
            global.fetch = buildFetchMock({keysItems: [{name: 'key1', node: 'node1', size: 2626}]});
            await renderAndWait('root/cfg/cfg1', 1, openSnackbar);
            return openEditDialog(user, 'key1');
        }],
        ['delete', async () => {
            global.fetch = buildFetchMock({keysItems: [{name: 'key1', node: 'node1', size: 2626}]});
            await renderAndWait('root/cfg/cfg1', 1, openSnackbar);
            return openDeleteDialog(user, 'key1');
        }],
        ['view', async () => {
            const blob = makeMockBlob(encodeText('sample text'));
            global.fetch = buildFetchMock({keysItems: [{name: 'key1', node: 'node1', size: 11}], keyBlob: blob});
            await renderAndWait('root/cfg/cfg1', 1, openSnackbar);
            const viewButton = await screen.findByRole('button', {name: /View key key1/i});
            await act(async () => {
                await user.click(viewButton);
            });
            const dialog = await screen.findByRole('dialog');
            await waitFor(() => {
                expect(within(dialog).queryByRole('progressbar')).not.toBeInTheDocument();
            });
            return dialog;
        }],
    ])('closes %s dialog with Escape key', async (_label, setup) => {
        const dialog = await setup();
        fireEvent.keyDown(dialog, {key: 'Escape', code: 'Escape'});
        await waitFor(() => {
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });
    });

    // ── View dialog ──────────────────────────────────────────────────────────

    test('view dialog shows text content correctly', async () => {
        const textContent = 'Hello, World!';
        global.fetch = buildFetchMock({
            keysItems: [{name: 'textkey', node: 'node1', size: textContent.length}],
            keyBlob: makeMockBlob(encodeText(textContent)),
        });
        await renderAndWait('root/cfg/cfg1', 1, openSnackbar);
        const viewButton = await screen.findByRole('button', {name: /View key textkey/i});
        await act(async () => {
            await user.click(viewButton);
        });

        await waitFor(() => {
            expect(screen.getByRole('dialog')).toBeInTheDocument();
        });
        await waitFor(() => {
            expect(within(screen.getByRole('dialog')).queryByRole('progressbar')).not.toBeInTheDocument();
        });

        const dialog = screen.getByRole('dialog');
        expect(within(dialog).getByText(/Type:\s*Text/i)).toBeInTheDocument();
        expect(within(dialog).getByDisplayValue(textContent)).toBeInTheDocument();
    });

    test('view dialog shows binary hex view for control characters', async () => {
        const binaryData = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x07, 0x6f]);
        global.fetch = buildFetchMock({
            keysItems: [{name: 'ctrlkey', node: 'node1', size: binaryData.length}],
            keyBlob: makeMockBlob(binaryData),
        });
        await renderAndWait('root/cfg/cfg1', 1, openSnackbar);
        const viewButton = await screen.findByRole('button', {name: /View key ctrlkey/i});
        await act(async () => {
            await user.click(viewButton);
        });

        await waitFor(() => {
            expect(screen.getByRole('dialog')).toBeInTheDocument();
        }, {timeout: 10000});
        await waitFor(() => {
            expect(within(screen.getByRole('dialog')).queryByRole('progressbar')).not.toBeInTheDocument();
        }, {timeout: 10000});
        await waitFor(() => {
            expect(within(screen.getByRole('dialog')).getByText(/Binary \(Hex View\)/i)).toBeInTheDocument();
        });
    });

    test('view dialog shows binary hex view for empty blob', async () => {
        global.fetch = buildFetchMock({
            keysItems: [{name: 'emptykey', node: 'node1', size: 0}],
            keyBlob: makeMockBlob(new Uint8Array([])),
        });
        await renderAndWait('root/cfg/cfg1', 1, openSnackbar);
        const viewButton = await screen.findByRole('button', {name: /View key emptykey/i});
        await act(async () => {
            await user.click(viewButton);
        });

        await waitFor(() => {
            expect(screen.getByRole('dialog')).toBeInTheDocument();
        });
        await waitFor(() => {
            expect(within(screen.getByRole('dialog')).queryByRole('progressbar')).not.toBeInTheDocument();
        });
        expect(within(screen.getByRole('dialog')).getByText(/Binary \(Hex View\)/i)).toBeInTheDocument();
    });

    test('view dialog failure closes dialog and shows error snackbar', async () => {
        global.fetch = jest.fn((url) => {
            if (url.includes('/data/keys'))
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({items: [{name: 'failkey', node: 'node1', size: 50}]})
                });
            if (url.includes('/data/key'))
                return Promise.resolve({ok: false, status: 500});
            return Promise.resolve({ok: true});
        });
        await renderAndWait('root/cfg/cfg1', 1, openSnackbar);
        const viewButton = await screen.findByRole('button', {name: /View key failkey/i});
        await act(async () => {
            await user.click(viewButton);
        });

        await waitFor(() => {
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });
        await waitFor(() => {
            expect(openSnackbar).toHaveBeenCalledWith('Failed to fetch key content: 500', 'error');
        });
    });

    test('view dialog closes via Close button', async () => {
        const blob = makeMockBlob(encodeText('sample text'));
        global.fetch = buildFetchMock({keysItems: [{name: 'key1', node: 'node1', size: 11}], keyBlob: blob});
        await renderAndWait('root/cfg/cfg1', 1, openSnackbar);
        const viewButton = await screen.findByRole('button', {name: /View key key1/i});
        await act(async () => {
            await user.click(viewButton);
        });
        await waitFor(() => {
            expect(screen.getByRole('dialog')).toBeInTheDocument();
        });
        await waitFor(() => {
            expect(within(screen.getByRole('dialog')).queryByRole('progressbar')).not.toBeInTheDocument();
        });

        await act(async () => {
            await user.click(within(screen.getByRole('dialog')).getByRole('button', {name: /Close/i}));
        });
        await waitFor(() => {
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });
    });

    // ── Update dialog: prefetch behaviour ────────────────────────────────────

    test('shows spinner in update dialog while content loads', async () => {
        let resolveBlob;
        const blobPromise = new Promise((res) => {
            resolveBlob = res;
        });
        global.fetch = jest.fn((url) => {
            if (url.includes('/data/keys'))
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({items: [{name: 'key1', node: 'node1', size: 100}]})
                });
            if (url.includes('/data/key'))
                return Promise.resolve({ok: true, blob: () => blobPromise});
            return Promise.resolve({ok: true});
        });
        await renderAndWait('root/cfg/cfg1', 1, openSnackbar);
        const editButton = await screen.findByRole('button', {name: /Edit key key1/i});
        await act(async () => {
            await user.click(editButton);
        });

        const dialog = await screen.findByRole('dialog');
        expect(within(dialog).getByRole('progressbar')).toBeInTheDocument();

        await act(async () => {
            resolveBlob(makeMockBlob(encodeText('hello')));
        });
    });

    test('shows snackbar and switches to file mode when updating binary key', async () => {
        global.fetch = buildFetchMock({
            keysItems: [{name: 'binaryKey', node: 'node1', size: 3}],
            keyBlob: makeMockBlob(new Uint8Array([0x00, 0x01, 0x02])),
        });
        await renderAndWait('root/cfg/cfg1', 1, openSnackbar);
        const editButton = await screen.findByRole('button', {name: /Edit key binaryKey/i});
        await act(async () => {
            await user.click(editButton);
        });

        await waitFor(() => {
            expect(openSnackbar).toHaveBeenCalledWith("Key is binary – please use file upload to update.", "info");
        });
        const dialog = await screen.findByRole('dialog');
        expect(within(dialog).getByRole('radiogroup')).toHaveAttribute('data-value', 'file');
    });

    test('handles error when fetching key content for update (not ok)', async () => {
        global.fetch = jest.fn((url) => {
            if (url.includes('/data/keys'))
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({items: [{name: 'key1', node: 'node1', size: 100}]})
                });
            if (url.includes('/data/key'))
                return Promise.resolve({ok: false, status: 500});
            return Promise.resolve({ok: true});
        });
        await renderAndWait('root/cfg/cfg1', 1, openSnackbar);
        const editButton = await screen.findByRole('button', {name: /Edit key key1/i});
        await act(async () => {
            await user.click(editButton);
        });

        const dialog = await screen.findByRole('dialog');
        await waitFor(() => {
            expect(within(dialog).queryByRole('progressbar')).not.toBeInTheDocument();
        });
        expect(openSnackbar).toHaveBeenCalledWith('Failed to fetch key content: 500', 'error');
        expect(within(dialog).getByDisplayValue('file')).toBeInTheDocument();
    });

    test('handles network error when fetching key content for update', async () => {
        global.fetch = jest.fn((url) => {
            if (url.includes('/data/keys'))
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({items: [{name: 'key1', node: 'node1', size: 100}]})
                });
            if (url.includes('/data/key'))
                return Promise.reject(new Error('Connection refused'));
            return Promise.resolve({ok: true});
        });
        await renderAndWait('root/cfg/cfg1', 1, openSnackbar);
        const editButton = await screen.findByRole('button', {name: /Edit key key1/i});
        await act(async () => {
            await user.click(editButton);
        });

        const dialog = await screen.findByRole('dialog');
        await waitFor(() => {
            expect(within(dialog).queryByRole('progressbar')).not.toBeInTheDocument();
        });
        await waitFor(() => {
            expect(openSnackbar).toHaveBeenCalledWith('Error: Connection refused', 'error');
        });
    });

    test('update via file upload sends File as body', async () => {
        global.fetch = jest.fn((url, options = {}) => {
            if (url.includes('/data/keys'))
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({items: [{name: 'key1', node: 'node1', size: 100}]})
                });
            if (url.includes('/data/key') && options.method === 'PUT') {
                expect(options.body).toBeInstanceOf(File);
                return Promise.resolve({ok: true});
            }
            if (url.includes('/data/key'))
                return Promise.resolve({
                    ok: true,
                    blob: () => Promise.resolve(makeMockBlob(encodeText('text content')))
                });
            return Promise.resolve({ok: true});
        });
        await renderAndWait('root/cfg/cfg1', 1, openSnackbar);
        const dialog = await openEditDialog(user, 'key1');
        await waitFor(() => {
            expect(within(dialog).queryByRole('progressbar')).not.toBeInTheDocument();
        });

        await selectInputMode(user, dialog, 'file');
        const fileInput = await waitFor(() => {
            const fi = findFileInput(dialog, 'update');
            expect(fi).toBeTruthy();
            return fi;
        });
        await act(async () => {
            await user.upload(fileInput, new File(['file content'], 'upload.txt'));
        });
        await act(async () => {
            await user.click(within(dialog).getByRole('button', {name: /Update/i}));
        });

        await waitFor(() => {
            expect(openSnackbar).toHaveBeenCalledWith("Key 'key1' updated successfully");
        });
    });

    test('create with text mode sends Blob as body', async () => {
        let capturedBody;
        global.fetch = jest.fn((url, options = {}) => {
            if (url.includes('/data/key') && options.method === 'POST') {
                capturedBody = options.body;
                return Promise.resolve({ok: true});
            }
            if (url.includes('/data/keys'))
                return Promise.resolve({ok: true, json: () => Promise.resolve({items: []})});
            return Promise.resolve({ok: true});
        });
        await renderAndWait('root/cfg/cfg1', 0, openSnackbar);
        const dialog = await openCreateDialog(user);
        await selectInputMode(user, dialog, 'text');
        await act(async () => {
            await user.type(within(dialog).getByPlaceholderText('Key Name'), 'blobKey');
        });
        await act(async () => {
            await user.type(within(dialog).getByPlaceholderText(/enter the text content/i), 'some text data');
        });
        await act(async () => {
            await user.click(within(dialog).getByRole('button', {name: /Create/i}));
        });

        await waitFor(() => {
            expect(openSnackbar).toHaveBeenCalledWith("Key 'blobKey' created successfully");
        });
        expect(capturedBody).toBeInstanceOf(Blob);
    });

    // ── File selection display ────────────────────────────────────────────────

    test('shows selected filename in create dialog', async () => {
        global.fetch = buildFetchMock({keysItems: []});
        await renderAndWait('root/cfg/cfg1', 0, openSnackbar);
        const dialog = await openCreateDialog(user);
        await selectInputMode(user, dialog, 'file');
        await waitFor(() => {
            expect(screen.getByText('No file selected')).toBeInTheDocument();
        });

        await act(async () => {
            await user.type(within(dialog).getByPlaceholderText('Key Name'), 'newKey');
            await uploadFile(user, dialog, 'create');
        });
        await waitFor(() => {
            expect(screen.getByText('test.txt')).toBeInTheDocument();
        });
    });

    // ── Dialog field reset ────────────────────────────────────────────────────

    test('create dialog resets fields after successful creation', async () => {
        global.fetch = buildFetchMock({
            keysItems: [],
            methodOverrides: {POST: () => Promise.resolve({ok: true, json: () => Promise.resolve({})})}
        });
        await renderAndWait('root/cfg/cfg1', 0, openSnackbar);

        let dialog = await openCreateDialog(user);
        await act(async () => {
            await user.type(within(dialog).getByPlaceholderText('Key Name'), 'tempKey');
        });
        await act(async () => {
            await user.click(within(dialog).getByRole('button', {name: /Create/i}));
        });
        await waitFor(() => {
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });

        dialog = await openCreateDialog(user);
        expect(within(dialog).getByPlaceholderText('Key Name').value).toBe('');
    });

    // ── Fullscreen ───────────────────────────────────────────────────────────

    test.each([
        ['create', async () => {
            await renderAndWait('root/cfg/cfg1', 0, openSnackbar);
            const dialog = await openCreateDialog(user);
            await selectInputMode(user, dialog, 'text');
            return dialog;
        }],
        ['update', async () => {
            global.fetch = buildFetchMock({
                keysItems: [{name: 'key1', node: 'node1', size: 100}],
                keyBlob: makeMockBlob(encodeText('some text content')),
            });
            await renderAndWait('root/cfg/cfg1', 1, openSnackbar);
            const dialog = await openEditDialog(user, 'key1');
            await waitFor(() => {
                expect(within(dialog).queryByRole('progressbar')).not.toBeInTheDocument();
            });
            await waitFor(() => {
                expect(within(dialog).getByRole('radiogroup')).toHaveAttribute('data-value', 'text');
            });
            return dialog;
        }],
    ])('%s dialog enters and exits fullscreen', async (_label, setup) => {
        const dialog = await setup();
        const fullscreenBtn = getFullscreenButton(dialog);
        await act(async () => {
            await user.click(fullscreenBtn);
        });

        await waitFor(() => {
            expect(screen.getByRole('dialog')).toHaveAttribute('data-fullscreen', 'true');
        });

        const exitBtn = getExitFullscreenButton(screen.getByRole('dialog'));
        await act(async () => {
            await user.click(exitBtn);
        });

        await waitFor(() => {
            expect(screen.getByRole('dialog')).toHaveAttribute('data-fullscreen', 'false');
        });
    });

    test('fullscreen hides name/radio fields and shows only textarea', async () => {
        await renderAndWait('root/cfg/cfg1', 0, openSnackbar);
        const dialog = await openCreateDialog(user);
        await selectInputMode(user, dialog, 'text');

        await act(async () => {
            await user.click(getFullscreenButton(dialog));
        });

        await waitFor(() => {
            const d = screen.getByRole('dialog');
            expect(within(d).queryByPlaceholderText('Key Name')).not.toBeInTheDocument();
            expect(within(d).queryByRole('radiogroup')).not.toBeInTheDocument();
            expect(within(d).getByPlaceholderText(/enter the text content/i)).toBeInTheDocument();
        });
    });

    test.each([
        ['create', async () => {
            await renderAndWait('root/cfg/cfg1', 0, openSnackbar);
            const dialog = await openCreateDialog(user);
            await selectInputMode(user, dialog, 'text');
            await act(async () => {
                await user.click(getFullscreenButton(dialog));
            });
            await waitFor(() => {
                expect(screen.getByRole('dialog')).toHaveAttribute('data-fullscreen', 'true');
            });
            await act(async () => {
                await user.click(within(screen.getByRole('dialog')).getByRole('button', {name: /Cancel/i}));
            });
            await waitFor(() => {
                expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
            });
            return openCreateDialog(user);
        }],
        ['update', async () => {
            global.fetch = buildFetchMock({
                keysItems: [{name: 'key1', node: 'node1', size: 100}],
                keyBlob: makeMockBlob(encodeText('text content')),
            });
            await renderAndWait('root/cfg/cfg1', 1, openSnackbar);
            const dialog = await openEditDialog(user, 'key1');
            await waitFor(() => {
                expect(within(dialog).queryByRole('progressbar')).not.toBeInTheDocument();
            });
            await act(async () => {
                await user.click(getFullscreenButton(dialog));
            });
            await waitFor(() => {
                expect(screen.getByRole('dialog')).toHaveAttribute('data-fullscreen', 'true');
            });
            await act(async () => {
                await user.click(within(screen.getByRole('dialog')).getByRole('button', {name: /Cancel/i}));
            });
            await waitFor(() => {
                expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
            });
            const editButton = await screen.findByRole('button', {name: /Edit key key1/i});
            await act(async () => {
                await user.click(editButton);
            });
            return screen.findByRole('dialog');
        }],
    ])('%s dialog cancel resets fullscreen state', async (_label, setup) => {
        const newDialog = await setup();
        expect(newDialog).toHaveAttribute('data-fullscreen', 'false');
    });

    // ── Token lost between delete and subsequent fetchKeys ───────────────────

    test('sets keysError when token removed before post-delete fetchKeys', async () => {
        mockLocalStorage.getItem.mockReturnValue('mock-token');
        global.fetch = buildFetchMock({keysItems: [{name: 'k1', node: 'n1', size: 5}]});
        await renderAndWait('root/cfg/cfg1', 1, openSnackbar);

        global.fetch = jest.fn((url, options = {}) => {
            if (url.includes('/data/key') && options.method === 'DELETE') {
                mockLocalStorage.getItem.mockReturnValue(null);
                return Promise.resolve({ok: true});
            }
            if (url.includes('/data/keys'))
                return Promise.resolve({ok: true, json: () => Promise.resolve({items: []})});
            return Promise.resolve({ok: true});
        });

        const dialog = await openDeleteDialog(user, 'k1');
        await act(async () => {
            await user.click(within(dialog).getByRole('button', {name: /Delete/i}));
        });

        await waitFor(() => {
            expect(openSnackbar).toHaveBeenCalledWith("Key 'k1' deleted successfully");
        });
        await waitFor(() => {
            const alerts = screen.queryAllByRole('alert');
            expect(alerts.some(a => a.textContent.includes('Auth token not found'))).toBe(true);
        });
    });
});
