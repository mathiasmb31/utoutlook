import {dirname, resolve, sep} from "path";
import {existsSync, readFileSync, statSync} from "fs";

import {fileURLToPath} from 'url';
import {logger} from '../logger.mjs';

function getDirname(importMetaUrl) {
    const filename = fileURLToPath(importMetaUrl);
    return dirname(filename);
}

const __dirname = getDirname(import.meta.url);

const cache = {};
const publicDir = resolve(__dirname, "../../public");

export default (relpath) => {
    // Input validation
    if (typeof relpath !== 'string' || !relpath) {
        throw new TypeError('relpath must be a non-empty string');
    }

    if (cache[relpath]) {
        return cache[relpath];
    }

    relpath = relpath.trim();

    // Remove initial . or / to prevent out of bound request
    while (["/", "."].indexOf(relpath.substring(0, 1)) !== -1) {
        relpath = relpath.substring(1);
    }

    // Resolve the full path and validate it's within public directory
    const fullpath = resolve(publicDir, relpath);

    // Security: Ensure resolved path is within public directory
    if (!fullpath.startsWith(publicDir + sep) && fullpath !== publicDir) {
        throw new Error(
            `Security: ${relpath} attempts to access files outside public directory`
        );
    }

    if (!existsSync(fullpath) || !statSync(fullpath).isFile()) {
        throw new Error(
            `${relpath} is not a valid client file. It must exist in ${fullpath}`
        );
    }

    logger.debug(`Prepare %o to be injected.`, relpath);
    cache[relpath] = readFileSync(fullpath, 'utf-8');
    return cache[relpath];
};
