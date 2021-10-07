import { Value } from "thingpedia";

export interface ThingTrack {
    id: Value.Entity;
    artists: Value.Entity[];
    album: Value.Entity;
    genres: string[];
    release_date: Date;
    popularity: number; // int [0, 100]
    energy: number; // int [0, 100]
    danceability: number; // int [0, 100]
}

export interface ThingArtist {
    id: Value.Entity;
    genres: string[];
    popularity: number; // int[0, 100]
}

export interface ThingAlbum {
    id: Value.Entity;
    artists: Value.Entity[];
    release_date: Date;
    popularity: number; // int[0, 100]
    genres: string[];
}

export interface ThingPlaylist {
    id: Value.Entity;
}

export interface ThingShow {
    id: Value.Entity;
}

export type ThingPlayable =
    | ThingTrack
    | ThingArtist
    | ThingAlbum
    | ThingPlaylist
    | ThingShow;
