import CacheAlbum from "../cache/cache_album";
import ApiComponent from "./api_component";

export default class Albums extends ApiComponent {
    get(id: string): Promise<CacheAlbum> {
        return this.api.albums
            .get(id, { market: "from_token" })
            .then(this.augment.album.bind(this.augment));
    }

    getAll(ids: string[]): Promise<CacheAlbum[]> {
        return this.api.albums
            .getAll(ids, { market: "from_token" })
            .then(this.augment.albums.bind(this.augment));
    }

    getTrackURIs(id: string): Promise<string[]> {
        return this.get(id).then((album) =>
            album.tracks.items.map((t) => t.uri)
        );
    }
}
