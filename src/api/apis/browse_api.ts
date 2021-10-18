import { PagingObject, SimplifiedAlbumObject } from "../objects";
import { BrowseOptions } from "../requests";
import { FeaturedPlaylistsResponse } from "../responses";
import BaseApi from "./base_api";

export default class BrowseApi extends BaseApi {
    getFeaturedPlaylists(
        options: BrowseOptions = {}
    ): Promise<FeaturedPlaylistsResponse> {
        return this._http.get<FeaturedPlaylistsResponse>(
            "/v1/browse/featured-playlists",
            options
        );
    }

    getNewReleases(
        options: BrowseOptions = {}
    ): Promise<PagingObject<SimplifiedAlbumObject>> {
        return this._http
            .get<{ albums: PagingObject<SimplifiedAlbumObject> }>(
                "/v1/browse/new-releases",
                options
            )
            .then((r) => r.albums);
    }
}
