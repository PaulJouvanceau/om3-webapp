import React, {useState, useEffect, useRef, useMemo, useReducer, useCallback, useId} from "react";
import {Dialog} from "../ui/components/Dialog";
import {Button, IconButton} from "../ui/components/Button";
import {Field, Input, Checkbox, Textarea} from "../ui/components/Field";
import {Table, HeaderRow, HeaderCell, Row, Cell} from "../ui/components/Table";
import {Alert} from "../ui/components/Alert";
import {Spinner} from "../ui/components/Spinner";
import {CodeIcon, EyeIcon, EyeOffIcon, FileIcon, PencilIcon, LifeRingIcon, PlusIcon, TrashIcon} from "../ui/icons";
import {formatSeconds, useAutoHide} from "../ui/lib/reveal";
import {URL_OBJECT} from "../config/apiPath.js";
import {parseObjectPath} from "../utils/objectUtils";

/**
 * The object configuration file, its secrets redacted unless `showSecrets`: the
 * object endpoint takes `redact-secrets` (the instance endpoint ignores it), and
 * forwards the request to a node holding an instance when the one answering has none.
 */
const useConfig = (decodedObjectName, configNode, setConfigNode, refreshTrigger, showSecrets = false) => {
    const initialState = {
        data: null,
        loading: false,
        error: null,
    };
    const reducer = (state, action) => {
        switch (action.type) {
            case "FETCH_START":
                return {...state, loading: true, error: null};
            case "FETCH_SUCCESS":
                return {...state, loading: false, data: action.payload};
            case "FETCH_ERROR":
                return {...state, loading: false, error: action.payload};
            case "RESET":
                return initialState;
            /* istanbul ignore next */
            default:
                return state;
        }
    };
    const [state, dispatch] = useReducer(reducer, initialState);
    const lastFetch = useRef({});

    const fetchConfig = useCallback(async (node, forceBypassThrottle = false) => {
        /* istanbul ignore next */
        if (!node) {
            dispatch({type: "RESET"});
            return;
        }
        // The redaction is part of the key: switching it must not be throttled away.
        const key = `${decodedObjectName}:${node}:${showSecrets}`;
        const now = Date.now();
        if (!forceBypassThrottle && lastFetch.current[key] && now - lastFetch.current[key] < 1000) return;
        lastFetch.current[key] = now;
        const {namespace, kind, name} = parseObjectPath(decodedObjectName);
        const token = localStorage.getItem("authToken") || "";
        dispatch({type: "FETCH_START"});
        setConfigNode(node);
        try {
            const response = await fetch(`${URL_OBJECT}/${namespace}/${kind}/${name}/config/file?redact-secrets=${!showSecrets}`, {
                headers: {Authorization: `Bearer ${token}`},
                cache: "no-cache",
            });
            if (!response.ok) {
                const error = new Error(`HTTP ${response.status}`);
                dispatch({type: "FETCH_ERROR", payload: `Failed to fetch config: ${error.message}`});
                return;
            }
            const text = await response.text();
            dispatch({type: "FETCH_SUCCESS", payload: text});
        } catch (err) {
            dispatch({type: "FETCH_ERROR", payload: `Failed to fetch config: ${err.message}`});
        }
    }, [decodedObjectName, setConfigNode, showSecrets]);

    // Showing or hiding the secrets always reloads, throttle or not, and drops the
    // text first: a revealed secret must not stay on screen while hiding them.
    const prevShowSecrets = useRef(showSecrets);
    useEffect(() => {
        const secretsToggled = prevShowSecrets.current !== showSecrets;
        prevShowSecrets.current = showSecrets;
        if (secretsToggled) dispatch({type: "RESET"});
        if (configNode) {
            void fetchConfig(configNode, secretsToggled);
        } else {
            dispatch({type: "RESET"});
        }
    }, [configNode, decodedObjectName, fetchConfig, showSecrets]);

    const prevRefreshTrigger = useRef(refreshTrigger);
    useEffect(() => {
        if (refreshTrigger === prevRefreshTrigger.current) return;
        prevRefreshTrigger.current = refreshTrigger;
        if (configNode) {
            void fetchConfig(configNode, true);
        }
    }, [refreshTrigger, configNode, fetchConfig]);

    return {...state, fetchConfig};
};

const useKeywords = (decodedObjectName) => {
    const initialState = {
        data: null,
        loading: false,
        error: null,
    };
    const reducer = (state, action) => {
        switch (action.type) {
            case "FETCH_START":
                return {...state, loading: true, error: null};
            case "FETCH_SUCCESS":
                return {...state, loading: false, data: action.payload};
            case "FETCH_ERROR":
                return {...state, loading: false, error: action.payload};
            /* istanbul ignore next */
            default:
                return state;
        }
    };
    const [state, dispatch] = useReducer(reducer, initialState);
    const fetchKeywords = async () => {
        const {namespace, kind, name} = parseObjectPath(decodedObjectName);
        const token = localStorage.getItem("authToken") || "";
        dispatch({type: "FETCH_START"});
        const timeout = 60000;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        try {
            const response = await fetch(`${URL_OBJECT}/${namespace}/${kind}/${name}/config/keywords`, {
                headers: {Authorization: `Bearer ${token}`},
                cache: "no-cache",
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            if (!response.ok) {
                const error = new Error(`HTTP ${response.status}`);
                dispatch({type: "FETCH_ERROR", payload: `Failed to fetch keywords: ${error.message}`});
                return;
            }
            const data = await response.json();
            if (!data || !Array.isArray(data.items)) {
                const error = new Error("Invalid response format: missing items");
                dispatch({type: "FETCH_ERROR", payload: error.message});
                return;
            }
            const seen = new Set();
            const uniqueKeywords = data.items.filter((item) => {
                const key = `${item.section || "default"}.${item.option}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
            dispatch({type: "FETCH_SUCCESS", payload: uniqueKeywords});
        } catch (err) {
            const errorMsg = err.name === "AbortError" ? "Request timed out after 60 seconds" : `Failed to fetch keywords: ${err.message}`;
            dispatch({type: "FETCH_ERROR", payload: errorMsg});
        }
    };
    return {...state, fetchKeywords};
};

const useExistingParams = (decodedObjectName) => {
    const initialState = {
        data: null,
        loading: false,
        error: null,
    };
    const reducer = (state, action) => {
        switch (action.type) {
            case "FETCH_START":
                return {...state, loading: true, error: null};
            case "FETCH_SUCCESS":
                return {...state, loading: false, data: action.payload};
            case "FETCH_ERROR":
                return {...state, loading: false, error: action.payload};
            /* istanbul ignore next */
            default:
                return state;
        }
    };
    const [state, dispatch] = useReducer(reducer, initialState);
    const fetchExistingParams = async () => {
        const {namespace, kind, name} = parseObjectPath(decodedObjectName);
        const token = localStorage.getItem("authToken") || "";
        dispatch({type: "FETCH_START"});
        try {
            const response = await fetch(`${URL_OBJECT}/${namespace}/${kind}/${name}/config`, {
                headers: {Authorization: `Bearer ${token}`},
                cache: "no-cache",
            });
            if (!response.ok) {
                const error = new Error(`HTTP ${response.status}`);
                dispatch({type: "FETCH_ERROR", payload: `Failed to fetch existing parameters: ${error.message}`});
                return;
            }
            const data = await response.json();
            dispatch({type: "FETCH_SUCCESS", payload: data.items || []});
        } catch (err) {
            dispatch({type: "FETCH_ERROR", payload: `Failed to fetch existing parameters: ${err.message}`});
        }
    };
    return {...state, fetchExistingParams};
};

/** "section.option", or "option" alone for a keyword without section. */
/** The configuration file of an object as stored, its secrets in clear, for editing. */
const fetchRawConfigFile = async (decodedObjectName) => {
    const {namespace, kind, name} = parseObjectPath(decodedObjectName);
    const token = localStorage.getItem("authToken") || "";
    const response = await fetch(`${URL_OBJECT}/${namespace}/${kind}/${name}/config/file?redact-secrets=false`, {
        headers: {Authorization: `Bearer ${token}`},
        cache: "no-cache",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
};

/** What the daemon says of a refused request: the detail of its problem, else the status. */
const problemMessage = async (response) => {
    try {
        const problem = await response.json();
        if (problem?.detail) return problem.detail;
    } catch {
        // Not a problem document: the status says enough.
    }
    return `HTTP ${response.status}`;
};

const keywordLabel = (keyword) => `${keyword.section ? `${keyword.section}.` : ""}${keyword.option}`;

/**
 * File picker: the native input, hidden but focusable, behind a label drawn as a
 * secondary button; the chosen file name beside it.
 */
const FilePicker = ({id, file, onChange, disabled, emptyText}) => (
    <div className="flex items-center gap-3">
        <input
            id={id}
            type="file"
            className="peer sr-only"
            onChange={(e) => onChange(e.target.files[0])}
            disabled={disabled}
        />
        <label
            htmlFor={id}
            className={
                disabled
                    ? "inline-flex h-8 items-center rounded-(--radius-control) border border-line bg-surface-raised px-3 font-medium opacity-60"
                    : "inline-flex h-8 cursor-pointer items-center rounded-(--radius-control) border border-line bg-surface-raised px-3 font-medium hover:bg-surface-sunken peer-focus-visible:outline-2 peer-focus-visible:outline-(--focus-ring)"
            }
        >
            Choose File
        </label>
        <span className={file ? "text-ink" : "text-ink-muted"}>{file ? file.name : emptyText}</span>
    </div>
);

const UpdateConfigDialog = ({
                                open,
                                onClose,
                                newConfigFile,
                                setNewConfigFile,
                                actionLoading,
                                handleUpdateConfig,
                            }) => (
    <Dialog
        open={open}
        onClose={onClose}
        title="Update Configuration"
        size="md"
        footer={
            <>
                <Button onClick={onClose} disabled={actionLoading}>Cancel</Button>
                <Button
                    variant="primary"
                    onClick={handleUpdateConfig}
                    disabled={actionLoading || !newConfigFile}
                    icon={actionLoading ? <Spinner label="Updating"/> : undefined}
                >
                    Update
                </Button>
            </>
        }
    >
        <FilePicker
            id="update-config-file-upload"
            file={newConfigFile}
            onChange={setNewConfigFile}
            disabled={actionLoading}
            emptyText="No file chosen"
        />
    </Dialog>
);

const KeywordsDialog = ({open, onClose, keywordsData, keywordsLoading, keywordsError}) => (
    <Dialog
        open={open}
        onClose={onClose}
        title="Configuration Keywords"
        size="lg"
        footer={<Button onClick={onClose} disabled={keywordsLoading}>Close</Button>}
    >
        {keywordsLoading && <Spinner/>}
        {keywordsError && <Alert>{keywordsError}</Alert>}
        {!keywordsLoading && !keywordsError && !keywordsData && (
            <p className="text-ink-muted">No keywords available.</p>
        )}
        {!keywordsLoading && !keywordsError && keywordsData && (
            <Table aria-label="configuration keywords table">
                <thead>
                <HeaderRow>
                    <HeaderCell>Keyword</HeaderCell>
                    <HeaderCell>Description</HeaderCell>
                    <HeaderCell>Default</HeaderCell>
                    <HeaderCell>Type</HeaderCell>
                    <HeaderCell>Section</HeaderCell>
                    <HeaderCell>Scopable</HeaderCell>
                </HeaderRow>
                </thead>
                <tbody>
                {keywordsData.map((keyword, index) => (
                    <Row key={`${keyword.section || "default"}.${keyword.option}-${index}`}>
                        <Cell className="font-mono whitespace-nowrap">{keyword.option}</Cell>
                        <Cell>{keyword.text || "N/A"}</Cell>
                        <Cell className="font-mono">{keyword.default || "None"}</Cell>
                        <Cell className="whitespace-nowrap">{keyword.converter || "N/A"}</Cell>
                        <Cell className="whitespace-nowrap">{keyword.section || "N/A"}</Cell>
                        <Cell>{keyword.scopable ? "Yes" : "No"}</Cell>
                    </Row>
                ))}
                </tbody>
            </Table>
        )}
    </Dialog>
);

/** A group of checkboxes, one per choice, in a bordered scrolling box. */
const CheckboxGroup = ({legend, hint, choices, isChecked, onToggle, disabled, emptyText}) => (
    <fieldset className="space-y-1">
        <legend className="mb-1 font-semibold">{legend}</legend>
        {choices.length === 0 ? (
            <p className="text-ink-muted">{emptyText}</p>
        ) : (
            <div
                className="max-h-40 space-y-1 overflow-y-auto rounded-(--radius-control) border border-line bg-surface px-2 py-1">
                {choices.map(({key, label, value}) => (
                    <div key={key}>
                        <Checkbox
                            label={<span className="font-mono">{label}</span>}
                            checked={isChecked(value)}
                            onChange={() => onToggle(value)}
                            disabled={disabled}
                        />
                    </div>
                ))}
            </div>
        )}
        <p className="text-data text-ink-muted">{hint}</p>
    </fieldset>
);

const ManageParamsDialog = ({
                                open,
                                onClose,
                                keywordsData,
                                existingParams,
                                keywordsLoading,
                                existingParamsLoading,
                                keywordsError,
                                existingParamsError,
                                paramsToSet,
                                setParamsToSet,
                                paramsToUnset,
                                setParamsToUnset,
                                paramsToDelete,
                                setParamsToDelete,
                                actionLoading,
                                handleManageParamsSubmit,
                                openSnackbar,
                            }) => {
    const listId = useId();
    // The text of the "add" field: a keyword when it names one, else free text.
    const [keywordInput, setKeywordInput] = useState("");

    const selectedKeyword = useMemo(() => {
        const text = keywordInput.trim();
        if (!text) return null;
        return (keywordsData || []).find((keyword) => keywordLabel(keyword) === text) || text;
    }, [keywordInput, keywordsData]);

    const existingKeywords = useMemo(() => {
        if (!existingParams) return [];
        return existingParams.map((param) => {
            const parts = param.keyword.split(".");
            return {
                section: parts.length > 1 ? parts[0] : "",
                option: parts.length > 1 ? parts.slice(1).join(".") : param.keyword,
                value: param.value,
            };
        });
    }, [existingParams]);

    const existingSections = useMemo(() => {
        if (!existingParams) return [];
        const sections = new Set(
            existingParams.map((param) => {
                const parts = param.keyword.split(".");
                return parts.length > 1 ? parts[0] : "";
            }).filter(Boolean)
        );
        return Array.from(sections);
    }, [existingParams]);

    const existingSectionSuffixes = useMemo(() => {
        const suffixMap = {};
        existingSections.forEach((section) => {
            const hashIndex = section.indexOf("#");
            if (hashIndex !== -1) {
                const prefix = section.substring(0, hashIndex);
                const suffix = section.substring(hashIndex + 1);
                if (!suffixMap[prefix]) suffixMap[prefix] = [];
                if (!suffixMap[prefix].includes(suffix)) suffixMap[prefix].push(suffix);
            }
        });
        return suffixMap;
    }, [existingSections]);

    const addParameter = () => {
        if (selectedKeyword) {
            if (typeof selectedKeyword === 'string') {
                openSnackbar(`Invalid parameter: ${selectedKeyword}`, 'error');
                return;
            }
            const keywordSection = selectedKeyword.section || "";
            const hasSection = keywordSection && keywordSection !== "DEFAULT";
            if (hasSection) {
                const newParam = {
                    sectionPrefix: keywordSection,
                    sectionSuffix: "",
                    option: selectedKeyword.option,
                    value: "",
                    id: `${selectedKeyword.option}-${Date.now()}`,
                    keyword: {...selectedKeyword},
                };
                setParamsToSet([...paramsToSet, newParam]);
            } else {
                const newParam = {
                    section: "",
                    option: selectedKeyword.option,
                    value: "",
                    id: `${selectedKeyword.option}-${Date.now()}`,
                    keyword: {...selectedKeyword},
                };
                setParamsToSet([...paramsToSet, newParam]);
            }
            setKeywordInput("");
        }
    };

    const removeParameter = (index) => {
        const newParams = paramsToSet.filter((_, i) => i !== index);
        setParamsToSet(newParams);
    };

    const updateParamSection = (index, newSection) => {
        const updated = [...paramsToSet];
        updated[index].section = newSection;
        setParamsToSet(updated);
    };

    const updateParamSectionSuffix = (index, newSuffix) => {
        const updated = [...paramsToSet];
        updated[index].sectionSuffix = newSuffix;
        setParamsToSet(updated);
    };

    const updateParamValue = (index, newValue) => {
        const updated = [...paramsToSet];
        updated[index].value = newValue;
        setParamsToSet(updated);
    };

    const toggleUnset = (keyword) => {
        const label = keywordLabel(keyword);
        const selected = paramsToUnset.some((item) => keywordLabel(item) === label)
            ? paramsToUnset.filter((item) => keywordLabel(item) !== label)
            : [...paramsToUnset, keyword];
        setParamsToUnset(selected.map((item, index) => ({...item, id: `unset-${item.option}-${index}`})));
    };

    const toggleDelete = (section) => {
        setParamsToDelete(
            paramsToDelete.includes(section)
                ? paramsToDelete.filter((item) => item !== section)
                : [...paramsToDelete, section]
        );
    };

    return (
        <Dialog
            open={open}
            onClose={onClose}
            title="Manage Configuration Parameters"
            size="lg"
            footer={
                <>
                    <Button onClick={onClose} disabled={actionLoading}>Cancel</Button>
                    <Button
                        variant="primary"
                        onClick={handleManageParamsSubmit}
                        disabled={actionLoading}
                        icon={actionLoading ? <Spinner label="Applying"/> : undefined}
                    >
                        Apply
                    </Button>
                </>
            }
        >
            {(keywordsLoading || existingParamsLoading) && <Spinner/>}
            {keywordsError && <Alert>{keywordsError}</Alert>}
            {existingParamsError && <Alert>{existingParamsError}</Alert>}

            <section className="space-y-2">
                <h3 className="font-semibold">Add parameters</h3>
                <div className="flex items-end gap-2">
                    <div className="min-w-0 flex-1">
                        <Field label="Select parameter to add" hint="Select a parameter to add, then click Add">
                            {(control) => (
                                <Input
                                    {...control}
                                    list={`${listId}-keywords`}
                                    placeholder="Select parameter"
                                    autoComplete="off"
                                    className="font-mono"
                                    value={keywordInput}
                                    onChange={(e) => setKeywordInput(e.target.value)}
                                    disabled={actionLoading || keywordsLoading}
                                />
                            )}
                        </Field>
                        <datalist id={`${listId}-keywords`}>
                            {(keywordsData || []).map((keyword, index) => (
                                <option key={`${keywordLabel(keyword)}-${index}`} value={keywordLabel(keyword)}/>
                            ))}
                        </datalist>
                    </div>
                    {/* Aligned with the field, above its hint. */}
                    <div className="mb-6">
                        <Button
                            icon={<PlusIcon/>}
                            onClick={addParameter}
                            disabled={!selectedKeyword || actionLoading}
                        >
                            Add Parameter
                        </Button>
                    </div>
                </div>

                {paramsToSet.length > 0 && (
                    <Table aria-label="Parameters to add">
                        <thead>
                        <HeaderRow>
                            <HeaderCell className="w-1/4">Section</HeaderCell>
                            <HeaderCell>Parameter</HeaderCell>
                            <HeaderCell className="w-1/4">Value</HeaderCell>
                            <HeaderCell>Description</HeaderCell>
                            <HeaderCell><span className="sr-only">Actions</span></HeaderCell>
                        </HeaderRow>
                        </thead>
                        <tbody>
                        {paramsToSet.map((param, index) => {
                            const keyword = param.keyword;
                            const hasSectionPrefix = param.sectionPrefix !== undefined;
                            const sectionListId = `${listId}-sections-${index}`;
                            return (
                                <Row key={param.id}>
                                    <Cell>
                                        {hasSectionPrefix ? (
                                            <div className="flex items-center gap-1">
                                                <span
                                                    className="font-mono whitespace-nowrap">{param.sectionPrefix}#</span>
                                                <Input
                                                    aria-label="Index"
                                                    list={sectionListId}
                                                    autoComplete="off"
                                                    placeholder="e.g., prod, 1, data"
                                                    className="h-7 font-mono"
                                                    value={param.sectionSuffix}
                                                    onChange={(e) => updateParamSectionSuffix(index, e.target.value)}
                                                    disabled={actionLoading}
                                                />
                                                <datalist id={sectionListId}>
                                                    {(existingSectionSuffixes[param.sectionPrefix] || []).map((suffix) => (
                                                        <option key={suffix} value={suffix}/>
                                                    ))}
                                                </datalist>
                                            </div>
                                        ) : (
                                            <>
                                                <Input
                                                    aria-label="Section (optional)"
                                                    list={sectionListId}
                                                    autoComplete="off"
                                                    placeholder="e.g., database, fs#data"
                                                    className="h-7 font-mono"
                                                    value={param.section || ""}
                                                    onChange={(e) => updateParamSection(index, e.target.value)}
                                                    disabled={actionLoading}
                                                />
                                                <datalist id={sectionListId}>
                                                    {existingSections.map((section) => (
                                                        <option key={section} value={section}/>
                                                    ))}
                                                </datalist>
                                            </>
                                        )}
                                    </Cell>
                                    <Cell className="font-mono whitespace-nowrap" title={keyword?.text || ""}>
                                        {param.option}
                                    </Cell>
                                    <Cell>
                                        <Input
                                            aria-label="Value"
                                            className="h-7 font-mono"
                                            value={param.value}
                                            onChange={(e) => updateParamValue(index, e.target.value)}
                                            disabled={actionLoading}
                                        />
                                    </Cell>
                                    <Cell className="max-w-60 truncate text-ink-muted" title={keyword?.text || ""}>
                                        {keyword?.text || "N/A"}
                                    </Cell>
                                    <Cell align="right">
                                        <IconButton
                                            size="sm"
                                            label="Remove parameter"
                                            onClick={() => removeParameter(index)}
                                            disabled={actionLoading}
                                        >
                                            <TrashIcon/>
                                        </IconButton>
                                    </Cell>
                                </Row>
                            );
                        })}
                        </tbody>
                    </Table>
                )}
            </section>

            <CheckboxGroup
                legend="Unset parameters"
                hint="Select existing parameters to remove their values"
                emptyText="No parameters set."
                choices={existingKeywords.map((keyword) => ({
                    key: keywordLabel(keyword),
                    label: keywordLabel(keyword),
                    value: keyword,
                }))}
                isChecked={(keyword) => paramsToUnset.some((item) => keywordLabel(item) === keywordLabel(keyword))}
                onToggle={toggleUnset}
                disabled={actionLoading || existingParamsLoading}
            />

            <CheckboxGroup
                legend="Delete sections"
                hint="Select existing sections to delete"
                emptyText="No sections."
                choices={existingSections.map((section) => ({key: section, label: section, value: section}))}
                isChecked={(section) => paramsToDelete.includes(section)}
                onToggle={toggleDelete}
                disabled={actionLoading || existingParamsLoading}
            />
        </Dialog>
    );
};

const ConfigSection = ({
                           decodedObjectName,
                           configNode,
                           setConfigNode,
                           openSnackbar,
                           configDialogOpen,
                           setConfigDialogOpen,
                           configRefreshTrigger = 0,
                       }) => {
    // Secrets stay hidden until asked for, and hidden again each time the dialog opens.
    const [showSecrets, setShowSecrets] = useState(false);
    useEffect(() => {
        if (configDialogOpen) setShowSecrets(false);
    }, [configDialogOpen]);
    // Shown secrets are masked again on their own after a few seconds.
    const secondsLeft = useAutoHide(showSecrets, () => setShowSecrets(false));
    const {data: configData, loading: configLoading, error: configError, fetchConfig} = useConfig(
        decodedObjectName,
        configNode,
        setConfigNode,
        configRefreshTrigger,
        showSecrets,
    );
    const {
        data: keywordsData,
        loading: keywordsLoading,
        error: keywordsError,
        fetchKeywords
    } = useKeywords(decodedObjectName);
    const {
        data: existingParams,
        loading: existingParamsLoading,
        error: existingParamsError,
        fetchExistingParams,
    } = useExistingParams(decodedObjectName);

    const [updateConfigDialogOpen, setUpdateConfigDialogOpen] = useState(false);
    const [newConfigFile, setNewConfigFile] = useState(null);
    const [manageParamsDialogOpen, setManageParamsDialogOpen] = useState(false);
    const [keywordsDialogOpen, setKeywordsDialogOpen] = useState(false);
    const [paramsToSet, setParamsToSet] = useState([]);
    const [paramsToUnset, setParamsToUnset] = useState([]);
    const [paramsToDelete, setParamsToDelete] = useState([]);
    const [actionLoading, setActionLoading] = useState(false);

    // Direct edition of the file: `base` is the file the edit started from, `text`
    // the edited one. Kept when the dialog closes, so an edit is not lost to Escape.
    const [edit, setEdit] = useState(null);
    const [editLoading, setEditLoading] = useState(false);
    const [editError, setEditError] = useState(null);
    const [editConflict, setEditConflict] = useState(false);
    const editDirty = edit !== null && edit.text !== edit.base;

    const startEdit = async () => {
        // The shown text is redacted: written back, it would replace every secret
        // with asterisks. The edit starts from the file as stored.
        setShowSecrets(false);
        setEditError(null);
        setEditConflict(false);
        setEditLoading(true);
        try {
            const text = await fetchRawConfigFile(decodedObjectName);
            setEdit({base: text, text});
        } catch (err) {
            setEditError(`Failed to fetch config: ${err.message}`);
        } finally {
            setEditLoading(false);
        }
    };

    const cancelEdit = () => {
        setEdit(null);
        setEditError(null);
        setEditConflict(false);
    };

    const saveEdit = async () => {
        const token = localStorage.getItem("authToken");
        if (!token) {
            openSnackbar("Auth token not found.", "error");
            return;
        }
        const {namespace, kind, name} = parseObjectPath(decodedObjectName);
        setEditError(null);
        setEditConflict(false);
        setActionLoading(true);
        try {
            // The daemon writes the whole file: a change landed since the edit
            // started would be undone without a word.
            const current = await fetchRawConfigFile(decodedObjectName);
            if (current !== edit.base) {
                setEditConflict(true);
                setEditError("The configuration was changed by someone else since you started editing it. Your changes are not saved.");
                return;
            }
            const response = await fetch(`${URL_OBJECT}/${namespace}/${kind}/${name}/config/file`, {
                method: "PUT",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/octet-stream",
                },
                body: edit.text,
            });
            if (!response.ok) {
                if (response.status === 409) setEditConflict(true);
                setEditError(`Failed to update config: ${await problemMessage(response)}`);
                return;
            }
            setEdit(null);
            openSnackbar("Configuration updated successfully");
            if (configNode) await fetchConfig(configNode, true);
        } catch (err) {
            setEditError(`Failed to update config: ${err.message}`);
        } finally {
            setActionLoading(false);
        }
    };

    const handleOpenKeywordsDialog = () => {
        setKeywordsDialogOpen(true);
        void fetchKeywords();
    };

    const handleOpenManageParamsDialog = () => {
        setManageParamsDialogOpen(true);
        void fetchKeywords();
        void fetchExistingParams();
    };

    const handleUpdateConfig = async () => {
        /* istanbul ignore next */
        if (!newConfigFile) {
            openSnackbar("Configuration file is required.", "error");
            return;
        }
        const token = localStorage.getItem("authToken");
        if (!token) {
            openSnackbar("Auth token not found.", "error");
            return;
        }
        const {namespace, kind, name} = parseObjectPath(decodedObjectName);
        setActionLoading(true);
        openSnackbar("Updating configuration…", "info");
        try {
            const response = await fetch(`${URL_OBJECT}/${namespace}/${kind}/${name}/config/file`, {
                method: "PUT",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/octet-stream",
                },
                body: newConfigFile,
            });
            if (!response.ok) {
                const error = new Error(`Failed to update config: ${response.status}`);
                openSnackbar(`Error: ${error.message}`, "error");
                return;
            }
            openSnackbar("Configuration updated successfully");
            if (configNode) {
                await fetchConfig(configNode, true);
                setConfigDialogOpen(true);
            }
        } catch (err) {
            openSnackbar(`Error: ${err.message}`, "error");
        } finally {
            setActionLoading(false);
            setUpdateConfigDialogOpen(false);
            setNewConfigFile(null);
        }
    };

    const handleAddParams = async () => {
        /* istanbul ignore next */
        if (!paramsToSet.length) {
            openSnackbar("Parameter input is required.", "error");
            return false;
        }
        const token = localStorage.getItem("authToken");
        if (!token) {
            openSnackbar("Auth token not found.", "error");
            return false;
        }
        const {namespace, kind, name} = parseObjectPath(decodedObjectName);
        setActionLoading(true);
        let successCount = 0;
        for (const param of paramsToSet) {
            let fullKeyword;
            if (param.section !== undefined) {
                fullKeyword = param.section ? `${param.section}.${param.option}` : param.option;
            } else if (param.sectionPrefix !== undefined) {
                const section = param.sectionSuffix ? `${param.sectionPrefix}#${param.sectionSuffix}` : param.sectionPrefix;
                fullKeyword = section ? `${section}.${param.option}` : param.option;
            } else {
                /* istanbul ignore next */
                fullKeyword = param.option;
            }
            const {value, option} = param;
            const keyword = param.keyword;
            try {
                /* istanbul ignore next */
                if (!keyword) {
                    openSnackbar(`Invalid parameter: ${option}`, "error");
                    continue;
                }
                if (keyword.converter === "converters.TListLowercase" && value.includes(",")) {
                    const values = value.split(",").map((v) => v.trim().toLowerCase());
                    if (values.some((v) => !v)) {
                        openSnackbar(`Invalid value for ${fullKeyword}: must be comma-separated lowercase strings`, "error");
                        continue;
                    }
                }
                const url = `${URL_OBJECT}/${namespace}/${kind}/${name}/config?set=${encodeURIComponent(fullKeyword)}=${encodeURIComponent(value)}`;
                const response = await fetch(url, {
                    method: "PATCH",
                    headers: {Authorization: `Bearer ${token}`},
                });
                if (!response.ok) {
                    const error = new Error(`HTTP ${response.status}`);
                    openSnackbar(`Error adding parameter ${fullKeyword}: ${error.message}`, "error");
                    continue;
                }
                successCount++;
            } catch (err) {
                openSnackbar(`Error adding parameter ${fullKeyword}: ${err.message}`, "error");
            }
        }
        if (successCount > 0) {
            openSnackbar(`Successfully added ${successCount} parameter(s)`, "success");
            if (configNode) {
                await fetchConfig(configNode, true);
                await fetchExistingParams();
                setConfigDialogOpen(true);
            }
        }
        setActionLoading(false);
        return successCount > 0;
    };

    const handleUnsetParams = async () => {
        if (!paramsToUnset.length) return false;
        const token = localStorage.getItem("authToken");
        if (!token) {
            openSnackbar("Auth token not found.", "error");
            return false;
        }
        const {namespace, kind, name} = parseObjectPath(decodedObjectName);
        setActionLoading(true);
        let successCount = 0;
        for (const param of paramsToUnset) {
            const {section, option} = param;
            try {
                /* istanbul ignore next */
                if (!option) {
                    openSnackbar(`Error unsetting parameter ${param.option || "unknown"}`, "error");
                    continue;
                }
                const fullKeyword = section ? `${section}.${option}` : option;
                const url = `${URL_OBJECT}/${namespace}/${kind}/${name}/config?unset=${encodeURIComponent(fullKeyword)}`;
                const response = await fetch(url, {
                    method: "PATCH",
                    headers: {Authorization: `Bearer ${token}`},
                });
                if (!response.ok) {
                    const error = new Error(`Failed to unset parameter ${fullKeyword}: ${response.status}`);
                    openSnackbar(`Error unsetting parameter ${fullKeyword}: ${error.message}`, "error");
                    continue;
                }
                successCount++;
            } catch (err) {
                openSnackbar(`Error unsetting parameter ${option || "unknown"}: ${err.message}`, "error");
            }
        }
        if (successCount > 0) {
            openSnackbar(`Successfully unset ${successCount} parameter(s)`, "success");
            if (configNode) {
                await fetchConfig(configNode, true);
                await fetchExistingParams();
                setConfigDialogOpen(true);
            }
        }
        setActionLoading(false);
        return successCount > 0;
    };

    const handleDeleteParams = async () => {
        if (!paramsToDelete.length) return false;
        const token = localStorage.getItem("authToken");
        if (!token) {
            openSnackbar("Auth token not found.", "error");
            return false;
        }
        const {namespace, kind, name} = parseObjectPath(decodedObjectName);
        setActionLoading(true);
        let successCount = 0;
        for (const section of paramsToDelete) {
            try {
                const url = `${URL_OBJECT}/${namespace}/${kind}/${name}/config?delete=${encodeURIComponent(section)}`;
                const response = await fetch(url, {
                    method: "PATCH",
                    headers: {Authorization: `Bearer ${token}`},
                });
                if (!response.ok) {
                    const error = new Error(`Failed to delete section ${section}: ${response.status}`);
                    openSnackbar(`Error deleting section ${section}: ${error.message}`, "error");
                    continue;
                }
                successCount++;
            } catch (err) {
                openSnackbar(`Error deleting section ${section}: ${err.message}`, "error");
            }
        }
        if (successCount > 0) {
            openSnackbar(`Successfully deleted ${successCount} section(s)`, "success");
            if (configNode) {
                await fetchConfig(configNode, true);
                await fetchExistingParams();
                setConfigDialogOpen(true);
            }
        }
        setActionLoading(false);
        return successCount > 0;
    };

    const handleManageParamsSubmit = async () => {
        let anySuccess = false;
        if (paramsToSet.length) anySuccess = await handleAddParams() || anySuccess;
        if (paramsToUnset.length) anySuccess = await handleUnsetParams() || anySuccess;
        if (paramsToDelete.length) anySuccess = await handleDeleteParams() || anySuccess;
        if (!paramsToSet.length && !paramsToUnset.length && !paramsToDelete.length) {
            openSnackbar("No selection made", "error");
            return;
        }
        if (anySuccess) {
            setParamsToSet([]);
            setParamsToUnset([]);
            setParamsToDelete([]);
            setManageParamsDialogOpen(false);
        }
    };

    const closeConfigDialog = () => setConfigDialogOpen(false);

    return (
        <div className="w-full">
            <Button
                size="sm"
                icon={<FileIcon/>}
                onClick={() => setConfigDialogOpen(true)}
                className="w-full min-w-0 overflow-hidden text-ellipsis"
            >
                View Configuration
            </Button>

            <Dialog
                open={configDialogOpen}
                onClose={closeConfigDialog}
                title="Configuration"
                size="lg"
                footer={edit ? (
                    <>
                        <Button onClick={cancelEdit} disabled={actionLoading}>Cancel</Button>
                        <Button
                            variant="primary"
                            onClick={saveEdit}
                            disabled={actionLoading || !editDirty}
                            icon={actionLoading ? <Spinner label="Saving"/> : undefined}
                        >
                            Save
                        </Button>
                    </>
                ) : (
                    <Button onClick={closeConfigDialog}>Close</Button>
                )}
            >
                {edit ? (
                    <div className="space-y-2">
                        <p className="text-data text-ink-muted">
                            Editing the file as stored: secret values are shown in clear. Saving uploads the whole file.
                        </p>
                        {editError && (
                            <Alert
                                action={editConflict && (
                                    <Button size="sm" onClick={startEdit} disabled={actionLoading || editLoading}>
                                        Start over from the current file
                                    </Button>
                                )}
                            >
                                {editError}
                            </Alert>
                        )}
                        <Textarea
                            aria-label="Configuration file"
                            value={edit.text}
                            onChange={(e) => setEdit({...edit, text: e.target.value})}
                            disabled={actionLoading}
                            spellCheck={false}
                            rows={Math.min(30, Math.max(10, edit.text.split("\n").length + 1))}
                            className="font-mono text-data whitespace-pre"
                        />
                    </div>
                ) : (
                    <>
                        <div className="flex items-center justify-end gap-1">
                            {configData !== null && !configLoading && (
                                <p className="mr-auto text-data text-ink-muted">
                                    {showSecrets
                                        ? `Secrets masked again in ${formatSeconds(secondsLeft)}.`
                                        : "Secret values are shown as ********."}
                                </p>
                            )}
                            <IconButton
                                label={showSecrets ? "Hide secrets" : "Show secrets"}
                                aria-pressed={showSecrets}
                                onClick={() => setShowSecrets((shown) => !shown)}
                                disabled={configLoading}
                            >
                                {showSecrets ? <EyeOffIcon/> : <EyeIcon/>}
                            </IconButton>
                            <IconButton
                                label="Edit configuration file"
                                onClick={startEdit}
                                disabled={actionLoading || editLoading || !configNode}
                            >
                                <CodeIcon/>
                            </IconButton>
                            <IconButton
                                label="Upload new configuration file"
                                onClick={() => setUpdateConfigDialogOpen(true)}
                                disabled={actionLoading}
                            >
                                <FileIcon/>
                            </IconButton>
                            <IconButton
                                label="Manage configuration parameters"
                                onClick={handleOpenManageParamsDialog}
                                disabled={actionLoading}
                            >
                                <PencilIcon/>
                            </IconButton>
                            <IconButton
                                label="View configuration keywords"
                                onClick={handleOpenKeywordsDialog}
                                disabled={actionLoading}
                            >
                                <LifeRingIcon/>
                            </IconButton>
                        </div>
                        {!configNode && !configLoading && !configError && (
                            <p className="text-ink-muted">No instance selected to view configuration.</p>
                        )}
                        {editLoading && <Spinner label="Loading configuration for editing"/>}
                        {editError && !editLoading && <Alert>{editError}</Alert>}
                        {configLoading && <Spinner label="Loading configuration"/>}
                        {configError && <Alert>{configError}</Alert>}
                        {!configLoading && !configError && configData === null && configNode && (
                            <p className="text-ink-muted">No configuration available.</p>
                        )}
                        {!configLoading && !configError && configData !== null && (
                            <div
                                className="overflow-x-auto rounded-(--radius-control) border border-line bg-surface-sunken p-2">
                            <pre key={configData} className="m-0 font-mono text-data whitespace-pre-wrap text-ink">
                                {configData}
                            </pre>
                            </div>
                        )}
                    </>
                )}
            </Dialog>

            <UpdateConfigDialog
                open={updateConfigDialogOpen}
                onClose={() => setUpdateConfigDialogOpen(false)}
                newConfigFile={newConfigFile}
                setNewConfigFile={setNewConfigFile}
                actionLoading={actionLoading}
                handleUpdateConfig={handleUpdateConfig}
            />
            <ManageParamsDialog
                open={manageParamsDialogOpen}
                onClose={() => setManageParamsDialogOpen(false)}
                keywordsData={keywordsData}
                existingParams={existingParams}
                keywordsLoading={keywordsLoading}
                existingParamsLoading={existingParamsLoading}
                keywordsError={keywordsError}
                existingParamsError={existingParamsError}
                paramsToSet={paramsToSet}
                setParamsToSet={setParamsToSet}
                paramsToUnset={paramsToUnset}
                setParamsToUnset={setParamsToUnset}
                paramsToDelete={paramsToDelete}
                setParamsToDelete={setParamsToDelete}
                actionLoading={actionLoading}
                handleManageParamsSubmit={handleManageParamsSubmit}
                openSnackbar={openSnackbar}
            />
            <KeywordsDialog
                open={keywordsDialogOpen}
                onClose={() => setKeywordsDialogOpen(false)}
                keywordsData={keywordsData}
                keywordsLoading={keywordsLoading}
                keywordsError={keywordsError}
            />
        </div>
    );
};

export default ConfigSection;
