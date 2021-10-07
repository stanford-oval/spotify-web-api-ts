import {
    ArtistObject,
    CursorPagingObject,
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
