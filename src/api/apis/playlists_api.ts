import { PagingObject, PlaylistObject, PlaylistTrackObject } from "../objects";
import BaseApi from "./base_api";

export default class PlaylistsApi extends BaseApi {
    get(
        id: string,
        options: {
            market?: string;
            fields?: string;
            additional_types?: string | string[];
        } = {}
    ): Promise<PlaylistObject> {
        return this._http.get<PlaylistObject>(`/v1/playlists/${id}`, options);
    }

    getTracks(
        id: string,
        options: {
            market?: string;
            fields?: string;
            additional_types?: string | string[];
            limit?: number;
            offset?: number;
        } = {}
    ): Promise<PagingObject<PlaylistTrackObject>> {
        return this._http.get<PagingObject<PlaylistTrackObject>>(
            `/v1/playlists/${id}/tracks`,
            options
        );
    }
}
