import { isSingularURI } from "../../helpers";
import {
    CurrentlyPlayingContextObject,
    CurrentlyPlayingObject,
    DeviceObject,
} from "../objects";
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

    play(
        device_id: string,
        uris: string | string[],
        options: {
            offset?: number;
            position_ms?: number;
        } = {}
    ): Promise<null> {
        const args: Record<string, any> = { device_id, ...options };
        if (Array.isArray(uris)) {
            args.uris = uris;
        } else if (isSingularURI(uris)) {
            args.uris = [uris];
        } else {
            args.context_uri = uris;
        }

        return this._http.put<null>("/v1/me/player/play", args);
    }

    addToQueue(deviceId: string, uri: string): Promise<null> {
        return this._http.request<null>({
            method: "POST",
            path: "/v1/me/player/queue",
            query: { device_id: deviceId, uri },
        });
    }
}
