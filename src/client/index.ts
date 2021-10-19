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
import CacheEntity from "../cache/cache_entity";
import CachePlaylist from "../cache/cache_playlist";
import CacheShow from "../cache/cache_show";
import { assertUnreachable, uriId, uriType } from "../helpers";
// import Logging from "../logging";
// import { Logger } from "../logging/logger";
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

// const LOG = Logging.get(__filename);

// Class Definition
// ===========================================================================
export default class Client {
    // private static readonly log = LOG.childFor(Client);

    public readonly api: Api;

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
        useOAuth2,
        redis,
    }: {
        useOAuth2: Helpers.Http.HTTPRequestOptions["useOAuth2"];
        redis?: RedisClientType;
    }) {
        this.api = new Api({ useOAuth2 });

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
}
