import * as Path from "path";
import * as FS from "fs";

import * as Winston from "winston";
import Colors from "colors/safe";

// Constants
// ===========================================================================

export const DEFAULT_TAB_SIZE = 4;
export const DEFAULT_COLORIZE = Colors.enabled;

// Types
// ===========================================================================

export type Color = (str: string) => string;
export type ColorMap = Record<string, Color>;

// Functions
// ===========================================================================

export function composeColors(...colors: Color[]): Color {
    return colors.reduce((f1, f2) => (str: string) => f2(f1(str)));
}

export function extendDefaultMeta(
    options: Winston.LoggerOptions,
    extension: any
): Winston.LoggerOptions {
    return {
        ...options,
        defaultMeta: { ...options.defaultMeta, ...extension },
    };
}

export function maxLineLength(lines: string[]): number {
    return lines.reduce(
        (max: number, str: string) => Math.max(max, str.length),
        0
    );
}

export function colWidth(
    content: number | string | string[],
    tabSize: number = DEFAULT_TAB_SIZE
): number {
    let maxLength: number;
    if (typeof content === "number") {
        maxLength = content;
    } else if (typeof content === "string") {
        maxLength = content.length;
    } else if (Array.isArray(content)) {
        maxLength = maxLineLength(content);
    } else {
        throw new TypeError(
            `Expected number, string or string[], ` +
                `given ${typeof content}: ${content}`
        );
    }
    return (Math.floor(maxLength / tabSize) + 1) * tabSize;
}

export function findPackageJSONPath(startDir: string): string {
    let lastDir: null | string = null;
    let currentDir: string = startDir;
    do {
        const path = Path.resolve(currentDir, "package.json");
        try {
            if (FS.statSync(path).isFile()) {
                return path;
            }
        } catch (err) {}
        lastDir = currentDir;
        currentDir = Path.resolve(currentDir, "..");
    } while (currentDir !== lastDir);

    throw new Error(
        `Unable to find package.json in ${startDir} or it's ancestors`
    );
}

export function findPackageName(startDir: string): string {
    const packageJSONPath = findPackageJSONPath(startDir);
    let packageJSON: any;
    try {
        packageJSON = JSON.parse(FS.readFileSync(packageJSONPath, "utf8"));
    } catch (error) {
        throw new Error(`Unable to read/parse ${packageJSONPath}: ${error}`);
    }
    if (!packageJSON.hasOwnProperty("name")) {
        throw new Error(
            `package.json file has no "name" property: ${packageJSONPath}`
        );
    }
    const name = packageJSON.name;
    if (typeof name !== "string") {
        throw new TypeError(
            `package.json file has non-string "name" property: ${packageJSONPath}`
        );
    }
    return name;
}
