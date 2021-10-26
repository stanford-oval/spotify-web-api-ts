// Imports
// ===========================================================================
// Dependencies
// ---------------------------------------------------------------------------

import { Helpers } from "thingpedia";

// Package
// ---------------------------------------------------------------------------

import CacheTrack from "../cache/cache_track";
import Api from "../api";
import CacheAlbum from "../cache/cache_album";
import CacheArtist from "../cache/cache_artist";
import CacheEntity from "../cache/cache_entity";
import CachePlaylist from "../cache/cache_playlist";
import CacheShow from "../cache/cache_show";
import {
    assertUnreachable,
    RedisClient,
    sample,
    uriId,
    uriType,
} from "../helpers";
import Albums from "./components/albums";
import Artists from "./components/artists";
import Tracks from "./components/tracks";
import Augment from "./augment";
import Browse from "./components/browse";
import Follow from "./components/follow";
import Library from "./components/library";
import Personalization from "./components/personalization";
import Player from "./components/player";
import Playlists from "./components/playlists";
import Search from "./components/search";
import Shows from "./components/shows";
import Users from "./components/users";
import { PageOptions } from "../api/requests";

// Constants
// ===========================================================================

// const LOG = Logging.get(__filename);

// Class Definition
// ===========================================================================

export default class Client {
    // private static readonly log = LOG.childFor(Client);

    protected readonly _api: Api;
    protected readonly _redis: RedisClient;
    protected readonly _userId: string;

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
    public readonly users: Users;

    constructor({
        useOAuth2,
        redis,
        userId,
    }: {
        useOAuth2: Helpers.Http.HTTPRequestOptions["useOAuth2"];
        redis: RedisClient;
        userId: string;
    }) {
        this._api = new Api({ useOAuth2 });
        this._redis = redis;
        this._userId = userId;

        this.augment = new Augment(this._api);

        const apiComponentKwds = {
            api: this._api,
            augment: this.augment,
            redis: this._redis,
            userId: this._userId,
        };

        this.albums = new Albums(apiComponentKwds);
        this.artists = new Artists(apiComponentKwds);
        this.browse = new Browse(apiComponentKwds);
        this.follow = new Follow(apiComponentKwds);
        this.library = new Library(apiComponentKwds);
        this.personalization = new Personalization(apiComponentKwds);
        this.player = new Player(apiComponentKwds);
        this.playlists = new Playlists(apiComponentKwds);
        this.search = new Search(apiComponentKwds);
        this.shows = new Shows(apiComponentKwds);
        this.tracks = new Tracks(apiComponentKwds);
        this.users = new Users(apiComponentKwds);
    }

    // Instance Methods
    // =======================================================================
    //
    // Helper Methods
    // -----------------------------------------------------------------------

    // private get log(): Logger {
    //     return Client.log;
    // }

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

    // "Get Any" Instance Methods
    // -----------------------------------------------------------------------
    //
    // Used to serve empty queries for a specific playable type from Genie —
    // "play a X" sort of things.
    //

    getAnyArtists(options: PageOptions = {}): Promise<CacheArtist[]> {
        return this.personalization.getMyTopArtists(options);
    }

    getAnyTracks(options: PageOptions = {}): Promise<CacheTrack[]> {
        return this.personalization.getMyTopTracks(options);
    }

    getAnyAlbums(options: PageOptions = {}): Promise<CacheAlbum[]> {
        return this.browse.getNewReleases(options);
    }

    getAnyPlaylists(options: PageOptions = {}): Promise<CachePlaylist[]> {
        return this.browse.getFeaturedPlaylists(options);
    }

    getAnyShows(options: PageOptions = {}): Promise<CacheShow[]> {
        return this.search.shows({
            ...options,
            query: { year: new Date() },
        });
    }

    async getAnyShow(): Promise<CacheShow> {
        const top10Shows = await this.getAnyShows({ limit: 10 });
        return sample(top10Shows);
    }

    getAnyPlayable(): Promise<CacheEntity[]> {
        return this.getAnyTracks();
    }
}
