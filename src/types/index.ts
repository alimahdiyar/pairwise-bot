import {Context, NarrowedContext} from "telegraf";
import {Message, Update} from "telegraf/typings/core/types/typegram";

export interface SessionData {
  token?: string
  cid?: string
  privateKey: string
}
export interface TelegrafContext extends Context {
  session?: SessionData;
}

export type CtxType = NarrowedContext<TelegrafContext,  Update.MessageUpdate<Message>>
