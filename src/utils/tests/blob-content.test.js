import {describe, expect, test} from 'vitest';
import {encodeText, parseBlobContent, textFormat} from '../blob-content';

const blob = (bytes) => ({arrayBuffer: async () => new Uint8Array(bytes).buffer});
const text = (s) => blob([...new TextEncoder().encode(s)]);

describe('parseBlobContent', () => {
    test('UTF-8 with tabs and line ends: text, as it is', async () => {
        expect(await parseBlobContent(text('a\tb\r\nc é\n'))).toEqual({type: 'text', content: 'a\tb\r\nc é\n', format: {bom: false, eol: 'mixed'}});
    });

    test('empty: text, empty, to be edited as any', async () => {
        expect(await parseBlobContent(blob([]))).toEqual({type: 'text', content: '', format: {bom: false, eol: 'none'}});
    });

    test('a control character, or bytes not UTF-8: binary, in hex, as far as asked', async () => {
        expect(await parseBlobContent(blob([0x61, 0x00]))).toEqual({type: 'binary', content: '00000000  61 00' + ' '.repeat(43) + '  a.'});
        expect((await parseBlobContent(blob([0xff, 0xfe]))).type).toBe('binary');
        expect((await parseBlobContent(blob(new Array(40).fill(0)), {hexLimit: 16})).content.split('\n')).toHaveLength(1);
    });
});

describe('how a text is written', () => {
    test('its byte order mark out of the text and said; its line ends said', async () => {
        expect(await parseBlobContent(blob([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('a\r\nb\r\n')])))
            .toEqual({type: 'text', content: 'a\r\nb\r\n', format: {bom: true, eol: 'crlf'}});
        expect(textFormat('a\nb')).toEqual({bom: false, eol: 'lf'});
        expect(textFormat('a\r\nb\nc')).toEqual({bom: false, eol: 'mixed'});
        expect(textFormat('one line')).toEqual({bom: false, eol: 'none'});
    });

    test('written back as read: edited, its lines ended by CRLF again, its byte order mark first; else as typed', () => {
        // A textarea gives its lines ended by LF.
        expect(encodeText('a\nb\nc', {bom: true, eol: 'crlf'})).toBe('\uFEFFa\r\nb\r\nc');
        expect(encodeText('a\r\nb', {bom: false, eol: 'crlf'})).toBe('a\r\nb');
        expect(encodeText('a\nb', {bom: false, eol: 'lf'})).toBe('a\nb');
        expect(encodeText('a\r\nb\nc', {bom: false, eol: 'mixed'})).toBe('a\r\nb\nc');
        expect(encodeText('a')).toBe('a');
    });
});
