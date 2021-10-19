import { BrowseOptions } from "../api/requests";
import CacheAlbum from "../cache/cache_album";
import CachePlaylist from "../cache/cache_playlist";
import ApiComponent from "./api_component";

export default class Browse extends ApiComponent {
    getFeaturedPlaylists(
        options: BrowseOptions = {}
    ): Promise<CachePlaylist[]> {
        return this._api.browse
            .getFeaturedPlaylists(options)
            .then((r) => this.augment.playlists(r.playlists.items));
    }

    getNewReleases(options: BrowseOptions = {}): Promise<CacheAlbum[]> {
        return this._api.browse
            .getNewReleases(options)
            .then((r) => this.augment.albums(r.items));
    }
}
