import { UserObject } from "../objects";
import BaseApi from "./base_api";

export default class UsersApi extends BaseApi {
    me(): Promise<UserObject> {
        return this._http.get<UserObject>("/me");
    }
}
