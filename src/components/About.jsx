import React from "react";
import {Trans, useTranslation} from "react-i18next";
import useEventStore from "../hooks/useEventStore.js";
import {ProductTag} from "../ui/components/ProductTag";
import {APP_VERSION} from "../app/version";
import {Checkbox} from "../ui/components/Field";
import {setReleaseCheck, useReleaseCheck} from "../app/release-check";

/** The publisher, and where to reach it. */
const PUBLISHER = {
    name: "OpenSVC SAS",
    site: "https://www.opensvc.com",
    contact: "contact@opensvc.com",
    support: "support@opensvc.com",
};

/** The sources: the agent and its daemon, this webapp. */
const SOURCES = [
    {name: "om3", url: "https://github.com/opensvc/om3", license: "Apache-2.0"},
    {name: "om3-webapp", url: "https://github.com/opensvc/om3-webapp", license: "Apache-2.0"},
];

/**
 * The software this webapp bundles, each under its own license, as their packages
 * say (package.json, its dependencies): kept with them when one is added or removed.
 */
const BUNDLED = [
    ["React, React DOM", "MIT"],
    ["React Router", "MIT"],
    ["i18next, react-i18next", "MIT"],
    ["Zustand", "MIT"],
    ["axios", "MIT"],
    ["Ajv, ajv-keywords", "MIT"],
    ["clsx, tailwind-merge", "MIT"],
    ["event-source-polyfill", "MIT"],
    ["react-virtuoso, react-window, react-virtualized-auto-sizer", "MIT"],
    ["xterm.js, its fit addon", "MIT"],
    ["oidc-client-ts", "Apache-2.0"],
    ["web-vitals", "Apache-2.0"],
    ["IBM Plex Sans", "OFL-1.1"],
];

const LINK = "text-accent underline-offset-2 hover:underline";

function Mail({to}) {
    return <a className={LINK} href={`mailto:${to}`}>{to}</a>;
}

function Section({id, title, children}) {
    return (
        <section aria-labelledby={`about-${id}`} className="space-y-2">
            <h2 id={`about-${id}`} className="font-semibold">{title}</h2>
            <div className="space-y-2 text-ink-muted [&_strong]:text-ink">{children}</div>
        </section>
    );
}

/**
 * About OpenSVC and this webapp: the product, its publisher, the licenses and the
 * sources, then what the law of the European Union asks to be told: the personal
 * data handled (GDPR), what the browser keeps (ePrivacy), the accessibility, where to
 * report a vulnerability. Open to all, signed in or not.
 */
export function About() {
    const {t} = useTranslation();
    // The agent the nodes run, when signed in: each version once.
    const versions = useEventStore((s) => [...new Set(Object.values(s.nodeStatus ?? {}).map((n) => n?.agent).filter(Boolean))].sort().join(", "));
    const support = <Mail to={PUBLISHER.support}/>;
    const releaseCheck = useReleaseCheck();
    return (
        <div className="mx-auto max-w-3xl space-y-6 p-4">
            <header className="space-y-2">
                <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
                    OpenSVC
                    <ProductTag/>
                </h1>
                <p className="text-ink-muted">{t("about.tagline")}</p>
                {APP_VERSION && <p data-about="webapp"><span className="text-ink-muted">{t("about.webapp")}</span> <span className="font-mono">{APP_VERSION}</span></p>}
                {versions && <p data-about="agent"><span className="text-ink-muted">{t("about.agent")}</span> <span className="font-mono">{versions}</span></p>}
            </header>

            <Section id="publisher" title={t("about.publisher.title")}>
                <p>
                    <strong>{PUBLISHER.name}</strong> · <a className={LINK} href={PUBLISHER.site}>{PUBLISHER.site.replace("https://", "")}</a>
                </p>
                <p>{t("about.publisher.contact")} <Mail to={PUBLISHER.contact}/> · {t("about.publisher.support")} {support}</p>
            </Section>

            <Section id="licenses" title={t("about.licenses.title")}>
                {/* Apart on a touch screen: a link a finger, not the next one. */}
                <ul className="space-y-0.5 pointer-coarse:space-y-2.5">
                    {SOURCES.map((s) => (
                        <li key={s.name}>
                            <a className={`${LINK} font-mono`} href={s.url}>{s.name}</a>
                            {s.license && <span> · {t("about.licenses.under", {license: s.license})}</span>}
                        </li>
                    ))}
                </ul>
                <p>{t("about.licenses.bundled")}</p>
                <ul data-about="bundled" className="grid gap-x-4 sm:grid-cols-2">
                    {BUNDLED.map(([name, license]) => (
                        <li key={name}><span className="text-ink">{name}</span> · {license}</li>
                    ))}
                </ul>
            </Section>

            <Section id="privacy" title={t("about.privacy.title")}>
                <p>{t("about.privacy.none")}</p>
                <p>{t("about.privacy.controller")}</p>
                <p>{t("about.privacy.browser")}</p>
                <p>{t("about.privacy.github")}</p>
                {/* The one request leaving the cluster: made on the user's say-so alone. */}
                <Checkbox label={t("about.privacy.releaseCheck")} checked={releaseCheck} onChange={(e) => setReleaseCheck(e.target.checked)}/>
                <p>{t("about.privacy.oidc")}</p>
                <p><Trans i18nKey="about.privacy.rights" components={{mail: support}}/></p>
            </Section>

            <Section id="cookies" title={t("about.cookies.title")}>
                <p>{t("about.cookies.text")}</p>
            </Section>

            <Section id="accessibility" title={t("about.accessibility.title")}>
                <p><Trans i18nKey="about.accessibility.text" components={{mail: support}}/></p>
            </Section>

            <Section id="security" title={t("about.security.title")}>
                <p><Trans i18nKey="about.security.text" components={{mail: support}}/></p>
            </Section>
        </div>
    );
}

export default About;
