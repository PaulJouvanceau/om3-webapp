import React, {useEffect, useState} from 'react';
import {URL_AUTH_WHOAMI} from '../config/apiPath';
import {
    Card,
    CardContent,
    LinearProgress,
    Alert,
    Typography,
    Button,
    Box,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import {useTheme} from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import {FaSignOutAlt, FaServer, FaUser, FaLock, FaMoon, FaSun} from "react-icons/fa";
import {useOidc} from "../context/OidcAuthContext.tsx";
import {useAuth, useAuthDispatch, Logout} from "../context/AuthProvider.jsx";
import {useNavigate} from "react-router-dom";
import logger from '../utils/logger.js';
import useFetchDaemonStatus from "../hooks/useFetchDaemonStatus";
import {useDarkMode} from "../context/DarkModeContext";

const WhoAmI = () => {
    const [userInfo, setUserInfo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [appVersion, setAppVersion] = useState('Loading...');
    const {userManager} = useOidc();
    const auth = useAuth();
    const authDispatch = useAuthDispatch();
    const navigate = useNavigate();
    const {daemon, fetchNodes} = useFetchDaemonStatus();
    const {isDarkMode, toggleDarkMode} = useDarkMode();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    // Fetch version from GitHub
    useEffect(() => {
        const fetchVersion = async () => {
            const cached = localStorage.getItem('appVersion');
            const cacheTime = localStorage.getItem('appVersionTime');
            const now = Date.now();

            if (cached && cacheTime && (now - parseInt(cacheTime)) < 3600000) {
                setAppVersion(cached);
                return;
            }

            try {
                const response = await fetch('https://api.github.com/repos/opensvc/om3-webapp/releases', {
                    headers: {'User-Agent': 'MonTestCurl'}
                });
                const data = await response.json();
                const latestVersion = data[0]?.tag_name || 'Unknown';
                const cleanVersion = latestVersion.startsWith('v') ? latestVersion.slice(1) : latestVersion;

                setAppVersion(cleanVersion);
                localStorage.setItem('appVersion', cleanVersion);
                localStorage.setItem('appVersionTime', now.toString());
            } catch (error) {
                logger.error('Error fetching version:', error);
                setAppVersion(cached || 'Unknown');
            }
        };

        void fetchVersion();
    }, []);

    // Fetch daemon status
    useEffect(() => {
        const fetchDaemonData = async () => {
            const token = localStorage.getItem("authToken");
            if (token) {
                try {
                    await fetchNodes(token);
                } catch (error) {
                    logger.error("Error fetching daemon status:", error);
                }
            }
        };

        void fetchDaemonData();
    }, [fetchNodes]);

    // Fetch WhoAmI
    useEffect(() => {
        const fetchUserInfo = async () => {
            try {
                const response = await fetch(URL_AUTH_WHOAMI, {
                    credentials: 'include',
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                    }
                });

                if (!response.ok) {
                    setError('Failed to load user information');
                    return;
                }
                setUserInfo(await response.json());
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        void fetchUserInfo();
    }, []);

    const handleLogout = () => {
        if (auth?.authChoice === "openid") {
            void userManager.signoutRedirect();
            void userManager.removeUser();
        }
        localStorage.removeItem("authToken");
        if (authDispatch) {
            authDispatch({type: Logout});
        }
        navigate("/auth-choice");
    };

    if (loading) return <LinearProgress/>;
    if (error) return <Alert severity="error">{String(error)}</Alert>;

    const MyInfoCard = (
        <Card sx={{height: '100%'}}>
            <CardContent sx={{py: 2}}>
                <Box sx={{display: 'flex', alignItems: 'center', mb: 1}}>
                    <FaUser style={{marginRight: '8px', color: '#1976d2'}}/>
                    <Typography variant="h6">My Information</Typography>
                </Box>
                <Typography variant="subtitle2" sx={{display: 'flex', alignItems: 'center', mb: 0.5}}>
                    <FaUser style={{marginRight: '4px', fontSize: '0.9rem'}}/>
                    Identity
                </Typography>
                <Box>
                    <Typography variant="caption" color="text.secondary">Username</Typography>
                    <Typography variant="body2" sx={{fontFamily: 'monospace', mb: 1}}>
                        {userInfo?.name || "N/A"}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">Auth Method</Typography>
                    <Typography variant="body2" sx={{fontFamily: 'monospace'}}>
                        {userInfo?.auth || "N/A"}
                    </Typography>
                </Box>
            </CardContent>
        </Card>
    );

    const PermissionCard = (
        <Card sx={{height: '100%'}}>
            <CardContent sx={{py: 2}}>
                <Box sx={{display: 'flex', alignItems: 'center', mb: 1}}>
                    <FaLock style={{marginRight: '8px', color: '#1976d2'}}/>
                    <Typography variant="h6">Permission Details</Typography>
                </Box>
                <Box sx={{
                    bgcolor: isDarkMode ? 'background.default' : 'grey.50',
                    p: 1.5,
                    borderRadius: 1
                }}>
                    <Typography variant="caption" color="text.secondary">Raw Permissions</Typography>
                    <Typography variant="body2" sx={{fontFamily: 'monospace'}}>
                        {userInfo?.raw_grant || "None"}
                    </Typography>
                </Box>
            </CardContent>
        </Card>
    );

    const ServerInfoCard = (
        <Card sx={{height: '100%'}}>
            <CardContent>
                <Box sx={{display: 'flex', alignItems: 'center', mb: 2}}>
                    <FaServer style={{marginRight: '8px', color: '#1976d2'}}/>
                    <Typography variant="h6">Server Information</Typography>
                </Box>
                <Box>
                    <Typography variant="caption" color="text.secondary">Connected Node</Typography>
                    <Typography variant="body2" sx={{fontFamily: 'monospace', mb: 1.5}}>
                        {daemon?.nodename || "Loading..."}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">WebApp Version</Typography>
                    <Typography variant="body2" sx={{fontFamily: 'monospace'}}>
                        v{appVersion}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block">
                        OM3 WebApp
                    </Typography>
                </Box>
            </CardContent>
        </Card>
    );

    const ActionButtons = (
        <Box sx={{display: 'flex', flexDirection: {xs: 'column', sm: 'row'}, gap: 2}}>
            <Button
                startIcon={isDarkMode ? <FaSun/> : <FaMoon/>}
                onClick={toggleDarkMode}
                size="large"
                fullWidth
                sx={{
                    backgroundColor: isDarkMode ? "#ff9800" : "#333333",
                    color: "white",
                    fontWeight: 'bold',
                    borderRadius: 2,
                }}
            >
                {isDarkMode ? "Light Mode" : "Dark Mode"}
            </Button>
            <Button
                startIcon={<FaSignOutAlt/>}
                onClick={handleLogout}
                size="large"
                fullWidth
                sx={{
                    backgroundColor: "red",
                    color: "white",
                    fontWeight: 'bold',
                    borderRadius: 2
                }}
            >
                Logout
            </Button>
        </Box>
    );

    if (isMobile) {
        return (
            <Box sx={{p: 3}}>
                <Grid container spacing={3} direction="column">
                    <Grid item>{MyInfoCard}</Grid>
                    <Grid item>{PermissionCard}</Grid>
                    <Grid item>{ServerInfoCard}</Grid>
                    <Grid item>{ActionButtons}</Grid>
                </Grid>
            </Box>
        );
    }

    return (
        <Box sx={{p: 3}}>
            <Grid container spacing={3}>
                <Grid item xs={12} lg={8}>
                    <Box sx={{display: 'flex', flexDirection: 'column', gap: 3}}>
                        <Box sx={{display: 'flex', flexDirection: {xs: 'column', md: 'row'}, gap: 3}}>
                            <Box sx={{flex: 1}}>{MyInfoCard}</Box>
                            <Box sx={{flex: 1}}>{PermissionCard}</Box>
                        </Box>
                        {ActionButtons}
                    </Box>
                </Grid>

                <Grid item xs={12} lg={4}>
                    {ServerInfoCard}
                </Grid>
            </Grid>
        </Box>
    );
};

export default WhoAmI;
