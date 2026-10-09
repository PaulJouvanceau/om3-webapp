import React from 'react';
import i18n from '../../i18n';
import {render, screen, waitFor, act, within, fireEvent, cleanup} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {vi} from 'vitest';
import KeysSection from '../KeysSection';

// ── Mocks ──────────────────────────────────────────────────────────────
vi.mock('../../hooks/useEventStore.js', () => ({default: vi.fn()}));
vi.mock('../../eventSourceManager.jsx', () => ({
    closeEventSource: vi.fn(),
    startEventReception: vi.fn(),
    configureEventSource: vi.fn(),
}));

const mockLocalStorage = {
    getItem: vi.fn(() => 'mock-token'),
    setItem: vi.fn(),
    removeItem: vi.fn(),
};
Object.defineProperty(global, 'localStorage', {value: mockLocalStorage});

const user = userEvent.setup();
const openSnackbar = vi.fn();
const queryLoading = (container = screen) => container.queryByRole('status', {name: /^Loading/});
const encodeText = (text) => new TextEncoder().encode(text);
const makeMockBlob = (uint8Array) => ({
    arrayBuffer: () => Promise.resolve(uint8Array.buffer.slice(uint8Array.byteOffset, uint8Array.byteOffset + uint8Array.byteLength)),
    size: uint8Array.byteLength,
    type: 'application/octet-stream',
});

const mockFetch = ({keys = [], keyBlob = null, methods = {}} = {}) => {
    global.fetch = vi.fn((url, options = {}) => {
        const method = options.method || 'GET';
        if (methods[method]) {
            const res = methods[method](url, options);
            if (res !== undefined) return res;
        }
        if (url.includes('/data/keys')) return Promise.resolve({ok: true, json: () => Promise.resolve({items: keys})});
        if (url.includes('/data/key')) {
            const blob = keyBlob ?? makeMockBlob(encodeText('hello world'));
            return Promise.resolve({ok: true, blob: () => Promise.resolve(blob)});
        }
        return Promise.resolve({ok: true, json: () => Promise.resolve({})});
    });
};

const renderAndWait = async (objectName, expectedCount) => {
    render(<KeysSection decodedObjectName={objectName} openSnackbar={openSnackbar}/>);
    if (expectedCount !== null) {
        await waitFor(() => {
            expect(screen.getByText((content) =>
                content.includes('Object Keys') && content.includes(String(expectedCount))
            )).toBeInTheDocument();
        }, {timeout: 15000});
    }
    await waitFor(() => expect(queryLoading()).not.toBeInTheDocument());
};

const openDialog = async (action, keyName = 'key1') => {
    const btnMap = {
        create: () => screen.getByRole('button', {name: /add new key/i}),
        edit: () => screen.findAllByRole('button', {name: new RegExp('Edit key ' + keyName, 'i')}).then(b => b[0]),
        delete: () => screen.findAllByRole('button', {name: new RegExp('Delete key ' + keyName, 'i')}).then(b => b[0]),
        view: () => screen.findByRole('button', {name: new RegExp('View key ' + keyName, 'i')}),
    };
    if (!btnMap[action]) throw new Error('Unknown action: ' + action);
    const btn = await btnMap[action]();
    await act(async () => {
        await user.click(btn);
    });
    return screen.findByRole('dialog');
};

const selectInputMode = async (dialog, mode) => {
    const radio = within(dialog).getByRole('radio', {name: new RegExp(mode, 'i')});
    await act(async () => {
        await user.click(radio);
    });
};

const findFileInput = (dialog, prefix) => dialog.querySelector(`#${prefix}-key-file-upload`);

const uploadFileInDialog = async (dialog, prefix = 'create') => {
    await selectInputMode(dialog, 'file');
    let fileInput;
    await waitFor(() => {
        fileInput = findFileInput(dialog, prefix);
        if (!fileInput) throw new Error('File input not found');
    });
    await user.upload(fileInput, new File(['test content'], 'test.txt', {type: 'text/plain'}));
};

const fillNameAndSubmit = async (dialog, name, btnName) => {
    const nameInput = within(dialog).getByRole('textbox', {name: /Key Name/i});
    await act(async () => {
        await user.clear(nameInput);
        await user.type(nameInput, name);
    });
    const submitBtn = within(dialog).getByRole('button', {name: new RegExp(btnName, 'i')});
    await act(async () => {
        await user.click(submitBtn);
    });
};

beforeEach(() => {
    vi.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue('mock-token');
});

// ── Tests ──────────────────────────────────────────────────────────────
describe('KeysSection', () => {
    test.each([
        ['service path', 'root/svc/service1'],
        ['null', null],
        ['short path', 'cluster'],
        ['invalid kind', 'root/invalid/test'],
    ])('does not render for %s', async (_, objectName) => {
        render(<KeysSection decodedObjectName={objectName} openSnackbar={openSnackbar}/>);
        await waitFor(() => expect(screen.queryByText(/Object Keys/i)).not.toBeInTheDocument());
    });

    test('renders for cfg and sec', async () => {
        mockFetch({keys: [{name: 'k', node: 'n', size: 100}]});
        await renderAndWait('root/cfg/cfg1', 1);
        expect(screen.getByText('k')).toBeInTheDocument();
    });

    test.each([
        ['full table', [{name: 'k1', node: 'n1', size: 10}, {
            name: 'k2',
            node: 'n2',
            size: 20
        }], ['k1', 'k2', '10 bytes', '20 bytes']],
        ['empty array', [], ['No keys available.']],
        ['no items field', {}, ['No keys available.']],
        ['non-array items', 'not-array', ['No keys available.']],
    ])('displays %s', async (_, keys, expectedTexts) => {
        const safeKeys = Array.isArray(keys) ? keys : keys;
        mockFetch({keys: safeKeys});
        const count = Array.isArray(safeKeys) ? safeKeys.length : 0;
        await renderAndWait('root/cfg/cfg1', count);
        for (const text of expectedTexts) {
            expect(screen.getByText(text)).toBeInTheDocument();
        }
    });

    test('shows loading spinner', async () => {
        global.fetch = vi.fn(() => new Promise(() => {
        }));
        render(<KeysSection decodedObjectName="root/cfg/cfg1" openSnackbar={openSnackbar}/>);
        expect(await screen.findByRole('status', {name: 'Loading keys'})).toBeInTheDocument();
    });

    test('displays fetch error', async () => {
        global.fetch = vi.fn(() => Promise.reject(new Error('Fail')));
        await renderAndWait('root/cfg/cfg1', 0);
        expect(screen.getByText(/Fail/i)).toBeInTheDocument();
    });

    test('displays HTTP error', async () => {
        global.fetch = vi.fn(() => Promise.resolve({ok: false, status: 500}));
        await renderAndWait('root/cfg/cfg1', 0);
        expect(await screen.findByText(/Failed to fetch keys: 500/i)).toBeInTheDocument();
    });

    test.each([
        ['create', 'Create', 'newKey', true, 'Creating key newKey…', "Key 'newKey' created successfully"],
        ['edit', 'Update', 'updatedKey', true, 'Updating key updatedKey…', "Key 'updatedKey' updated successfully"],
        ['delete', 'Delete', 'key1', false, 'Deleting key key1…', "Key 'key1' deleted successfully"],
    ])('%s success', async (action, btn, name, needsFile, info, ok) => {
        mockFetch({keys: [{name: 'key1', node: 'n1', size: 10}]});
        await renderAndWait('root/cfg/cfg1', 1);
        const dialog = await openDialog(action);
        if (action !== 'delete') {
            if (needsFile) await uploadFileInDialog(dialog, action === 'edit' ? 'update' : 'create');
            await fillNameAndSubmit(dialog, name, btn);
        } else {
            await act(async () => {
                await user.click(within(dialog).getByRole('button', {name: /Delete/i}));
            });
        }
        expect(openSnackbar).toHaveBeenCalledWith(info, 'info');
        await waitFor(() => expect(openSnackbar).toHaveBeenCalledWith(ok));
    });

    test('create empty content mode', async () => {
        mockFetch({keys: [], methods: {POST: () => Promise.resolve({ok: true})}});
        await renderAndWait('root/cfg/cfg1', 0);
        const dialog = await openDialog('create');
        await act(async () => {
            await user.type(within(dialog).getByRole('textbox', {name: /Key Name/i}), 'emptyKey');
        });
        await selectInputMode(dialog, 'empty');
        expect(within(dialog).getByRole('button', {name: /Create/i})).not.toBeDisabled();
        await act(async () => {
            await user.click(within(dialog).getByRole('button', {name: /Create/i}));
        });
        await waitFor(() => expect(openSnackbar).toHaveBeenCalledWith("Key 'emptyKey' created successfully"));
    });

    test.each([
        ['create', 'POST', 'newKey', 'Create', 'Creating key newKey…', 'Failed to create key: 400'],
        ['edit', 'PUT', 'updatedKey', 'Update', 'Updating key updatedKey…', 'Failed to update key: 400'],
        ['delete', 'DELETE', 'key1', 'Delete', 'Deleting key key1…', 'Failed to delete key: 400'],
    ])('%s HTTP error', async (action, method, name, btn, info, err) => {
        mockFetch({
            keys: [{name: 'key1', node: 'n1', size: 10}],
            methods: {[method]: () => Promise.resolve({ok: false, status: 400})},
        });
        await renderAndWait('root/cfg/cfg1', 1);
        const dialog = await openDialog(action);
        if (action !== 'delete') {
            await uploadFileInDialog(dialog, action === 'edit' ? 'update' : 'create');
            await fillNameAndSubmit(dialog, name, btn);
        } else {
            await act(async () => {
                await user.click(within(dialog).getByRole('button', {name: /Delete/i}));
            });
        }
        expect(openSnackbar).toHaveBeenCalledWith(info, 'info');
        await waitFor(() => expect(openSnackbar).toHaveBeenCalledWith(err, 'error'));
    });

    test.each([
        ['create', 'POST', 'newKey', 'Create', 'Creating key newKey…'],
        ['edit', 'PUT', 'updatedKey', 'Update', 'Updating key updatedKey…'],
        ['delete', 'DELETE', 'key1', 'Delete', 'Deleting key key1…'],
    ])('%s network error', async (action, method, name, btn, info) => {
        mockFetch({
            keys: [{name: 'key1', node: 'n1', size: 10}],
            methods: {[method]: () => Promise.reject(new Error('Network error'))},
        });
        await renderAndWait('root/cfg/cfg1', 1);
        const dialog = await openDialog(action);
        if (action !== 'delete') {
            await uploadFileInDialog(dialog, action === 'edit' ? 'update' : 'create');
            await fillNameAndSubmit(dialog, name, btn);
        } else {
            await act(async () => {
                await user.click(within(dialog).getByRole('button', {name: /Delete/i}));
            });
        }
        expect(openSnackbar).toHaveBeenCalledWith(info, 'info');
        await waitFor(() => expect(openSnackbar).toHaveBeenCalledWith('Error: Network error', 'error'));
    });

    test.each([
        ['create', (d) => uploadFileInDialog(d, 'create').then(() => fillNameAndSubmit(d, 'newKey', 'Create'))],
        ['edit', (d) => uploadFileInDialog(d, 'update').then(() => fillNameAndSubmit(d, 'updatedKey', 'Update'))],
        ['delete', (d) => user.click(within(d).getByRole('button', {name: /Delete/i}))],
    ])('auth token missing for %s', async (action, actionFn) => {
        mockFetch({keys: [{name: 'key1', node: 'n1', size: 10}]});
        await renderAndWait('root/cfg/cfg1', 1);
        const dialog = await openDialog(action);
        mockLocalStorage.getItem.mockReturnValue(null);
        await actionFn(dialog);
        await waitFor(() => expect(openSnackbar).toHaveBeenCalledWith('Auth token not found.', 'error'));
    });

    test('auth token missing for view', async () => {
        mockFetch({keys: [{name: 'key1', node: 'n1', size: 10}]});
        await renderAndWait('root/cfg/cfg1', 1);
        mockLocalStorage.getItem.mockReturnValue(null);
        const viewBtn = await screen.findByRole('button', {name: /View key key1/i});
        await act(async () => {
            await user.click(viewBtn);
        });
        await waitFor(() => expect(openSnackbar).toHaveBeenCalledWith('Auth token not found.', 'error'));
    });

    test.each([
        ['create', 'POST', 'Create'],
        ['edit', 'PUT', 'Update'],
        ['delete', 'DELETE', 'Delete'],
    ])('%s buttons disabled during action', async (action, method, btn) => {
        mockFetch({
            keys: [{name: 'key1', node: 'n1', size: 10}],
            methods: {
                [method]: () => new Promise(() => {
                })
            },
        });
        await renderAndWait('root/cfg/cfg1', 1);
        const dialog = await openDialog(action);
        if (action !== 'delete') {
            await uploadFileInDialog(dialog, action === 'edit' ? 'update' : 'create');
            await fillNameAndSubmit(dialog, action === 'create' ? 'newKey' : 'updatedKey', btn);
        } else {
            await act(async () => {
                await user.click(within(dialog).getByRole('button', {name: /Delete/i}));
            });
        }
        await waitFor(() => expect(within(dialog).getByRole('button', {name: new RegExp(btn, 'i')})).toBeDisabled());
    });

    test('create/update disabled without file', async () => {
        mockFetch({keys: []});
        await renderAndWait('root/cfg/cfg1', 0);
        const dialog = await openDialog('create');
        await selectInputMode(dialog, 'file');
        expect(within(dialog).getByRole('button', {name: /Create/i})).toBeDisabled();
        await act(async () => {
            await user.type(within(dialog).getByRole('textbox', {name: /Key Name/i}), 'test');
        });
        expect(within(dialog).getByRole('button', {name: /Create/i})).toBeDisabled();
    });

    test.each(['create', 'edit', 'delete', 'view'])('%s dialog closes with Cancel/Escape', async (action) => {
        mockFetch({
            keys: [{name: 'key1', node: 'n1', size: 10}],
            keyBlob: action === 'view' ? makeMockBlob(encodeText('t')) : undefined,
        });
        if (action === 'create') await renderAndWait('root/cfg/cfg1', 0);
        else await renderAndWait('root/cfg/cfg1', 1);
        let dialog = await openDialog(action);
        if (action === 'view') await waitFor(() => expect(queryLoading(within(dialog))).not.toBeInTheDocument());
        // The footer button (the header holds a close cross too).
        await act(async () => {
            await user.click(within(dialog).getAllByRole('button', {name: /^(Cancel|Close)$/}).at(-1));
        });
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

        dialog = await openDialog(action);
        fireEvent.keyDown(dialog, {key: 'Escape'});
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    test('view shows text', async () => {
        mockFetch({keys: [{name: 'tk', node: 'n', size: 5}], keyBlob: makeMockBlob(encodeText('hello'))});
        await renderAndWait('root/cfg/cfg1', 1);
        await openDialog('view', 'tk');
        const dialog = screen.getByRole('dialog');
        await waitFor(() => expect(queryLoading(within(dialog))).not.toBeInTheDocument());
        expect(within(dialog).getByText(/Type:\s*Text/i)).toBeInTheDocument();
        expect(within(dialog).getByDisplayValue('hello')).toBeInTheDocument();
    });

    test('view shows binary', async () => {
        mockFetch({keys: [{name: 'bk', node: 'n', size: 2}], keyBlob: makeMockBlob(new Uint8Array([0x00, 0x07]))});
        await renderAndWait('root/cfg/cfg1', 1);
        await openDialog('view', 'bk');
        const dialog = screen.getByRole('dialog');
        await waitFor(() => expect(queryLoading(within(dialog))).not.toBeInTheDocument());
        expect(within(dialog).getByText(/Binary \(Hex View\)/i)).toBeInTheDocument();
    });

    test('view error closes dialog', async () => {
        mockFetch({
            keys: [{name: 'key1', node: 'n1', size: 1}],
            methods: {
                GET: (url) => url.includes('/data/key?name=') ? Promise.resolve({
                    ok: false,
                    status: 500
                }) : undefined
            },
        });
        await renderAndWait('root/cfg/cfg1', 1);
        const viewBtn = await screen.findByRole('button', {name: /View key key1/i});
        await act(async () => {
            await user.click(viewBtn);
        });
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(openSnackbar).toHaveBeenCalledWith('Failed to fetch key content: 500', 'error');
    });

    test('update spinner and text mode', async () => {
        let resolveBlob;
        mockFetch({
            keys: [{name: 'key1', node: 'n1', size: 1}],
            methods: {
                GET: (url) => url.includes('/data/key?name=') ? Promise.resolve({
                    ok: true,
                    blob: () => new Promise(r => {
                        resolveBlob = r;
                    })
                }) : undefined
            },
        });
        await renderAndWait('root/cfg/cfg1', 1);
        const dialog = await openDialog('edit', 'key1');
        expect(within(dialog).getByRole('status', {name: 'Loading key content'})).toBeInTheDocument();
        await act(async () => resolveBlob(makeMockBlob(encodeText('hi'))));
        await waitFor(() => expect(queryLoading(within(dialog))).not.toBeInTheDocument());
    });

    test('update binary falls back to file', async () => {
        mockFetch({keys: [{name: 'b', node: 'n', size: 2}], keyBlob: makeMockBlob(new Uint8Array([0x00, 0x01]))});
        await renderAndWait('root/cfg/cfg1', 1);
        await openDialog('edit', 'b');
        await waitFor(() => expect(openSnackbar).toHaveBeenCalledWith("Key is binary – please use file upload to update.", "info"));
        expect(within(screen.getByRole('dialog')).getByRole('radio', {name: /Upload from file/i})).toBeChecked();
    });

    test('update prefetch error', async () => {
        mockFetch({
            keys: [{name: 'key1', node: 'n1', size: 1}],
            methods: {GET: (url) => url.includes('/data/key?name=') ? Promise.reject(new Error('fail')) : undefined},
        });
        await renderAndWait('root/cfg/cfg1', 1);
        await openDialog('edit', 'key1');
        await waitFor(() => expect(openSnackbar).toHaveBeenCalledWith('Error: fail', 'error'));
    });

    test('fullscreen toggles', async () => {
        mockFetch({keys: []});
        await renderAndWait('root/cfg/cfg1', 0);
        const dialog = await openDialog('create');
        expect(within(dialog).queryByRole('button', {name: 'Full screen'})).not.toBeInTheDocument();
        await selectInputMode(dialog, 'text');
        await act(async () => {
            await user.click(within(dialog).getByRole('button', {name: 'Full screen'}));
        });
        await waitFor(() => expect(within(screen.getByRole('dialog')).getByRole('button', {name: 'Exit full screen'})).toBeInTheDocument());
        expect(within(screen.getByRole('dialog')).getByRole('textbox', {name: 'Key Content'})).toBeInTheDocument();
        await act(async () => {
            await user.click(within(screen.getByRole('dialog')).getByRole('button', {name: 'Exit full screen'}));
        });
        expect(within(screen.getByRole('dialog')).queryByRole('button', {name: 'Exit full screen'})).not.toBeInTheDocument();
        expect(within(screen.getByRole('dialog')).getByRole('textbox', {name: /Key Name/i})).toBeInTheDocument();
    });

    test('fullscreen keeps the typed text', async () => {
        mockFetch({keys: []});
        await renderAndWait('root/cfg/cfg1', 0);
        const dialog = await openDialog('create');
        await selectInputMode(dialog, 'text');
        await act(async () => {
            await user.type(within(dialog).getByRole('textbox', {name: 'Key Content'}), 'abc');
            await user.click(within(dialog).getByRole('button', {name: 'Full screen'}));
        });
        expect(within(screen.getByRole('dialog')).getByRole('textbox', {name: 'Key Content'})).toHaveValue('abc');
    });

    test('fullscreen hides fields', async () => {
        mockFetch({keys: []});
        await renderAndWait('root/cfg/cfg1', 0);
        const dialog = await openDialog('create');
        await selectInputMode(dialog, 'text');
        await act(async () => {
            await user.click(within(dialog).getByRole('button', {name: 'Full screen'}));
        });
        const fullDlg = screen.getByRole('dialog');
        expect(within(fullDlg).queryByRole('textbox', {name: /Key Name/i})).not.toBeInTheDocument();
        expect(within(fullDlg).queryByRole('group', {name: 'Input Mode'})).not.toBeInTheDocument();
    });

    test('cancel after fullscreen resets', async () => {
        mockFetch({keys: []});
        await renderAndWait('root/cfg/cfg1', 0);
        const dialog = await openDialog('create');
        await selectInputMode(dialog, 'text');
        await act(async () => {
            await user.click(within(dialog).getByRole('button', {name: 'Full screen'}));
        });
        await act(async () => {
            await user.click(within(screen.getByRole('dialog')).getByRole('button', {name: /Cancel/i}));
        });
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        const newDialog = await openDialog('create');
        expect(within(newDialog).queryByRole('button', {name: 'Exit full screen'})).not.toBeInTheDocument();
        expect(within(newDialog).getByRole('textbox', {name: /Key Name/i})).toBeInTheDocument();
    });

    test('shows selected file name', async () => {
        mockFetch({keys: []});
        await renderAndWait('root/cfg/cfg1', 0);
        const dialog = await openDialog('create');
        await selectInputMode(dialog, 'file');
        expect(screen.getByText('No file selected')).toBeInTheDocument();
        await uploadFileInDialog(dialog);
        expect(screen.getByText('test.txt')).toBeInTheDocument();
    });

    test('dialog resets after create', async () => {
        mockFetch({keys: [], methods: {POST: () => Promise.resolve({ok: true})}});
        await renderAndWait('root/cfg/cfg1', 0);
        const dialog = await openDialog('create');
        await act(async () => {
            await user.type(within(dialog).getByRole('textbox', {name: /Key Name/i}), 'temp');
        });
        await act(async () => {
            await user.click(within(dialog).getByRole('button', {name: /Create/i}));
        });
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        const dialog2 = await openDialog('create');
        expect(within(dialog2).getByRole('textbox', {name: /Key Name/i}).value).toBe('');
    });

    test('token lost after delete triggers error', async () => {
        mockFetch({keys: [{name: 'k1', node: 'n1', size: 5}]});
        await renderAndWait('root/cfg/cfg1', 1);
        global.fetch = vi.fn((url, options) => {
            if (url.includes('/data/key') && options?.method === 'DELETE') {
                mockLocalStorage.getItem.mockReturnValue(null);
                return Promise.resolve({ok: true});
            }
            if (url.includes('/data/keys')) return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({items: []})
            });
            return Promise.resolve({ok: true});
        });
        const dialog = await openDialog('delete', 'k1');
        await act(async () => {
            await user.click(within(dialog).getByRole('button', {name: /Delete/i}));
        });
        await waitFor(() => expect(openSnackbar).toHaveBeenCalledWith("Key 'k1' deleted successfully"));
        expect(await screen.findByText(/Auth token not found/i)).toBeInTheDocument();
    });

    test('create text sends Blob, update file sends File', async () => {
        let capturedBody;
        mockFetch({keys: [{name: 'key1', node: 'n1', size: 10}]});
        await renderAndWait('root/cfg/cfg1', 1);

        let dialog = await openDialog('create');
        await selectInputMode(dialog, 'text');
        await act(async () => {
            await user.type(within(dialog).getByRole('textbox', {name: /Key Name/i}), 'blobKey');
        });
        const textArea = within(dialog).getByPlaceholderText(/Enter the text content/i);
        await act(async () => {
            await user.type(textArea, 'data');
        });
        global.fetch = vi.fn((url, options = {}) => {
            if (url.includes('/data/key') && options.method === 'POST') {
                capturedBody = options.body;
                return Promise.resolve({ok: true});
            }
            if (url.includes('/data/keys')) return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({items: [{name: 'key1', node: 'n1', size: 10}]})
            });
            return Promise.resolve({ok: true, blob: () => Promise.resolve(makeMockBlob(encodeText('text')))});
        });
        await act(async () => {
            await user.click(within(dialog).getByRole('button', {name: /Create/i}));
        });
        await waitFor(() => expect(capturedBody instanceof Blob).toBe(true));

        dialog = await openDialog('edit');
        await waitFor(() => expect(queryLoading(within(dialog))).not.toBeInTheDocument());
        await uploadFileInDialog(dialog, 'update');
        global.fetch = vi.fn((url, options = {}) => {
            if (url.includes('/data/key') && options.method === 'PUT') {
                capturedBody = options.body;
                return Promise.resolve({ok: true});
            }
            if (url.includes('/data/keys')) return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({items: [{name: 'key1', node: 'n1', size: 10}]})
            });
            return Promise.resolve({ok: true, blob: () => Promise.resolve(makeMockBlob(encodeText('text')))});
        });
        await act(async () => {
            await user.click(within(dialog).getByRole('button', {name: /Update/i}));
        });
        await waitFor(() => expect(capturedBody instanceof File).toBe(true));
    });

    // ── Secret-specific tests ─────────────────────────────────────────────

    test('secret view is hidden by default', async () => {
        mockFetch({
            keys: [{name: 'sk', node: 'n', size: 11}],
            keyBlob: makeMockBlob(encodeText('supersecret')),
        });
        await renderAndWait('root/sec/sec1', 1);
        await openDialog('view', 'sk');
        const dialog = screen.getByRole('dialog');
        await waitFor(() => expect(queryLoading(within(dialog))).not.toBeInTheDocument());

        // The "hidden by default" message must be visible
        expect(within(dialog).getByText(/hidden by default/i)).toBeInTheDocument();
        // The secret content must NOT be displayed
        expect(within(dialog).queryByDisplayValue('supersecret')).not.toBeInTheDocument();
    });

    test('secret reveal button toggles content visibility', async () => {
        mockFetch({
            keys: [{name: 'sk', node: 'n', size: 11}],
            keyBlob: makeMockBlob(encodeText('supersecret')),
        });
        await renderAndWait('root/sec/sec1', 1);
        await openDialog('view', 'sk');
        const dialog = screen.getByRole('dialog');
        await waitFor(() => expect(queryLoading(within(dialog))).not.toBeInTheDocument());

        // "Reveal secret" button present
        const revealBtn = within(dialog).getByRole('button', {name: /reveal secret/i});
        await act(async () => {
            await user.click(revealBtn);
        });
        expect(within(dialog).getByDisplayValue('supersecret')).toBeInTheDocument();
        expect(within(dialog).queryByText(/hidden by default/i)).not.toBeInTheDocument();

        // "Hide secret" button now present
        const hideBtn = within(dialog).getByRole('button', {name: /hide secret/i});
        await act(async () => {
            await user.click(hideBtn);
        });
        expect(within(dialog).queryByDisplayValue('supersecret')).not.toBeInTheDocument();
        expect(within(dialog).getByText(/hidden by default/i)).toBeInTheDocument();
    });

    test('a revealed secret is masked again on its own after 10 seconds', async () => {
        mockFetch({
            keys: [{name: 'sk', node: 'n', size: 11}],
            keyBlob: makeMockBlob(encodeText('supersecret')),
        });
        await renderAndWait('root/sec/sec1', 1);
        await openDialog('view', 'sk');
        const dialog = screen.getByRole('dialog');
        await waitFor(() => expect(queryLoading(within(dialog))).not.toBeInTheDocument());

        vi.useFakeTimers();
        try {
            fireEvent.click(within(dialog).getByRole('button', {name: /reveal secret/i}));
            expect(within(dialog).getByDisplayValue('supersecret')).toBeInTheDocument();
            expect(within(dialog).getByText(/Masked again in 10 seconds/)).toBeInTheDocument();

            act(() => vi.advanceTimersByTime(3_000));
            expect(within(dialog).getByText(/Masked again in 7 seconds/)).toBeInTheDocument();

            act(() => vi.advanceTimersByTime(6_000));
            expect(within(dialog).getByText(/Masked again in 1 second\./)).toBeInTheDocument();

            act(() => vi.advanceTimersByTime(999));
            expect(within(dialog).getByDisplayValue('supersecret')).toBeInTheDocument();

            act(() => vi.advanceTimersByTime(1));
            expect(within(dialog).queryByDisplayValue('supersecret')).not.toBeInTheDocument();
            expect(within(dialog).getByText(/hidden by default/i)).toBeInTheDocument();
            expect(within(dialog).getByRole('button', {name: /reveal secret/i})).toBeInTheDocument();
        } finally {
            vi.useRealTimers();
        }
    });

    test('cfg view does not show reveal button and displays content directly', async () => {
        mockFetch({
            keys: [{name: 'ck', node: 'n', size: 5}],
            keyBlob: makeMockBlob(encodeText('hello')),
        });
        await renderAndWait('root/cfg/cfg1', 1);
        await openDialog('view', 'ck');
        const dialog = screen.getByRole('dialog');
        await waitFor(() => expect(queryLoading(within(dialog))).not.toBeInTheDocument());

        expect(within(dialog).queryByRole('button', {name: /reveal secret/i})).not.toBeInTheDocument();
        expect(within(dialog).queryByRole('button', {name: /hide secret/i})).not.toBeInTheDocument();
        expect(within(dialog).getByDisplayValue('hello')).toBeInTheDocument();
    });

    test('secret view resets reveal state on reopen', async () => {
        mockFetch({
            keys: [{name: 'sk', node: 'n', size: 11}],
            keyBlob: makeMockBlob(encodeText('supersecret')),
        });
        await renderAndWait('root/sec/sec1', 1);

        // Open and reveal
        let dialog = await openDialog('view', 'sk');
        await waitFor(() => expect(queryLoading(within(dialog))).not.toBeInTheDocument());
        await act(async () => {
            await user.click(within(dialog).getByRole('button', {name: /reveal secret/i}));
        });
        expect(within(dialog).getByDisplayValue('supersecret')).toBeInTheDocument();

        // Close
        await act(async () => {
            await user.click(within(dialog).getAllByRole('button', {name: /^Close$/}).at(-1));
        });
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

        // Reopen → must be hidden by default
        dialog = await openDialog('view', 'sk');
        await waitFor(() => expect(queryLoading(within(dialog))).not.toBeInTheDocument());
        expect(within(dialog).getByText(/hidden by default/i)).toBeInTheDocument();
        expect(within(dialog).queryByDisplayValue('supersecret')).not.toBeInTheDocument();
    });

    test('secret edit does not fetch content and shows info message', async () => {
        let fetchKeyCalled = false;
        mockFetch({
            keys: [{name: 'sk', node: 'n', size: 11}],
            methods: {
                GET: (url) => {
                    if (url.includes('/data/key?name=')) {
                        fetchKeyCalled = true;
                        return Promise.resolve({
                            ok: true,
                            blob: () => Promise.resolve(makeMockBlob(encodeText('supersecret'))),
                        });
                    }
                    return undefined;
                },
            },
        });
        await renderAndWait('root/sec/sec1', 1);
        const dialog = await openDialog('edit', 'sk');

        await waitFor(() => expect(openSnackbar).toHaveBeenCalledWith(
            "Secret content is hidden. Provide new content to update it.",
            "info"
        ));
        // No GET request to /data/key to fetch the content
        expect(fetchKeyCalled).toBe(false);
        // The form must default to "file" mode
        expect(within(dialog).getByRole('radio', {name: /Upload from file/i})).toBeChecked();
        // No spinner
        expect(queryLoading(within(dialog))).not.toBeInTheDocument();
    });

    test('secret edit uploads new content via file', async () => {
        let capturedBody;
        let fetchKeyCalled = false;
        mockFetch({
            keys: [{name: 'sk', node: 'n', size: 11}],
            methods: {
                GET: (url) => {
                    if (url.includes('/data/key?name=')) {
                        fetchKeyCalled = true;
                    }
                    return undefined;
                },
                PUT: (url, options) => {
                    capturedBody = options.body;
                    return Promise.resolve({ok: true});
                },
            },
        });
        await renderAndWait('root/sec/sec1', 1);
        const dialog = await openDialog('edit', 'sk');

        await waitFor(() => expect(openSnackbar).toHaveBeenCalledWith(
            "Secret content is hidden. Provide new content to update it.",
            "info"
        ));

        await uploadFileInDialog(dialog, 'update');
        await act(async () => {
            await user.click(within(dialog).getByRole('button', {name: /Update/i}));
        });

        await waitFor(() => expect(openSnackbar).toHaveBeenCalledWith("Key 'sk' updated successfully"));
        expect(capturedBody).toBeInstanceOf(File);
        expect(fetchKeyCalled).toBe(false);
    });

    test('secret delete works normally', async () => {
        mockFetch({
            keys: [{name: 'sk', node: 'n', size: 11}],
            methods: {DELETE: () => Promise.resolve({ok: true})},
        });
        await renderAndWait('root/sec/sec1', 1);
        const dialog = await openDialog('delete', 'sk');
        await act(async () => {
            await user.click(within(dialog).getByRole('button', {name: /Delete/i}));
        });
        await waitFor(() => expect(openSnackbar).toHaveBeenCalledWith("Key 'sk' deleted successfully"));
    });

    test('secret create works normally', async () => {
        mockFetch({
            keys: [],
            methods: {POST: () => Promise.resolve({ok: true})},
        });
        await renderAndWait('root/sec/sec1', 0);
        const dialog = await openDialog('create');
        await act(async () => {
            await user.type(within(dialog).getByRole('textbox', {name: /Key Name/i}), 'newSecret');
        });
        await selectInputMode(dialog, 'text');
        const textArea = within(dialog).getByPlaceholderText(/Enter the text content/i);
        await act(async () => {
            await user.type(textArea, 'mySecretValue');
        });
        await act(async () => {
            await user.click(within(dialog).getByRole('button', {name: /Create/i}));
        });
        await waitFor(() => expect(openSnackbar).toHaveBeenCalledWith("Key 'newSecret' created successfully"));
    });

    test('secret view shows reveal button with correct initial label', async () => {
        mockFetch({
            keys: [{name: 'sk', node: 'n', size: 11}],
            keyBlob: makeMockBlob(encodeText('topsecret')),
        });
        await renderAndWait('root/sec/sec1', 1);
        await openDialog('view', 'sk');
        const dialog = screen.getByRole('dialog');
        await waitFor(() => expect(queryLoading(within(dialog))).not.toBeInTheDocument());

        // Initially the button must invite to reveal
        expect(within(dialog).getByRole('button', {name: /reveal secret/i})).toBeInTheDocument();
        expect(within(dialog).queryByRole('button', {name: /hide secret/i})).not.toBeInTheDocument();
    });

    test('secret binary view shows hex after reveal', async () => {
        mockFetch({
            keys: [{name: 'sk', node: 'n', size: 2}],
            keyBlob: makeMockBlob(new Uint8Array([0x00, 0x01])),
        });
        await renderAndWait('root/sec/sec1', 1);
        await openDialog('view', 'sk');
        const dialog = screen.getByRole('dialog');
        await waitFor(() => expect(queryLoading(within(dialog))).not.toBeInTheDocument());

        // Hidden by default even for binary
        expect(within(dialog).getByText(/hidden by default/i)).toBeInTheDocument();
        expect(within(dialog).getByText(/Binary \(Hex View\)/i)).toBeInTheDocument();

        // Reveal → hexdump visible
        await act(async () => {
            await user.click(within(dialog).getByRole('button', {name: /reveal secret/i}));
        });
        expect(within(dialog).queryByText(/hidden by default/i)).not.toBeInTheDocument();
        expect(within(dialog).getByDisplayValue(/00000000/)).toBeInTheDocument();
    });

    test('secret edit in text mode sends Blob', async () => {
        let capturedBody;
        mockFetch({
            keys: [{name: 'sk', node: 'n', size: 11}],
            methods: {
                PUT: (url, options) => {
                    capturedBody = options.body;
                    return Promise.resolve({ok: true});
                },
            },
        });
        await renderAndWait('root/sec/sec1', 1);
        const dialog = await openDialog('edit', 'sk');
        await waitFor(() => expect(openSnackbar).toHaveBeenCalledWith(
            "Secret content is hidden. Provide new content to update it.", "info"
        ));

        await selectInputMode(dialog, 'text');
        const textArea = within(dialog).getByPlaceholderText(/Enter the text content/i);
        await act(async () => {
            await user.type(textArea, 'newsecret');
        });
        await act(async () => {
            await user.click(within(dialog).getByRole('button', {name: /Update/i}));
        });

        await waitFor(() => expect(openSnackbar).toHaveBeenCalledWith("Key 'sk' updated successfully"));
        expect(capturedBody).toBeInstanceOf(Blob);
        expect(capturedBody).not.toBeInstanceOf(File);
    });

    test('secret edit never shows loading spinner', async () => {
        mockFetch({keys: [{name: 'sk', node: 'n', size: 11}]});
        await renderAndWait('root/sec/sec1', 1);
        const dialog = await openDialog('edit', 'sk');
        // Check immediately then after a few ticks
        expect(queryLoading(within(dialog))).not.toBeInTheDocument();
        await act(async () => {
            await Promise.resolve();
        });
        expect(queryLoading(within(dialog))).not.toBeInTheDocument();
    });

    test('secret edit resets between opens', async () => {
        mockFetch({keys: [{name: 'sk', node: 'n', size: 11}]});
        await renderAndWait('root/sec/sec1', 1);

        let dialog = await openDialog('edit', 'sk');
        await waitFor(() => expect(openSnackbar).toHaveBeenCalledWith(
            "Secret content is hidden. Provide new content to update it.", "info"
        ));
        await selectInputMode(dialog, 'text');
        await act(async () => {
            await user.type(within(dialog).getByPlaceholderText(/Enter the text content/i), 'leaked');
        });
        await act(async () => {
            await user.click(within(dialog).getByRole('button', {name: /Cancel/i}));
        });
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

        dialog = await openDialog('edit', 'sk');
        expect(within(dialog).getByRole('radio', {name: /Upload from file/i})).toBeChecked();
        expect(within(dialog).queryByDisplayValue('leaked')).not.toBeInTheDocument();
    });

    test('reveal state does not leak to cfg view', async () => {
        mockFetch({
            keys: [{name: 'sk', node: 'n', size: 5}],
            keyBlob: makeMockBlob(encodeText('secret')),
        });
        await renderAndWait('root/sec/sec1', 1);
        let dialog = await openDialog('view', 'sk');
        await waitFor(() => expect(queryLoading(within(dialog))).not.toBeInTheDocument());
        await act(async () => {
            await user.click(within(dialog).getByRole('button', {name: /reveal secret/i}));
        });
        await act(async () => {
            await user.click(within(dialog).getAllByRole('button', {name: /^Close$/}).at(-1));
        });
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

        // Re-render as cfg
        cleanup();
        mockFetch({
            keys: [{name: 'ck', node: 'n', size: 5}],
            keyBlob: makeMockBlob(encodeText('hello')),
        });
        await renderAndWait('root/cfg/cfg1', 1);
        await openDialog('view', 'ck');
        dialog = screen.getByRole('dialog');
        await waitFor(() => expect(queryLoading(within(dialog))).not.toBeInTheDocument());
        expect(within(dialog).queryByRole('button', {name: /reveal secret/i})).not.toBeInTheDocument();
        expect(within(dialog).getByDisplayValue('hello')).toBeInTheDocument();
    });

    test('secret reveal button is enabled in view dialog', async () => {
        mockFetch({
            keys: [{name: 'sk', node: 'n', size: 5}],
            keyBlob: makeMockBlob(encodeText('x')),
        });
        await renderAndWait('root/sec/sec1', 1);
        await openDialog('view', 'sk');
        const dialog = screen.getByRole('dialog');
        await waitFor(() => expect(queryLoading(within(dialog))).not.toBeInTheDocument());
        expect(within(dialog).getByRole('button', {name: /reveal secret/i})).not.toBeDisabled();
    });

    test.each([
        'root/sec/sec1',
        'root/sec/mysecret',
        'root/sec/a-very-long-secret-name',
        'root/sec/123',
    ])('detects secret kind for path %s', async (path) => {
        mockFetch({
            keys: [{name: 'sk', node: 'n', size: 5}],
            keyBlob: makeMockBlob(encodeText('x')),
        });
        await renderAndWait(path, 1);
        await openDialog('view', 'sk');
        const dialog = screen.getByRole('dialog');
        await waitFor(() => expect(queryLoading(within(dialog))).not.toBeInTheDocument());
        expect(within(dialog).getByText(/hidden by default/i)).toBeInTheDocument();
    });

    test('secret edit does not fetch content on cancel', async () => {
        let keyContentCalls = 0;
        mockFetch({
            keys: [{name: 'sk', node: 'n', size: 11}],
            methods: {
                GET: (url) => {
                    if (url.includes('/data/key?name=')) keyContentCalls++;
                    return undefined;
                },
            },
        });
        await renderAndWait('root/sec/sec1', 1);
        const dialog = await openDialog('edit', 'sk');
        await act(async () => {
            await user.click(within(dialog).getByRole('button', {name: /Cancel/i}));
        });
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(keyContentCalls).toBe(0);
    });

    test('secret with empty content can be revealed', async () => {
        mockFetch({
            keys: [{name: 'sk', node: 'n', size: 0}],
            keyBlob: makeMockBlob(new Uint8Array([])),
        });
        await renderAndWait('root/sec/sec1', 1);
        await openDialog('view', 'sk');
        const dialog = screen.getByRole('dialog');
        await waitFor(() => expect(queryLoading(within(dialog))).not.toBeInTheDocument());
        await act(async () => {
            await user.click(within(dialog).getByRole('button', {name: /reveal secret/i}));
        });
        // Empty content is displayed without crashing
        expect(within(dialog).queryByText(/hidden by default/i)).not.toBeInTheDocument();
    });
});

describe('KeysSection in French', () => {
    afterEach(async () => {
        await i18n.changeLanguage('en');
    });

    test('shows the keys table in French', async () => {
        await i18n.changeLanguage('fr');
        mockFetch({keys: [{name: 'key1', node: 'node1', size: 12}]});
        render(<KeysSection decodedObjectName="root/cfg/cfg1" openSnackbar={openSnackbar}/>);
        expect(await screen.findByText("Clés de l'objet (1)")).toBeInTheDocument();
        expect(screen.getByText('12 octets')).toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'Supprimer la clé key1'})).toBeInTheDocument();
    });
});
