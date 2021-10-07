import { Value } from "thingpedia";

/**
 * Cached  that we can represent as `thingpedia.Value.Entity`
 * instances.
 *
 * They must include an `id`, a `name` and a `uri`.
 */
export default class CacheEntity {
    constructor(
        public type: string,
        public id: string,
        public name: string,
        public uri: string
    ) {}

    get entity(): Value.Entity {
        return new Value.Entity(this.uri, this.name);
    }

    toThing() {
        return {
            id: this.entity,
        };
    }
}
