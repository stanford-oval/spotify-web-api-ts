import CacheArtist from "../cache/cache_artist";
import { arrayFor } from "../helpers";
import ApiComponent from "./api_component";

export default class Follow extends ApiComponent {
    getMyArtists(
        options: {
            after?: string;
            limit?: number;
        } = {}
    ): Promise<CacheArtist[]> {
        return this._api.follow
            .getMyArtists()
            .then((page) => this.augment.artists(page.items));
    }

    putArtists(ids: string | string[]): Promise<void> {
        return this._api.follow.putArtists(arrayFor(ids));
    }
}
