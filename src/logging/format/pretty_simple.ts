import { inspect } from "util";
import { MESSAGE } from "triple-beam";
import { TransformableInfo } from "logform";

import { LoggerId } from "../logger";
import { colWidth, DEFAULT_COLORIZE, ColorMap } from "../helpers";
import Theme, { DEFAULT_THEME } from "./theme";

// Constants
// ===========================================================================

export const LEVELS = {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    verbose: 4,
    debug: 5,
    silly: 6,
};

const LEVEL_COL_WIDTH = colWidth(Object.keys(LEVELS));
const LEVEL_COL_SPACER = " ".repeat(LEVEL_COL_WIDTH);

const TYPE_COL_WIDTH = colWidth([
    "string",
    "number",
    "bigint",
    "boolean",
    "symbol",
    "undefined",
    "object",
    "function",
]);
const TYPE_COL_SPACER = " ".repeat(TYPE_COL_WIDTH);

const BASE_OMIT = new Set(["level", "message", "durationMs", "logger"]);

// Types
// ===========================================================================

export type TPrettySimpleOptions = {
    colorize?: boolean;
    depth?: null | number;
    omit?: Set<string>;
    theme?: Theme | ColorMap;
};

// Class
// ===========================================================================

export class PrettySimple {
    public colorize: boolean;
    public depth: undefined | null | number;
    public omit: Set<string>;
    public theme: Theme;

    constructor({
        colorize = DEFAULT_COLORIZE,
        depth = null,
        omit,
        theme,
    }: TPrettySimpleOptions = {}) {
        this.colorize = colorize;
        this.depth = depth;

        this.omit = new Set(BASE_OMIT);
        if (omit !== undefined) {
            for (let member of omit) {
                this.omit.add(member);
            }
        }

        if (theme instanceof Theme) {
            this.theme = theme;
        } else {
            this.theme = DEFAULT_THEME.extend(theme, {
                enabled: this.colorize,
            });
        }
    }

    /**
     * Simply satisfies the Winston Format API (though this property is
     * optional, seems nice to include it since we do take options).
     */
    get options(): TPrettySimpleOptions {
        return {
            colorize: this.colorize,
            depth: this.depth,
            omit: this.omit,
        };
    }

    style(content: string, style: string): string {
        return this.theme.apply(content, style);
    }

    formatLevel(info: TransformableInfo): string {
        return this.style(
            info.level.toUpperCase().padEnd(LEVEL_COL_WIDTH),
            `level.${info.level}`
        );
    }

    formatLoggerId(info: TransformableInfo): string {
        if (!(info.logger instanceof LoggerId)) {
            return "";
        }
        if (!this.colorize) {
            // If we're not using colors then there's no reason to deal with
            // the individual parts
            return String(info.logger);
        }
        let id =
            this.style(info.logger.packageName, "id.packageName") +
            this.style("/", "id.slash") +
            this.style(info.logger.moduleNamepath, "id.moduleNamepath");
        if (info.logger.propertyNamepath) {
            id +=
                this.style(".", "id.dot") +
                this.style(info.logger.propertyNamepath, "id.propertyNamepath");
        }
        return id;
    }

    getMeta(info: TransformableInfo): [Record<string, any>, number] {
        const meta: Record<string, any> = {};
        let size: number = 0;

        for (const name of Object.keys(info)) {
            if (!this.omit.has(name)) {
                size += 1;
                meta[name] = info[name];
            }
        }

        return [meta, size];
    }

    dump(obj: any): string {
        return inspect(obj, false, this.depth, this.colorize);
    }

    formatMeta(info: TransformableInfo): string {
        const [meta, size] = this.getMeta(info);
        if (size === 0) {
            return "";
        }
        const lines: string[] = [];
        const names = Object.keys(meta).sort();
        const nameColWidth = colWidth(names);
        const nameColSpacer = " ".repeat(nameColWidth);
        for (const name of names) {
            const value = meta[name];
            const type = typeof value;
            const valueLines = (type === "string" ? value : this.dump(value))
                .trim()
                .split("\n");

            // First line is special; it has the key and type columns
            lines.push(
                LEVEL_COL_SPACER +
                    this.style(name.padEnd(nameColWidth), "meta.name") +
                    this.style(type.padEnd(TYPE_COL_WIDTH), "meta.type") +
                    valueLines.shift()
            );

            // Rest of lines (if any) are just the dump
            for (const valueLine of valueLines) {
                lines.push(
                    LEVEL_COL_SPACER +
                        nameColSpacer +
                        TYPE_COL_SPACER +
                        valueLine
                );
            }
        }
        return lines.join("\n") + "\n";
    }

    formatDuration(info: TransformableInfo): string {
        const durationMs = info.durationMs;
        if (typeof durationMs !== "number") {
            return "";
        }
        const [amount, units] =
            durationMs > 1000 ? [durationMs / 1000, "sec"] : [durationMs, "ms"];
        return (
            LEVEL_COL_SPACER +
            "⏱".padEnd(4) +
            this.style(String(amount).padStart(6), "duration.amount") +
            " " +
            this.style(units, "duration.units") +
            "\n"
        );
    }

    formatMessage(info: TransformableInfo): string {
        if (
            info.message === undefined ||
            info.message === null ||
            info.message === ""
        ) {
            return "";
        }
        if (!info.message.includes("\n")) {
            return LEVEL_COL_SPACER + info.message + "\n";
        }
        return (
            info.message
                .trim()
                .split("\n")
                .map((line) => LEVEL_COL_SPACER + line)
                .join("\n") + "\n"
        );
    }

    formatHeader(info: TransformableInfo): string {
        return this.formatLevel(info) + this.formatLoggerId(info) + "\n";
    }

    transform(info: TransformableInfo): TransformableInfo {
        info[MESSAGE as any] =
            this.formatHeader(info) +
            this.formatMessage(info) +
            this.formatDuration(info) +
            this.formatMeta(info);
        return info;
    }
}

export default function prettySimple(opts: TPrettySimpleOptions = {}) {
    return new PrettySimple(opts);
}
