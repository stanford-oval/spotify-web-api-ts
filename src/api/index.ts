import { URL, URLSearchParams } from "url";
import { strict as assert } from "assert";

import { HTTPError, HTTPRequestOptions } from "thingpedia/dist/helpers/http";

import {
    AlbumObject,
    ArtistObject,
    AudioFeaturesObject,
    CursorPagingObject,
    SimplifiedAlbumObject,
    SimplifiedShowObject,
    TrackObject,
} from "./objects";
import {
    FeaturedPlaylistsResponse,
    NewReleasesResponse,
    SearchResponse,
    UserCurrentlyPlayingTrackResponse,
    UserSavedShow,
} from "./responses";
import { SearchQuery, SearchQueryProps } from "./search_query";
import { Helpers } from "thingpedia";
import { ThingError } from "../thing_types";
import Logging from "../logging";
import { Logger } from "../logging/logger";
import { assertBounds } from "../helpers";
import { FeaturedPlaylistsOptions, UserSavedShowsOptions } from "./requests";

export type SearchKwds = {
    query: SearchQueryProps | SearchQuery;
    type: string | string[];
    market?: string;
    limit?: number;
    offset?: number;
    include_external?: string;
};

export type HTTPMethod = "GET" | "POST" | "PUT" | "DELETE";

const LOG = Logging.get(__filename);

export default class Api {
    private static readonly LOG = LOG.childFor(Api);

    static readonly DEFAULT_URL_BASE = "https://api.spotify.com";

    useOAuth2: HTTPRequestOptions["useOAuth2"];
    urlBase: string;

    constructor({
        useOAuth2,
        urlBase = Api.DEFAULT_URL_BASE,
    }: {
        useOAuth2: HTTPRequestOptions["useOAuth2"];
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

    private handleHTTPError(error: HTTPError): never {
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
        if (reason instanceof HTTPError) {
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

        const options: HTTPRequestOptions = {
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
    ): Promise<CursorPagingObject<SimplifiedAlbumObject>> {
        return this.get<CursorPagingObject<SimplifiedAlbumObject>>(
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
        options: FeaturedPlaylistsOptions = {}
    ): Promise<FeaturedPlaylistsResponse> {
        return this.get<FeaturedPlaylistsResponse>(
            "/v1/browse/featured-playlists",
            options
        );
    }

    getNewReleases(
        options: {
            country?: string;
            limit?: number;
            offset?: number;
        } = {}
    ): Promise<NewReleasesResponse> {
        return this.get<NewReleasesResponse>(
            "/v1/browse/new-releases",
            options
        );
    }

    // ### Library API ###

    getUserSavedShows(
        options: UserSavedShowsOptions = {}
    ): Promise<CursorPagingObject<UserSavedShow>> {
        return this.get<CursorPagingObject<UserSavedShow>>(
            "/v1/me/shows",
            options
        );
    }

    // ### Personalization ###

    getUserTopArtists(
        options: {
            time_range?: "long_term" | "medium_term" | "short_term";
            limit?: number;
            offset?: number;
        } = {}
    ): Promise<CursorPagingObject<ArtistObject>> {
        if (options.limit !== undefined) {
            assertBounds("options.limit", options.limit, 1, 50);
        }
        return this.get<CursorPagingObject<ArtistObject>>(
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
    ): Promise<CursorPagingObject<TrackObject>> {
        if (options.limit !== undefined) {
            assertBounds("options.limit", options.limit, 1, 50);
        }
        return this.get<CursorPagingObject<TrackObject>>(
            "/v1/me/top/tracks",
            options
        );
    }

    // ### Player API ###

    getUserCurrentlyPlayingTrack(options: {
        market: string;
        additional_types?: string | string[];
    }): Promise<UserCurrentlyPlayingTrackResponse> {
        return this.get<UserCurrentlyPlayingTrackResponse>(
            "/v1/me/player/currently-playing",
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
        assert(ids.length <= 50, `Limit 50 ids, given ${ids.length}.`);
        return this.getList<SimplifiedShowObject>("/v1/shows", {
            ids,
            ...options,
        });
    }

    // ### Tracks API ###

    getAudioFeatures(trackIds: string[]): Promise<AudioFeaturesObject[]> {
        assert(
            trackIds.length <= 100,
            `Limit 100 ids, given ${trackIds.length}.`
        );
        return this.getList<AudioFeaturesObject>("/v1/audio-features", {
            ids: trackIds,
        });
    }
}
