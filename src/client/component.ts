import Api from "../api";

export default class Component {
    protected readonly _api: Api;

    constructor(api: Api) {
        this._api = api;
    }
}
