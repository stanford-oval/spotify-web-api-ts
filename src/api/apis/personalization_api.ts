import { assertBounds } from "../../helpers";
import { ArtistObject, PagingObject, TrackObject } from "../objects";
import BaseApi from "./base_api";

export default class PersonalizationApi extends BaseApi {
    getMyTopArtists(
        options: {
            time_range?: "long_term" | "medium_term" | "short_term";
            limit?: number;
            offset?: number;
        } = {}
    ): Promise<PagingObject<ArtistObject>> {
        if (options.limit !== undefined) {
            assertBounds("options.limit", options.limit, 1, 50);
        }
        return this._http.get<PagingObject<ArtistObject>>(
            "/v1/me/top/artists",
            options
        );
    }

    getMyTopTracks(
        options: {
            time_range?: "long_term" | "medium_term" | "short_term";
            limit?: number;
            offset?: number;
        } = {}
    ): Promise<PagingObject<TrackObject>> {
        if (options.limit !== undefined) {
            assertBounds("options.limit", options.limit, 1, 50);
        }
        return this._http.get<PagingObject<TrackObject>>(
            "/v1/me/top/tracks",
            options
        );
    }
}
