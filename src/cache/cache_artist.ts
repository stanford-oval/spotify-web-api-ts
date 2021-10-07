import { ArtistObject, FollowersObject, ImageObject } from "../api/objects";
import { ThingArtist } from "../thing_types";
import CacheEntity from "./cache_entity";

export default class CacheArtist extends CacheEntity implements ArtistObject {
    // Properties
    // =======================================================================

    // AlbumObject Properties
    // -----------------------------------------------------------------------
    type: "artist";
    external_urls: object;
    href: string;
    followers: FollowersObject;
    genres: string[];
    images: ImageObject[];
    popularity: number; // int[0, 100]

    // Construction
    // =======================================================================

    constructor(artist: ArtistObject) {
        super(artist.type, artist.id, artist.name, artist.uri);
        this.type = artist.type;
        this.external_urls = artist.external_urls;
        this.href = artist.href;
        this.followers = artist.followers;
        this.genres = artist.genres;
        this.images = artist.images;
        this.popularity = artist.popularity;
    }

    toThing(): ThingArtist {
        return {
            id: this.entity,
            genres: this.genres,
            popularity: this.popularity,
        };
    }
}
