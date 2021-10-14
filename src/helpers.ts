import { strict as assert } from "assert";

import { SimplifiedAlbumObject } from "./api/objects";
import { ThingPlayable } from "./thing_types";

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
