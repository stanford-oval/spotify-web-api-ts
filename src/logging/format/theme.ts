import {
    blue,
    rainbow,
    green,
    cyan,
    magenta,
    yellow,
    bold,
    italic,
    dim,
    red,
    gray,
    white,
} from "colors/safe";
import { composeColors, ColorMap, DEFAULT_COLORIZE } from "../helpers";

export interface ThemeOptions {
    enabled?: boolean;
}

export default class Theme {
    public map: ColorMap;
    public enabled: boolean;

    constructor(map: ColorMap, options: ThemeOptions = {}) {
        this.map = map;
        this.enabled =
            options.enabled === undefined ? DEFAULT_COLORIZE : options.enabled;
    }

    get options(): ThemeOptions {
        return { enabled: this.enabled };
    }

    apply(content: string, style: string): string {
        if (!this.enabled || !this.map.hasOwnProperty(style)) {
            return content;
        }
        return this.map[style](content);
    }

    extend(overrides: undefined | ColorMap, options: ThemeOptions) {
        return new Theme(
            { ...this.map, ...overrides },
            { ...this.options, ...options }
        );
    }
}

export const DEFAULT_THEME = new Theme({
    // Logger ID
    // =======================================================================

    "id.packageName": composeColors(blue, dim),
    "id.moduleNamepath": composeColors(cyan, dim),
    "id.propertyNamepath": composeColors(green, dim),
    "id.slash": gray,
    "id.dot": gray,

    // Levels
    // =======================================================================

    "level.silly": rainbow,
    "level.debug": green,
    "level.verbose": cyan,
    "level.http": magenta,
    "level.info": blue,
    "level.warn": composeColors(yellow, bold),
    "level.error": composeColors(red, bold),

    // Metadata
    // =======================================================================

    "meta.name": composeColors(blue, italic),
    "meta.type": composeColors(cyan, italic),

    // Profiling
    // =======================================================================

    "duration.amount": composeColors(white, bold),
    // "duration.units": italic,
});
