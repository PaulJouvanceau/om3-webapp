import {WebStorageStateStore} from "oidc-client-ts";
import logger from "../utils/logger.js";

const DEFAULT_SCOPES = [
    "openid",
    "profile",
    "email",
    "offline_access",
    "opensvc:om3",
    "opensvc:om3:root",
    "opensvc:om3:guest",
    "opensvc:badscope",
];

const initData = {
    client_id: "om3",
    response_type: "code",
    accessTokenExpiringNotificationTimeInSeconds: 30,
    automaticSilentRenew: true,
    monitorSession: true,
};

/**
 * Filters the DEFAULT_SCOPES based on a list of allowed scopes from the well-known configuration.
 * @param {string[]} allowedScopes - Scopes allowed from well-known config
 * @returns {string} space-separated filtered scopes
 */
function filterScopes(allowedScopes) {
    if (!Array.isArray(allowedScopes) || allowedScopes.length === 0) {
        logger.warn("No allowed scopes provided, using default scopes");
        return DEFAULT_SCOPES.join(" ");
    }

    const filteredScopes = DEFAULT_SCOPES.filter(scope => allowedScopes.includes(scope));
    logger.debug("Filtered scopes:", filteredScopes);
    return filteredScopes.join(" ");
}

const isBrowser = typeof window !== 'undefined' && typeof window.location !== 'undefined';

const getBasePath = () => {
    if (!isBrowser) return "";
    const match = window.location.pathname.match(/^\/ui/);
    return match ? match[0] : "";
};

async function oidcConfiguration(authInfo) {
    let scopesSupported = DEFAULT_SCOPES;
    if (!authInfo?.openid?.issuer) {
        logger.warn("OIDC Configuration fallback: 'authInfo.openid.issuer' is missing. Falling back to default configuration.");
        return initData;
    }

    try {
        let url = new URL(authInfo.openid.issuer);
        if (!url.protocol || !url.host) {
            logger.error("Malformed URI: missing protocol or host");
            return initData;
        }
        if (!url.pathname.endsWith("/")) {
            url.pathname += "/";
        }
        url.pathname += '.well-known/openid-configuration';
        logger.info("Fetching OIDC configuration from:", url.toString());
        const response = await fetch(url);

        if (response.ok) {
            const wellKnown = await response.json();
            scopesSupported = wellKnown.scopes_supported || DEFAULT_SCOPES;
            logger.debug("OIDC well-known configuration fetched:", wellKnown);
        } else {
            logger.warn("Failed to fetch .well-known/openid-configuration:", response.status);
        }
    } catch (error) {
        logger.error("Well-formed URL required for openid.issuer", error);
        return initData;
    }

    const baseUrl = isBrowser ? window.location.origin + getBasePath() : "";
    const finalScope = filterScopes(scopesSupported);
    const userStore = isBrowser && typeof window.localStorage !== 'undefined'
        ? new WebStorageStateStore({store: window.localStorage})
        : undefined;

    const config = {
        ...initData,
        authority: authInfo.openid.issuer,
        client_id: authInfo.openid.client_id,
        scope: finalScope,
        redirect_uri: `${baseUrl}/auth-callback`,
        // Use a dedicated silent renew endpoint so the iframe can call `signinSilentCallback`
        silent_redirect_uri: `${baseUrl}/silent-renew`,
        // Explicitly control refresh token usage for SPAs. Set to true to use refresh tokens for silent renew.
        useRefreshToken: true,
        post_logout_redirect_uri: `${baseUrl}/`,
        ...(userStore ? {userStore} : {}),
    };
    logger.debug("Final OIDC configuration:", config);
    return config;
}

export default oidcConfiguration;
