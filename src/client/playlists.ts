import { PagingObject, PlaylistTrackObject } from "../api/objects";
import CachePlaylist from "../cache/cache_playlist";
import ApiComponent from "./api_component";

export default class Playlists extends ApiComponent {
    get(id: string): Promise<CachePlaylist> {
        return this.api.playlists
            .get(id, { market: "from_token" })
            .then(this.augment.playlist.bind(this.augment));
    }

    getTracks(id: string): Promise<PagingObject<PlaylistTrackObject>> {
        return this.api.playlists.getTracks(id, { market: "from_token" });
    }

    getPlaylistTrackURIs(id: string): Promise<string[]> {
        return this.getTracks(id).then((page) =>
            page.items.map((t) => t.track.uri)
        );
    }
}
