import CacheAlbum from "../cache/cache_album";
import CacheShow from "../cache/cache_show";
import CacheTrack from "../cache/cache_track";
import ApiComponent from "./api_component";

export default class Library extends ApiComponent {
    getShows(): Promise<CacheShow[]> {
        return this.api.library
            .getShows({ limit: 50 })
            .then((r) =>
                this.augment.shows(r.items.map((entry) => entry.show))
            );
    }

    getTracks(): Promise<CacheTrack[]> {
        return this.api.library
            .getTracks({ limit: 50 })
            .then((page) =>
                this.augment.tracks(page.items.map((x) => x.track))
            );
    }

    getAlbums(): Promise<CacheAlbum[]> {
        return this.api.library
            .getAlbums({ limit: 50 })
            .then((page) =>
                this.augment.albums(page.items.map((x) => x.album))
            );
    }
}