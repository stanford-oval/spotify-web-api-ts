import { PagingObject } from "./api/objects";
import { PageOptions } from "./api/requests";

export type PaginatorRequestFn<T> = (
    options: PageOptions
) => Promise<PagingObject<T>>;

export interface PaginatorSetup<T> {
    requestFn: PaginatorRequestFn<T>;
    pageSize: number;
    startPage: number;
    batchSize: number;
}

export default class Paginator<T> {
    public readonly requestFn: PaginatorRequestFn<T>;
    public readonly pageSize: number;
    public readonly startPage: number;
    // public readonly batchSize: number;

    private _nextPageNumber: number;
    private _total: undefined | number;
    // private _prefetch: Array<T[]>;

    constructor({
        requestFn,
        pageSize,
        startPage = 0,
        batchSize = 1,
    }: PaginatorSetup<T>) {
        this.requestFn = requestFn;
        this.pageSize = pageSize;
        this.startPage = startPage;
        // this.batchSize = batchSize;

        this._nextPageNumber = this.startPage;
        // this._prefetch = [];
    }

    get nextPageNumber(): number {
        return this._nextPageNumber;
    }

    async nextPage(): Promise<T[]> {
        // if (this._prefetch.length > 0) {
        //     this._nextPageNumber += 1;
        //     return
        // }
        const offset = this.pageSize * this._nextPageNumber;
        if (this._total !== undefined && offset > this._total) {
            throw new Error(`No more!`);
        }
        const options = {
            limit: this.pageSize,
            offset,
        };
        this._nextPageNumber += 1;
        const page = await this.requestFn(options);

        if (this._total === undefined) {
            this._total = page.total;
        }

        return page.items;
    }
}
