import { Value } from "thingpedia";
import { DeviceObject } from "./api/objects";
import { assertUnreachable, isSingularURI, uriType } from "./helpers";
import Logging from "./logging";
import { Logger } from "./logging/logger";

type URIResolver = (uri: string) => Promise<string[]>;

type NextValue = {
    done: false;
    value: string;
};

type NextDone = {
    done: true;
};

const LOG = Logging.get(__filename);

export default class QueueBuilder {
    private static readonly log = LOG.childFor(QueueBuilder);

    public readonly appId: string;
    public readonly device;
    public srcURIs: string[];

    private _destURIs: string[];
    private _resolver: URIResolver;
    private _canceled: boolean;

    constructor(appId: string, device: DeviceObject, resolver: URIResolver) {
        this.appId = appId;
        this.device = device;
        this.srcURIs = [];

        this._destURIs = [];
        this._resolver = resolver;
        this._canceled = false;
    }

    private get log(): Logger {
        return QueueBuilder.log;
    }

    get deviceEntity(): Value.Entity {
        return new Value.Entity(this.device.id, this.device.name);
    }

    get isEmpty(): boolean {
        return this.srcURIs.length === 0;
    }

    async popInitialURIs(): Promise<string[]> {
        const log = this.log.childFor(this.popInitialURIs, {
            appId: this.appId,
        });

        if (this.isEmpty) {
            log.error("Attempting to pop initial URIs from empty QueueBuilder");
            return [];
        }

        const readyURIs: string[] = [];
        while (this.srcURIs.length > 0 && isSingularURI(this.srcURIs[0])) {
            readyURIs.push(this.srcURIs[0]);
            this.srcURIs.shift();
        }

        if (readyURIs.length > 0) {
            log.debug(
                `Found ${readyURIs.length} initial ready URIs, returning.`,
                {
                    readyURIs,
                    remainingSrcURIs: this.srcURIs.length,
                }
            );
            return readyURIs;
        }

        const srcURI = this.srcURIs.shift();

        if (srcURI === undefined) {
            assertUnreachable();
        }

        log.debug("No initial ready URIs found, resolving first src URI...", {
            srcURI,
        });

        const destURIs = await this._resolver(srcURI);

        log.debug("Resolved first URI, returning.", { srcURI, destURIs });

        return destURIs;
    }

    push(entity: Value.Entity): void {
        this.srcURIs.push(entity.value);
    }

    cancel() {
        this._canceled = true;
    }

    async next(): Promise<NextValue | NextDone> {
        const log = this.log.childFor(this.next, { appId: this.appId });
        log.debug("Getting next destination URI...", {
            srcURIs: this.srcURIs,
            destURIs: this._destURIs,
        });

        if (this._canceled) {
            log.debug("Canceled, done.");
            return { done: true };
        }

        const destURI = this._destURIs.shift();
        if (destURI !== undefined) {
            log.debug("Returning next destination URI", { uri: destURI });
            return { done: false, value: destURI };
        }

        const srcURI = this.srcURIs.shift();
        if (srcURI === undefined) {
            log.debug("No more source URIs, done.");
            return { done: true };
        }

        const srcURIType = uriType(srcURI);
        if (srcURIType === "track" || srcURIType === "episode") {
            log.debug("Next source URI is a track or episode, returning", {
                uri: srcURI,
            });
            return { done: false, value: srcURI };
        }

        log.debug("Need to resolve next source URI", {
            uri: srcURI,
        });
        this._destURIs = await this._resolver(srcURI);
        log.debug("Resolved, looping again...", {
            src: srcURI,
            dest: this._destURIs,
        });
        return await this.next();
    }

    [Symbol.asyncIterator]() {
        return this;
    }
}

// export default class QueueBuilder {
//     private _items: QueueBuilderItem[];
//     private _state: QueryBuilderState = QueryBuilderState.Building;

//     constructor() {
//         this._items = [];
//     }

//     get state(): QueryBuilderState {
//         return this._state;
//     }

//     get size(): number {
//         return this._items.length;
//     }

//     get isEmpty(): boolean {
//         return this.size === 0;
//     }

//     private finish() {
//         this._state = QueryBuilderState.Done;
//         this._items = [];
//     }

//     private async enqueueOnly(): Promise<void> {
//         const item = this._items[0];
//         this.finish();
//         switch (item.type) {
//             case "track":
//             case "episode":
//                 await this.set({ uris: [item.entity.value] });
//                 break;
//             default:
//                 await this.set({ context_uri: item.entity.value });
//                 break;
//         }
//     }

//     private async addRest(): Promise<void> {
//         const item = this._items.shift();
//         if (item === undefined) {
//             this.finish();
//             return;
//         }
//         const uris = await item.resolveURIs();
//         for (const uri of uris) {
//             await this._addURI(uri);
//         }
//         this.addRest();
//     }

//     async enqueue(): Promise<void> {
//         if (this._state !== QueryBuilderState.Building) {
//             throw new Error(`Can only enqueue when Building`);
//         }
//         this._state = QueryBuilderState.Enqueuing;

//         if (this._items.length === 1) {
//             await this.enqueueOnly();
//             return;
//         }

//         const queueNowURIs: string[] = [];
//         while (!this.isEmpty && this._items[0].isReady) {
//             const item = this._items.shift();
//             if (item === undefined) {
//                 assertUnreachable();
//             }
//             queueNowURIs.push(item.entity.value);
//         }

//         if (queueNowURIs.length > 0) {
//             // Have item(s) at the start of the list that are ready (tracks and
//             // episodes that don't need to go get their URIs), so we start with
//             // those

//             if (this.isEmpty) {
//                 this.finish();
//             }

//             await this.set({ uris: queueNowURIs });
//             return;
//         }

//         const urisPromise = this._items[0].resolveURIs();
//     }
// }
