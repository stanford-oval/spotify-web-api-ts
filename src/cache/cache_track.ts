import { Value } from "thingpedia";
import {
    ArtistObject,
    AudioFeaturesObject,
    ExternalIdObject,
    ExternalUrlObject,
    LinkedTrackObject,
    SimplifiedAlbumObject,
    SimplifiedArtistObject,
    TrackObject,
    TrackRestrictionObject,
} from "../api/objects";
import { ThingTrack } from "../thing_types";
import CacheEntity from "./cache_entity";

export const DEFAULT_AUDIO_FEATURE = 50;

export default class CacheTrack extends CacheEntity implements TrackObject {
    // Properties
    // =======================================================================

    // TrackObject Properties
    // -----------------------------------------------------------------------

    type: "track";
    album: SimplifiedAlbumObject;
    artists: SimplifiedArtistObject[];
    available_markets: string[];
    disc_number: number; // int
    duration_ms: number; // int
    explicit?: boolean; // may be unknown
    external_ids: ExternalIdObject;
    external_urls: ExternalUrlObject;
    href: string;
    is_local: boolean;
    is_playable?: boolean; // relinking (when given market)
    linked_from?: LinkedTrackObject; // relinking (when given market)
    popularity: number; // int[0, 100]
    preview_url: string;
    restrictions?: TrackRestrictionObject;
    track_number: number; // int, inside disc_number

    // Additional Cached Properties
    // -----------------------------------------------------------------------

    /**
     * Genie consumes track genres, but genres are a property of artists, so
     * we cache that union.
     */
    genres: string[];

    /**
     * Genie consumes track audio features, which is an additional API hit, so
     * we cache them along with the track.
     */
    audio_features: undefined | null | AudioFeaturesObject;

    // Construction
    // =======================================================================

    constructor(
        track: TrackObject,
        artists: ArtistObject[],
        audioFeatures: undefined | null | AudioFeaturesObject
    ) {
        super(track.type, track.id, track.name, track.uri);
        this.type = track.type;
        this.album = track.album;
        this.artists = track.artists;
        this.available_markets = track.available_markets;
        this.disc_number = track.disc_number;
        this.duration_ms = track.duration_ms;
        this.explicit = track.explicit;
        this.external_ids = track.external_ids;
        this.external_urls = track.external_urls;
        this.href = track.href;
        this.is_local = track.is_local;
        this.is_playable = track.is_playable;
        this.linked_from = track.linked_from;
        this.popularity = track.popularity;
        this.preview_url = track.preview_url;
        this.restrictions = track.restrictions;
        this.track_number = track.track_number;
        const genres: Set<string> = new Set();
        for (let artist of artists) {
            for (let genre of artist.genres) {
                genres.add(genre);
            }
        }
        this.genres = Array.from(genres);
        this.audio_features = audioFeatures;
    }

    get energy(): number {
        if (!this.audio_features) {
            return DEFAULT_AUDIO_FEATURE;
        }
        return this.audio_features.energy * 100;
    }

    get danceability(): number {
        if (!this.audio_features) {
            return DEFAULT_AUDIO_FEATURE;
        }
        return this.audio_features.danceability * 100;
    }

    get artistEntities(): Value.Entity[] {
        return this.artists.map(
            (artist) => new Value.Entity(artist.uri, artist.name)
        );
    }

    get albumEntity(): Value.Entity {
        return new Value.Entity(this.album.uri, this.album.name);
    }

    get releaseDate(): Date {
        return new Date(this.album.release_date);
    }

    toThing(): ThingTrack {
        return {
            id: this.entity,
            artists: this.artistEntities,
            album: this.albumEntity,
            genres: this.genres,
            release_date: this.releaseDate,
            popularity: this.popularity,
            energy: this.energy,
            danceability: this.danceability,
        };
    }
}
