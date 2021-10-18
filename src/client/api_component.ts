import Api from "../api";
import Augment from "./augment";
import Component from "./component";

export default class ApiComponent extends Component {
    protected readonly augment: Augment;

    constructor(api: Api, augment: Augment) {
        super(api);
        this.augment = augment;
    }
}
