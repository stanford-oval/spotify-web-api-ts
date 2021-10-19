import { SearchKwds } from "../api/apis/search_api";
import CacheAlbum from "../cache/cache_album";
import CacheArtist from "../cache/cache_artist";
import CachePlaylist from "../cache/cache_playlist";
import CacheShow from "../cache/cache_show";
import CacheTrack from "../cache/cache_track";
import ApiComponent from "./api_component";

export type CachePlayable = CacheTrack | CacheAlbum | CachePlaylist | CacheShow;

export default class Search extends ApiComponent {
    async artists(kwds: Omit<SearchKwds, "type">): Promise<CacheArtist[]> {
        const response = await this._api.search.search({
            type: "artist",
            market: "from_token",
            ...kwds,
        });
        if (response.artists) {
            return await this.augment.artists(response.artists.items);
        }
        return [];
    }

    async albums(kwds: Omit<SearchKwds, "type">): Promise<CacheAlbum[]> {
        const response = await this._api.search.search({
            type: "album",
            market: "from_token",
            ...kwds,
        });
        if (response.albums) {
            return await this.augment.albums(response.albums.items);
        }
        return [];
    }

    async tracks(kwds: Omit<SearchKwds, "type">): Promise<CacheTrack[]> {
        const response = await this._api.search.search({
            type: "track",
            market: "from_token",
            ...kwds,
        });
        if (response.tracks) {
            return await this.augment.tracks(response.tracks.items);
        }
        return [];
    }

    async shows(kwds: Omit<SearchKwds, "type">): Promise<CacheShow[]> {
        const response = await this._api.search.search({
            type: "show",
            market: "from_token",
            ...kwds,
        });
        if (response.shows) {
            return await this.augment.shows(response.shows.items);
        }
        return [];
    }

    async playlists(kwds: Omit<SearchKwds, "type">): Promise<CachePlaylist[]> {
        const response = await this._api.search.search({
            type: "playlist",
            market: "from_token",
            ...kwds,
        });
        if (response.playlists) {
            return await this.augment.playlists(response.playlists.items);
        }
        return [];
    }

    async playables({
        query,
        market = "from_token",
        limit,
        offset,
        include_external,
    }: Omit<SearchKwds, "type">): Promise<CachePlayable[]> {
        const results = await this._api.search.search({
            query,
            type: "track,album,playlist,show",
            market,
            limit,
            offset,
            include_external,
        });

        const promises: Promise<CachePlayable[]>[] = [];

        if (results.tracks && results.tracks.total > 0) {
            promises.push(this.augment.tracks(results.tracks.items));
        }

        if (results.albums && results.albums.total > 0) {
            promises.push(this.augment.albums(results.albums.items));
        }

        if (results.playlists && results.playlists.total > 0) {
            promises.push(this.augment.playlists(results.playlists.items));
        }

        if (results.shows && results.shows.total > 0) {
            promises.push(this.augment.shows(results.shows.items));
        }

        const lists = await Promise.all(promises);

        const playables: CachePlayable[] = [];
        for (const list of lists) {
            for (const playable of list) {
                playables.push(playable);
            }
        }

        return playables;
    }
}
