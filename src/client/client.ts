// Imports
// ===========================================================================
// Dependencies
// ---------------------------------------------------------------------------

import { Helpers } from "thingpedia";
import { RedisClientType } from "redis/dist/lib/client";

// Package
// ---------------------------------------------------------------------------

import CacheTrack from "../cache/cache_track";
import Api from "../api";
import CacheAlbum from "../cache/cache_album";
import CacheArtist from "../cache/cache_artist";
import CacheEntity, { DisplayFormatter } from "../cache/cache_entity";
import CachePlaylist from "../cache/cache_playlist";
import CacheShow from "../cache/cache_show";
import { assertUnreachable, sample, uriId, uriType } from "../helpers";
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
        displayFormatter,
        redis,
    }: {
        useOAuth2: Helpers.Http.HTTPRequestOptions["useOAuth2"];
        displayFormatter: DisplayFormatter;
        redis?: RedisClientType;
    }) {
        this._api = new Api({ useOAuth2 });

        this.augment = new Augment(this._api);

        this.albums = new Albums(this._api, this.augment);
        this.artists = new Artists(this._api, this.augment);
        this.browse = new Browse(this._api, this.augment);
        this.follow = new Follow(this._api, this.augment);
        this.library = new Library(this._api, this.augment);
        this.personalization = new Personalization(this._api, this.augment);
        this.player = new Player(this._api, this.augment);
        this.playlists = new Playlists(this._api, this.augment);
        this.search = new Search(this._api, this.augment);
        this.shows = new Shows(this._api, this.augment);
        this.tracks = new Tracks(this._api, this.augment);
        this.users = new Users(this._api, this.augment);
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
