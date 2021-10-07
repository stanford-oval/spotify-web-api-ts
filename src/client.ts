import { HTTPRequestOptions } from "thingpedia/dist/helpers/http";
import { RedisClientType } from "redis/dist/lib/client";
import {
    CompiledFilterHint,
    CompiledQueryHints,
    ExecEnvironment,
} from "thingtalk/dist/runtime/exec_environment";

import {
    ArtistObject,
    SimplifiedAlbumObject,
    SimplifiedPlaylistObject,
    SimplifiedShowObject,
    TrackObject,
} from "./api/objects";
import CacheTrack from "./cache/cache_track";
import {
    ThingAlbum,
    ThingArtist,
    ThingPlayable,
    ThingPlaylist,
    ThingShow,
    ThingTrack,
} from "./thing_types";
import Api, { SearchKwds } from "./api";
import CacheAlbum from "./cache/cache_album";
import CacheArtist from "./cache/cache_artist";
import { artistIdsForAlbums } from "./helpers";
import { SearchQuery } from "./api/search_query";
import CacheEntity from "./cache/cache_entity";
import CachePlaylist from "./cache/cache_playlist";
import CacheShow from "./cache/cache_show";

type Params = Record<string, any>;
type CachePlayable = CacheTrack | CacheAlbum | CachePlaylist | CacheShow;

export class ThingError extends Error {
    code: string;

    constructor(message: string, code: string) {
        super(message);
        this.code = code;
    }
}

export default class Client {
    api: Api;

    constructor(
        useOAuth2: HTTPRequestOptions["useOAuth2"],
        redis: RedisClientType
    ) {
        this.api = new Api(useOAuth2);
    }

    // Helper Methods
    // -----------------------------------------------------------------------

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

    async augmentAlbums(
        albums: SimplifiedAlbumObject[]
    ): Promise<CacheAlbum[]> {
        throw new Error(`Not Implemented`);
    }

    async augmentPlaylists(
        playlists: SimplifiedPlaylistObject[]
    ): Promise<CachePlaylist[]> {
        throw new Error(`Not Implemented`);
    }

    async augmentShows(
        playlists: SimplifiedShowObject[]
    ): Promise<CacheShow[]> {
        throw new Error(`Not Implemented`);
    }

    async getNewAlbums(): Promise<CacheAlbum[]> {
        return await this.searchAlbums({
            query: {
                tag: "new",
            },
            limit: 5,
        });
    }

    async getArtists(ids: string[]): Promise<CacheArtist[]> {
        return (await this.api.getArtists(ids)).map(
            (artistObject) => new CacheArtist(artistObject)
        );
    }

    async getAnyArtists(): Promise<CacheArtist[]> {
        return this.getArtists(artistIdsForAlbums(await this.getNewAlbums()));
    }

    async getAnyTracks(): Promise<CacheTrack[]> {
        throw new Error(`Not Implemented`);
    }

    getAnyAlbums(): Promise<CacheAlbum[]> {
        return this.getNewAlbums();
    }

    async getAnyPlaylists(): Promise<CachePlaylist[]> {
        throw new Error(`Not Implemented`);
    }

    async getAnyShows(): Promise<CacheShow[]> {
        throw new Error(`Not Implemented`);
    }

    async getAnyPlayable(): Promise<CacheEntity[]> {
        throw new Error(`Not Implemented`);
    }

    async searchArtists({
        query,
        market = "from_token",
        limit,
        offset,
        include_external,
    }: SearchKwds): Promise<CacheArtist[]> {
        throw new Error(`Not Implemented`);
    }

    async searchAlbums({
        query,
        market = "from_token",
        limit,
        offset,
        include_external,
    }: SearchKwds): Promise<CacheAlbum[]> {
        throw new Error(`Not Implemented`);
    }

    async searchTracks({
        query,
        market = "from_token",
        limit,
        offset,
        include_external,
    }: SearchKwds): Promise<CacheTrack[]> {
        throw new Error(`Not Implemented`);
    }

    async searchShows({
        query,
        market = "from_token",
        limit,
        offset,
        include_external,
    }: SearchKwds): Promise<CacheShow[]> {
        throw new Error(`Not Implemented`);
    }

    async searchPlaylists({
        query,
        market = "from_token",
        limit,
        offset,
        include_external,
    }: SearchKwds): Promise<CachePlaylist[]> {
        throw new Error(`Not Implemented`);
    }

    async searchPlayables({
        query,
        market = "from_token",
        limit,
        offset,
        include_external,
    }: SearchKwds): Promise<CachePlayable[]> {
        const results = await this.api.search({
            query,
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

    private _search<T>(
        hints: CompiledQueryHints,
        idProp: keyof SearchQuery,
        searchMethod: (kwds: SearchKwds) => Promise<T[]>,
        fallbackMethod: () => Promise<T[]>
    ): Promise<T[]> {
        if (!hints.filter) {
            return fallbackMethod();
        }

        const query = this.buildQuery(hints.filter, idProp);

        if (query.isEmpty()) {
            return fallbackMethod();
        }

        return searchMethod({ query });
    }

    // Genie Methods
    // -----------------------------------------------------------------------

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
            await this._search(
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
            await this._search(
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
            await this._search(
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
            await this._search(
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
            await this._search(
                hints,
                "any",
                this.searchPlaylists.bind(this),
                this.getAnyPlaylists.bind(this)
            )
        ).map((x) => x.toThing());
    }
}
