import React, {useState, useEffect, useRef, useMemo, useReducer, useCallback} from "react";
import {
    Box,
    Typography,
    Tooltip,
    IconButton,
    CircularProgress,
    Alert,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Autocomplete,
    useTheme,
} from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import EditIcon from "@mui/icons-material/Edit";
import InfoIcon from "@mui/icons-material/Info";
import DeleteIcon from "@mui/icons-material/Delete";
import {URL_OBJECT, URL_NODE} from "../config/apiPath.js";
import {parseObjectPath} from "../utils/objectUtils";

const useConfig = (decodedObjectName, configNode, setConfigNode, refreshTrigger) => {
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
        const key = `${decodedObjectName}:${node}`;
        const now = Date.now();
        if (!forceBypassThrottle && lastFetch.current[key] && now - lastFetch.current[key] < 1000) return;
        lastFetch.current[key] = now;
        const {namespace, kind, name} = parseObjectPath(decodedObjectName);
        const token = localStorage.getItem("authToken") || "";
        dispatch({type: "FETCH_START"});
        setConfigNode(node);
        try {
            const response = await fetch(`${URL_NODE}/${node}/instance/path/${namespace}/${kind}/${name}/config/file`, {
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
    }, [decodedObjectName, setConfigNode]);

    useEffect(() => {
        if (configNode) {
            void fetchConfig(configNode);
        } else {
            dispatch({type: "RESET"});
        }
    }, [configNode, decodedObjectName, fetchConfig]);

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

const UpdateConfigDialog = ({
                                open,
                                onClose,
                                newConfigFile,
                                setNewConfigFile,
                                actionLoading,
                                handleUpdateConfig,
                            }) => (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>Update Configuration</DialogTitle>
        <DialogContent>
            <Box sx={{mt: 2}}>
                <input
                    id="update-config-file-upload"
                    type="file"
                    hidden
                    onChange={(e) => setNewConfigFile(e.target.files[0])}
                    disabled={actionLoading}
                />
                <Box sx={{display: "flex", alignItems: "center", gap: 2}}>
                    <Button
                        variant="outlined"
                        component="label"
                        htmlFor="update-config-file-upload"
                        disabled={actionLoading}
                    >
                        Choose File
                    </Button>
                    <Typography variant="body2" color={newConfigFile ? "textPrimary" : "textSecondary"}>
                        {newConfigFile ? newConfigFile.name : "No file chosen"}
                    </Typography>
                </Box>
            </Box>
        </DialogContent>
        <DialogActions>
            <Button onClick={onClose} disabled={actionLoading}>Cancel</Button>
            <Button
                variant="contained"
                onClick={handleUpdateConfig}
                disabled={actionLoading || !newConfigFile}
                startIcon={actionLoading ? <CircularProgress size={20}/> : null}
            >
                Update
            </Button>
        </DialogActions>
    </Dialog>
);

const KeywordsDialog = ({open, onClose, keywordsData, keywordsLoading, keywordsError}) => (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle>Configuration Keywords</DialogTitle>
        <DialogContent>
            {keywordsLoading && <CircularProgress size={24}/>}
            {keywordsError && <Alert severity="error" sx={{mb: 2}}>{keywordsError}</Alert>}
            {!keywordsLoading && !keywordsError && !keywordsData && (
                <Typography color="textSecondary">No keywords available.</Typography>
            )}
            {!keywordsLoading && !keywordsError && keywordsData && (
                <TableContainer component={Paper} sx={{maxWidth: "100%", overflowX: "auto"}}>
                    <Table aria-label="configuration keywords table">
                        <TableHead>
                            <TableRow>
                                <TableCell>Keyword</TableCell>
                                <TableCell>Description</TableCell>
                                <TableCell>Default</TableCell>
                                <TableCell>Type</TableCell>
                                <TableCell>Section</TableCell>
                                <TableCell>Scopable</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {keywordsData.map((keyword, index) => (
                                <TableRow key={`${keyword.section || "default"}.${keyword.option}-${index}`}>
                                    <TableCell>{keyword.option}</TableCell>
                                    <TableCell>{keyword.text || "N/A"}</TableCell>
                                    <TableCell>{keyword.default || "None"}</TableCell>
                                    <TableCell>{keyword.converter || "N/A"}</TableCell>
                                    <TableCell>{keyword.section || "N/A"}</TableCell>
                                    <TableCell>{keyword.scopable ? "Yes" : "No"}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}
        </DialogContent>
        <DialogActions>
            <Button onClick={onClose} disabled={keywordsLoading}>Close</Button>
        </DialogActions>
    </Dialog>
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
    const [selectedKeyword, setSelectedKeyword] = useState(null);

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
            setSelectedKeyword(null);
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

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>Manage Configuration Parameters</DialogTitle>
            <DialogContent>
                {(keywordsLoading || existingParamsLoading) && <CircularProgress size={24}/>}
                {keywordsError && <Alert severity="error" sx={{mb: 2}}>{keywordsError}</Alert>}
                {existingParamsError && <Alert severity="error" sx={{mb: 2}}>{existingParamsError}</Alert>}

                <Typography variant="subtitle1" gutterBottom>Add parameters</Typography>
                <Autocomplete
                    freeSolo
                    options={keywordsData || []}
                    value={selectedKeyword}
                    getOptionLabel={(option) => {
                        if (typeof option === 'string') return option;
                        return option && option.option ? `${option.section ? `${option.section}.` : ""}${option.option}` : '';
                    }}
                    renderInput={(params) => (
                        <TextField
                            {...params}
                            label="Select parameter to add"
                            placeholder="Select parameter"
                            helperText="Select a parameter to add, then click Add"
                            slotProps={{inputLabel: {"aria-label": "Select parameter to add"}}}
                        />
                    )}
                    onChange={(_event, newValue) => setSelectedKeyword(newValue)}
                    disabled={actionLoading || keywordsLoading}
                    sx={{mb: 2}}
                />
                <Button
                    variant="contained"
                    onClick={addParameter}
                    disabled={!selectedKeyword || actionLoading}
                    sx={{mb: 2}}
                >
                    Add Parameter
                </Button>

                {paramsToSet.length > 0 && (
                    <Box sx={{mb: 2}}>
                        <Box sx={{display: "flex", alignItems: "center", mb: 1, gap: 2}}>
                            <Box sx={{flex: "0 0 25%"}}>
                                <Typography variant="body2" fontWeight="bold">Section</Typography>
                            </Box>
                            <Box sx={{flex: "0 0 20%"}}>
                                <Typography variant="body2" fontWeight="bold">Parameter</Typography>
                            </Box>
                            <Box sx={{flex: "0 0 20%"}}>
                                <Typography variant="body2" fontWeight="bold">Value</Typography>
                            </Box>
                            <Box sx={{flex: 1}}>
                                <Typography variant="body2" fontWeight="bold">Description</Typography>
                            </Box>
                            <Box sx={{flex: "0 0 40px"}}></Box>
                        </Box>
                        {paramsToSet.map((param, index) => {
                            const keyword = param.keyword;
                            const hasSectionPrefix = param.sectionPrefix !== undefined;
                            return (
                                <Box key={param.id} sx={{display: "flex", alignItems: "center", mb: 2, gap: 2}}>
                                    <Box sx={{flex: "0 0 25%"}}>
                                        {hasSectionPrefix ? (
                                            <Box sx={{display: "flex", alignItems: "center", gap: 1}}>
                                                <Typography variant="body2" sx={{whiteSpace: "nowrap"}}>
                                                    {param.sectionPrefix}#
                                                </Typography>
                                                <Autocomplete
                                                    freeSolo
                                                    options={existingSectionSuffixes[param.sectionPrefix] || []}
                                                    getOptionLabel={(option) => typeof option === 'string' ? option : ''}
                                                    value={param.sectionSuffix}
                                                    inputValue={param.sectionSuffix}
                                                    onInputChange={(event, newInputValue) => {
                                                        updateParamSectionSuffix(index, newInputValue);
                                                    }}
                                                    onChange={(event, newValue) => {
                                                        updateParamSectionSuffix(index, newValue || "");
                                                    }}
                                                    renderInput={(params) => (
                                                        <TextField
                                                            {...params}
                                                            label="Index"
                                                            size="small"
                                                            placeholder="e.g., prod, 1, data"
                                                            inputProps={{
                                                                ...params.inputProps,
                                                                'aria-label': 'Index'
                                                            }}
                                                        />
                                                    )}
                                                    disabled={actionLoading}
                                                    sx={{width: "100%"}}
                                                />
                                            </Box>
                                        ) : (
                                            <Autocomplete
                                                freeSolo
                                                options={existingSections}
                                                getOptionLabel={(option) => typeof option === 'string' ? option : ''}
                                                value={param.section || ""}
                                                inputValue={param.section || ""}
                                                onInputChange={(event, newInputValue) => {
                                                    updateParamSection(index, newInputValue);
                                                }}
                                                onChange={(event, newValue) => {
                                                    updateParamSection(index, newValue || "");
                                                }}
                                                renderInput={(params) => (
                                                    <TextField
                                                        {...params}
                                                        label="Section (optional)"
                                                        size="small"
                                                        placeholder="e.g., database, fs#data"
                                                        inputProps={{
                                                            ...params.inputProps,
                                                            'aria-label': 'Section (optional)'
                                                        }}
                                                    />
                                                )}
                                                disabled={actionLoading}
                                                sx={{width: "100%"}}
                                            />
                                        )}
                                    </Box>
                                    <Box sx={{flex: "0 0 20%"}}>
                                        <Tooltip title={keyword?.text || ""} arrow>
                                            <Typography sx={{
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                                whiteSpace: "nowrap"
                                            }}>
                                                {param.option}
                                            </Typography>
                                        </Tooltip>
                                    </Box>
                                    <Box sx={{flex: "0 0 20%"}}>
                                        <TextField
                                            fullWidth
                                            label="Value"
                                            value={param.value}
                                            onChange={(e) => updateParamValue(index, e.target.value)}
                                            disabled={actionLoading}
                                            size="small"
                                            slotProps={{inputLabel: {"aria-label": "Value"}}}
                                        />
                                    </Box>
                                    <Box sx={{flex: 1}}>
                                        <Typography
                                            variant="caption"
                                            color="textSecondary"
                                            sx={{
                                                whiteSpace: "normal",
                                                maxHeight: "60px",
                                                overflowY: "auto",
                                                display: "block"
                                            }}
                                            title={keyword?.text || ""}
                                        >
                                            {keyword?.text || "N/A"}
                                        </Typography>
                                    </Box>
                                    <IconButton onClick={() => removeParameter(index)} disabled={actionLoading}
                                                aria-label="Remove parameter">
                                        <DeleteIcon/>
                                    </IconButton>
                                </Box>
                            );
                        })}
                    </Box>
                )}

                <Typography variant="subtitle1" gutterBottom sx={{mt: 2}}>Unset parameters</Typography>
                <Autocomplete
                    multiple
                    options={existingKeywords}
                    value={paramsToUnset}
                    getOptionLabel={(option) => `${option.section ? `${option.section}.` : ""}${option.option}`}
                    renderInput={(params) => (
                        <TextField
                            {...params}
                            label="Select parameters to unset"
                            placeholder="Select parameters"
                            helperText="Select existing parameters to remove their values"
                            slotProps={{inputLabel: {"aria-label": "Select parameters to unset"}}}
                        />
                    )}
                    onChange={(_event, newValue) => {
                        const formattedParams = (newValue || []).map((item, index) => {
                            if (typeof item === "string") {
                                const parts = item.split(".");
                                return {
                                    section: parts.length > 1 ? parts[0] : "",
                                    option: parts.length > 1 ? parts.slice(1).join(".") : item,
                                    id: `unset-${item}-${index}`,
                                };
                            }
                            return {...item, id: `unset-${item.option}-${index}`};
                        });
                        setParamsToUnset(formattedParams);
                    }}
                    disabled={actionLoading || existingParamsLoading}
                    sx={{mb: 2}}
                />

                <Typography variant="subtitle1" gutterBottom sx={{mt: 2}}>Delete sections</Typography>
                <Autocomplete
                    multiple
                    options={existingSections}
                    value={paramsToDelete}
                    getOptionLabel={(option) => option}
                    renderInput={(params) => (
                        <TextField
                            {...params}
                            label="Select sections to delete"
                            placeholder="Select sections"
                            helperText="Select existing sections to delete"
                            slotProps={{inputLabel: {"aria-label": "Select sections to delete"}}}
                        />
                    )}
                    onChange={(_event, newValue) => setParamsToDelete(newValue)}
                    disabled={actionLoading || existingParamsLoading}
                />
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={actionLoading}>Cancel</Button>
                <Button
                    variant="contained"
                    onClick={handleManageParamsSubmit}
                    disabled={actionLoading}
                    startIcon={actionLoading ? <CircularProgress size={20}/> : null}
                >
                    Apply
                </Button>
            </DialogActions>
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
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';

    const {data: configData, loading: configLoading, error: configError, fetchConfig} = useConfig(
        decodedObjectName,
        configNode,
        setConfigNode,
        configRefreshTrigger,
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

    return (
        <Box sx={{mb: 2, width: "100%", display: 'flex', justifyContent: 'flex-end'}}>
            <Box sx={{width: '100%', overflow: 'hidden'}}>
                <Button
                    variant="contained"
                    size="small"
                    onClick={() => setConfigDialogOpen(true)}
                    sx={{
                        display: 'block',
                        minWidth: 0,
                        width: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}
                >
                    View Configuration
                </Button>
            </Box>

            <Dialog open={configDialogOpen} onClose={() => setConfigDialogOpen(false)} maxWidth="lg" fullWidth>
                <DialogTitle>Configuration</DialogTitle>
                <DialogContent>
                    <Box sx={{mt: 2}}>
                        <Box sx={{display: "flex", justifyContent: "flex-end", mb: 2, gap: 1}}>
                            <Tooltip title="Upload a new configuration file">
                                <IconButton
                                    color="primary"
                                    onClick={() => setUpdateConfigDialogOpen(true)}
                                    disabled={actionLoading}
                                    aria-label="Upload new configuration file"
                                    size="small"
                                >
                                    <UploadFileIcon/>
                                </IconButton>
                            </Tooltip>
                            <Tooltip title="Manage configuration parameters (add, unset, delete)">
                                <IconButton
                                    color="primary"
                                    onClick={handleOpenManageParamsDialog}
                                    disabled={actionLoading}
                                    aria-label="Manage configuration parameters"
                                    size="small"
                                >
                                    <EditIcon/>
                                </IconButton>
                            </Tooltip>
                            <Tooltip title="View available configuration keywords">
                                <IconButton
                                    color="primary"
                                    onClick={handleOpenKeywordsDialog}
                                    disabled={actionLoading}
                                    aria-label="View configuration keywords"
                                    size="small"
                                >
                                    <InfoIcon/>
                                </IconButton>
                            </Tooltip>
                        </Box>
                        {!configNode && !configLoading && !configError && (
                            <Typography color="textSecondary" variant="body2">
                                No instance selected to view configuration.
                            </Typography>
                        )}
                        {configLoading && <CircularProgress size={24}/>}
                        {configError && <Alert severity="error" sx={{mb: 2}}>{configError}</Alert>}
                        {!configLoading && !configError && configData === null && configNode && (
                            <Typography color="textSecondary" variant="body2">No configuration available.</Typography>
                        )}
                        {!configLoading && !configError && configData !== null && (
                            <Box
                                sx={{
                                    p: 2,
                                    bgcolor: isDark ? 'grey.900' : 'grey.200',
                                    borderRadius: 1,
                                    maxWidth: "100%",
                                    overflowX: "auto",
                                    boxSizing: "border-box",
                                    scrollbarWidth: "thin",
                                    "&::-webkit-scrollbar": {height: "8px"},
                                    "&::-webkit-scrollbar-thumb": {
                                        backgroundColor: isDark ? 'grey.600' : 'grey.400',
                                        borderRadius: "4px"
                                    },
                                }}
                            >
                                <Box
                                    component="pre"
                                    key={configData}
                                    sx={{
                                        whiteSpace: "pre-wrap",
                                        fontFamily: "Monospace",
                                        bgcolor: "inherit",
                                        p: 1,
                                        m: 0,
                                        minWidth: "max-content",
                                        fontSize: '0.875rem',
                                        color: 'text.primary',
                                    }}
                                >
                                    {configData}
                                </Box>
                            </Box>
                        )}
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfigDialogOpen(false)}>Close</Button>
                </DialogActions>
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
        </Box>
    );
};

export default ConfigSection;
