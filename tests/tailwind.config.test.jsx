import {describe, test, expect} from 'vitest';
import tailwindConfig from '../tailwind.config';

describe('Tailwind CSS configuration', () => {
    test('should export an object', () => {
        expect(tailwindConfig).toBeTypeOf('object');
    });

    test('should have the correct content paths', () => {
        expect(tailwindConfig.content).toEqual([
            './pages/**/*.{js,ts,jsx,tsx}',
            './src/**/*.{js,ts,jsx,tsx}',
        ]);
    });

    test('should have darkMode set to "class"', () => {
        expect(tailwindConfig.darkMode).toBe('class');
    });

    test('should extend theme with custom colors', () => {
        expect(tailwindConfig.theme.extend.colors).toBeDefined();
        expect(tailwindConfig.theme.extend.colors.gray).toEqual({
            700: '#5d5d5d',
            800: '#4d4d4d',
            900: '#3d3d3d',
        });
    });

    test('should extend backgroundColor with dark variants', () => {
        expect(tailwindConfig.theme.extend.backgroundColor).toEqual({
            'dark-primary': '#4d4d4d',
            'dark-secondary': '#5d5d5d',
            'dark-tertiary': '#6d6d6d',
        });
    });

    test('should extend textColor with dark variants', () => {
        expect(tailwindConfig.theme.extend.textColor).toEqual({
            'dark-primary': '#ffffff',
            'dark-secondary': '#eeeeee',
        });
    });

    test('should have an empty plugins array', () => {
        expect(tailwindConfig.plugins).toEqual([]);
    });
});
