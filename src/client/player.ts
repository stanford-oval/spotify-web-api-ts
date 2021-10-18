import { CurrentlyPlayingContextObject, DeviceObject } from "../api/objects";
import CacheEpisode from "../cache/cache_episode";
import CacheTrack from "../cache/cache_track";
import { assertUnreachable } from "../helpers";
import ApiComponent from "./api_component";

export default class Player extends ApiComponent {
    async getCurrentlyPlaying(): Promise<null | CacheTrack | CacheEpisode> {
        const playing = await this.api.player.getCurrentlyPlaying({
            market: "from_token",
        });

        if (playing.item === null) {
            return null;
        } else if (playing.item.type === "track") {
            return this.augment.track(playing.item);
        } else if (playing.item.type === "episode") {
            return this.augment.episode(playing.item);
        } else {
            assertUnreachable();
        }
    }

    get(): Promise<CurrentlyPlayingContextObject> {
        return this.api.player.get();
    }

    getDevices(): Promise<DeviceObject[]> {
        return this.api.player.getDevices();
    }
}
