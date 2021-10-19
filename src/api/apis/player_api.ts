import { isSingularURI } from "../../helpers";
import {
    CurrentlyPlayingContextObject,
    CurrentlyPlayingObject,
    DeviceObject,
} from "../objects";
import { DeviceOptions } from "../requests";
import BaseApi from "./base_api";

export default class PlayerApi extends BaseApi {
    getCurrentlyPlaying(options: {
        market: string;
        additional_types?: string | string[];
    }): Promise<CurrentlyPlayingObject> {
        return this._http.get<CurrentlyPlayingObject>(
            "/v1/me/player/currently-playing",
            options
        );
    }

    get(
        options: {
            market?: string;
            additional_types?: string | string[];
        } = {}
    ): Promise<CurrentlyPlayingContextObject> {
        return this._http.get<CurrentlyPlayingContextObject>(
            "/v1/me/player",
            options
        );
    }

    getDevices(): Promise<DeviceObject[]> {
        return this._http.getList<DeviceObject>("/v1/me/player/devices");
    }

    play({
        device_id,
        uris,
        offset,
        position_ms,
    }: {
        device_id?: string;
        uris?: string | string[];
        offset?: number;
        position_ms?: number;
    } = {}): Promise<null> {
        let body: undefined | Record<string, any> = undefined;

        if (uris !== undefined) {
            body = {};
            if (Array.isArray(uris)) {
                body.uris = uris;
            } else if (isSingularURI(uris)) {
                body.uris = [uris];
            } else {
                body.context_uri = uris;
                if (offset !== undefined) {
                    body.offset = offset;
                }
                if (position_ms !== undefined) {
                    body.position_ms = position_ms;
                }
            }
        }

        return this._http.request<null>({
            method: "PUT",
            path: "/v1/me/player/play",
            query: { device_id },
            body,
        });
    }

    addToQueue(deviceId: string, uri: string): Promise<null> {
        return this._http.request<null>({
            method: "POST",
            path: "/v1/me/player/queue",
            query: { device_id: deviceId, uri },
        });
    }

    pause(options: DeviceOptions = {}): Promise<null> {
        return this._http.request<null>({
            method: "PUT",
            path: "/v1/me/player/pause",
            query: options,
        });
    }

    next(options: DeviceOptions = {}): Promise<null> {
        return this._http.request<null>({
            method: "POST",
            path: "/v1/me/player/next",
            query: options,
        });
    }

    previous(options: DeviceOptions = {}): Promise<null> {
        return this._http.request<null>({
            method: "POST",
            path: "/v1/me/player/previous",
            query: options,
        });
    }

    shuffle(
        state: boolean,
        options: { device_id?: string } = {}
    ): Promise<null> {
        return this._http.request<null>({
            method: "PUT",
            path: "/v1/me/player/shuffle",
            query: { state, ...options },
        });
    }

    repeat(
        state: "track" | "context" | "off",
        options: { device_id?: string } = {}
    ): Promise<null> {
        return this._http.request<null>({
            method: "PUT",
            path: "/v1/me/player/repeat",
            query: { state, ...options },
        });
    }
}
