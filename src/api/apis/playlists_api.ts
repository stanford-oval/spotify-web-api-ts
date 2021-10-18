import { assertBounds } from "../../helpers";
import {
    PagingObject,
    PlaylistObject,
    PlaylistTrackObject,
    SimplifiedPlaylistObject,
} from "../objects";
import { PageOptions } from "../requests";
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

    create(
        user_id: string,
        name: string,
        options: {
            public?: boolean;
            collaborative?: boolean;
            description?: string;
        } = {}
    ): Promise<PlaylistObject> {
        return this._http.post(`/v1/users/${user_id}/playlists`, {
            name,
            ...options,
        });
    }

    getMy(
        options: PageOptions = {}
    ): Promise<PagingObject<SimplifiedPlaylistObject>> {
        if (options.limit !== undefined) {
            assertBounds("options.limit", options.limit, 1, 50);
        }
        if (options.offset !== undefined) {
            assertBounds("options.offset", options.offset, 0, 100000);
        }
        return this._http.get<PagingObject<SimplifiedPlaylistObject>>(
            "/v1/me/playlists",
            options
        );
    }

    add(
        id: string,
        uris: string | string[],
        options: {
            position?: number;
        } = {}
    ) {
        if (!Array.isArray(uris)) {
            uris = [uris];
        }
        return this._http.post<{ snapshot_id: string }>(
            `/v1/playlists/${id}/tracks`,
            { uris, ...options }
        );
    }
}
