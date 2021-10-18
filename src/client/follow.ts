import CacheArtist from "../cache/cache_artist";
import ApiComponent from "./api_component";

export default class Follow extends ApiComponent {
    getMyArtists(
        options: {
            after?: string;
            limit?: number;
        } = {}
    ): Promise<CacheArtist[]> {
        return this.api.follow
            .getMyArtists()
            .then((page) => this.augment.artists(page.items));
    }
}
