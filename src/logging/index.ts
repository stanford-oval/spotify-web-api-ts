import * as Path from "path";

import * as Winston from "Winston";

import prettySimple from "./format/pretty_simple";
import Factory from "./factory";

const RUN_ROOT = Path.resolve(__dirname, "..");
const REPO_ROOT = Path.resolve(RUN_ROOT, "..");

export default new Factory({
    runRoot: RUN_ROOT,
    level: "debug",
    format: Winston.format.combine(Winston.format.json()),
    transports: [
        //
        // - Write all logs with level `error` and below to `error.log`
        // - Write all logs with level `info` and below to `combined.log`
        //
        new Winston.transports.File({
            filename: Path.resolve(REPO_ROOT, "tmp", "error.log"),
            level: "error",
        }),
        new Winston.transports.File({
            filename: Path.resolve(REPO_ROOT, "tmp", "all.log"),
        }),
        new Winston.transports.Console({
            format: prettySimple({ colorize: true }),
        }),
    ],
});
