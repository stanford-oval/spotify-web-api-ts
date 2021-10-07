import {
    CursorPagingObject,
    ExternalUrlObject,
    FollowersObject,
    ImageObject,
    PlaylistObject,
    PlaylistTrackObject,
    PublicUserObject,
} from "../api/objects";
import { ThingPlaylist } from "../thing_types";
import CacheEntity from "./cache_entity";

export default class CachePlaylist
    extends CacheEntity
    implements PlaylistObject
{
    // Properties
    // =======================================================================

    // PlaylistObject Properties
    // -----------------------------------------------------------------------
    type: "playlist";
    collaborative: boolean;
    description: null | string;
    external_urls: ExternalUrlObject;
    href: string;
    images: ImageObject[];
    owner: PublicUserObject;
    public: null | boolean;
    snapshot_id: string;
    followers: FollowersObject;
    tracks: CursorPagingObject<PlaylistTrackObject>;

    // Construction
    // =======================================================================

    constructor(playlist: PlaylistObject) {
        super(playlist.type, playlist.id, playlist.name, playlist.uri);
        this.type = playlist.type;
        this.collaborative = playlist.collaborative;
        this.description = playlist.description;
        this.external_urls = playlist.external_urls;
        this.href = playlist.href;
        this.images = playlist.images;
        this.owner = playlist.owner;
        this.public = playlist.public;
        this.snapshot_id = playlist.snapshot_id;
        this.followers = playlist.followers;
        this.tracks = playlist.tracks;
    }

    toThing(): ThingPlaylist {
        return {
            id: this.entity,
        };
    }
}
