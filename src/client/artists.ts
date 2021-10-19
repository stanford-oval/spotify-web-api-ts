import CacheArtist from "../cache/cache_artist";
import CacheTrack from "../cache/cache_track";
import ApiComponent from "./api_component";

export default class Artists extends ApiComponent {
    getAll(ids: string[]): Promise<CacheArtist[]> {
        return this._api.artists
            .getAll(ids)
            .then(this.augment.artists.bind(this.augment));
    }

    get(id: string): Promise<CacheArtist> {
        return this._api.artists
            .get(id)
            .then(this.augment.artist.bind(this.augment));
    }

    getTopTracks(id: string): Promise<CacheTrack[]> {
        return this._api.artists
            .getTopTracks(id)
            .then(this.augment.tracks.bind(this.augment));
    }

    getTopTrackURIs(id: string): Promise<string[]> {
        // TODO This can potentially be done more efficiently
        return this.getTopTracks(id).then((tracks) => tracks.map((t) => t.uri));
    }
}
