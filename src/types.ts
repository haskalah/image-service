import {Request} from "express";
import {IApiKey} from "imagelib";

export interface RequestWithApiKey extends Request {
    apiKey: IApiKey;
}
