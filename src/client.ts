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

import {
    AlbumObject,
    ArtistObject,
    CurrentlyPlayingContextObject,
    DeviceObject,
    EpisodeObject,
    PagingObject,
    PlaylistTrackObject,
    SimplifiedAlbumObject,
    SimplifiedPlaylistObject,
    SimplifiedShowObject,
    TrackObject,
} from "./api/objects";
import CacheTrack from "./cache/cache_track";
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
} from "./things";
import Api, { SearchKwds } from "./api";
import CacheAlbum from "./cache/cache_album";
import CacheArtist from "./cache/cache_artist";
import { SearchQuery } from "./api/search_query";
import CacheEntity from "./cache/cache_entity";
import CachePlaylist from "./cache/cache_playlist";
import CacheShow from "./cache/cache_show";
import { BrowseOptions, MarketPageOptions } from "./api/requests";
import CacheEpisode from "./cache/cache_episode";
import {
    assertBounds,
    assertUnreachable,
    isJSONParseEmptyInputError,
    isTestMode,
    isUnfinished,
    uriId,
    uriType,
} from "./helpers";
import Logging from "./logging";
import { Logger } from "./logging/logger";
import { Value } from "thingpedia";
import QueueBuilder from "./queue_builder";

// Constants
// ===========================================================================

const LOG = Logging.get(__filename);

// Types
// ===========================================================================

type Params = Record<string, any>;
type CachePlayable = CacheTrack | CacheAlbum | CachePlaylist | CacheShow;

// Class Definition
// ===========================================================================
export default class Client {
    private static readonly log = LOG.childFor(Client);

    public readonly api: Api;
    private _queueBuilders: Map<string, QueueBuilder>;
    private _backgroundFlushes: Map<string, QueueBuilder>;

    constructor(
        useOAuth2: HTTPRequestOptions["useOAuth2"],
        redis?: RedisClientType
    ) {
        this.api = new Api({ useOAuth2 });
        this._queueBuilders = new Map<string, QueueBuilder>();
        this._backgroundFlushes = new Map<string, QueueBuilder>();
    }

    // Instance Methods
    // =======================================================================
    // Helper Methods
    // -----------------------------------------------------------------------

    private get log(): Logger {
        return Client.log;
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

    // ### Augment Helper Methods ############################################
    //
    // Extend Spotify Web API objects into their cached form.
    //

    async augmentTracks(tracks: TrackObject[]): Promise<CacheTrack[]> {
        const trackIds: string[] = [];
        const artistIds: Set<string> = new Set();
        for (let track of tracks) {
            trackIds.push(track.id);
            for (let artist of track.artists) {
                artistIds.add(artist.id);
            }
        }

        const audioFeaturesPromise = this.api.getAudioFeatures(trackIds);
        const artistsPromise = this.api.getArtists(Array.from(artistIds));

        const [audioFeatures, artists] = await Promise.all([
            audioFeaturesPromise,
            artistsPromise,
        ]);

        const artistsById: Record<string, ArtistObject> = {};
        for (let artist of artists) {
            artistsById[artist.id] = artist;
        }

        const cacheTracks: CacheTrack[] = [];

        for (let i = 0; i < tracks.length; i++) {
            const track = tracks[i];

            const trackArtists: ArtistObject[] = [];
            for (let simplifiedArtist of track.artists) {
                if (artistsById.hasOwnProperty(simplifiedArtist.id)) {
                    trackArtists.push(artistsById[simplifiedArtist.id]);
                }
            }

            cacheTracks.push(
                new CacheTrack(track, trackArtists, audioFeatures[i])
            );
        }

        return cacheTracks;
    }

    async augmentTrack(track: TrackObject): Promise<CacheTrack> {
        return (await this.augmentTracks([track]))[0];
    }

    async augmentAlbums(
        albums: SimplifiedAlbumObject[]
    ): Promise<CacheAlbum[]> {
        const ids = albums.map((a) => a.id);
        const fullAlbums = await this.api.getAlbums(ids);
        return fullAlbums.map((a) => new CacheAlbum(a));
    }

    async augmentAlbum(album: AlbumObject): Promise<CacheAlbum> {
        return new CacheAlbum(album);
    }

    async augmentPlaylists(
        playlists: SimplifiedPlaylistObject[]
    ): Promise<CachePlaylist[]> {
        return playlists.map((p) => new CachePlaylist(p));
    }

    async augmentShows(shows: SimplifiedShowObject[]): Promise<CacheShow[]> {
        return shows.map((s) => new CacheShow(s));
    }

    async augmentEpisodes(episodes: EpisodeObject[]): Promise<CacheEpisode[]> {
        return episodes.map((e) => new CacheEpisode(e));
    }

    async augmentEpisode(episode: EpisodeObject): Promise<CacheEpisode> {
        return (await this.augmentEpisodes([episode]))[0];
    }

    async augmentArtists(artists: ArtistObject[]): Promise<CacheArtist[]> {
        return artists.map((a) => new CacheArtist(a));
    }

    async augmentArtist(artist: ArtistObject): Promise<CacheArtist> {
        return new CacheArtist(artist);
    }

    // API Methods
    // -----------------------------------------------------------------------
    // ### Albums API ###

    getAlbum(id: string): Promise<CacheAlbum> {
        return this.api
            .getAlbum(id, { market: "from_token" })
            .then((album) => this.augmentAlbum(album));
    }

    getAlbumTrackURIs(id: string): Promise<string[]> {
        return this.getAlbum(id).then((album) =>
            album.tracks.items.map((t) => t.uri)
        );
    }

    // ### Artists API #######################################################

    getArtists(ids: string[]): Promise<CacheArtist[]> {
        return this.api.getArtists(ids).then(this.augmentArtists.bind(this));
    }

    getArtist(id: string): Promise<CacheArtist> {
        return this.api.getArtist(id).then(this.augmentArtist.bind(this));
    }

    getArtistTopTracks(id: string): Promise<CacheTrack[]> {
        return this.api
            .getArtistTopTracks(id)
            .then(this.augmentTracks.bind(this));
    }

    getArtistTopTrackURIs(id: string): Promise<string[]> {
        // TODO This can potentially be done more efficiently
        return this.getArtistTopTracks(id).then((tracks) =>
            tracks.map((t) => t.uri)
        );
    }

    // ### Browse API ########################################################

    getFeaturedPlaylists(
        options: BrowseOptions = {}
    ): Promise<CachePlaylist[]> {
        return this.api
            .getFeaturedPlaylists(options)
            .then((r) => this.augmentPlaylists(r.playlists.items));
    }

    getNewReleases(options: BrowseOptions = {}): Promise<CacheAlbum[]> {
        return this.api
            .getNewReleases(options)
            .then((r) => this.augmentAlbums(r.items));
    }

    // ### Follow API ########################################################

    getMyFollowedArtists(
        options: {
            after?: string;
            limit?: number;
        } = {}
    ): Promise<CacheArtist[]> {
        return this.api
            .getMyFollowedArtists()
            .then((page) => this.augmentArtists(page.items));
    }

    // ### Library API #######################################################

    getUserSavedShows(): Promise<CacheShow[]> {
        return this.api
            .getUserSavedShows({ limit: 50 })
            .then((r) => this.augmentShows(r.items.map((entry) => entry.show)));
    }

    getUserSavedTracks(): Promise<CacheTrack[]> {
        return this.api
            .getUserSavedTracks({ limit: 50 })
            .then((page) => this.augmentTracks(page.items.map((x) => x.track)));
    }

    getUserSavedAlbums(): Promise<CacheAlbum[]> {
        return this.api
            .getUserSavedAlbums({ limit: 50 })
            .then((page) => this.augmentAlbums(page.items.map((x) => x.album)));
    }

    // ### Personalization API ###############################################

    getUserTopArtists(): Promise<CacheArtist[]> {
        return this.api
            .getUserTopArtists()
            .then((r) => this.augmentArtists(r.items));
    }

    getUserTopTracks(): Promise<CacheTrack[]> {
        return this.api
            .getUserTopTracks()
            .then((r) => this.augmentTracks(r.items));
    }

    // ### Player API ########################################################

    async getCurrentlyPlaying(): Promise<null | CacheTrack | CacheEpisode> {
        const playing = await this.api.getCurrentlyPlaying({
            market: "from_token",
        });

        if (playing.item === null) {
            return null;
        } else if (playing.item.type === "track") {
            return this.augmentTrack(playing.item);
        } else if (playing.item.type === "episode") {
            return this.augmentEpisode(playing.item);
        } else {
            assertUnreachable();
        }
    }

    getPlayer(): Promise<CurrentlyPlayingContextObject> {
        return this.api.getPlayer();
    }

    getPlayerDevices(): Promise<DeviceObject[]> {
        return this.api.getPlayerDevices();
    }

    // ### Playlist API ######################################################

    getPlaylist(id: string): Promise<CachePlaylist> {
        throw new Error(`Not Implemented`);
    }

    getPlaylistTracks(id: string): Promise<PagingObject<PlaylistTrackObject>> {
        return this.api.getPlaylistTracks(id, { market: "from_token" });
    }

    getPlaylistTrackURIs(id: string): Promise<string[]> {
        return this.getPlaylistTracks(id).then((page) =>
            page.items.map((t) => t.track.uri)
        );
    }

    // ### Search API ########################################################

    async searchArtists(
        kwds: Omit<SearchKwds, "type">
    ): Promise<CacheArtist[]> {
        const response = await this.api.search({
            type: "artist",
            market: "from_token",
            ...kwds,
        });
        if (response.artists) {
            return await this.augmentArtists(response.artists.items);
        }
        return [];
    }

    async searchAlbums(kwds: Omit<SearchKwds, "type">): Promise<CacheAlbum[]> {
        const response = await this.api.search({
            type: "album",
            market: "from_token",
            ...kwds,
        });
        if (response.albums) {
            return await this.augmentAlbums(response.albums.items);
        }
        return [];
    }

    async searchTracks(kwds: Omit<SearchKwds, "type">): Promise<CacheTrack[]> {
        const response = await this.api.search({
            type: "track",
            market: "from_token",
            ...kwds,
        });
        if (response.tracks) {
            return await this.augmentTracks(response.tracks.items);
        }
        return [];
    }

    async searchShows(kwds: Omit<SearchKwds, "type">): Promise<CacheShow[]> {
        const response = await this.api.search({
            type: "show",
            market: "from_token",
            ...kwds,
        });
        if (response.shows) {
            return await this.augmentShows(response.shows.items);
        }
        return [];
    }

    async searchPlaylists(
        kwds: Omit<SearchKwds, "type">
    ): Promise<CachePlaylist[]> {
        const response = await this.api.search({
            type: "playlist",
            market: "from_token",
            ...kwds,
        });
        if (response.playlists) {
            return await this.augmentPlaylists(response.playlists.items);
        }
        return [];
    }

    async searchPlayables({
        query,
        market = "from_token",
        limit,
        offset,
        include_external,
    }: Omit<SearchKwds, "type">): Promise<CachePlayable[]> {
        const results = await this.api.search({
            query,
            type: "track,album,playlist,show",
            market,
            limit,
            offset,
            include_external,
        });

        const promises: Promise<CachePlayable[]>[] = [];

        if (results.tracks && results.tracks.total > 0) {
            promises.push(this.augmentTracks(results.tracks.items));
        }

        if (results.albums && results.albums.total > 0) {
            promises.push(this.augmentAlbums(results.albums.items));
        }

        if (results.playlists && results.playlists.total > 0) {
            promises.push(this.augmentPlaylists(results.playlists.items));
        }

        if (results.shows && results.shows.total > 0) {
            promises.push(this.augmentShows(results.shows.items));
        }

        const lists = await Promise.all(promises);

        const playables: CachePlayable[] = [];
        for (const list of lists) {
            for (const playable of list) {
                playables.push(playable);
            }
        }

        return playables;
    }

    // ### Shows API #########################################################

    getShowEpisodes(
        showId: string,
        options: MarketPageOptions = {}
    ): Promise<CacheEpisode[]> {
        return this.api
            .getShowEpisodes(showId, options)
            .then((page) => this.augmentEpisodes(page.items));
    }

    async getUnfinishedShowEpisodes(
        showId: string,
        limit: number,
        pageSize: number = 50
    ): Promise<CacheEpisode[]> {
        assertBounds("limit", limit, 1, 10);
        const log = this.log.childFor(this.getUnfinishedShowEpisodes, {
            showId,
            limit,
            pageSize,
        });
        // TODO This can be MUCH better...
        const page = await this.api.getShowEpisodes(showId, {
            limit: pageSize,
        });
        const unfinished = page.items.filter(isUnfinished);

        if (unfinished.length === limit) {
            log.debug(`Found EXACT limit of unfinished shows`, {
                returning: limit,
                total: page.total,
            });
            return this.augmentEpisodes(unfinished);
        }

        if (unfinished.length > limit) {
            log.debug(`Found MORE than limit of unfinished shows`, {
                returning: limit,
                total: page.total,
            });
            return this.augmentEpisodes(unfinished.slice(0, limit));
        }

        // We didn't find enough to hit the limit...

        // Maybe there weren't any more...?
        if (page.total <= pageSize) {
            // No more! Listened to them all!
            log.debug(`Didn't hit limit, but no more to check`, {
                returning: unfinished.length,
                total: page.total,
            });
        } else {
            // There might be more :/
            log.warn(`Didn't hit limit, could scan more`, {
                returning: unfinished.length,
                total: page.total,
            });
        }

        return this.augmentEpisodes(unfinished);
    }

    // ### Additional "Get Any" Methods ######################################
    //
    // Used to serve empty queries for a specific playable type from Genie —
    // "play a X" sort of things.
    //

    getAnyArtists(): Promise<CacheArtist[]> {
        return this.getUserTopArtists();
    }

    getAnyTracks(): Promise<CacheTrack[]> {
        return this.getUserTopTracks();
    }

    getAnyAlbums(): Promise<CacheAlbum[]> {
        return this.getNewReleases();
    }

    getAnyPlaylists(): Promise<CachePlaylist[]> {
        return this.getFeaturedPlaylists();
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
        return this.getUserSavedShows();
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

        return (await this.searchPlayables({ query, limit: 5 })).map(
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
                this.searchArtists.bind(this),
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
                this.searchTracks.bind(this),
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
                this.searchAlbums.bind(this),
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
                this.searchShows.bind(this),
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
                this.searchPlaylists.bind(this),
                this.getAnyPlaylists.bind(this)
            )
        ).map((x) => x.toThing());
    }

    get_get_user_top_tracks(): Promise<Array<{ song: ThingTrack }>> {
        // TODO https://api.spotify.com/v1/me/top/tracks?limit=20&time_range=short_term
        return this.getUserTopTracks().then((tracks) =>
            tracks.map((track) => ({ song: track.toThing() }))
        );
    }

    // TODO Ask Gio about returning `null`
    async get_get_currently_playing(): Promise<
        null | ThingTrack | ThingEpisode
    > {
        let response: null | CacheTrack | CacheEpisode;

        try {
            response = await this.getCurrentlyPlaying();
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
            playInfo = await this.getPlayer();
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
        return await this.getPlayerDevices();
    }

    get_get_song_from_library(
        params: Params,
        hints: CompiledQueryHints,
        env: ExecEnvironment
    ): Promise<ThingTrack[]> {
        return this.getUserSavedTracks().then((list) =>
            list.map((item) => item.toThing())
        );
    }

    get_get_album_from_library(
        params: Params,
        hints: CompiledQueryHints,
        env: ExecEnvironment
    ): Promise<ThingAlbum[]> {
        return this.getUserSavedAlbums().then((list) =>
            list.map((item) => item.toThing())
        );
    }

    get_get_show_from_library(
        params: Params,
        hints: CompiledQueryHints,
        env: ExecEnvironment
    ): Promise<ThingShow[]> {
        return this.getUserSavedShows().then((list) =>
            list.map((item) => item.toThing())
        );
    }

    get_get_artist_from_library(
        params: Params,
        hints: CompiledQueryHints,
        env: ExecEnvironment
    ): Promise<ThingArtist[]> {
        return this.getMyFollowedArtists().then((list) =>
            list.map((item) => item.toThing())
        );
    }

    // ### Actions ###########################################################

    async getActiveDevice(env: ExecWrapper): Promise<DeviceObject> {
        const devices = await this.api.getPlayerDevices();
        if (devices.length === 0) {
            throw new ThingError("No player devices", "no_devices");
        }
        const activeDevice = devices.find((device) => device.is_active);
        if (activeDevice === undefined) {
            return devices[0];
        }
        return activeDevice;
    }

    resolveURI(uri: string): Promise<string[]> {
        const id = uriId(uri);
        switch (uriType(uri)) {
            case "track":
            case "episode":
                // Really shouldn't bother calling for these, but whatever we'll
                // support them...
                return Promise.resolve([uri]);
            case "album":
                return this.getAlbumTrackURIs(id);
            case "artist":
                return this.getArtistTopTrackURIs(id);
            case "playlist":
                return this.getPlaylistTrackURIs(id);
            case "show":
                return this.getUnfinishedShowEpisodes(id, 10).then((episodes) =>
                    episodes.map((e) => e.uri)
                );
            default:
                assertUnreachable();
        }
    }

    private async backgroundFlush(builder: QueueBuilder) {
        const log = LOG.childFor(this.backgroundFlush, {
            appId: builder.appId,
        });

        log.debug("Starting background flush...", { appId: builder.appId });

        this._backgroundFlushes.set(builder.appId, builder);

        for await (const uri of builder) {
            log.debug("Adding URI to queue...", { uri });
            this.api.addToQueue(builder.device.id, uri);
        }

        log.debug("Background flush done.");
        const other = this._backgroundFlushes.get(builder.appId);
        if (other === builder) {
            log.debug("Removing from background flush map");
            this._backgroundFlushes.delete(builder.appId);
        }
    }

    private async flush(appId: any) {
        const log = LOG.childFor(this.flush, { appId });

        log.debug("Flushing QueueBuilder...");

        const builder = this._queueBuilders.get(appId);

        if (builder === undefined) {
            log.warn("No QueueBuilder found for appId");
            return;
        }

        this._queueBuilders.delete(appId);

        if (builder.isEmpty) {
            log.error("Attempted to flush empty QueueBuilder.");
            return;
        }

        if (builder.srcURIs.length === 1) {
            log.debug("QueueBuilder has a single URI, playing directly.");
            await this.api.play(builder.device.id, builder.srcURIs[0]);
            return;
        }

        // const uris = await builder.popInitialURIs();
        const uri = await builder.next();
        if (uri.done) {
            log.error("Unable to get next URI from QueueBuilder");
            return;
        }

        const backgroundBuilder = this._backgroundFlushes.get(appId);
        if (backgroundBuilder !== undefined) {
            log.debug(
                "A previous QueueBuilder is still flushing, canceling..."
            );
            backgroundBuilder.cancel();
            this._backgroundFlushes.delete(appId);
        }

        log.debug("Playing initial URI...", { uri: uri.value });
        await this.api.play(builder.device.id, uri.value);

        log.debug("Kicking off background flush...");
        this.backgroundFlush(builder);
    }

    async getQueueBuilder(env: ExecWrapper): Promise<QueueBuilder> {
        const appId = env.app.uniqueId;
        let builder = this._queueBuilders.get(appId);
        if (builder !== undefined) {
            return builder;
        }
        const device = await this.getActiveDevice(env);
        builder = new QueueBuilder(appId, device, this.resolveURI.bind(this));
        env.addExitProcedureHook(async () => {
            await this.flush(appId);
        });
        this._queueBuilders.set(appId, builder);
        return builder;
    }

    async do_play(
        { playable }: { playable: Value.Entity },
        env: ExecWrapper
    ): Promise<{ device: Value.Entity }> {
        const builder = await this.getQueueBuilder(env);
        builder.push(playable);
        return { device: builder.deviceEntity };
    }
}
