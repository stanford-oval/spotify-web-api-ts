// Imports
// ===========================================================================
// Standard Library
// ---------------------------------------------------------------------------

import { URL, URLSearchParams } from "url";
import { strict as assert } from "assert";

// Dependencies
// ---------------------------------------------------------------------------

import { Helpers } from "thingpedia";

// Package
// ---------------------------------------------------------------------------

import {
    AlbumObject,
    ArtistObject,
    AudioFeaturesObject,
    CurrentlyPlayingContextObject,
    CurrentlyPlayingObject,
    PagingObject,
    DeviceObject,
    SimplifiedAlbumObject,
    SimplifiedShowObject,
    TrackObject,
    SimplifiedEpisodeObject,
    PlaylistObject,
    PlaylistTrackObject,
} from "./objects";
import {
    FeaturedPlaylistsResponse,
    SearchResponse,
    UserSavedAlbum,
    UserSavedShow,
    UserSavedTrack,
} from "./responses";
import { SearchQuery, SearchQueryProps } from "./search_query";
import { ThingError } from "../things";
import Logging from "../logging";
import { Logger } from "../logging/logger";
import {
    assertBounds,
    assertMax,
    checkPageOptions,
    isSingularURI,
} from "../helpers";
import { BrowseOptions, MarketPageOptions, PageOptions } from "./requests";

// Constants
// ===========================================================================

const LOG = Logging.get(__filename);

// Types
// ===========================================================================

export type SearchKwds = {
    query: SearchQueryProps | SearchQuery;
    type: string | string[];
    market?: string;
    limit?: number;
    offset?: number;
    include_external?: string;
};

export type HTTPMethod = "GET" | "POST" | "PUT" | "DELETE";

// Class Definition
// ===========================================================================
export default class Api {
    private static readonly LOG = LOG.childFor(Api);

    static readonly DEFAULT_URL_BASE = "https://api.spotify.com";

    useOAuth2: Helpers.Http.HTTPRequestOptions["useOAuth2"];
    urlBase: string;

    constructor({
        useOAuth2,
        urlBase = Api.DEFAULT_URL_BASE,
    }: {
        useOAuth2: Helpers.Http.HTTPRequestOptions["useOAuth2"];
        urlBase?: string;
    }) {
        this.useOAuth2 = useOAuth2;
        this.urlBase = urlBase;
    }

    makeURL(path: string, query?: Record<string, any>): URL {
        const url = new URL(path, this.urlBase);
        if (query !== undefined) {
            const searchQueryObj: Record<string, string> = {};
            for (const [key, value] of Object.entries(query)) {
                if (value !== undefined && value !== null) {
                    if (value instanceof Date) {
                        searchQueryObj[key] = value.toISOString();
                    } else {
                        searchQueryObj[key] = value.toString();
                    }
                }
            }
            url.search = new URLSearchParams(searchQueryObj).toString();
        }
        return url;
    }

    private get log(): Logger {
        return Api.LOG;
    }

    private handleHTTPError(error: Helpers.Http.HTTPError): never {
        switch (error.code) {
            case 429:
                throw new ThingError(`Too many requests`, "rate_limit_error");
            default:
                if (!error.detail) throw error;
                let detail: any = undefined;
                try {
                    detail = JSON.parse(error.detail);
                } catch (parseError) {}
                const message = detail?.error?.message;
                if (message) {
                    throw new ThingError(
                        message.toString(),
                        `http_${error.code}`
                    );
                } else {
                    throw new ThingError(
                        `HTTP ${error.code} Error`,
                        `http_${error.code}`
                    );
                }
        }
    }

    private handleHTTPFailure(reason: any): never {
        if (reason instanceof Helpers.Http.HTTPError) {
            this.handleHTTPError(reason);
        }
        throw new Error(`Unknown HTTP Error, reason: ${reason}`);
    }

    async request<TResponse = any>({
        method,
        path,
        query,
        body,
    }: {
        method: HTTPMethod;
        path: string;
        query?: Record<string, any>;
        body?: Record<string, any>;
    }): Promise<TResponse> {
        const log = this.log.childFor(this.request, {
            method,
            path,
            query,
            body,
        });
        const url = this.makeURL(path, query);

        const options: Helpers.Http.HTTPRequestOptions = {
            useOAuth2: this.useOAuth2,
            accept: "application/json",
        };

        let encodedBody: null | string = null;
        if (body !== undefined) {
            options.dataContentType = "application/json";
            try {
                encodedBody = JSON.stringify(body);
            } catch (error: any) {
                log.error("Failed to JSON encode request body --", error);
                throw error;
            }
        }

        let response: string;
        const timer = log.startTimer();

        try {
            response = await Helpers.Http.request(
                url.href,
                method,
                encodedBody,
                options
            );
        } catch (reason: any) {
            const status = reason?.code || 600; // 600 means ???
            timer.done({ level: "http", status });
            this.handleHTTPFailure(reason);
        }

        timer.done({ level: "http" });

        if (!response) {
            return null as any as TResponse;
        }

        try {
            return JSON.parse(response) as TResponse;
        } catch (error: any) {
            log.error("Failed to JSON parse response --", error);
            throw error;
        }
    }

    get<TResponse = any>(
        path: string,
        query?: Record<string, any>
    ): Promise<TResponse> {
        return this.request<TResponse>({ method: "GET", path, query });
    }

    /**
     * Make a GET request that returns a "list response" -- an object with a
     * _single_ key that's value is the array of results -- and automatically
     * extract that array of results.
     *
     * The "list response" is a common response pattern; things like:
     *
     *      {artists: ArtistObject[]}
     *      {audio_features: AudioFeatureObject[]}
     *
     * It works by typing the "list response" as `Record<string, TItem[]>`, then
     * returning the value of the first key.
     *
     * @param path
     * @param query
     * @returns
     */
    getList<TItem>(
        path: string,
        query?: Record<string, any>
    ): Promise<TItem[]> {
        return this.get<Record<string, TItem[]>>(path, query).then((r) => {
            return r[Object.keys(r)[0]];
        });
    }

    post<TResponse = any>(
        path: string,
        body: Record<string, any>
    ): Promise<TResponse> {
        return this.request<TResponse>({ method: "POST", path, body });
    }

    put<TResponse = any>(
        path: string,
        body: Record<string, any>
    ): Promise<TResponse> {
        return this.request<TResponse>({ method: "PUT", path, body });
    }

    // API Methods
    // -----------------------------------------------------------------------

    // ### Albums API ###

    getAlbums(
        ids: string[],
        options: { market?: string } = {}
    ): Promise<AlbumObject[]> {
        assert(ids.length <= 20, `Limit 20 ids, given ${ids.length}.`);
        return this.getList<AlbumObject>("/v1/albums", { ids, ...options });
    }

    getAlbum(
        id: string,
        options: { market?: string } = {}
    ): Promise<AlbumObject> {
        return this.get<AlbumObject>(`/v1/albums/${id}`, options);
    }

    // ### Artists API ###

    /**
     * Get a single artist by ID.
     *
     * @see https://developer.spotify.com/documentation/web-api/reference/#category-artists
     * @see https://developer.spotify.com/console/get-artist/
     *
     * @param id Artist ID.
     * @returns Artist object.
     */
    getArtist(id: string): Promise<ArtistObject> {
        return this.get<ArtistObject>(`/v1/artists/${id}`);
    }

    /**
     * Get multiple artists by their IDs.
     *
     * @see https://developer.spotify.com/documentation/web-api/reference/#category-artists
     * @see https://developer.spotify.com/console/get-several-artists/
     *
     * @param ids Array of artist IDs. Limit 50. Not de-duped.
     * @returns Array of artist objects corresponding to the `ids`.
     */
    getArtists(ids: string[]): Promise<ArtistObject[]> {
        assert(ids.length <= 50, `Limit 50 ids, given ${ids.length}.`);
        if (ids.length === 0) {
            return Promise.resolve([]);
        }
        return this.getList<ArtistObject>("/v1/artists", { ids });
    }

    getArtistAlbums(
        id: string,
        options: {
            include_groups?: Array<
                "album" | "single" | "appears_on" | "compilation"
            >;
            market?: string;
            limit?: number;
            offset?: number;
        } = {}
    ): Promise<PagingObject<SimplifiedAlbumObject>> {
        return this.get<PagingObject<SimplifiedAlbumObject>>(
            `/v1/artists/${id}/albums`,
            options
        );
    }

    getArtistTopTracks(
        id: string,
        options: { market?: string } = {}
    ): Promise<TrackObject[]> {
        return this.getList<TrackObject>(
            `/v1/artists/${id}/top-tracks`,
            options
        );
    }

    getArtistRelatedArtists(id: string): Promise<ArtistObject[]> {
        return this.getList<ArtistObject>(`/v1/artists/${id}/related-artists`);
    }

    // ### Browse API ###

    getFeaturedPlaylists(
        options: BrowseOptions = {}
    ): Promise<FeaturedPlaylistsResponse> {
        return this.get<FeaturedPlaylistsResponse>(
            "/v1/browse/featured-playlists",
            options
        );
    }

    getNewReleases(
        options: BrowseOptions = {}
    ): Promise<PagingObject<SimplifiedAlbumObject>> {
        return this.get<{ albums: PagingObject<SimplifiedAlbumObject> }>(
            "/v1/browse/new-releases",
            options
        ).then((r) => r.albums);
    }

    // ### Follow API ########################################################

    getMyFollowedArtists(
        options: {
            after?: string;
            limit?: number;
        } = {}
    ): Promise<PagingObject<ArtistObject>> {
        return this.get<{ artists: PagingObject<ArtistObject> }>(
            "/v1/me/following",
            options
        ).then(({ artists }) => artists);
    }

    // ### Library API ###

    getUserSavedShows(
        options: PageOptions = {}
    ): Promise<PagingObject<UserSavedShow>> {
        return this.get<PagingObject<UserSavedShow>>("/v1/me/shows", options);
    }

    getUserSavedTracks(
        options: PageOptions = {}
    ): Promise<PagingObject<UserSavedTrack>> {
        return this.get<PagingObject<UserSavedTrack>>("/v1/me/tracks", options);
    }

    getUserSavedAlbums(
        options: PageOptions = {}
    ): Promise<PagingObject<UserSavedAlbum>> {
        return this.get<PagingObject<UserSavedAlbum>>("/v1/me/albums", options);
    }

    // ### Personalization ###

    getUserTopArtists(
        options: {
            time_range?: "long_term" | "medium_term" | "short_term";
            limit?: number;
            offset?: number;
        } = {}
    ): Promise<PagingObject<ArtistObject>> {
        if (options.limit !== undefined) {
            assertBounds("options.limit", options.limit, 1, 50);
        }
        return this.get<PagingObject<ArtistObject>>(
            "/v1/me/top/artists",
            options
        );
    }

    getUserTopTracks(
        options: {
            time_range?: "long_term" | "medium_term" | "short_term";
            limit?: number;
            offset?: number;
        } = {}
    ): Promise<PagingObject<TrackObject>> {
        if (options.limit !== undefined) {
            assertBounds("options.limit", options.limit, 1, 50);
        }
        return this.get<PagingObject<TrackObject>>(
            "/v1/me/top/tracks",
            options
        );
    }

    // ### Player API ###

    getCurrentlyPlaying(options: {
        market: string;
        additional_types?: string | string[];
    }): Promise<CurrentlyPlayingObject> {
        return this.get<CurrentlyPlayingObject>(
            "/v1/me/player/currently-playing",
            options
        );
    }

    getPlayer(
        options: {
            market?: string;
            additional_types?: string | string[];
        } = {}
    ): Promise<CurrentlyPlayingContextObject> {
        return this.get<CurrentlyPlayingContextObject>(
            "/v1/me/player",
            options
        );
    }

    getPlayerDevices(): Promise<DeviceObject[]> {
        return this.getList<DeviceObject>("/v1/me/player/devices");
    }

    play(
        device_id: string,
        uris: string | string[],
        options: {
            offset?: number;
            position_ms?: number;
        } = {}
    ): Promise<null> {
        const args: Record<string, any> = { device_id, ...options };
        if (Array.isArray(uris)) {
            args.uris = uris;
        } else if (isSingularURI(uris)) {
            args.uris = [uris];
        } else {
            args.context_uri = uris;
        }

        return this.put<null>("/v1/me/player/play", args);
    }

    addToQueue(deviceId: string, uri: string): Promise<null> {
        return this.request<null>({
            method: "POST",
            path: "/v1/me/player/queue",
            query: { device_id: deviceId, uri },
        });
    }

    // ### Playlist API ###

    getPlaylist(
        id: string,
        options: {
            market?: string;
            fields?: string;
            additional_types?: string | string[];
        } = {}
    ): Promise<PlaylistObject> {
        return this.get<PlaylistObject>(`/v1/playlists/${id}`, options);
    }

    getPlaylistTracks(
        id: string,
        options: {
            market?: string;
            fields?: string;
            additional_types?: string | string[];
            limit?: number;
            offset?: number;
        } = {}
    ): Promise<PagingObject<PlaylistTrackObject>> {
        return this.get<PagingObject<PlaylistTrackObject>>(
            `/v1/playlists/${id}/tracks`,
            options
        );
    }

    // ### Search API ###

    search(kwds: SearchKwds): Promise<SearchResponse> {
        kwds.query = SearchQuery.from(kwds.query);
        return this.get<SearchResponse>("/v1/search", kwds);
    }

    // ### Shows API ###

    getShows(
        ids: string[],
        options: { market?: string } = {}
    ): Promise<SimplifiedShowObject[]> {
        assertMax("ids.length", ids.length, 50);
        return this.getList<SimplifiedShowObject>("/v1/shows", {
            ids,
            ...options,
        });
    }

    getShowEpisodes(
        showId: string,
        options: MarketPageOptions = {}
    ): Promise<PagingObject<SimplifiedEpisodeObject>> {
        checkPageOptions(options);
        return this.get<PagingObject<SimplifiedEpisodeObject>>(
            `/v1/shows/${showId}/episodes`,
            options
        );
    }

    // ### Tracks API ###

    getAudioFeatures(trackIds: string[]): Promise<AudioFeaturesObject[]> {
        assertMax("trackIds.length", trackIds.length, 100);
        return this.getList<AudioFeaturesObject>("/v1/audio-features", {
            ids: trackIds,
        });
    }
}
