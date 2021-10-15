export interface PageOptions {
    limit?: number;
    offset?: number;
}

export interface MarketPageOptions extends PageOptions {
    market?: string;
}

export interface BrowseOptions extends PageOptions {
    country?: string;
    locale?: string;
    timestamp?: string | Date;
}
