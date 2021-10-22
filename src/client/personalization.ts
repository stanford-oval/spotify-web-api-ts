import { MyTopOptions } from "../api/requests";
import CacheArtist from "../cache/cache_artist";
import CacheTrack from "../cache/cache_track";
import ApiComponent from "./api_component";

export default class Personalization extends ApiComponent {
    getMyTopArtists(options: MyTopOptions = {}): Promise<CacheArtist[]> {
        return this._api.personalization
            .getMyTopArtists(options)
            .then((r) => this.augment.artists(r.items));
    }

    getMyTopTracks(options: MyTopOptions = {}): Promise<CacheTrack[]> {
        return this._api.personalization
            .getMyTopTracks(options)
            .then((r) => this.augment.tracks(r.items));
    }
}
