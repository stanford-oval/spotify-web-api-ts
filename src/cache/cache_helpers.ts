import { strict as assert } from "assert";

import ApiComponent from "../client/api_component";

const REGISTRY: Record<string, any> = {};

export const DEFAULT_TTL_SECONDS = 60 * 60 * 24; // 1 day

export function cacheRegister(cls: any) {
    REGISTRY[cls.name] = cls;
}

export function orderedPairsFor(
    record: Record<string, any>,
    omit: string[] = []
): Array<[string, any]> {
    const pairs: Array<[string, any]> = [];
    for (const key of Object.keys(record).sort()) {
        if (!omit.includes(key)) {
            const value = record[key];
            if (value !== undefined) pairs.push([key, value]);
        }
    }
    return pairs;
}

export function cacheReviver(key: string, value: any) {
    if (typeof value !== "object") {
        return value;
    }
    if (!value.hasOwnProperty("__class__")) {
        return value;
    }
    const className = value.__class__;
    if (typeof className !== "string") {
        return value;
    }
    const cls = REGISTRY[className];
    if (!cls) {
        return value;
    }

    return cls(value);
}

export function cache<TArgs extends any[]>(
    makeKey: (...args: TArgs) => string,
    setOptions: any = { EX: DEFAULT_TTL_SECONDS }
) {
    return function (
        target: Object,
        propertyKey: string,
        descriptor: PropertyDescriptor
    ) {
        const fn = descriptor.value;

        assert(
            typeof fn === "function",
            `cache() can only decorate functions, given ${typeof fn}: ${fn}`
        );

        descriptor.value = async function (this: ApiComponent, ...args: TArgs) {
            const log = this.log.childFor(fn);
            log.debug("START client cache request...", { args });
            const timer = log.startTimer();
            const argsKey = makeKey.apply(this, args);
            const key = `com.spotify:${this.userId}:${argsKey}`;
            const cached = await this.redis.GET(key);
            let data: any;
            let isFromCache: boolean = false;
            if (cached === null) {
                log.info("CACHE MISS", { key });
                data = await fn.apply(this, args);
                this.redis.SET(key, JSON.stringify(data), setOptions);
                log.info("CACHE SET", { key, options: setOptions });
            } else {
                isFromCache = true;
                log.info("CACHE HIT", { key });
                data = JSON.parse(cached, cacheReviver);
            }
            timer.done({
                level: "info",
                message: "DONE client cache request.",
                cached: isFromCache,
            });
            return data;
        };
    };
}
