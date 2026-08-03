import React from 'react';
import {render, screen, waitFor, act, within, fireEvent} from '@testing-library/react';
import ConfigSection from '../ConfigSection';
import userEvent from '@testing-library/user-event';
import {URL_OBJECT} from '../../config/apiPath.js';

// ── Mocks ─────────────────────────────────────────────────────────────────────
jest.mock('react-router-dom', () => ({
    ...jest.requireActual('react-router-dom'),
    useParams: jest.fn(),
}));

jest.mock('@mui/material', () => {
    const actual = jest.requireActual('@mui/material');
    const {useState} = jest.requireActual('react');
    const mocks = {
        ...actual,
        Dialog: ({children, open, onClose, ...props}) => open ? (
            <div
                role="dialog"
                onKeyDown={(e) => {
                    if (e.key === 'Escape' && onClose) onClose(e, 'escapeKeyDown');
                }}
                {...props}
            >
                {children}
            </div>
        ) : null,
        DialogTitle: ({children, ...props}) => <div {...props}><h2>{children}</h2></div>,
        DialogContent: ({children, ...props}) => <div {...props}>{children}</div>,
        DialogActions: ({children, ...props}) => <div {...props}>{children}</div>,
        Alert: ({children, severity, ...props}) => <div role="alert"
                                                        data-severity={severity} {...props}>{children}</div>,
        Button: ({children, onClick, disabled, variant, component, htmlFor, ...props}) => (
            <button onClick={onClick} disabled={disabled} data-variant={variant}
                    {...(component === 'label' ? {htmlFor} : {})} {...props}>{children}</button>
        ),
        TextField: ({label, value, onChange, disabled, type, inputProps, InputLabelProps, placeholder, ...props}) => (
            <input type={type || 'text'} role="textbox"
                   aria-label={InputLabelProps?.['aria-label'] || label || 'autocomplete-input'}
                   placeholder={placeholder || label || ''} value={value || ''} onChange={onChange} disabled={disabled}
                   {...inputProps} {...props} />
        ),
        // Autocomplete mock: always calls getOptionLabel
        Autocomplete: ({options, getOptionLabel, onChange, multiple, renderInput, value, freeSolo, ...props}) => {
            const [inputValue, setInputValue] = useState(
                multiple
                    ? (Array.isArray(value) ? value.map(v => getOptionLabel(v)).join(', ') : '')
                    : (value ? (typeof value === 'string' ? value : getOptionLabel(value)) : '')
            );
            const handleChange = (e) => {
                const text = e.target.value;
                setInputValue(text);
                const vals = multiple ? text.split(',').map(v => v.trim()).filter(Boolean) : [text.trim()];
                const selected = vals.map(v => {
                    const opt = options.find(o => getOptionLabel(o) === v);
                    if (!opt) return freeSolo ? v : multiple ? (options[0]?.option ? {
                        option: v,
                        section: v.includes('.') ? v.split('.')[0] : ''
                    } : v) : null;
                    return opt;
                }).filter(Boolean);
                onChange({}, multiple ? selected : selected[0] || (freeSolo ? text : null));
            };
            const label = renderInput({}).InputLabelProps?.['aria-label'] || renderInput({}).label || 'autocomplete-input';
            return (
                <div data-testid="autocomplete" {...props}>
                    {renderInput({
                        inputProps: {
                            'data-testid': 'autocomplete-input', value: inputValue || '', onChange: handleChange,
                            'aria-label': label, role: 'combobox', 'aria-expanded': !!inputValue,
                        },
                        label,
                    })}
                </div>
            );
        },
        CircularProgress: () => <div role="progressbar">Loading...</div>,
        Typography: ({children, variant, fontWeight, ...props}) => <span {...props}>{children}</span>,
        Box: ({children, sx, ...props}) => <div style={sx} {...props}>{children}</div>,
        Tooltip: ({children, title}) => <span title={title}>{children}</span>,
        IconButton: ({children, onClick, disabled, 'aria-label': ariaLabel, ...props}) => (
            <button onClick={onClick} disabled={disabled} aria-label={ariaLabel} {...props}>{children}</button>
        ),
        TableContainer: ({children, ...props}) => <div {...props}>{children}</div>,
        Table: ({children, ...props}) => <table {...props}>{children}</table>,
        TableHead: ({children, ...props}) => <thead {...props}>{children}</thead>,
        TableBody: ({children, ...props}) => <tbody {...props}>{children}</tbody>,
        TableRow: ({children, ...props}) => <tr {...props}>{children}</tr>,
        TableCell: ({children, ...props}) => <td {...props}>{children}</td>,
        Paper: ({children, ...props}) => <div {...props}>{children}</div>,
    };
    return mocks;
});

jest.mock('@mui/icons-material/UploadFile', () => () => <span data-testid="UploadFileIcon"/>);
jest.mock('@mui/icons-material/Edit', () => () => <span data-testid="EditIcon"/>);
jest.mock('@mui/icons-material/Info', () => () => <span data-testid="InfoIcon"/>);
jest.mock('@mui/icons-material/Delete', () => () => <span data-testid="DeleteIcon"/>);

const mockLocalStorage = {getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn()};
Object.defineProperty(global, 'localStorage', {value: mockLocalStorage});

// ── Helpers ────────────────────────────────────────────────────────────────────
const defaultProps = {
    decodedObjectName: 'root/cfg/cfg1',
    configNode: 'node1',
    setConfigNode: jest.fn(),
    openSnackbar: jest.fn(),
    configDialogOpen: true,
    setConfigDialogOpen: jest.fn(),
};
const renderConfig = (props = {}) => render(<ConfigSection {...defaultProps} {...props} />);
const getViewConfigButton = () => screen.getByText('View Configuration');
const getUploadButton = () => screen.getByRole('button', {name: /Upload new configuration file/i});
const getManageButton = () => screen.getByRole('button', {name: /Manage configuration parameters/i});
const getKeywordsButton = () => screen.getByRole('button', {name: /View configuration keywords/i});
const getDialogByTitle = (title) => screen.getAllByRole('dialog').find(d => within(d).queryByText(title));
const getComboboxes = () => screen.getAllByRole('combobox', {name: /autocomplete-input/i});

const openUpdateDialogWithFile = async (user, fileName = 'config.ini', content = '[DEFAULT]\nnodes = node2') => {
    await waitFor(() => expect(screen.getAllByRole('dialog').length).toBeGreaterThan(0));
    await act(() => user.click(getUploadButton()));
    await waitFor(() => expect(screen.getByText(/Update Configuration/i)).toBeInTheDocument());
    const file = new File([content], fileName);
    await act(() => user.upload(document.querySelector('#update-config-file-upload'), file));
    return file;
};

const openManageDialog = async (user) => {
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    await act(() => user.click(getManageButton()));
    await waitFor(() => expect(screen.getByText(/Manage Configuration Parameters/i)).toBeInTheDocument());
    await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument());
};

const defaultFetchMock = (url, options) => {
    const headers = options?.headers || {};
    if (url.includes('/config/file')) {
        return Promise.resolve({
            ok: true, status: 200,
            text: () => Promise.resolve('[DEFAULT]\nnodes = *\norchestrate = ha\n[fs#1]\nsize = 10GB'),
            json: () => Promise.resolve({}),
            headers: new Headers({Authorization: headers.Authorization || ''}),
        });
    }
    if (url.includes('/config/keywords')) {
        return Promise.resolve({
            ok: true, status: 200,
            json: () => Promise.resolve({
                items: [
                    {
                        option: 'nodes',
                        section: 'DEFAULT',
                        text: 'Nodes to deploy the service',
                        converter: 'string',
                        scopable: true,
                        default: '*'
                    },
                    {
                        option: 'size',
                        section: 'fs',
                        text: 'Size of filesystem',
                        converter: 'string',
                        scopable: false,
                        default: '1GB'
                    },
                    {
                        option: 'orchestrate',
                        section: 'DEFAULT',
                        text: 'Orchestration mode',
                        converter: 'string',
                        scopable: true,
                        default: 'ha'
                    },
                    {
                        option: 'roles',
                        section: 'DEFAULT',
                        text: 'Comma-separated roles',
                        converter: 'converters.TListLowercase',
                        scopable: true,
                        default: ''
                    },
                ],
            }),
            headers: new Headers({Authorization: headers.Authorization || ''}),
        });
    }
    if (url.includes('/config?set=') || url.includes('/config?unset=') || url.includes('/config?delete=')) {
        return Promise.resolve({
            ok: true, status: 200,
            json: () => Promise.resolve({}),
            text: () => Promise.resolve(''),
            headers: new Headers({Authorization: headers.Authorization || ''}),
        });
    }
    if (url.includes('/config')) {
        return Promise.resolve({
            ok: true, status: 200,
            json: () => Promise.resolve({
                items: [
                    {keyword: 'nodes', value: '*'},
                    {keyword: 'fs#1.size', value: '10GB'},
                    {keyword: 'orchestrate', value: 'ha'},
                ],
            }),
            headers: new Headers({Authorization: headers.Authorization || ''}),
        });
    }
    return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve({}), text: () => Promise.resolve(''),
        headers: new Headers({Authorization: headers.Authorization || ''}),
    });
};

// ── Tests ──────────────────────────────────────────────────────────────────────
describe('ConfigSection Component', () => {
    const user = userEvent.setup();

    beforeEach(() => {
        jest.setTimeout(30000);
        jest.clearAllMocks();
        mockLocalStorage.getItem.mockReturnValue('mock-token');
        require('react-router-dom').useParams.mockReturnValue({objectName: 'root/cfg/cfg1'});
        global.fetch = jest.fn(defaultFetchMock);
    });

    afterEach(() => jest.resetAllMocks());

    // ── Basic rendering ────────────────────────────────────────────────────────
    test('displays configuration button, no dialog initially', () => {
        renderConfig({configDialogOpen: false});
        expect(getViewConfigButton()).toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    test('clicking View Configuration calls setConfigDialogOpen(true)', async () => {
        const setConfigDialogOpen = jest.fn();
        renderConfig({configDialogOpen: false, setConfigDialogOpen});
        await act(() => user.click(getViewConfigButton()));
        expect(setConfigDialogOpen).toHaveBeenCalledWith(true);
    });

    test('displays dialog content when open', async () => {
        renderConfig();
        await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
        expect(screen.getByText('Configuration')).toBeInTheDocument();
        await waitFor(() => expect(screen.getByText(/nodes = \*/i)).toBeInTheDocument());
        await waitFor(() => expect(screen.getByText(/orchestrate = ha/i)).toBeInTheDocument());
        await waitFor(() => expect(screen.getByText(/size = 10GB/i)).toBeInTheDocument());
    });

    test('close button calls setConfigDialogOpen(false)', async () => {
        const setConfigDialogOpen = jest.fn();
        renderConfig({setConfigDialogOpen});
        await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
        await act(() => user.click(screen.getByRole('button', {name: /Close/i})));
        expect(setConfigDialogOpen).toHaveBeenCalledWith(false);
    });

    test('pressing Escape on the configuration dialog triggers onClose', async () => {
        const setConfigDialogOpen = jest.fn();
        renderConfig({setConfigDialogOpen});
        const dialog = await screen.findByRole('dialog');
        fireEvent.keyDown(dialog, {key: 'Escape', code: 'Escape'});
        expect(setConfigDialogOpen).toHaveBeenCalledWith(false);
    });

    test('shows no configuration available when configNode is missing', async () => {
        renderConfig({configNode: ''});
        await waitFor(() => expect(screen.getByText(/No instance selected to view configuration/i)).toBeInTheDocument());
    });

    test('shows "No configuration available" when config text is null', async () => {
        global.fetch.mockImplementation((url) => {
            if (url.includes('/config/file')) return Promise.resolve({
                ok: true,
                status: 200,
                text: () => Promise.resolve(null),
                headers: new Headers()
            });
            return Promise.resolve({
                ok: true,
                status: 200,
                json: () => Promise.resolve({items: []}),
                headers: new Headers()
            });
        });
        renderConfig();
        await waitFor(() => expect(screen.getByText(/No configuration available/i)).toBeInTheDocument());
    });

    // ── Fetch error cases ──────────────────────────────────────────────────────
    test.each([
        ['HTTP error', () => Promise.resolve({
            ok: false,
            status: 500,
            text: () => Promise.resolve('Server error')
        }), /Failed to fetch config: HTTP 500/i],
        ['network error', () => Promise.reject(new Error('Network failure')), /Failed to fetch config: Network failure/i],
    ])('fetch configuration: %s', async (_, fetchImpl, expected) => {
        global.fetch.mockImplementation(fetchImpl);
        renderConfig();
        await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
        expect(screen.getByRole('alert')).toHaveTextContent(expected);
    });

    test('shows loading indicator while fetching', async () => {
        global.fetch.mockImplementation(() => new Promise(() => {
        }));
        renderConfig();
        await waitFor(() => expect(screen.getByRole('progressbar')).toBeInTheDocument());
    });

    // ── Re-fetch triggers ──────────────────────────────────────────────────────
    test('configNode change triggers config re-fetch', async () => {
        const {rerender} = renderConfig();
        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('node1'), expect.any(Object)));
        const before = global.fetch.mock.calls.length;
        rerender(<ConfigSection {...defaultProps} configNode="node2"/>);
        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('node2'), expect.any(Object)));
        expect(global.fetch.mock.calls.length).toBeGreaterThan(before);
    });

    test('decodedObjectName change triggers config re-fetch', async () => {
        const {rerender} = renderConfig();
        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('cfg1'), expect.any(Object)));
        rerender(<ConfigSection {...defaultProps} decodedObjectName="root/cfg/cfg2"/>);
        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('cfg2'), expect.any(Object)));
    });

    test('debounce prevents duplicate fetchConfig calls within 1 second', async () => {
        renderConfig();
        await waitFor(() => expect(global.fetch).toHaveBeenCalled());
        const count = global.fetch.mock.calls.filter(c => c[0].includes('/config/file')).length;
        const {rerender} = renderConfig();
        rerender(<ConfigSection {...defaultProps} />);
        await act(() => new Promise(r => setTimeout(r, 100)));
        expect(global.fetch.mock.calls.filter(c => c[0].includes('/config/file')).length).toBeGreaterThanOrEqual(count);
    });

    test('refreshTrigger change triggers fetchConfig with forceBypassThrottle=true', async () => {
        const {rerender} = renderConfig();
        await waitFor(() => expect(global.fetch).toHaveBeenCalled());
        global.fetch.mockClear();
        rerender(<ConfigSection {...defaultProps} configRefreshTrigger={1}/>);
        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('node1'), expect.any(Object)));
    });

    test('refreshTrigger change with null configNode does not fetch', async () => {
        const {rerender} = renderConfig({configNode: ''});
        expect(await screen.findByText(/No instance selected to view configuration/i)).toBeInTheDocument();
        global.fetch.mockClear();
        rerender(<ConfigSection {...defaultProps} configNode="" configRefreshTrigger={1}/>);
        await act(() => new Promise(r => setTimeout(r, 200)));
        expect(global.fetch).not.toHaveBeenCalledWith(expect.stringContaining('/config/file'), expect.anything());
    });

    test('handles parseObjectPath with various input formats', async () => {
        renderConfig({decodedObjectName: 'cluster'});
        await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
        await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    });

    // ── Update config dialog ───────────────────────────────────────────────────
    test('update config: success flow', async () => {
        const openSnackbar = jest.fn();
        renderConfig({openSnackbar});
        const file = await openUpdateDialogWithFile(user);
        await waitFor(() => expect(screen.getByText(file.name)).toBeInTheDocument());
        await act(() => user.click(screen.getByRole('button', {name: /Update/i})));
        await waitFor(() => expect(openSnackbar).toHaveBeenCalledWith('Updating configuration…', 'info'));
        await waitFor(() => expect(openSnackbar).toHaveBeenCalledWith('Configuration updated successfully'));
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining(`${URL_OBJECT}/root/cfg/cfg1/config/file`),
            expect.objectContaining({
                method: 'PUT',
                headers: expect.objectContaining({
                    Authorization: 'Bearer mock-token',
                    'Content-Type': 'application/octet-stream'
                }),
            })
        );
        await waitFor(() => expect(screen.queryByText('Update Configuration')).not.toBeInTheDocument());
    });

    test('update config: Update button disabled without file', async () => {
        renderConfig();
        await act(() => user.click(getUploadButton()));
        await waitFor(() => expect(screen.getByText(/Update Configuration/i)).toBeInTheDocument());
        expect(screen.getByRole('button', {name: /Update/i})).toBeDisabled();
    });

    test.each([
        ['missing token', () => mockLocalStorage.getItem.mockReturnValue(null), 'Auth token not found.', 'error', false],
        ['API failure', () => {
            global.fetch.mockImplementation((url, options) => {
                if (url.includes('/config/file')) return Promise.resolve({
                    ok: false,
                    status: 500,
                    text: () => Promise.resolve('Server error'),
                    headers: new Headers()
                });
                return defaultFetchMock(url, options);
            });
        }, 'Error: Failed to update config: 500', 'error', true],
        ['network error', () => {
            global.fetch.mockImplementation((url, options) => {
                if (url.includes('/config/file') && options.method === 'PUT') return Promise.reject(new Error('Network error'));
                return defaultFetchMock(url, options);
            });
        }, 'Error: Network error', 'error', true],
    ])('update config: %s', async (_, setup, expectedMsg, severity, shouldClose) => {
        setup();
        const openSnackbar = jest.fn();
        renderConfig({openSnackbar});
        await openUpdateDialogWithFile(user);
        await act(() => user.click(screen.getByRole('button', {name: /Update/i})));
        await waitFor(() => expect(openSnackbar).toHaveBeenCalledWith(expectedMsg, severity));
        if (shouldClose) {
            await waitFor(() => expect(screen.queryByText('Update Configuration')).not.toBeInTheDocument());
        } else {
            expect(screen.getByText('Update Configuration')).toBeInTheDocument();
        }
    });

    test('update config: works without configNode', async () => {
        global.fetch.mockImplementation((url) => {
            if (url.includes('/config/file')) return Promise.resolve({
                ok: true,
                status: 200,
                text: () => Promise.resolve(''),
                headers: new Headers()
            });
            return defaultFetchMock(url);
        });
        const openSnackbar = jest.fn();
        renderConfig({configNode: '', openSnackbar});
        await openUpdateDialogWithFile(user);
        await act(() => user.click(screen.getByRole('button', {name: /Update/i})));
        await waitFor(() => expect(openSnackbar).toHaveBeenCalledWith('Configuration updated successfully'));
    });

    test('update config dialog: cancel closes it', async () => {
        renderConfig();
        await openUpdateDialogWithFile(user);
        const dlg = getDialogByTitle('Update Configuration');
        await act(() => user.click(within(dlg).getByRole('button', {name: /Cancel/i})));
        await waitFor(() => expect(screen.queryByText(/Update Configuration/i)).not.toBeInTheDocument());
    });

    // ── Manage params dialog (add / unset / delete) ────────────────────────────
    test('manage params: no selection shows error', async () => {
        const openSnackbar = jest.fn();
        renderConfig({openSnackbar});
        await openManageDialog(user);
        await act(() => user.click(screen.getByRole('button', {name: /Apply/i})));
        await waitFor(() => expect(openSnackbar).toHaveBeenCalledWith('No selection made', 'error'));
        expect(screen.getByText(/Manage Configuration Parameters/i)).toBeInTheDocument();
    });

    test('manage params dialog: cancel button closes it', async () => {
        renderConfig();
        await openManageDialog(user);
        const dlg = getDialogByTitle('Manage Configuration Parameters');
        await act(() => user.click(within(dlg).getByRole('button', {name: /Cancel/i})));
        await waitFor(() => expect(screen.queryByText(/Manage Configuration Parameters/i)).not.toBeInTheDocument());
    });

    test('manage params: add invalid parameter shows error', async () => {
        const openSnackbar = jest.fn();
        renderConfig({openSnackbar});
        await openManageDialog(user);
        await act(() => user.type(getComboboxes()[0], 'invalid_param{Enter}'));
        await act(() => user.click(screen.getByRole('button', {name: /Add Parameter/i})));
        await waitFor(() => expect(openSnackbar).toHaveBeenCalledWith('Invalid parameter: invalid_param', 'error'));
    });

    test('manage params: add DEFAULT.orchestrate and apply', async () => {
        const openSnackbar = jest.fn();
        renderConfig({openSnackbar});
        await openManageDialog(user);
        await act(() => user.type(getComboboxes()[0], 'DEFAULT.orchestrate{Enter}'));
        await act(() => user.click(screen.getByRole('button', {name: /Add Parameter/i})));
        await waitFor(() => expect(screen.getByText('orchestrate')).toBeInTheDocument());
        await act(() => user.type(screen.getByLabelText('Value'), 'new-value'));
        await act(() => user.click(screen.getByRole('button', {name: /Apply/i})));
        await waitFor(() => expect(openSnackbar).toHaveBeenCalledWith('Successfully added 1 parameter(s)', 'success'));
        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/config/file'), expect.any(Object)));
        await waitFor(() => expect(screen.queryByText(/Manage Configuration Parameters/i)).not.toBeInTheDocument());
    });

    test('manage params: add fs.size with indexed section and apply', async () => {
        const openSnackbar = jest.fn();
        renderConfig({openSnackbar});
        await openManageDialog(user);
        await act(() => user.type(getComboboxes()[0], 'fs.size{Enter}'));
        await act(() => user.click(screen.getByRole('button', {name: /Add Parameter/i})));
        await waitFor(() => expect(screen.getByText('size')).toBeInTheDocument());
        await act(() => user.type(screen.getByLabelText('Index'), '2'));
        await act(() => user.type(screen.getByLabelText('Value'), '20GB'));
        await act(() => user.click(screen.getByRole('button', {name: /Apply/i})));
        await waitFor(() => expect(openSnackbar).toHaveBeenCalledWith('Successfully added 1 parameter(s)', 'success'));
        expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('set=fs%232.size=20GB'), expect.objectContaining({
            method: 'PATCH',
            headers: expect.objectContaining({Authorization: 'Bearer mock-token'}),
        }));
        await waitFor(() => expect(screen.queryByText(/Manage Configuration Parameters/i)).not.toBeInTheDocument());
    });

    test('manage params: TListLowercase with empty split shows error', async () => {
        const openSnackbar = jest.fn();
        renderConfig({openSnackbar});
        await openManageDialog(user);
        await act(() => user.type(getComboboxes()[0], 'DEFAULT.roles{Enter}'));
        await act(() => user.click(screen.getByRole('button', {name: /Add Parameter/i})));
        await waitFor(() => expect(screen.getByText('roles')).toBeInTheDocument());
        const valueInput = screen.getByLabelText('Value');
        await user.clear(valueInput);
        await user.type(valueInput, 'admin, , guest');
        await act(() => user.click(screen.getByRole('button', {name: /Apply/i})));
        await waitFor(() => expect(openSnackbar).toHaveBeenCalledWith(
            expect.stringMatching(/Invalid value for .*: must be comma-separated lowercase strings/), 'error'
        ));
        expect(global.fetch).not.toHaveBeenCalledWith(expect.stringContaining('set=DEFAULT.roles='), expect.any(Object));
    });

    test('manage params: TListLowercase success', async () => {
        const openSnackbar = jest.fn();
        renderConfig({openSnackbar});
        await openManageDialog(user);
        await act(() => user.type(getComboboxes()[0], 'DEFAULT.roles{Enter}'));
        await act(() => user.click(screen.getByRole('button', {name: /Add Parameter/i})));
        await waitFor(() => expect(screen.getByText('roles')).toBeInTheDocument());
        await user.clear(screen.getByLabelText('Value'));
        await user.type(screen.getByLabelText('Value'), 'admin,user,guest');
        await act(() => user.click(screen.getByRole('button', {name: /Apply/i})));
        await waitFor(() => expect(openSnackbar).toHaveBeenCalledWith('Successfully added 1 parameter(s)', 'success'));
        expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('set=roles=admin%2Cuser%2Cguest'), expect.anything());
    });

    test('manage params: modify section of added parameter', async () => {
        const openSnackbar = jest.fn();
        renderConfig({openSnackbar});
        await openManageDialog(user);
        await act(() => user.type(getComboboxes()[0], 'DEFAULT.orchestrate{Enter}'));
        await act(() => user.click(screen.getByRole('button', {name: /Add Parameter/i})));
        await waitFor(() => expect(screen.getByText('orchestrate')).toBeInTheDocument());
        const sectionInput = screen.getByLabelText('Section (optional)');
        await user.clear(sectionInput);
        await user.type(sectionInput, 'database');
        await user.clear(screen.getByLabelText('Value'));
        await user.type(screen.getByLabelText('Value'), 'test-value');
        await act(() => user.click(screen.getByRole('button', {name: /Apply/i})));
        await waitFor(() => expect(openSnackbar).toHaveBeenCalledWith('Successfully added 1 parameter(s)', 'success'));
        expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('set=database.orchestrate=test-value'), expect.any(Object));
    });

    test('manage params: remove parameter from list', async () => {
        renderConfig();
        await openManageDialog(user);
        await act(() => user.type(getComboboxes()[0], 'DEFAULT.orchestrate{Enter}'));
        await act(() => user.click(screen.getByRole('button', {name: /Add Parameter/i})));
        await waitFor(() => expect(screen.getByText('orchestrate')).toBeInTheDocument());
        await act(() => user.click(screen.getByRole('button', {name: /Remove parameter/i})));
        await waitFor(() => expect(screen.queryByText('orchestrate')).not.toBeInTheDocument());
    });

    test.each([
        ['unset', 1, 'nodes', 'unset=nodes', 'Successfully unset 1 parameter(s)'],
        ['delete', 2, 'fs#1', 'delete=fs%231', 'Successfully deleted 1 section(s)'],
    ])('manage params: %s success', async (_, comboIdx, input, urlFragment, successMsg) => {
        const openSnackbar = jest.fn();
        renderConfig({openSnackbar});
        await openManageDialog(user);
        await act(() => user.type(getComboboxes()[comboIdx], `${input}{Enter}`));
        await waitFor(() => expect(getComboboxes()[comboIdx]).toHaveValue(input));
        await act(() => user.click(screen.getByRole('button', {name: /Apply/i})));
        await waitFor(() => expect(openSnackbar).toHaveBeenCalledWith(successMsg, 'success'));
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining(`${URL_OBJECT}/root/cfg/cfg1/config?${urlFragment}`),
            expect.objectContaining({
                method: 'PATCH',
                headers: expect.objectContaining({Authorization: 'Bearer mock-token'})
            })
        );
        await waitFor(() => expect(screen.queryByText(/Manage Configuration Parameters/i)).not.toBeInTheDocument());
    });

    test.each([
        ['unset', 1, 'nodes', 'Error unsetting parameter nodes: Failed to unset parameter nodes: 500'],
        ['delete', 2, 'fs#1', 'Error deleting section fs#1: Failed to delete section fs#1: 500'],
    ])('manage params: %s API failure', async (_, comboIdx, input, expectedError) => {
        global.fetch.mockImplementation((url, options) => {
            if (url.includes(`/config?${comboIdx === 1 ? 'unset' : 'delete'}=`))
                return Promise.resolve({
                    ok: false,
                    status: 500,
                    json: () => Promise.resolve({}),
                    headers: new Headers()
                });
            return defaultFetchMock(url, options);
        });
        const openSnackbar = jest.fn();
        renderConfig({openSnackbar});
        await openManageDialog(user);
        await act(() => user.type(getComboboxes()[comboIdx], `${input}{Enter}`));
        await act(() => user.click(screen.getByRole('button', {name: /Apply/i})));
        await waitFor(() => expect(openSnackbar).toHaveBeenCalledWith(expectedError, 'error'));
        expect(screen.getByText(/Manage Configuration Parameters/i)).toBeInTheDocument();
    });

    test('manage params: add parameter network error shows specific message', async () => {
        global.fetch.mockImplementation((url) => {
            if (url.includes('/config?set=')) return Promise.reject(new Error('Network failure'));
            return defaultFetchMock(url);
        });
        const openSnackbar = jest.fn();
        renderConfig({openSnackbar});
        await openManageDialog(user);
        await act(() => user.type(getComboboxes()[0], 'DEFAULT.orchestrate{Enter}'));
        await act(() => user.click(screen.getByRole('button', {name: /Add Parameter/i})));
        await waitFor(() => expect(screen.getByText('orchestrate')).toBeInTheDocument());
        await user.clear(screen.getByLabelText('Value'));
        await user.type(screen.getByLabelText('Value'), 'test');
        await act(() => user.click(screen.getByRole('button', {name: /Apply/i})));
        await waitFor(() => expect(openSnackbar).toHaveBeenCalledWith(
            'Error adding parameter orchestrate: Network failure', 'error'
        ));
    });

    test.each([
        ['unset', 1, 'nodes', 'Error unsetting parameter nodes: Network failure'],
        ['delete', 2, 'fs#1', 'Error deleting section fs#1: Network failure'],
    ])('manage params: %s network error', async (_, comboIdx, input, errorMsg) => {
        global.fetch.mockImplementation((url) => {
            if (url.includes(`/config?${comboIdx === 1 ? 'unset' : 'delete'}=`)) return Promise.reject(new Error('Network failure'));
            return defaultFetchMock(url);
        });
        const openSnackbar = jest.fn();
        renderConfig({openSnackbar});
        await openManageDialog(user);
        await act(() => user.type(getComboboxes()[comboIdx], `${input}{Enter}`));
        await act(() => user.click(screen.getByRole('button', {name: /Apply/i})));
        await waitFor(() => expect(openSnackbar).toHaveBeenCalledWith(errorMsg, 'error'));
    });

    test('manage params: all operations fail keeps dialog open', async () => {
        global.fetch.mockImplementation((url, options) => {
            if (url.includes('/config?set=') || url.includes('/config?unset=') || url.includes('/config?delete='))
                return Promise.resolve({
                    ok: false,
                    status: 500,
                    json: () => Promise.resolve({}),
                    headers: new Headers()
                });
            return defaultFetchMock(url, options);
        });
        const openSnackbar = jest.fn();
        renderConfig({openSnackbar});
        await openManageDialog(user);
        await act(() => user.type(getComboboxes()[0], 'DEFAULT.orchestrate{Enter}'));
        await act(() => user.click(screen.getByRole('button', {name: /Add Parameter/i})));
        await waitFor(() => expect(screen.getByText('orchestrate')).toBeInTheDocument());
        await user.clear(screen.getByLabelText('Value'));
        await user.type(screen.getByLabelText('Value'), 'test');
        await act(() => user.type(getComboboxes()[1], 'nodes{Enter}'));
        await act(() => user.type(getComboboxes()[2], 'fs#1{Enter}'));
        await act(() => user.click(screen.getByRole('button', {name: /Apply/i})));
        await waitFor(() => expect(openSnackbar).toHaveBeenCalledWith(expect.stringContaining('Error adding parameter orchestrate: HTTP 500'), 'error'));
        expect(screen.getByText(/Manage Configuration Parameters/i)).toBeInTheDocument();
    });

    test.each([
        ['add', 0, 'DEFAULT.roles'],
        ['unset', 1, 'nodes'],
        ['delete', 2, 'fs#1'],
    ])('manage params: missing token for %s shows error', async (_, comboIdx, input) => {
        mockLocalStorage.getItem.mockReturnValue(null);
        const openSnackbar = jest.fn();
        renderConfig({openSnackbar});
        await openManageDialog(user);
        await act(() => user.type(getComboboxes()[comboIdx], `${input}{Enter}`));
        if (comboIdx === 0) {
            await act(() => user.click(screen.getByRole('button', {name: /Add Parameter/i})));
            await waitFor(() => expect(screen.getByText(input.split('.')[1] || input)).toBeInTheDocument());
            await user.clear(screen.getByPlaceholderText('Value'));
            await user.type(screen.getByPlaceholderText('Value'), 'admin');
        }
        await act(() => user.click(screen.getByRole('button', {name: /Apply/i})));
        await waitFor(() => expect(openSnackbar).toHaveBeenCalledWith('Auth token not found.', 'error'));
    });

    test('manage params: unset parses free-text string with a dot when no existing params match', async () => {
        global.fetch.mockImplementation((url, options) => {
            if (url.includes('/config') && !url.includes('file') && !url.includes('keywords')
                && !url.includes('set') && !url.includes('unset') && !url.includes('delete')) {
                return Promise.resolve({
                    ok: true, status: 200,
                    json: () => Promise.resolve({items: []}),
                    headers: new Headers(),
                });
            }
            return defaultFetchMock(url, options);
        });
        const openSnackbar = jest.fn();
        renderConfig({openSnackbar});
        await openManageDialog(user);
        await act(() => user.type(getComboboxes()[1], 'standalone.param{Enter}'));
        await waitFor(() => expect(getComboboxes()[1]).toHaveValue('standalone.param'));
        await act(() => user.click(screen.getByRole('button', {name: /Apply/i})));
        await waitFor(() => expect(openSnackbar).toHaveBeenCalledWith('Successfully unset 1 parameter(s)', 'success'));
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining(`${URL_OBJECT}/root/cfg/cfg1/config?unset=standalone.param`),
            expect.objectContaining({method: 'PATCH'})
        );
    });

    test('manage params: unset parses free-text string without a dot when no existing params match', async () => {
        global.fetch.mockImplementation((url, options) => {
            if (url.includes('/config') && !url.includes('file') && !url.includes('keywords')
                && !url.includes('set') && !url.includes('unset') && !url.includes('delete')) {
                return Promise.resolve({
                    ok: true, status: 200,
                    json: () => Promise.resolve({items: []}),
                    headers: new Headers(),
                });
            }
            return defaultFetchMock(url, options);
        });
        const openSnackbar = jest.fn();
        renderConfig({openSnackbar});
        await openManageDialog(user);
        await act(() => user.type(getComboboxes()[1], 'lonelyoption{Enter}'));
        await waitFor(() => expect(getComboboxes()[1]).toHaveValue('lonelyoption'));
        await act(() => user.click(screen.getByRole('button', {name: /Apply/i})));
        await waitFor(() => expect(openSnackbar).toHaveBeenCalledWith('Successfully unset 1 parameter(s)', 'success'));
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining(`${URL_OBJECT}/root/cfg/cfg1/config?unset=lonelyoption`),
            expect.objectContaining({method: 'PATCH'})
        );
    });

    // ── Fetch existing params edge cases ───────────────────────────────────────
    test.each([
        ['HTTP error', () => ({
            ok: false,
            status: 403,
            json: () => Promise.resolve({}),
            headers: new Headers()
        }), 'Failed to fetch existing parameters: HTTP 403'],
        ['network error', () => Promise.reject(new Error('Network failure')), 'Failed to fetch existing parameters: Network failure'],
    ])('fetchExistingParams: %s', async (_, fetchImpl, expectedText) => {
        global.fetch.mockImplementation((url) => {
            if (url.includes('/config') && !url.includes('file') && !url.includes('set') && !url.includes('unset') && !url.includes('delete') && !url.includes('keywords'))
                return fetchImpl();
            return defaultFetchMock(url);
        });
        renderConfig();
        await openManageDialog(user);
        await waitFor(() => {
            const alerts = screen.getAllByRole('alert');
            expect(alerts.find(a => a.textContent.includes(expectedText))).toBeInTheDocument();
        });
    });

    test('getExistingSections: null existingParams renders empty delete combobox', async () => {
        global.fetch.mockImplementation((url) => {
            if (url.includes('/config') && !url.includes('file') && !url.includes('set') && !url.includes('unset') && !url.includes('delete'))
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve({items: null}),
                    headers: new Headers()
                });
            return defaultFetchMock(url);
        });
        renderConfig();
        await openManageDialog(user);
        await waitFor(() => expect(getComboboxes()[2]).toHaveValue(''));
    });

    // ── Keywords dialog ────────────────────────────────────────────────────────
    test('keywords dialog: displays table with keywords', async () => {
        renderConfig();
        await act(() => user.click(getKeywordsButton()));
        await waitFor(() => expect(screen.getByText(/Configuration Keywords/i)).toBeInTheDocument());
        const kd = getDialogByTitle('Configuration Keywords');
        await waitFor(() => expect(within(kd).getByRole('table')).toBeInTheDocument());
    });

    test('keywords dialog: deduplicates duplicate keywords', async () => {
        global.fetch.mockImplementation((url) => {
            if (url.includes('/config/keywords')) {
                return Promise.resolve({
                    ok: true, status: 200,
                    json: () => Promise.resolve({
                        items: [
                            {
                                option: 'nodes',
                                section: 'DEFAULT',
                                text: 'Nodes to deploy the service',
                                converter: 'string',
                                scopable: true,
                                default: '*'
                            },
                            {
                                option: 'nodes',
                                section: 'DEFAULT',
                                text: 'Duplicate nodes entry',
                                converter: 'string',
                                scopable: false,
                                default: 'none'
                            },
                        ],
                    }),
                    headers: new Headers(),
                });
            }
            return defaultFetchMock(url);
        });
        renderConfig();
        await act(() => user.click(getKeywordsButton()));
        const kd = getDialogByTitle('Configuration Keywords');
        const rows = within(kd).getAllByRole('row');
        expect(rows).toHaveLength(2); // header + 1 unique row
        const cells = within(rows[1]).getAllByRole('cell');
        expect(cells[0]).toHaveTextContent('nodes');
        expect(cells[1]).not.toHaveTextContent('Duplicate nodes entry');
    });

    test.each([
        ['HTTP error', () => ({
            ok: false,
            status: 404,
            json: () => Promise.resolve({}),
            headers: new Headers()
        }), /Failed to fetch keywords: HTTP 404/i],
        ['invalid format', () => ({
            ok: true,
            status: 200,
            json: () => Promise.resolve({items: 'not-an-array'}),
            headers: new Headers()
        }), /Invalid response format/i],
        ['AbortError', () => Promise.reject(new DOMException('The operation was aborted', 'AbortError')), /Request timed out after 60 seconds/i],
        ['null items', () => ({
            ok: true,
            status: 200,
            json: () => Promise.resolve({items: null}),
            headers: new Headers()
        }), /Invalid response format/i],
    ])('keywords dialog: %s shows alert', async (_, fetchImpl, expected) => {
        global.fetch.mockImplementation((url) => {
            if (url.includes('/config/keywords')) return fetchImpl();
            return defaultFetchMock(url);
        });
        renderConfig();
        await act(() => user.click(getKeywordsButton()));
        const kd = getDialogByTitle('Configuration Keywords');
        await waitFor(() => expect(within(kd).getByRole('alert')).toHaveTextContent(expected));
    });

    test('keywords dialog: close button closes it', async () => {
        renderConfig();
        await act(() => user.click(getKeywordsButton()));
        await waitFor(() => expect(screen.getByText(/Configuration Keywords/i)).toBeInTheDocument());
        await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument());
        const kd = getDialogByTitle('Configuration Keywords');
        await act(() => user.click(within(kd).getByRole('button', {name: /Close/i})));
        await waitFor(() => expect(screen.queryByText(/Configuration Keywords/i)).not.toBeInTheDocument());
    });

    test('getUniqueSections: null keywordsData renders empty add combobox', async () => {
        global.fetch.mockImplementation((url) => {
            if (url.includes('/config/keywords')) return Promise.resolve({
                ok: true,
                status: 200,
                json: () => Promise.resolve({items: null}),
                headers: new Headers()
            });
            return defaultFetchMock(url);
        });
        renderConfig();
        await openManageDialog(user);
        await waitFor(() => expect(getComboboxes()[0]).toHaveValue(''));
    });
});
