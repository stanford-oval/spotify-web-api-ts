// Imports
// ===========================================================================
// Dependencies
// ---------------------------------------------------------------------------

import { HTTPRequestOptions } from "thingpedia/dist/helpers/http";
import { RedisClientType } from "redis/dist/lib/client";
import {
    CompiledFilterHint,
    CompiledQueryHints,
    ExecEnvironment,
} from "thingtalk/dist/runtime/exec_environment";

// Package
// ---------------------------------------------------------------------------

import { CurrentlyPlayingContextObject, DeviceObject } from "../api/objects";
import CacheTrack from "../cache/cache_track";
import {
    ExecWrapper,
    ThingAlbum,
    ThingArtist,
    ThingEpisode,
    ThingError,
    ThingPlayable,
    ThingPlaylist,
    ThingShow,
    ThingTrack,
} from "../things";
import Api from "../api";
import { SearchKwds } from "../api/apis/search_api";
import CacheAlbum from "../cache/cache_album";
import CacheArtist from "../cache/cache_artist";
import { SearchQuery } from "../api/search_query";
import CacheEntity from "../cache/cache_entity";
import CachePlaylist from "../cache/cache_playlist";
import CacheShow from "../cache/cache_show";
import CacheEpisode from "../cache/cache_episode";
import {
    assertUnreachable,
    isJSONParseEmptyInputError,
    isTestMode,
    uriId,
    uriType,
} from "../helpers";
import Logging from "../logging";
import { Logger } from "../logging/logger";
import { Value } from "thingpedia";
import QueueBuilder from "../queue_builder";
import Albums from "./albums";
import Artists from "./artists";
import Tracks from "./tracks";
import Augment from "./augment";
import Browse from "./browse";
import Follow from "./follow";
import Library from "./library";
import Personalization from "./personalization";
import Player from "./player";
import Playlists from "./playlists";
import Search from "./search";
import Shows from "./shows";

// Constants
// ===========================================================================

const LOG = Logging.get(__filename);

// Types
// ===========================================================================

type Params = Record<string, any>;
interface State {
    id: string;
    product?: string;
}

// Class Definition
// ===========================================================================
export default class Client {
    private static readonly log = LOG.childFor(Client);

    public readonly api: Api;
    public readonly state: State;
    private _pendingBuilders: Map<string, QueueBuilder>;
    private _backgroundBuilders: Map<string, QueueBuilder>;

    public readonly augment: Augment;
    public readonly albums: Albums;
    public readonly artists: Artists;
    public readonly browse: Browse;
    public readonly follow: Follow;
    public readonly library: Library;
    public readonly personalization: Personalization;
    public readonly player: Player;
    public readonly playlists: Playlists;
    public readonly search: Search;
    public readonly shows: Shows;
    public readonly tracks: Tracks;

    constructor({
        state,
        useOAuth2,
        redis,
    }: {
        state: State;
        useOAuth2: HTTPRequestOptions["useOAuth2"];
        redis?: RedisClientType;
    }) {
        this.state = state;
        this.api = new Api({ useOAuth2 });
        this._pendingBuilders = new Map<string, QueueBuilder>();
        this._backgroundBuilders = new Map<string, QueueBuilder>();

        this.augment = new Augment(this.api);

        this.albums = new Albums(this.api, this.augment);
        this.artists = new Artists(this.api, this.augment);
        this.browse = new Browse(this.api, this.augment);
        this.follow = new Follow(this.api, this.augment);
        this.library = new Library(this.api, this.augment);
        this.personalization = new Personalization(this.api, this.augment);
        this.player = new Player(this.api, this.augment);
        this.playlists = new Playlists(this.api, this.augment);
        this.search = new Search(this.api, this.augment);
        this.shows = new Shows(this.api, this.augment);
        this.tracks = new Tracks(this.api, this.augment);
    }

    // Instance Methods
    // =======================================================================
    // Helper Methods
    // -----------------------------------------------------------------------

    private get log(): Logger {
        return Client.log;
    }

    get isTestMode(): boolean {
        return process.env.TEST_MODE === "1";
    }

    buildQuery(
        filter: CompiledFilterHint[],
        idProp: keyof SearchQuery
    ): SearchQuery {
        const query = new SearchQuery();

        for (let [name, op, value] of filter) {
            switch (name) {
                case "id":
                    if (op === "==" || op === "=~") {
                        query[idProp] = value;
                    }
                    break;
                case "artists":
                    if (op === "contains" || op === "contains~") {
                        query.artist = value;
                    }
                    break;
                case "release_date":
                    if (!(value instanceof Date)) {
                        console.warn(
                            `Expected release_date to be Date, ` +
                                `found ${typeof value}: ${value}`
                        );
                        continue;
                    }
                    if (op === "==") {
                        query.year = value;
                    } else if (op === ">=") {
                        query.minYear = value;
                    } else if (op === "<=") {
                        query.maxYear = value;
                    }
                    break;
                case "genres":
                    if (op === "contains" || op === "contains~") {
                        query.genre = value;
                    }
                    break;
                case "album":
                    if (op === "==" || op === "=~") {
                        query.album = value;
                    }
                    break;
                default:
                    console.warn(`Un-recognized filter name '${name}'`);
                    break;
            }
        }

        return query;
    }

    private _invokeSearch<T>(
        hints: CompiledQueryHints,
        idProp: keyof SearchQuery,
        searchMethod: (kwds: Omit<SearchKwds, "type">) => Promise<T[]>,
        fallbackMethod: () => Promise<T[]>,
        otherSearchKwds: Omit<SearchKwds, "query" | "type"> = {}
    ): Promise<T[]> {
        if (!hints.filter) {
            return fallbackMethod();
        }

        const query = this.buildQuery(hints.filter, idProp);

        if (query.isEmpty()) {
            return fallbackMethod();
        }

        return searchMethod({ query, ...otherSearchKwds });
    }

    async getActiveDevice(env: ExecWrapper): Promise<DeviceObject> {
        const devices = await this.api.player.getDevices();
        if (devices.length === 0) {
            throw new ThingError("No player devices", "no_devices");
        }
        const activeDevice = devices.find((device) => device.is_active);
        if (activeDevice === undefined) {
            throw new ThingError("No active device", "no_active_device");
        }
        return activeDevice;
    }

    // Playback Queue Building and Flushing Instance Methods
    // -----------------------------------------------------------------------

    resolveURI(uri: string): Promise<string[]> {
        const id = uriId(uri);
        switch (uriType(uri)) {
            case "track":
            case "episode":
                // Really shouldn't bother calling for these, but whatever we'll
                // support them...
                return Promise.resolve([uri]);
            case "album":
                return this.albums.getTrackURIs(id);
            case "artist":
                return this.artists.getTopTrackURIs(id);
            case "playlist":
                return this.playlists.getPlaylistTrackURIs(id);
            case "show":
                return this.shows
                    .getUnfinishedEpisodes(id, 10)
                    .then((episodes) => episodes.map((e) => e.uri));
            default:
                assertUnreachable();
        }
    }

    protected async getQueueBuilder(env: ExecWrapper): Promise<QueueBuilder> {
        const appId = env.app.uniqueId;
        let builder = this._pendingBuilders.get(appId);
        if (builder !== undefined) {
            return builder;
        }
        const device = await this.getActiveDevice(env);
        builder = new QueueBuilder(appId, device, this.resolveURI.bind(this));
        env.addExitProcedureHook(async () => {
            await this.flushQueueBuilder(appId);
        });
        this._pendingBuilders.set(appId, builder);
        return builder;
    }

    protected async backgroundFlushQueueBuilder(builder: QueueBuilder) {
        const log = this.log.childFor(this.backgroundFlushQueueBuilder, {
            appId: builder.appId,
        });

        log.debug("Starting background flush...", { appId: builder.appId });

        this._backgroundBuilders.set(builder.appId, builder);

        for await (const uri of builder) {
            log.debug("Adding URI to queue...", { uri });
            this.api.player.addToQueue(builder.device.id, uri);
        }

        log.debug("Background flush done.");
        const other = this._backgroundBuilders.get(builder.appId);
        if (other === builder) {
            log.debug("Removing from background flush map");
            this._backgroundBuilders.delete(builder.appId);
        }
    }

    protected async flushQueueBuilder(appId: any) {
        const log = LOG.childFor(this.flushQueueBuilder, { appId });

        log.debug("Flushing QueueBuilder...");

        const builder = this._pendingBuilders.get(appId);

        if (builder === undefined) {
            log.warn("No QueueBuilder found for appId");
            return;
        }

        this._pendingBuilders.delete(appId);

        if (builder.isEmpty) {
            log.error("Attempted to flush empty QueueBuilder.");
            return;
        }

        if (builder.srcURIs.length === 1) {
            log.debug("QueueBuilder has a single URI, playing directly.");
            await this.api.player.play({
                device_id: builder.device.id,
                uris: builder.srcURIs[0],
            });
            return;
        }

        // const uris = await builder.popInitialURIs();
        const uri = await builder.next();
        if (uri.done) {
            log.error("Unable to get next URI from QueueBuilder");
            return;
        }

        const backgroundBuilder = this._backgroundBuilders.get(appId);
        if (backgroundBuilder !== undefined) {
            log.debug(
                "A previous QueueBuilder is still flushing, canceling..."
            );
            backgroundBuilder.cancel();
            this._backgroundBuilders.delete(appId);
        }

        log.debug("Playing initial URI...", { uri: uri.value });
        await this.api.player.play({
            device_id: builder.device.id,
            uris: uri.value,
        });

        log.debug("Kicking off background flush...");
        this.backgroundFlushQueueBuilder(builder);
    }

    // "Get Any" Instance Methods
    // -----------------------------------------------------------------------
    //
    // Used to serve empty queries for a specific playable type from Genie —
    // "play a X" sort of things.
    //

    getAnyArtists(): Promise<CacheArtist[]> {
        return this.personalization.getMyTopArtists();
    }

    getAnyTracks(): Promise<CacheTrack[]> {
        return this.personalization.getMyTopTracks();
    }

    getAnyAlbums(): Promise<CacheAlbum[]> {
        return this.browse.getNewReleases();
    }

    getAnyPlaylists(): Promise<CachePlaylist[]> {
        return this.browse.getFeaturedPlaylists();
    }

    /**
     * Get _any_ shows. Used when [[get_show]] is invoked with an empty query
     * (no applicable _hints_ from Genie), something like "play a show".
     *
     * This is an interesting one, because — opposed to all other playables —
     * there is currently no strait-forward way I can see to just "get some
     * shows" via the Web API.
     *
     * For now, we simply return the user's saved shows (those in their
     * library), if any.
     *
     * @returns Some shows. Hopefully.
     */
    getAnyShows(): Promise<CacheShow[]> {
        return this.library.getShows();
    }

    getAnyPlayable(): Promise<CacheEntity[]> {
        return this.getAnyTracks();
    }

    // Playback Device Methods
    // -----------------------------------------------------------------------
    //
    // Used to manage "devices" that Spotify can play on — desktop app, mobile
    // app, smart speaker (spotifyd), etc.
    //

    // Genie Methods
    // -----------------------------------------------------------------------
    // ### Queries ###########################################################

    async get_playable(
        params: Params,
        hints: CompiledQueryHints,
        env: ExecEnvironment
    ): Promise<ThingPlayable[]> {
        if (!hints.filter) {
            return (await this.getAnyPlayable()).map((playable) =>
                playable.toThing()
            );
        }

        const query = this.buildQuery(hints.filter, "any");

        if (SearchQuery.normalize(query.any).includes("daily mix")) {
            throw new ThingError(
                `Search for daily mix doesn't work`,
                "dailymix_error"
            );
        }

        if (query.isEmpty()) {
            return (await this.getAnyPlayable()).map((playable) =>
                playable.toThing()
            );
        }

        return (await this.search.playables({ query, limit: 5 })).map(
            (playable) => playable.toThing()
        );
    }

    async get_artist(
        params: Params,
        hints: CompiledQueryHints,
        env: ExecEnvironment
    ): Promise<ThingArtist[]> {
        return (
            await this._invokeSearch(
                hints,
                "artist",
                this.search.artists.bind(this),
                this.getAnyArtists.bind(this)
            )
        ).map((x) => x.toThing());
    }

    async get_song(
        params: Params,
        hints: CompiledQueryHints,
        env: ExecEnvironment
    ): Promise<ThingTrack[]> {
        return (
            await this._invokeSearch(
                hints,
                "track",
                this.search.tracks.bind(this),
                this.getAnyTracks.bind(this)
            )
        ).map((x) => x.toThing());
    }

    async get_album(
        params: Params,
        hints: CompiledQueryHints,
        env: ExecEnvironment
    ): Promise<ThingAlbum[]> {
        return (
            await this._invokeSearch(
                hints,
                "album",
                this.search.albums.bind(this),
                this.getAnyAlbums.bind(this)
            )
        ).map((x) => x.toThing());
    }

    async get_show(
        params: Params,
        hints: CompiledQueryHints,
        env: ExecEnvironment
    ): Promise<ThingShow[]> {
        return (
            await this._invokeSearch(
                hints,
                "any",
                this.search.shows.bind(this),
                this.getAnyShows.bind(this)
            )
        ).map((x) => x.toThing());
    }

    async get_playlist(
        params: Params,
        hints: CompiledQueryHints,
        env: ExecEnvironment
    ): Promise<ThingPlaylist[]> {
        return (
            await this._invokeSearch(
                hints,
                "any",
                this.search.playlists.bind(this),
                this.getAnyPlaylists.bind(this)
            )
        ).map((x) => x.toThing());
    }

    get_get_user_top_tracks(): Promise<Array<{ song: ThingTrack }>> {
        // TODO https://api.spotify.com/v1/me/top/tracks?limit=20&time_range=short_term
        return this.personalization
            .getMyTopTracks()
            .then((tracks) =>
                tracks.map((track) => ({ song: track.toThing() }))
            );
    }

    // TODO Ask Gio about returning `null`
    async get_get_currently_playing(): Promise<
        null | ThingTrack | ThingEpisode
    > {
        let response: null | CacheTrack | CacheEpisode;

        try {
            response = await this.player.getCurrentlyPlaying();
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

    async get_get_play_info(): Promise<
        undefined | CurrentlyPlayingContextObject
    > {
        let playInfo: CurrentlyPlayingContextObject;
        try {
            playInfo = await this.player.get();
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

    async get_get_available_devices(): Promise<DeviceObject[]> {
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
        return await this.player.getDevices();
    }

    get_get_song_from_library(
        params: Params,
        hints: CompiledQueryHints,
        env: ExecEnvironment
    ): Promise<ThingTrack[]> {
        return this.library
            .getTracks()
            .then((list) => list.map((item) => item.toThing()));
    }

    get_get_album_from_library(
        params: Params,
        hints: CompiledQueryHints,
        env: ExecEnvironment
    ): Promise<ThingAlbum[]> {
        return this.library
            .getAlbums()
            .then((list) => list.map((item) => item.toThing()));
    }

    get_get_show_from_library(
        params: Params,
        hints: CompiledQueryHints,
        env: ExecEnvironment
    ): Promise<ThingShow[]> {
        return this.library
            .getShows()
            .then((list) => list.map((item) => item.toThing()));
    }

    get_get_artist_from_library(
        params: Params,
        hints: CompiledQueryHints,
        env: ExecEnvironment
    ): Promise<ThingArtist[]> {
        return this.follow
            .getMyArtists()
            .then((list) => list.map((item) => item.toThing()));
    }

    // ### Actions ###########################################################

    async do_play(
        { playable }: { playable: Value.Entity },
        env: ExecWrapper
    ): Promise<{ device: Value.Entity }> {
        this._checkPremium();
        const builder = await this.getQueueBuilder(env);
        builder.push(playable);
        return { device: builder.deviceEntity };
    }

    async do_add_item_to_library({
        playable,
    }: {
        playable: any;
    }): Promise<void> {
        const log = this.log.childFor(this.do_add_item_to_library);
        if (this.isTestMode) {
            log.debug("In test mode, aborting.");
            return;
        }
        if (!playable || !(playable instanceof Value.Entity)) {
            throw new ThingError("No item to add", "no_item_to_add");
        }
        const id = uriId(playable.value);
        const type = uriType(playable.value);
        let method: (id: string) => Promise<null>;

        switch (type) {
            case "album":
                method = this.api.library.putAlbum;
                break;
            case "track":
                method = this.api.library.putTrack;
                break;
            case "show":
                method = this.api.library.putShow;
                break;
            case "episode":
                method = this.api.library.putEpisode;
                break;
            default:
                throw new ThingError(
                    `Can not add ${type} to library`,
                    "disallowed_action"
                );
        }

        try {
            await method.bind(this.api.library)(id);
        } catch (reason) {
            throw new ThingError(
                `Failed to add ${type} ${id} to library`,
                "disallowed_action"
            );
        }
    }

    async do_add_artist_to_library({ artist }: { artist: any }) {
        const log = this.log.childFor(this.do_add_artist_to_library);
        if (this.isTestMode) {
            log.debug("In test mode, aborting.");
            return;
        }
        if (!artist || !(artist instanceof Value.Entity)) {
            throw new ThingError("No artist to add", "no_item_to_add");
        }
        const id = uriId(artist.value);
        const type = uriType(artist.value);
        if (type !== "artist") {
            throw new ThingError(
                `Not an artist: ${artist}`,
                "disallowed_action"
            );
        }
        try {
            await this.api.follow.putArtist(id);
        } catch (error: any) {
            throw new ThingError(
                `Failed to follow artist ${artist}`,
                "disallowed_action"
            );
        }
    }

    async do_create_playlist({ name }: { name: string }): Promise<void> {
        const log = this.log.childFor(this.do_create_playlist);
        if (this.isTestMode) {
            log.debug("In test mode, aborting.");
            return;
        }
        try {
            await this.api.playlists.create(this.state.id, name);
        } catch (error) {
            throw new ThingError(
                `Failed to create playlist`,
                "disallowed_action"
            );
        }
    }

    async do_player_pause(params: Params, env: ExecWrapper) {
        const log = this.log.childFor(this.do_player_pause);
        return this._doPlayerAction(log, this.api.player.pause, env);
    }

    async do_player_play(params: Params, env: ExecWrapper) {
        const log = this.log.childFor(this.do_player_play);
        return this._doPlayerAction(log, this.api.player.play, env);
    }

    async do_player_next(params: Params, env: ExecWrapper) {
        const log = this.log.childFor(this.do_player_next);
        return this._doPlayerAction(log, this.api.player.next, env);
    }

    async do_player_previous(params: Params, env: ExecWrapper) {
        const log = this.log.childFor(this.do_player_next);
        return this._doPlayerAction(log, this.api.player.previous, env);
    }

    async do_player_shuffle(
        { shuffle }: { shuffle: "on" | "off" },
        env: ExecWrapper
    ) {
        const log = this.log.childFor(this.do_player_shuffle, { shuffle });
        log.debug("Setting shuffle...");
        this._checkPremium();
        const device = await this.getActiveDevice(env);
        try {
            await this.api.player.shuffle(shuffle === "on", {
                device_id: device.id,
            });
        } catch (error) {
            throw new ThingError(`Failed to set shuffle`, "disallowed_action");
        }
    }

    async do_player_repeat(
        {
            repeat,
        }: {
            repeat: "track" | "context" | "off";
        },
        env: ExecWrapper
    ) {
        const log = this.log.childFor(this.do_player_repeat, { repeat });
        log.debug("Setting repeat...");
        this._checkPremium();
        const device = await this.getActiveDevice(env);
        try {
            await this.api.player.repeat(repeat, {
                device_id: device.id,
            });
        } catch (error) {
            throw new ThingError(`Failed to set repeat`, "disallowed_action");
        }
    }

    async do_add_song_to_playlist({
        song,
        playlist,
    }: {
        song: Value.Entity;
        playlist: string;
    }) {
        const log = this.log.childFor(this.do_add_song_to_playlist, {
            song,
            playlist,
        });
        if (this.isTestMode) {
            log.debug("In test mode, aborting.");
            return;
        }

        const playlistId = await this.playlists.findMyId(playlist);

        if (playlistId === null) {
            log.error("Failed to find playlist");
            throw new ThingError(
                `Failed to find playlist ${JSON.stringify(playlist)}`,
                "no_playlist"
            );
        }

        await this.api.playlists.add(playlistId, song.value);
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

    protected async _doPlayerAction(
        log: Logger,
        method: ({ device_id }: { device_id?: string }) => Promise<null>,
        env: ExecWrapper
    ): Promise<void> {
        if (this.isTestMode) {
            log.debug("In test mode, aborting.");
            return;
        }

        this._checkPremium();

        const device = await this.getActiveDevice(env);

        try {
            await method.bind(this.api.player)({ device_id: device.id });
        } catch (error) {
            throw new ThingError(
                `Failed to pause playback`,
                "disallowed_action"
            );
        }
    }
}
