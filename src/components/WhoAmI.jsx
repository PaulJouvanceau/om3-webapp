import React, {useEffect, useState} from 'react';
import {URL_AUTH_WHOAMI} from '../config/apiPath';
import {Button} from '../ui/components/Button';
import {Alert} from '../ui/components/Alert';
import {Spinner} from '../ui/components/Spinner';
import {LockIcon, MoonIcon, ServerIcon, SignOutIcon, SunIcon, UserIcon} from '../ui/icons';
import {useOidc} from "../context/OidcAuthContext.tsx";
import {useAuth, useAuthDispatch, Logout} from "../context/AuthProvider.jsx";
import {useNavigate} from "react-router-dom";
import logger from '../utils/logger.js';
import useFetchDaemonStatus from "../hooks/useFetchDaemonStatus";
import {useDarkMode} from "../context/DarkModeContext";
import {clearObjectCache} from "../hooks/useEventStore.js";

/** A labelled value of a panel: the label muted above, the value in monospace. */
const Value = ({label, children}) => (
    <div>
        <dt className="text-data text-ink-muted">{label}</dt>
        <dd className="font-mono">{children}</dd>
    </div>
);

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
        clearObjectCache();
        if (authDispatch) {
            authDispatch({type: Logout});
        }
        navigate("/auth-choice");
    };

    if (loading) return (
        <div className="p-4">
            <Spinner label="Loading user information"/>
        </div>
    );
    if (error) return (
        <div className="p-4">
            <Alert>{String(error)}</Alert>
        </div>
    );

    const PANEL = "rounded-(--radius-panel) border border-line bg-surface-raised p-3";

    return (
        <div className="p-4 space-y-3">
            <div className="grid gap-3 lg:grid-cols-3">
                <section aria-labelledby="whoami-my-info" className={PANEL}>
                    <h2 id="whoami-my-info" className="mb-2 flex items-center gap-2 font-semibold">
                        <UserIcon className="text-accent"/>
                        My Information
                    </h2>
                    <dl className="space-y-2">
                        <Value label="Username">{userInfo?.name || "N/A"}</Value>
                        <Value label="Auth Method">{userInfo?.auth || "N/A"}</Value>
                    </dl>
                </section>

                <section aria-labelledby="whoami-permissions" className={PANEL}>
                    <h2 id="whoami-permissions" className="mb-2 flex items-center gap-2 font-semibold">
                        <LockIcon className="text-accent"/>
                        Permission Details
                    </h2>
                    <dl className="rounded-(--radius-control) bg-surface-sunken p-2">
                        <Value label="Raw Permissions">{userInfo?.raw_grant || "None"}</Value>
                    </dl>
                </section>

                <section aria-labelledby="whoami-server" className={PANEL}>
                    <h2 id="whoami-server" className="mb-2 flex items-center gap-2 font-semibold">
                        <ServerIcon className="text-accent"/>
                        Server Information
                    </h2>
                    <dl className="space-y-2">
                        <Value label="Connected Node">{daemon?.nodename || "Loading..."}</Value>
                        <div>
                            <dt className="text-data text-ink-muted">WebApp Version</dt>
                            <dd className="font-mono">v{appVersion}</dd>
                            <dd className="text-data text-ink-muted">OM3 WebApp</dd>
                        </div>
                    </dl>
                </section>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                    onClick={toggleDarkMode}
                    icon={isDarkMode ? <SunIcon className="h-4 w-4"/> : <MoonIcon className="h-4 w-4"/>}
                >
                    {isDarkMode ? "Light Mode" : "Dark Mode"}
                </Button>
                <Button variant="danger" icon={<SignOutIcon/>} onClick={handleLogout}>
                    Logout
                </Button>
            </div>
        </div>
    );
};

export default WhoAmI;
