import {
    ArtistObject,
    CursorPagingObject,
    ExternalUrlObject,
    ShowObject,
    SimplifiedAlbumObject,
    SimplifiedEpisodeObject,
    SimplifiedPlaylistObject,
    SimplifiedShowObject,
    TrackObject,
} from "./objects";

export interface SearchResponse {
    albums?: CursorPagingObject<SimplifiedAlbumObject>;
    artists?: CursorPagingObject<ArtistObject>;
    episodes?: CursorPagingObject<SimplifiedEpisodeObject>;
    playlists?: CursorPagingObject<SimplifiedPlaylistObject>;
    shows?: CursorPagingObject<SimplifiedShowObject>;
    tracks?: CursorPagingObject<TrackObject>;
}

export interface FeaturedPlaylistsResponse {
    message: string;
    playlists: CursorPagingObject<SimplifiedPlaylistObject>;
}

export interface NewReleasesResponse {
    albums: CursorPagingObject<SimplifiedAlbumObject>;
}

export interface UserSavedShow {
    added_at: string;
    show: ShowObject;
}

export interface UserCurrentlyPlayingTrackResponse {
    context: {
        external_urls: ExternalUrlObject;
        href: string;
        type: string; // playlist, etc...
        uri: string;
    };
    timestamp: number;
    progress_ms: number;
    is_playing: boolean;
    item: TrackObject;
}
