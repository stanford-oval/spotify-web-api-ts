export interface CursorOptions {
    limit?: number;
    offset?: number;
}

export interface FeaturedPlaylistsOptions extends CursorOptions {
    country?: string;
    locale?: string;
    timestamp?: string | Date;
}

export interface UserSavedShowsOptions extends CursorOptions {}
