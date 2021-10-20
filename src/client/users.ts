import { UserObject } from "../api/objects";
import ApiComponent from "./api_component";

export default class Users extends ApiComponent {
    me(): Promise<UserObject> {
        return this._api.users.me();
    }
}
