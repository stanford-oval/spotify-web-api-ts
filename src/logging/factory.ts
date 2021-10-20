import * as Winston from "winston";
import { findPackageName } from "./helpers";

import { Logger, createLogger, LoggerId } from "./logger";

export interface FactoryKwds extends Winston.LoggerOptions {
    runRoot: string;
    packageName?: string;
}

const LOGGER_OPTION_KEYS: Array<keyof Winston.LoggerOptions> = [
    "levels",
    "silent",
    "format",
    "level",
    "exitOnError",
    "defaultMeta",
    "transports",
    "handleExceptions",
    "exceptionHandlers",
];

export default class Factory {
    public readonly runRoot: string;
    public readonly packageName: string;
    public readonly options: Winston.LoggerOptions;

    constructor(kwds: FactoryKwds) {
        this.runRoot = kwds.runRoot;
        this.packageName = kwds.packageName || findPackageName(this.runRoot);
        this.options = {};
        for (const key of LOGGER_OPTION_KEYS) {
            if (kwds.hasOwnProperty(key)) {
                this.options[key] = kwds[key];
            }
        }
    }

    public mergeOptions(options: Winston.LoggerOptions) {
        return {
            ...this.options,
            ...options,
            defaultMeta: {
                ...this.options.defaultMeta,
                ...options.defaultMeta,
            },
        };
    }

    public get(filePath: string, options: Winston.LoggerOptions = {}): Logger {
        const id = LoggerId.from(this.packageName, filePath, this.runRoot);
        const key = String(id);
        if (Winston.loggers.has(key)) {
            return Winston.loggers.get(key) as Logger;
        }
        const logger = createLogger(id, this.mergeOptions(options));

        const globalLoggerMap = Winston.loggers.loggers;
        logger.on("close", () => globalLoggerMap.delete(key));
        globalLoggerMap.set(key, logger);

        return logger;
    }
}
