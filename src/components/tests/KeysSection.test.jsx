import React from 'react';
import {render, screen, waitFor, act, within, fireEvent} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import KeysSection from '../KeysSection';

jest.mock('../../hooks/useEventStore.js', () => jest.fn());
jest.mock('../../eventSourceManager.jsx', () => ({
    closeEventSource: jest.fn(),
    startEventReception: jest.fn(),
    configureEventSource: jest.fn(),
}));

jest.mock('@mui/material', () => {
    const actual = jest.requireActual('@mui/material');
    const {RadioGroup, FormControlLabel, ...rest} = actual;

    return {
        ...rest,
        RadioGroup,
        FormControlLabel,
        CircularProgress: () => <div role="progressbar">Loading...</div>,
        Dialog: ({children, open, onClose, fullScreen, ...props}) =>
            open ? (
                <div role="dialog" data-fullscreen={fullScreen ? 'true' : 'false'}
                     onKeyDown={e => e.key === 'Escape' && onClose?.()} {...props}>
                    {children}
                </div>
            ) : null,
        TextField: ({label, value, onChange, disabled, multiline, placeholder, ...props}) => (
            <input type="text" placeholder={placeholder || label} value={value} onChange={onChange}
                   disabled={disabled} {...(multiline ? {'data-multiline': true} : {})} {...props} />
        ),
        IconButton: ({children, onClick, disabled, 'aria-label': ariaLabel}) => (
            <button onClick={onClick} disabled={disabled} aria-label={ariaLabel}>{children}</button>
        ),
        Button: ({children, onClick, disabled, component, htmlFor}) => (
            <button onClick={onClick} disabled={disabled} {...(component === 'label' ? {htmlFor} : {})}>
                {children}
            </button>
        ),
        Typography: ({children}) => <span>{children}</span>,
        Box: ({children}) => <div>{children}</div>,
        Tooltip: ({children, title}) => <div data-tooltip={title}>{children}</div>,
        Table: ({children}) => <table>{children}</table>,
        TableHead: ({children}) => <thead>{children}</thead>,
        TableBody: ({children}) => <tbody>{children}</tbody>,
        TableRow: ({children}) => <tr>{children}</tr>,
        TableCell: ({children}) => <td>{children}</td>,
        Paper: ({children}) => <div>{children}</div>,
        FormControl: ({children}) => <div>{children}</div>,
        FormLabel: ({children}) => <label>{children}</label>,
        DialogTitle: ({children}) => <div>{children}</div>,
        DialogContent: ({children}) => <div>{children}</div>,
        DialogActions: ({children}) => <div>{children}</div>,
        Alert: ({children, severity}) => <div role="alert" data-severity={severity}>{children}</div>,
    };
});

['Add', 'Edit', 'Delete', 'Visibility'].forEach(icon => jest.mock(`@mui/icons-material/${icon}`, () => () => <span/>));
jest.mock('@mui/icons-material/Fullscreen', () => () => <span data-testid="fullscreen-icon"/>);
jest.mock('@mui/icons-material/FullscreenExit', () => () => <span data-testid="fullscreen-exit-icon"/>);

Object.defineProperty(global, 'localStorage', {
    value: {getItem: jest.fn(() => 'mock-token'), setItem: jest.fn(), removeItem: jest.fn()},
});

const user = userEvent.setup();
const openSnackbar = jest.fn();
const encodeText = (text) => new TextEncoder().encode(text);
const makeMockBlob = (uint8Array) => ({
    arrayBuffer: () => Promise.resolve(uint8Array.buffer.slice(uint8Array.byteOffset, uint8Array.byteOffset + uint8Array.byteLength)),
    size: uint8Array.byteLength,
    type: 'application/octet-stream',
});

const mockFetch = ({keys = [], keyBlob = null, methods = {}} = {}) => {
    global.fetch = jest.fn((url, options = {}) => {
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
    await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument());
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
    const nameInput = within(dialog).getByPlaceholderText('Key Name');
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
    jest.clearAllMocks();
    global.localStorage.getItem.mockReturnValue('mock-token');
});

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
        global.fetch = jest.fn(() => new Promise(() => {
        }));
        render(<KeysSection decodedObjectName="root/cfg/cfg1" openSnackbar={openSnackbar}/>);
        expect(await screen.findByRole('progressbar')).toBeInTheDocument();
    });

    test('displays fetch error', async () => {
        global.fetch = jest.fn(() => Promise.reject(new Error('Fail')));
        await renderAndWait('root/cfg/cfg1', 0);
        expect(screen.getByText(/Fail/i)).toBeInTheDocument();
    });

    test('displays HTTP error', async () => {
        global.fetch = jest.fn(() => Promise.resolve({ok: false, status: 500}));
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
            await user.type(within(dialog).getByPlaceholderText('Key Name'), 'emptyKey');
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
            methods: {[method]: () => Promise.resolve({ok: false, status: 400})}
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
            methods: {[method]: () => Promise.reject(new Error('Network error'))}
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
        global.localStorage.getItem.mockReturnValue(null);
        await actionFn(dialog);
        await waitFor(() => expect(openSnackbar).toHaveBeenCalledWith('Auth token not found.', 'error'));
    });

    test('auth token missing for view', async () => {
        mockFetch({keys: [{name: 'key1', node: 'n1', size: 10}]});
        await renderAndWait('root/cfg/cfg1', 1);
        global.localStorage.getItem.mockReturnValue(null);
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
            }
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
            await user.type(within(dialog).getByPlaceholderText('Key Name'), 'test');
        });
        expect(within(dialog).getByRole('button', {name: /Create/i})).toBeDisabled();
    });

    test.each(['create', 'edit', 'delete', 'view'])('%s dialog closes with Cancel/Escape', async (action) => {
        mockFetch({
            keys: [{name: 'key1', node: 'n1', size: 10}],
            keyBlob: action === 'view' ? makeMockBlob(encodeText('t')) : undefined
        });
        if (action === 'create') await renderAndWait('root/cfg/cfg1', 0);
        else await renderAndWait('root/cfg/cfg1', 1);
        let dialog = await openDialog(action);
        if (action === 'view') await waitFor(() => expect(within(dialog).queryByRole('progressbar')).not.toBeInTheDocument());
        await act(async () => {
            await user.click(within(dialog).getByRole('button', {name: /(Cancel|Close)/i}));
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
        await waitFor(() => expect(within(dialog).queryByRole('progressbar')).not.toBeInTheDocument());
        expect(within(dialog).getByText(/Type:\s*Text/i)).toBeInTheDocument();
        expect(within(dialog).getByDisplayValue('hello')).toBeInTheDocument();
    });

    test('view shows binary', async () => {
        mockFetch({keys: [{name: 'bk', node: 'n', size: 2}], keyBlob: makeMockBlob(new Uint8Array([0x00, 0x07]))});
        await renderAndWait('root/cfg/cfg1', 1);
        await openDialog('view', 'bk');
        const dialog = screen.getByRole('dialog');
        await waitFor(() => expect(within(dialog).queryByRole('progressbar')).not.toBeInTheDocument());
        expect(within(dialog).getByText(/Binary \(Hex View\)/i)).toBeInTheDocument();
    });

    test('view error closes dialog', async () => {
        mockFetch({
            keys: [{name: 'key1', node: 'n1', size: 1}],
            methods: {
                GET: (url) => {
                    if (url.includes('/data/key?name=')) return Promise.resolve({ok: false, status: 500});
                }
            }
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
                GET: (url) => {
                    if (url.includes('/data/key?name=')) {
                        return Promise.resolve({
                            ok: true,
                            blob: () => new Promise(r => {
                                resolveBlob = r;
                            })
                        });
                    }
                }
            }
        });
        await renderAndWait('root/cfg/cfg1', 1);
        const dialog = await openDialog('edit', 'key1');
        expect(within(dialog).getByRole('progressbar')).toBeInTheDocument();
        await act(async () => resolveBlob(makeMockBlob(encodeText('hi'))));
        await waitFor(() => expect(within(dialog).queryByRole('progressbar')).not.toBeInTheDocument());
    });

    test('update binary falls back to file', async () => {
        mockFetch({
            keys: [{name: 'b', node: 'n', size: 2}],
            keyBlob: makeMockBlob(new Uint8Array([0x00, 0x01]))
        });
        await renderAndWait('root/cfg/cfg1', 1);
        const dialog = await openDialog('edit', 'b');
        await waitFor(() => expect(openSnackbar).toHaveBeenCalledWith("Key is binary – please use file upload to update.", "info"));
        expect(within(dialog).getByRole('radio', {name: /Upload from file/i})).toBeChecked();
    });

    test('update prefetch error', async () => {
        mockFetch({
            keys: [{name: 'key1', node: 'n1', size: 1}],
            methods: {
                GET: (url) => {
                    if (url.includes('/data/key?name=')) return Promise.reject(new Error('fail'));
                }
            }
        });
        await renderAndWait('root/cfg/cfg1', 1);
        await openDialog('edit', 'key1');
        await waitFor(() => expect(openSnackbar).toHaveBeenCalledWith('Error: fail', 'error'));
    });

    test('fullscreen toggles', async () => {
        mockFetch({keys: []});
        await renderAndWait('root/cfg/cfg1', 0);
        const dialog = await openDialog('create');
        await selectInputMode(dialog, 'text');
        const fullscreenBtn = within(dialog).getByTestId('fullscreen-icon').closest('button');
        await act(async () => {
            await user.click(fullscreenBtn);
        });
        await waitFor(() => expect(screen.getByRole('dialog')).toHaveAttribute('data-fullscreen', 'true'));
        const exitBtn = within(screen.getByRole('dialog')).getByTestId('fullscreen-exit-icon').closest('button');
        await act(async () => {
            await user.click(exitBtn);
        });
        expect(screen.getByRole('dialog')).toHaveAttribute('data-fullscreen', 'false');
    });

    test('fullscreen hides fields', async () => {
        mockFetch({keys: []});
        await renderAndWait('root/cfg/cfg1', 0);
        const dialog = await openDialog('create');
        await selectInputMode(dialog, 'text');
        await act(async () => {
            await user.click(within(dialog).getByTestId('fullscreen-icon').closest('button'));
        });
        const fullDlg = screen.getByRole('dialog');
        expect(within(fullDlg).queryByPlaceholderText('Key Name')).not.toBeInTheDocument();
        expect(within(fullDlg).queryByRole('radiogroup')).not.toBeInTheDocument();
    });

    test('cancel after fullscreen resets', async () => {
        mockFetch({keys: []});
        await renderAndWait('root/cfg/cfg1', 0);
        const dialog = await openDialog('create');
        await selectInputMode(dialog, 'text');
        await act(async () => {
            await user.click(within(dialog).getByTestId('fullscreen-icon').closest('button'));
        });
        await act(async () => {
            await user.click(within(screen.getByRole('dialog')).getByRole('button', {name: /Cancel/i}));
        });
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        const newDialog = await openDialog('create');
        expect(newDialog).toHaveAttribute('data-fullscreen', 'false');
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
            await user.type(within(dialog).getByPlaceholderText('Key Name'), 'temp');
        });
        await act(async () => {
            await user.click(within(dialog).getByRole('button', {name: /Create/i}));
        });
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        const dialog2 = await openDialog('create');
        expect(within(dialog2).getByPlaceholderText('Key Name').value).toBe('');
    });

    test('token lost after delete triggers error', async () => {
        mockFetch({keys: [{name: 'k1', node: 'n1', size: 5}]});
        await renderAndWait('root/cfg/cfg1', 1);
        global.fetch = jest.fn((url, options) => {
            if (url.includes('/data/key') && options?.method === 'DELETE') {
                global.localStorage.getItem.mockReturnValue(null);
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
            await user.type(within(dialog).getByPlaceholderText('Key Name'), 'blobKey');
        });
        const textArea = within(dialog).getByPlaceholderText(/Enter the text content/i);
        await act(async () => {
            await user.type(textArea, 'data');
        });
        global.fetch = jest.fn((url, options = {}) => {
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
        await waitFor(() => expect(within(dialog).queryByRole('progressbar')).not.toBeInTheDocument());
        await uploadFileInDialog(dialog, 'update');
        global.fetch = jest.fn((url, options = {}) => {
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
});
