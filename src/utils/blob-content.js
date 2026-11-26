/**
 * How a text is written, beside its characters: `bom`, a byte order mark first;
 * `eol`, its line ends, "lf", "crlf", "mixed" (both), or "none" (a single line).
 * What a text field does not keep, a textarea giving its lines ended by LF alone.
 */
export const textFormat = (text) => {
    const lf = (text.match(/\n/g) ?? []).length;
    const crlf = (text.match(/\r\n/g) ?? []).length;
    const eol = lf === 0 ? "none" : crlf === lf ? "crlf" : crlf === 0 ? "lf" : "mixed";
    return {bom: false, eol};
};

/** The plain format: no byte order mark, the lines ended as typed. */
export const PLAIN_FORMAT = {bom: false, eol: "none"};

/**
 * A text written back as it was read (textFormat): its lines ended by CRLF if they
 * were, its byte order mark first if it had one; lines mixed, or none, as they are.
 */
export const encodeText = (text, format = PLAIN_FORMAT) => {
    const body = format.eol === "crlf" ? text.replace(/\r?\n/g, "\r\n") : text;
    return format.bom ? `\uFEFF${body}` : body;
};

/**
 * The content of a key or a file, as its dialog shows it: text, when it is UTF-8 with
 * no control character but tab and line ends, an empty one too, edited as any text,
 * its byte order mark out of it and said with its line ends (`format`, textFormat);
 * else binary, shown as a hex dump of `hexLimit` bytes at most (all of them by default).
 */
export const parseBlobContent = async (blob, {hexLimit = Infinity} = {}) => {
    // A blob of no arrayBuffer (an older engine) read by a FileReader.
    const arrayBuffer = await (typeof blob.arrayBuffer === "function" ? blob.arrayBuffer() : new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(blob);
    }));
    const uint8Array = new Uint8Array(arrayBuffer);
    let isText = true;
    let textContent = "";
    try {
        // The byte order mark kept by the decoder, to be said and written back.
        textContent = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(uint8Array);
        for (let i = 0; i < textContent.length; i++) {
            const code = textContent.charCodeAt(i);
            if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
                isText = false;
                break;
            }
        }
    } catch (e) {
        isText = false;
    }

    if (isText) {
        const bom = textContent.startsWith("\uFEFF");
        const content = bom ? textContent.slice(1) : textContent;
        return {type: "text", content, format: {...textFormat(content), bom}};
    } else {
        const hexLines = [];
        for (let i = 0; i < Math.min(uint8Array.length, hexLimit); i += 16) {
            const chunk = uint8Array.slice(i, i + 16);
            const hex = Array.from(chunk)
                .map(b => b.toString(16).padStart(2, '0'))
                .join(' ');
            const ascii = Array.from(chunk)
                .map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.')
                .join('');
            hexLines.push(`${i.toString(16).padStart(8, '0')}  ${hex.padEnd(48, ' ')}  ${ascii}`);
        }
        return {type: "binary", content: hexLines.join('\n')};
    }
};
