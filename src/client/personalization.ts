import CacheArtist from "../cache/cache_artist";
import CacheTrack from "../cache/cache_track";
import ApiComponent from "./api_component";

export default class Personalization extends ApiComponent {
    getMyTopArtists(): Promise<CacheArtist[]> {
        return this._api.personalization
            .getMyTopArtists()
            .then((r) => this.augment.artists(r.items));
    }

    getMyTopTracks(): Promise<CacheTrack[]> {
        return this._api.personalization
            .getMyTopTracks()
            .then((r) => this.augment.tracks(r.items));
    }
}
