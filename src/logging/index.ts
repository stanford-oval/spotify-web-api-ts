import * as Path from "path";

import * as Winston from "Winston";

import prettySimple from "./format/pretty_simple";
import Factory from "./factory";
import { Logger } from "./logger";

const RUN_ROOT = Path.resolve(__dirname, "..");
const REPO_ROOT = Path.resolve(RUN_ROOT, "..");

interface HasLogger {
    log: Logger;
}

export { Logger, HasLogger };

export default new Factory({
    runRoot: RUN_ROOT,
    level: "debug",
    transports: [
        //
        // - Write all logs with level `error` and below to `error.log`
        // - Write all logs with level `info` and below to `combined.log`
        //
        new Winston.transports.File({
            filename: Path.resolve(REPO_ROOT, "tmp", "error.log"),
            format: Winston.format.json(),
            level: "error",
        }),
        new Winston.transports.File({
            filename: Path.resolve(REPO_ROOT, "tmp", "all.log"),
            format: Winston.format.json(),
        }),
        new Winston.transports.Console({
            format: prettySimple({ colorize: true }),
        }),
    ],
});
