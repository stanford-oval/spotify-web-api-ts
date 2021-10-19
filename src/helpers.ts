import { strict as assert } from "assert";
import { Value } from "thingpedia";

import { SimplifiedAlbumObject, SimplifiedEpisodeObject } from "./api/objects";
import { PageOptions } from "./api/requests";
import { ThingPlayable } from "./things";

// Helper Functions
// ===========================================================================

export type URIType =
    | "track"
    | "artist"
    | "album"
    | "playlist"
    | "show"
    | "episode";

export const URI_TYPES: URIType[] = [
    "track",
    "artist",
    "album",
    "playlist",
    "show",
    "episode",
];

export function uriType(uri: string): URIType {
    for (const type of URI_TYPES) {
        if (uri.startsWith(`spotify:${type}`)) {
            return type;
        }
    }
    throw new Error(`Not a recognized URI type: ${uri}`);
}

export function isSingularURI(uri: string): boolean {
    const type = uriType(uri);
    return type === "track" || type === "episode";
}

export function uriId(uri: string): string {
    const parts = uri.split(":");
    return parts[parts.length - 1];
}

export function* iterArtistIdsForAlbums(
    albums: SimplifiedAlbumObject[]
): Generator<string, void, void> {
    for (let album of albums) {
        for (let artist of album.artists) {
            yield artist.id;
        }
    }
}

export function artistIdsForAlbums(albums: SimplifiedAlbumObject[]): string[] {
    return Array.from(new Set(iterArtistIdsForAlbums(albums)));
}

/**
 * Attempts to tell if a `reason` that came through a promise rejection is due
 * to trying to [[JSON.parse]] the empty string, like:
 *
 *      > JSON.parse("")
 *      Uncaught SyntaxError: Unexpected end of JSON input
 *
 * We can't really be _sure_ that [[JSON.parse]] and the empty string are to
 * blame — there's likely other conditions that cause the same error — but it's
 * the best I think we can do.
 *
 * The whole reason this exists is because I noticed this late in the initial
 * implementation (2021-10-14), and [[Api.get]] currently does a cast to a
 * caller-provided response type `T`. There is no response inspection or
 * validation happening; we're looking the other way / being efficient.
 *
 * It would be a pain to switch [[Api.get]] to resolve `undefined|T` because I'd
 * have to go throw checks in all over the place.
 *
 * Also we _still_ wouldn't know the HTTP response code
 * ([[thingpedia.Helpers.Http]] does not expose the response code for `2xx`
 * statuses), and so would not be able to flag the `200` / `204` or whatever
 * differences, leading me to want to fix this all together at some later point.
 *
 * @param reason A promise rejection reason.
 * @returns `true` if the `reason` may have come from `JSON.parse("")`.
 */
export function isJSONParseEmptyInputError(reason: any): boolean {
    return (
        reason instanceof SyntaxError &&
        reason.message === "Unexpected end of JSON input"
    );
}

// Assertion Helper Functions
// ---------------------------------------------------------------------------

export function assertMin(name: string, value: number, min: number): void {
    assert(value >= min, `Expected ${name} ≥ ${min}, given ${name} = ${value}`);
}

export function assertMax(name: string, value: number, max: number): void {
    assert(value <= max, `Expected ${name} ≤ ${max}, given ${name} = ${value}`);
}

export function assertBounds(
    name: string,
    value: number,
    min: number,
    max: number
): void {
    assert(
        min <= value && value <= max,
        `Expected ${min} ≤ ${name} ≤ ${max}, given ${name} = ${value}`
    );
}

export function assertUnreachable(): never {
    assert(false, "Expected to be unreachable");
}

export function checkPageOptions(
    options: PageOptions,
    {
        min = 1,
        max = 50,
    }: {
        min?: number;
        max?: number;
    } = {}
): void {
    if (options.limit !== undefined) {
        assertBounds("options.limit", options.limit, min, max);
    }
    if (options.offset !== undefined) {
        assertMin("options.offset", options.offset, 0);
    }
}

export type IsFn<T> = (x: any) => x is T;

export function cast<T>(is: IsFn<T>, x: any, message?: string): T {
    if (is(x)) {
        return x;
    }
    if (message === undefined) {
        message = `Expected ${is.name} to return true`;
    }
    throw new TypeError(`message; given ${typeof x}: ${x}`);
}

export function isString(x: any): x is string {
    return typeof x === "string";
}

export function checkEntity(name: string, x: any): Value.Entity {
    if (typeof x === "object" && x instanceof Value.Entity) {
        return x;
    }
    throw new TypeError(
        `Expected ${name} to be an Entity, given ${typeof x}: ${x}`
    );
}

// Functions Copied/Adapted From Skill
// ---------------------------------------------------------------------------
//
// Used to be in `thingpedia-common-devices/main/com.spotify/index.js`, see
//
// https://github.com/stanford-oval/thingpedia-common-devices/blob/4c20248f87d000be1aef906d34b74a820aa03788/main/com.spotify/index.js
//

export function isUnfinished(episode: SimplifiedEpisodeObject): boolean {
    return !episode?.resume_point?.fully_played;
}

export function isTestMode(): boolean {
    return process.env.TEST_MODE === "1";
}

export function entityMatchScore(
    searchTerm: string,
    candidate: string
): number {
    if (searchTerm === candidate) return 1000;

    candidate = removeParenthesis(candidate);
    searchTerm = removeParenthesis(searchTerm);
    let searchTermTokens = searchTerm.split(" ");

    let score = 0;
    score -= 0.1 * editDistance(searchTerm, candidate);

    const candidateTokens = new Set(candidate.split(" "));

    for (let candidateToken of candidateTokens) {
        let found = false;
        for (let token of searchTermTokens) {
            if (
                token === candidateToken ||
                (editDistance(token, candidateToken) <= 1 && token.length > 1)
            ) {
                score += 10;
                found = true;
            } else if (candidateToken.startsWith(token)) {
                score += 0.5;
            }
        }

        // give a small boost to ignorable tokens that are missing
        // this offsets the char-level edit distance
        if (
            !found &&
            ["the", "hotel", "house", "restaurant"].includes(candidateToken)
        )
            score += 0.1 * candidateToken.length;
    }

    return score;
}

function removeParenthesis(str: string): string {
    return str.replace(/ \(.*?\)/g, "");
}

function extractSongName(str: string): string {
    str = removeParenthesis(str);
    str = str.split(" - ")[0];
    return str;
}

// removes duplicate remixes/editions
//
// TODO Fix this up
//
export function filterPlayables(playables: ThingPlayable[]): ThingPlayable[] {
    const names: Set<string> = new Set();
    const filteredPlayables = Array.from(
        new Set(playables.map((playable) => String(playable.id.display)))
    )
        .filter((name) => {
            if (!names.has(extractSongName(name))) {
                names.add(extractSongName(name));
                return true;
            }
            return false;
        })
        .map((name) => {
            return playables.find((playable) => playable.id.display === name);
        });
    return filteredPlayables as ThingPlayable[];
}

function editDistance(one: string, two: string): number {
    if (one === two) return 0;
    if (one.indexOf(two) >= 0) return one.length - two.length;
    if (two.indexOf(one) >= 0) return two.length - one.length;

    const R = one.length + 1;
    const C = two.length + 1;
    const matrix: number[] = new Array(R * C);

    function set(i: number, j: number, v: number) {
        // assert(i * C + j < R * C);
        matrix[i * C + j] = v;
    }

    function get(i: number, j: number): number {
        // assert(i * C + j < R * C);
        return matrix[i * C + j];
    }

    for (let j = 0; j < C; j++) set(0, j, j);
    for (let i = 1; i < R; i++) set(i, 0, i);
    for (let i = 1; i <= one.length; i++) {
        for (let j = 1; j <= two.length; j++) {
            if (one[i - 1] === two[j - 1]) set(i, j, get(i - 1, j - 1));
            else
                set(
                    i,
                    j,
                    1 +
                        Math.min(
                            Math.min(get(i - 1, j), get(i, j - 1)),
                            get(i - 1, j - 1)
                        )
                );
        }
    }

    return get(one.length, two.length);
}
