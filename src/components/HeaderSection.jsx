import React from 'react';
import {useTranslation} from 'react-i18next';
import {MenuButton} from '../ui/components/MenuButton';
import {StatusBadge} from '../ui/components/StatusBadge';
import {statusBadge} from '../ui/components/status';
import {FrozenMark} from '../ui/components/FrozenMark';
import {ObjectIcon, om3ObjectKind} from '../ui/components/ObjectIcon';
import {AlertTriangleIcon} from '../ui/icons';
import {OBJECT_ACTIONS, actionLabel} from '../constants/actions';
import {isActionAllowedForSelection} from '../utils/objectUtils';

/** Icon of an action in a menu: the action icons are sized to the menu line. */
const ICON = "flex h-4 w-4 items-center justify-center text-ink-muted [&>svg]:h-4! [&>svg]:w-4!";
const DANGER_ICON = "flex h-4 w-4 items-center justify-center text-state-down [&>svg]:h-4! [&>svg]:w-4!";

/**
 * Record header of the object page: the kind icon and the object name, then its
 * global state, frozen and provisioning marks, the global expectation in progress,
 * and the object actions menu at the right edge.
 */
const HeaderSection = ({
                           decodedObjectName,
                           kind,
                           globalStatus,
                           actionInProgress,
                           handleObjectActionClick,
                           getObjectStatus,
                       }) => {
    const {t} = useTranslation();
    if (!globalStatus) return null;

    const isNotProvisioned = globalStatus?.provisioned === "false" || globalStatus?.provisioned === false;
    const {avail, frozen, globalExpect} = getObjectStatus();
    const badge = statusBadge(avail);
    // Some actions only apply to some kinds (enable and disable to services).
    const allowedActions = OBJECT_ACTIONS.filter(
        (action) => !action.kinds || action.kinds.includes(kind)
    );

    return (
        <div className="flex min-w-0 flex-wrap items-center gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-2">
                <ObjectIcon kind={om3ObjectKind(kind)} className="h-5 w-5"/>
                <h1 className="truncate text-title font-semibold">{decodedObjectName}</h1>
            </div>

            <div className="flex items-center gap-3">
                {globalExpect && (
                    <span title={globalExpect} className="text-data whitespace-nowrap text-ink-muted">
                        {globalExpect}
                    </span>
                )}
                <span data-state={badge.state} title={t("objects.header.statusTitle", {status: avail || t("objects.header.unknown")})} className="inline-flex">
                    <StatusBadge state={badge.state} label={badge.label ?? (avail || undefined)} className="w-auto"/>
                </span>
                <FrozenMark frozen={frozen === 'frozen'}/>
                {isNotProvisioned && (
                    <span
                        role="img"
                        title={t("objects.header.notProvisionedTitle")}
                        aria-label={t("objects.header.notProvisionedLabel")}
                        className="text-state-down"
                    >
                        <AlertTriangleIcon className="h-4 w-4"/>
                    </span>
                )}
                <MenuButton
                    label={t("objects.header.actionsMenu")}
                    align="end"
                    disabled={actionInProgress}
                    items={allowedActions.map(({name, icon, color}) => {
                        const isAllowed = isActionAllowedForSelection(name, [decodedObjectName]);
                        return {
                            key: name,
                            label: actionLabel(name),
                            icon: (
                                <span aria-hidden="true" className={color === "red" && isAllowed ? DANGER_ICON : ICON}>
                                    {icon}
                                </span>
                            ),
                            disabled: !isAllowed || actionInProgress,
                            onSelect: () => handleObjectActionClick(name),
                        };
                    })}
                />
            </div>
        </div>
    );
};

export default HeaderSection;
