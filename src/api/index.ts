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

// import Logging from "../logging";
// import { Logger } from "../logging/logger";
import AlbumsApi from "./apis/albums_api";
import Http from "./http";
import ArtistsApi from "./apis/artists_api";
import BrowseApi from "./apis/browse_api";
import FollowApi from "./apis/follow_api";
import LibraryApi from "./apis/library_api";
import PersonalizationApi from "./apis/personalization_api";
import PlayerApi from "./apis/player_api";
import PlaylistsApi from "./apis/playlists_api";
import SearchApi from "./apis/search_api";
import ShowsApi from "./apis/shows_api";
import TracksApi from "./apis/tracks_api";

// Constants
// ===========================================================================

// const LOG = Logging.get(__filename);

// Class Definition
// ===========================================================================
export default class Api {
    // private static readonly LOG = LOG.childFor(Api);

    static readonly DEFAULT_URL_BASE = "https://api.spotify.com";

    public readonly http: Http;
    public readonly albums: AlbumsApi;
    public readonly artists: ArtistsApi;
    public readonly browse: BrowseApi;
    public readonly follow: FollowApi;
    public readonly library: LibraryApi;
    public readonly personalization: PersonalizationApi;
    public readonly player: PlayerApi;
    public readonly playlists: PlaylistsApi;
    public readonly search: SearchApi;
    public readonly shows: ShowsApi;
    public readonly tracks: TracksApi;

    constructor({
        useOAuth2,
        urlBase = Api.DEFAULT_URL_BASE,
    }: {
        useOAuth2: Helpers.Http.HTTPRequestOptions["useOAuth2"];
        urlBase?: string;
    }) {
        this.http = new Http({ useOAuth2, urlBase });
        this.albums = new AlbumsApi(this.http);
        this.artists = new ArtistsApi(this.http);
        this.browse = new BrowseApi(this.http);
        this.follow = new FollowApi(this.http);
        this.library = new LibraryApi(this.http);
        this.personalization = new PersonalizationApi(this.http);
        this.player = new PlayerApi(this.http);
        this.playlists = new PlaylistsApi(this.http);
        this.search = new SearchApi(this.http);
        this.shows = new ShowsApi(this.http);
        this.tracks = new TracksApi(this.http);
    }

    // private get log(): Logger {
    //     return Api.LOG;
    // }
}
