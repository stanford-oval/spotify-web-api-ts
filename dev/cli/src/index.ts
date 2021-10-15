import * as Repl from "repl";

import { Command, Option } from "commander";
import * as Winston from "Winston";

import Client from "@stanford-oval/spotify-web-api/dist/client";
import Factory from "@stanford-oval/spotify-web-api/dist/logging/factory";
import prettySimple from "@stanford-oval/spotify-web-api/dist/logging/format/pretty_simple";
import { isPagingObject } from "@stanford-oval/spotify-web-api/dist/api/objects";

// Constants
// ===========================================================================

const CONSOLE_TRANSPORT = new Winston.transports.Console({
    format: prettySimple({ colorize: true }),
});

const LOG_FACTORY = new Factory({
    runRoot: __dirname,
    level: "debug",
    transports: [CONSOLE_TRANSPORT],
    handleExceptions: true,
});

const LOG = LOG_FACTORY.get(__filename);

const DUMP_HIDE = new Set([
    "available_markets",
    "tracks",
    "images",
    "copyrights",
]);

// Types
// ===========================================================================

type OptionValues = {
    token: string;
};

// Class Definitions
// ===========================================================================

class MockOAuth2 {
    constructor(public token: string) {}

    queryInterface(x: string) {
        if (x === "oauth2") {
            return {
                accessToken: this.token,
                refreshCredentials(): Promise<void> {
                    return Promise.reject(
                        new Error(`refreshCredentials not implemented`)
                    );
                },
            };
        } else {
            throw new Error(`Unsupported interface: ${x}`);
        }
    }
}

// Functions
// ===========================================================================

function hide(x: any): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(x)) {
        if (DUMP_HIDE.has(key)) {
            result[key] = "(hidden)";
        } else {
            result[key] = value;
        }
    }
    return result;
}

function dump(x: any, message: string[] = []): void {
    if (isPagingObject(x)) {
        dump(x.items, [...message, `PagingObject`]);
    } else if (Array.isArray(x)) {
        x.forEach((item, index) =>
            dump(item, [...message, `Item ${index + 1}`])
        );
    } else {
        LOG.info(message.join(" -- "), hide(x));
    }
}

function repl(opts: OptionValues) {
    const auth = new MockOAuth2(opts.token);
    const local = Repl.start("spotify-web-api> ");

    local.context.auth = auth;
    local.context.client = new Client(auth);
    local.context.log = LOG;
    local.context.dump = dump;
}

function createProgram() {
    const program = new Command();

    program
        .option("-d, --debug", "Enable debug logging")
        .addOption(
            new Option("-t, --token", "Spotify Web API Access Token")
                .env("SPOTIFY_TOKEN")
                .default("", "Empty access token")
        );

    program
        .command("repl")
        .description("Start a Node REPL session with client in context")
        .action((options) => repl(options));

    return program;
}

function main() {
    createProgram().parse(process.argv);
}

// Execution Hook
// ===========================================================================

if (require.main === module) {
    main();
}
