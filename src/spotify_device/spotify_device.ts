import { BaseDevice, BaseEngine, Helpers, Value } from "thingpedia";
import * as Winston from "winston";
import {
    CompiledQueryHints,
    ExecEnvironment,
} from "thingtalk/dist/runtime/exec_environment";

import SpotifyDaemon from "../spotify_daemon";
import Client from "../client";
import {
    ExecWrapper,
    isEntity,
    ThingAlbum,
    ThingArtist,
    ThingEpisode,
    ThingError,
    ThingPlayable,
    ThingPlaylist,
    ThingShow,
    ThingTrack,
} from "../things";
import { SearchQuery } from "../api/search_query";
import Logging from "../logging";
import {
    cast,
    isJSONParseEmptyInputError,
    isString,
    isTestMode,
    uriId,
    uriType,
} from "../helpers";
import CacheTrack from "../cache/cache_track";
import CacheEpisode from "../cache/cache_episode";
import { CurrentlyPlayingContextObject, DeviceObject } from "../api/objects";
import { buildQuery, invokeSearch } from "./helpers";
import QueueBuilderManager from "./queue_builder_manager";
import { isOnOff } from "./types";
import { isRepeatState } from "../api/requests";

// Constants
// ===========================================================================

const LOG = Logging.get(__filename);

// Types
// ===========================================================================

export interface SpotifyDeviceState extends BaseDevice.DeviceState {
    id: string;
}

export interface Tokenizer {
    _parseWordNumber(word: string): number;
}

export interface LangPack {
    getTokenizer(): Tokenizer;
}

export interface AudioDevice {
    /**
     * Stop all playback.
     */
    stop(conversationId: string): void;

    /**
     * Pause all playback.
     */
    pause?(conversationId: string): void;

    /**
     * Resume playback.
     */
    resume?(conversationId: string): void;
}

export interface AudioController {
    requestAudio(
        device: BaseDevice,
        iface: AudioDevice | (() => Promise<void>),
        conversationId?: string
    ): Promise<void>;
}

export interface SpotifyDeviceEngine extends BaseEngine {
    langPack: LangPack;
    audio?: AudioController;
}

type Params = Record<string, any>;

function genieGet(
    target: Object,
    propertyKey: string,
    descriptor: PropertyDescriptor
) {
    const fn = descriptor.value;

    if (typeof fn !== "function") {
        throw new TypeError(`Only functions`);
    }

    descriptor.value = async function (
        this: SpotifyDevice,
        params: Params,
        hints: CompiledQueryHints,
        env: ExecWrapper
    ) {
        const log = this.log.childFor(fn, {
            "request.type": "get",
            "state.id": this.state.id,
            "env.app.uniqueId": env.app.uniqueId,
            params,
            hints,
        });
        log.debug("Start Genie GET request");
        const profiler = log.startTimer();
        let response: ReturnType<typeof fn>;
        try {
            response = await fn.call(this, params, hints, env);
        } catch (error: any) {
            this._handleError(profiler, error);
        }
        profiler.done({ level: "info" });
        return response;
    };
}

function genieDo(
    target: Object,
    propertyKey: string,
    descriptor: PropertyDescriptor
) {
    const fn = descriptor.value;

    if (typeof fn !== "function") {
        throw new TypeError(`Only functions`);
    }

    descriptor.value = async function (
        this: SpotifyDevice,
        params: Params,
        env: ExecWrapper
    ) {
        const log = this.log.childFor(fn, {
            "request.type": "do",
            "state.id": this.state.id,
            "env.app.uniqueId": env.app.uniqueId,
            params,
        });
        if (isTestMode()) {
            log.debug("In test mode, aborting.");
            return;
        }
        log.debug("Start Genie DO request");
        const profiler = log.startTimer();
        let response: ReturnType<typeof fn>;
        try {
            response = await fn.call(this, params, env);
        } catch (error: any) {
            this._handleError(profiler, error);
        }
        profiler.done({ level: "info" });
        return response;
    };
}

export default class SpotifyDevice extends BaseDevice {
    private static readonly log = LOG.childFor(Client);

    // TODO Unsure what this is here for...
    public uniqueId: string;
    public accessToken: null | string = null;
    public spotifyd: null | SpotifyDaemon = null;

    public state: SpotifyDeviceState;

    protected _tokenizer: Tokenizer;
    protected _launchedSpotify: boolean = false;
    protected _client: Client;
    protected _queueBuilders: QueueBuilderManager;

    constructor(engine: SpotifyDeviceEngine, state: SpotifyDeviceState) {
        super(engine, state);
        this.state = state;
        this.uniqueId = `com.spotify-${this.state.id}`;
        this._tokenizer = engine.langPack.getTokenizer();

        if (this.platform.type === "server") {
            this.spotifyd = new SpotifyDaemon({
                cacheDir: this.platform.getCacheDir(),
                username: this.state.id,
                device_name: this.state.id,
                token: this.accessToken,
                // TODO Upgrade?
                version: "v0.3.2",
            });
        }

        this._client = new Client({
            useOAuth2: this as Helpers.Http.HTTPRequestOptions["useOAuth2"],
        });

        this._queueBuilders = new QueueBuilderManager({
            resolveURI: this._client.resolveURI.bind(this._client),
            getActiveDevice: this._getActiveDevice.bind(this),
            play: this._negotiatePlay.bind(this),
            addToQueue: this._client.api.player.addToQueue.bind(
                this._client.api.player
            ),
        });
    }

    get engine(): SpotifyDeviceEngine {
        return super.engine as SpotifyDeviceEngine;
    }

    get log() {
        return SpotifyDevice.log;
    }

    updateOAuth2Token(
        accessToken: string,
        refreshToken: string,
        extraData: {
            [key: string]: unknown;
        }
    ): Promise<void> {
        if (this.spotifyd && this.accessToken !== accessToken) {
            this.spotifyd.token = accessToken;
            this.spotifyd.reload();
        }
        return super.updateOAuth2Token(accessToken, refreshToken, extraData);
    }

    async start() {
        // make a harmless GET request to start so we'll refresh the access token
        // await this.http_get('https://api.spotify.com/v1/me');
    }

    // Helper Instance Methods
    // -----------------------------------------------------------------------

    protected _handleError(profiler: Winston.Profiler, error: any): never {
        if (error instanceof ThingError) {
            profiler.done({
                level: "info",
                message: `Handled Error -- ${error.message}`,
                stack: error.stack,
                code: error.code,
            });
            throw error;
        } else if (error instanceof Error) {
            const message = `Unhandled Error -- ${error.name}: ${error.message}`;
            profiler.done({
                level: "error",
                message,
                stack: error.stack,
                "error.name": error.name,
            });
            throw new ThingError(message, "disallowed_action");
        } else {
            profiler.done({
                level: "error",
                message: "Unknown value raised/rejected",
                error: error,
            });
            throw error;
        }
    }

    protected _checkPremium() {
        if (
            this.state.product !== "premium" &&
            this.state.product !== undefined
        ) {
            throw new ThingError(
                "Premium account required",
                "non_premium_account"
            );
        }
    }

    protected async _getActiveDevice(env: ExecWrapper): Promise<DeviceObject> {
        const log = SpotifyDevice.log.childFor(this._getActiveDevice);
        const devices = await this._client.player.getDevices();
        if (devices.length === 0) {
            throw new ThingError("No player devices", "no_devices");
        }

        // Prefer spotifyd if we have one ("server" platform)
        if (this.spotifyd !== null) {
            const spotifydDevice = devices.find(
                (device) => device.id === this.spotifyd?.deviceId
            );
            if (spotifydDevice !== undefined) {
                log.debug(`Found spotifyd device, returning`, {
                    device: spotifydDevice,
                });
                return spotifydDevice;
            }
        }

        const activeDevice = devices.find((device) => device.is_active);
        if (activeDevice === undefined) {
            throw new ThingError("No active device", "no_active_device");
        }
        return activeDevice;
    }

    protected async _negotiatePlay({
        device_id,
        uris,
    }: {
        device_id?: string;
        uris?: string | string[];
    }): Promise<void> {
        const log = this.log.childFor(this._negotiatePlay, { device_id, uris });
        if (isTestMode()) {
            log.debug("In test mode, aborting.");
            return;
        }

        if (this.engine.audio) {
            await this.engine.audio.requestAudio(this, {
                resume: async () => {
                    log.debug("resuming audio");
                    try {
                        await this._client.api.player.play({ device_id });
                    } catch (error: any) {
                        log.error("Failed to resume audio --", error);
                    }
                },

                stop: async () => {
                    log.debug("stopping audio");
                    try {
                        await this._client.api.player.pause({ device_id });
                    } catch (error: any) {
                        console.error("Failed to stop audio --", error);
                    }
                },
            });
        }

        try {
            await this._client.api.player.play({
                device_id,
                uris,
            });
        } catch (error) {
            const player_info = await this._client.player.get();
            if (player_info) {
                //regular spotify players will throw an error when songs are
                //already playing
                throw new ThingError("Disallowed Action", "disallowed_action");
            } else {
                //web players will throw an error when songs are not playing
                throw new ThingError("Player Error", "player_error");
            }
        }
    }

    // Genie Instance Methods
    // -----------------------------------------------------------------------
    //
    // ### Queries ###########################################################

    @genieGet
    async get_playable(
        params: Params,
        hints: CompiledQueryHints,
        env: ExecWrapper
    ): Promise<ThingPlayable[]> {
        if (!hints.filter) {
            return (await this._client.getAnyPlayable()).map((playable) =>
                playable.toThing()
            );
        }

        const query = buildQuery(hints.filter, "any");

        if (SearchQuery.normalize(query.any).includes("daily mix")) {
            throw new ThingError(
                `Search for daily mix doesn't work`,
                "dailymix_error"
            );
        }

        if (query.isEmpty()) {
            return (await this._client.getAnyPlayable()).map((playable) =>
                playable.toThing()
            );
        }

        return (await this._client.search.playables({ query, limit: 5 })).map(
            (playable) => playable.toThing()
        );
    }

    @genieGet
    async get_artist(
        params: Params,
        hints: CompiledQueryHints,
        env: ExecWrapper
    ): Promise<ThingArtist[]> {
        return (
            await invokeSearch(
                hints,
                "artist",
                this._client.search.artists.bind(this._client),
                this._client.getAnyArtists.bind(this._client)
            )
        ).map((x) => x.toThing());
    }

    @genieGet
    async get_song(
        params: Params,
        hints: CompiledQueryHints,
        env: ExecWrapper
    ): Promise<ThingTrack[]> {
        return (
            await invokeSearch(
                hints,
                "track",
                this._client.search.tracks.bind(this._client),
                this._client.getAnyTracks.bind(this._client)
            )
        ).map((x) => x.toThing());
    }

    @genieGet
    async get_album(
        params: Params,
        hints: CompiledQueryHints,
        env: ExecEnvironment
    ): Promise<ThingAlbum[]> {
        return (
            await invokeSearch(
                hints,
                "album",
                this._client.search.albums.bind(this._client),
                this._client.getAnyAlbums.bind(this._client)
            )
        ).map((x) => x.toThing());
    }

    @genieGet
    async get_show(
        params: Params,
        hints: CompiledQueryHints,
        env: ExecEnvironment
    ): Promise<ThingShow[]> {
        return (
            await invokeSearch(
                hints,
                "any",
                this._client.search.shows.bind(this._client),
                this._client.getAnyShows.bind(this._client)
            )
        ).map((x) => x.toThing());
    }

    @genieGet
    async get_playlist(
        params: Params,
        hints: CompiledQueryHints,
        env: ExecEnvironment
    ): Promise<ThingPlaylist[]> {
        return (
            await invokeSearch(
                hints,
                "any",
                this._client.search.playlists.bind(this._client),
                this._client.getAnyPlaylists.bind(this._client)
            )
        ).map((x) => x.toThing());
    }

    @genieGet
    get_get_user_top_tracks(
        params: Params,
        hints: CompiledQueryHints,
        env: ExecEnvironment
    ): Promise<Array<{ song: ThingTrack }>> {
        // TODO https://api.spotify.com/v1/me/top/tracks?limit=20&time_range=short_term
        return this._client.personalization
            .getMyTopTracks()
            .then((tracks) =>
                tracks.map((track) => ({ song: track.toThing() }))
            );
    }

    // TODO Ask Gio about returning `null`
    @genieGet
    async get_get_currently_playing(
        params: Params,
        hints: CompiledQueryHints,
        env: ExecEnvironment
    ): Promise<null | ThingTrack | ThingEpisode> {
        let response: null | CacheTrack | CacheEpisode;

        try {
            response = await this._client.player.getCurrentlyPlaying();
        } catch (reason: any) {
            if (isJSONParseEmptyInputError(reason)) {
                throw new ThingError("No song playing", "no_song_playing");
            }
            throw reason;
        }

        if (response === null) {
            return null;
        }
        return response.toThing();
    }

    @genieGet
    async get_get_play_info(
        params: Params,
        hints: CompiledQueryHints,
        env: ExecEnvironment
    ): Promise<undefined | CurrentlyPlayingContextObject> {
        let playInfo: CurrentlyPlayingContextObject;
        try {
            playInfo = await this._client.player.get();
        } catch (reason: any) {
            if (isJSONParseEmptyInputError(reason)) {
                // Follows the previous implementation:
                //
                // https://github.com/stanford-oval/thingpedia-common-devices/blob/4c20248f87d000be1aef906d34b74a820aa03788/main/com.spotify/index.js#L164
                //
                return undefined;
            } else {
                throw reason;
            }
        }
        return playInfo;
    }

    @genieGet
    async get_get_available_devices(
        params: Params,
        hints: CompiledQueryHints,
        env: ExecEnvironment
    ): Promise<DeviceObject[]> {
        if (isTestMode()) {
            // TODO This is weird like this...
            //
            // https://github.com/stanford-oval/thingpedia-common-devices/blob/4c20248f87d000be1aef906d34b74a820aa03788/main/com.spotify/index.js#L906
            //
            return [
                {
                    id: "mock",
                    is_active: true,
                    is_private_session: false,
                    is_restricted: false,
                    name: "Coolest Computer",
                    type: "Computer",
                    volume_percent: 100,
                },
            ];
        }
        return await this._client.player.getDevices();
    }

    @genieGet
    get_get_song_from_library(
        params: Params,
        hints: CompiledQueryHints,
        env: ExecEnvironment
    ): Promise<ThingTrack[]> {
        return this._client.library
            .getTracks()
            .then((list) => list.map((item) => item.toThing()));
    }

    @genieGet
    get_get_album_from_library(
        params: Params,
        hints: CompiledQueryHints,
        env: ExecEnvironment
    ): Promise<ThingAlbum[]> {
        return this._client.library
            .getAlbums()
            .then((list) => list.map((item) => item.toThing()));
    }

    @genieGet
    get_get_show_from_library(
        params: Params,
        hints: CompiledQueryHints,
        env: ExecEnvironment
    ): Promise<ThingShow[]> {
        return this._client.library
            .getShows()
            .then((list) => list.map((item) => item.toThing()));
    }

    @genieGet
    get_get_artist_from_library(
        params: Params,
        hints: CompiledQueryHints,
        env: ExecEnvironment
    ): Promise<ThingArtist[]> {
        return this._client.follow
            .getMyArtists()
            .then((list) => list.map((item) => item.toThing()));
    }

    // ### Actions ###########################################################

    @genieDo
    async do_play(
        params: Params,
        env: ExecWrapper
    ): Promise<{ device: Value.Entity }> {
        const playable = cast(
            isEntity,
            params.playable,
            "Expected params.playable to be an Entity"
        );
        this._checkPremium();

        const builder = await this._queueBuilders.get(env);
        builder.push(playable);
        return { device: builder.deviceEntity };
    }

    @genieDo
    async do_add_item_to_library(
        params: Params,
        env: ExecWrapper
    ): Promise<void> {
        const playable = cast(
            isEntity,
            params.playable,
            "Expected params.playable to be an Entity"
        );
        const id = uriId(playable.value);
        const type = uriType(playable.value);
        let method: (id: string) => Promise<null>;

        switch (type) {
            case "album":
                method = this._client.api.library.putAlbum;
                break;
            case "track":
                method = this._client.api.library.putTrack;
                break;
            case "show":
                method = this._client.api.library.putShow;
                break;
            case "episode":
                method = this._client.api.library.putEpisode;
                break;
            default:
                throw new ThingError(
                    `Can not add ${type} to library`,
                    "disallowed_action"
                );
        }

        await method.bind(this._client.api.library)(id);
    }

    @genieDo
    async do_add_artist_to_library(params: Params, env: ExecWrapper) {
        const artist = cast(
            isEntity,
            params.artist,
            "Expected params.artist to be an Entity"
        );
        const id = uriId(artist.value);
        const type = uriType(artist.value);
        if (type !== "artist") {
            throw new ThingError(
                `Not an artist: ${artist}`,
                "disallowed_action"
            );
        }
        await this._client.api.follow.putArtist(id);
    }

    @genieDo
    async do_create_playlist(params: Params, env: ExecWrapper): Promise<void> {
        const name = cast(
            isString,
            params.name,
            "Expected params.name to be a string"
        );
        await this._client.api.playlists.create(this.state.id, name);
    }

    @genieDo
    async do_player_play(params: Params, env: ExecWrapper) {
        this._checkPremium();
        const device = await this._getActiveDevice(env);
        await this._negotiatePlay({
            device_id: device.id,
        });
    }

    @genieDo
    async do_player_pause(params: Params, env: ExecWrapper) {
        this._checkPremium();
        const device = await this._getActiveDevice(env);
        return this._client.api.player.pause({
            device_id: device.id,
        });
    }

    @genieDo
    async do_player_next(params: Params, env: ExecWrapper) {
        this._checkPremium();
        const device = await this._getActiveDevice(env);
        return this._client.api.player.next({
            device_id: device.id,
        });
    }

    @genieDo
    async do_player_previous(params: Params, env: ExecWrapper) {
        this._checkPremium();
        const device = await this._getActiveDevice(env);
        return this._client.api.player.previous({
            device_id: device.id,
        });
    }

    @genieDo
    async do_player_shuffle(params: Params, env: ExecWrapper) {
        const shuffle = cast(
            isOnOff,
            params.shuffle,
            "Expected params.shuffle to be 'on' or 'off'"
        );
        this._checkPremium();
        const device = await this._getActiveDevice(env);
        await this._client.api.player.shuffle(shuffle === "on", {
            device_id: device.id,
        });
    }

    @genieDo
    async do_player_repeat(params: Params, env: ExecWrapper) {
        const repeat = cast(
            isRepeatState,
            params.repeat,
            "Expected params.repeat to be 'track', 'context', or 'off'"
        );
        this._checkPremium();
        const device = await this._getActiveDevice(env);
        await this._client.api.player.repeat(repeat, {
            device_id: device.id,
        });
    }

    @genieDo
    async do_add_song_to_playlist(params: Params, env: ExecWrapper) {
        const song = cast(
            isEntity,
            params.song,
            "Expected params.song to be an Entity"
        );
        const playlistName = cast(
            isString,
            params.playlist,
            "Expected params.playlist to be a string"
        );

        const playlistId = await this._client.playlists.findMyId(playlistName);

        if (playlistId === null) {
            throw new ThingError(
                `Failed to find playlist ${JSON.stringify(playlistName)}`,
                "no_playlist"
            );
        }

        await this._client.api.playlists.add(playlistId, song.value);
    }
}
