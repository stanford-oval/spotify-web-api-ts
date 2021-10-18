import * as Repl from "repl";

import { Command, Option } from "commander";
import * as Winston from "Winston";
import { Value } from "thingpedia";

import Client from "@stanford-oval/spotify-web-api/dist/client";
import Factory from "@stanford-oval/spotify-web-api/dist/logging/factory";
import prettySimple from "@stanford-oval/spotify-web-api/dist/logging/format/pretty_simple";
import { isPagingObject } from "@stanford-oval/spotify-web-api/dist/api/objects";
import { ExecWrapper } from "@stanford-oval/spotify-web-api/dist/things";

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

class MockEnv {
    public appId: string;
    public hook: null | (() => void | Promise<void>);

    constructor(appId: string) {
        this.appId = appId;
        this.hook = null;
    }

    get app() {
        return { uniqueId: this.appId };
    }

    addExitProcedureHook(hook: () => void | Promise<void>): void {
        this.hook = hook;
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
    const client = new Client(auth);
    const env = new MockEnv("blah");

    local.context.auth = auth;
    local.context.client = client;
    local.context.env = env;
    local.context.log = LOG;
    local.context.dump = dump;
    local.context.MockEnv = MockEnv;
    local.context.Entity = Value.Entity;
    local.context.enqueue = async () => {
        await client.do_play(
            {
                playable: new Value.Entity(
                    `spotify:album:64ub4SfdC8wvPjdUXw8QY9`,
                    "Return of the Boom-Bap"
                ),
            },
            env as any as ExecWrapper
        );

        await client.do_play(
            {
                playable: new Value.Entity(
                    `spotify:playlist:6VcefzRVz4hQityRgYVeMz`,
                    "kel"
                ),
            },
            env as any as ExecWrapper
        );

        await env.hook!();
    };
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
