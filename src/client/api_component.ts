import * as Path from "path";

import { Logger } from "@stanford-oval/logging";

import Api from "../api";
import Augment from "./augment";
import Component from "./component";
import Logging from "../logging";
import { RedisClient } from "../helpers";

export default abstract class ApiComponent extends Component {
    protected readonly augment: Augment;
    public readonly redis: RedisClient;
    public readonly userId: string;
    public readonly log: Logger.TLogger;

    constructor(props: {
        api: Api;
        redis: RedisClient;
        augment: Augment;
        userId: string;
    }) {
        super(props.api);
        this.redis = props.redis;
        this.augment = props.augment;
        this.userId = props.userId;
        this.log = Logging.get(
            Path.join(
                __dirname,
                "components",
                this.constructor.name.toLowerCase()
            )
        ).childFor(this.constructor);
        this.log.debug("Constructed!!!");
    }
}
