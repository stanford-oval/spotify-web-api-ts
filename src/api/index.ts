import { HTTPRequestOptions } from "thingpedia/dist/helpers/http";
import { ArtistObject, AudioFeaturesObject } from "./objects";
import { SearchResponse } from "./responses";
import { SearchQuery, SearchQueryProps } from "./search_query";

export type SearchKwds = {
    query: SearchQueryProps | SearchQuery;
    market?: string;
    limit?: number;
    offset?: number;
    include_external?: string;
};

export default class Api {
    useOAuth2: HTTPRequestOptions["useOAuth2"];

    constructor(useOAuth2: HTTPRequestOptions["useOAuth2"]) {
        this.useOAuth2 = useOAuth2;
    }

    async getArtists(ids: string[]): Promise<ArtistObject[]> {
        throw new Error(`Not Implemented`);
    }

    async getAudioFeatures(trackIds: string[]): Promise<AudioFeaturesObject[]> {
        throw new Error(`Not Implemented`);
    }

    async search({
        query,
        market = "from_token",
        limit,
        offset,
        include_external,
    }: SearchKwds): Promise<SearchResponse> {
        throw new Error(`Not Implemented`);
    }
}
