import * as Path from "path";

import * as Winston from "winston";
import { TransformableInfo } from "logform";

export interface Logger extends Winston.Logger {
    readonly id: LoggerId;

    childFor(obj: any, defaultMeta?: any): Logger;
}

export interface Named {
    name: string;
}

export function moduleNamepathFor(filePath: string, runRoot: string): string {
    const relPath = Path.relative(runRoot, filePath);
    return Path.join(
        Path.dirname(relPath),
        Path.basename(relPath, Path.extname(relPath))
    );
}

export class LoggerId {
    public static from(
        packageName: string,
        filePath: string,
        runRoot: string,
        propertyNamepath?: string
    ): LoggerId {
        const moduleNamepath = moduleNamepathFor(filePath, runRoot);
        return new LoggerId(packageName, moduleNamepath, propertyNamepath);
    }

    constructor(
        public readonly packageName: string,
        public readonly moduleNamepath: string,
        public readonly propertyNamepath?: string
    ) {}

    child(propertyNamepath: string): LoggerId {
        const newPropertyNamepath = this.propertyNamepath
            ? `${this.propertyNamepath}.${propertyNamepath}`
            : propertyNamepath;
        return new LoggerId(
            this.packageName,
            this.moduleNamepath,
            newPropertyNamepath
        );
    }

    toString(): string {
        let str: string = Path.join(this.packageName, this.moduleNamepath);
        if (this.propertyNamepath !== undefined) {
            str = `${str}.${this.propertyNamepath}`;
        }
        return str;
    }

    toJSON(): Record<string, string> {
        const obj: Record<string, string> = {
            pkg: this.packageName,
            mod: this.moduleNamepath,
        };
        if (this.propertyNamepath !== undefined) {
            obj["prop"] = this.propertyNamepath;
        }
        return obj;
    }
}

function extendLogger(
    id: LoggerId,
    proto: Winston.Logger,
    defaultMeta?: any
): Logger {
    return Object.create(proto, {
        id: {
            value: id,
            enumerable: true,
            writable: false,
        },

        write: {
            value(info: TransformableInfo) {
                const infoClone = Object.assign(
                    { logger: id },
                    defaultMeta,
                    info
                );

                // Object.assign doesn't copy inherited Error
                // properties so we have to do that explicitly
                if (info instanceof Error) {
                    infoClone.stack = info.stack;
                    infoClone.message = info.message;
                }

                proto.write(infoClone);
            },
        },

        childFor: {
            value(obj: Named, defaultMeta?: any) {
                return extendLogger(id.child(obj.name), this, defaultMeta);
            },
        },
    });
}

export function createLogger(
    id: LoggerId,
    options: Winston.LoggerOptions
): Logger {
    return extendLogger(id, Winston.createLogger(options));
}
