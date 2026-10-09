import i18n from '../../i18n';
import {actionLabel, NODE_ACTIONS, OBJECT_ACTIONS, INSTANCE_ACTIONS, RESOURCE_ACTIONS} from '../actions';

describe('actionLabel', () => {
    afterEach(async () => {
        await i18n.changeLanguage('en');
    });

    test('is the capitalized name in English', () => {
        expect(actionLabel('restart daemon')).toBe('Restart daemon');
        expect(actionLabel('start')).toBe('Start');
        expect(actionLabel('scsi scan')).toBe('Scsi scan');
    });

    test('has an English label for every action', () => {
        const all = [...OBJECT_ACTIONS, ...INSTANCE_ACTIONS, ...RESOURCE_ACTIONS, ...NODE_ACTIONS];
        for (const {name} of all) {
            const key = name.replace(/\s+(\w)/g, (_, c) => c.toUpperCase());
            expect(i18n.exists(`actions.labels.${key}`)).toBe(true);
            expect(actionLabel(name)).toBe(name.charAt(0).toUpperCase() + name.slice(1));
        }
    });

    test('is translated in French', async () => {
        await i18n.changeLanguage('fr');
        expect(actionLabel('restart daemon')).toBe('Redémarrer le démon');
        expect(actionLabel('freeze')).toBe('Geler');
    });

    test('falls back to the capitalized name for an unknown action', async () => {
        expect(actionLabel('reboot')).toBe('Reboot');
        await i18n.changeLanguage('fr');
        expect(actionLabel('reboot')).toBe('Reboot');
        expect(actionLabel('')).toBe('');
        expect(actionLabel(undefined)).toBe('');
    });
});
