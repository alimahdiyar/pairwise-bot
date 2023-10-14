import {CtxType, TelegrafContext} from "./types";
import {session, Telegraf} from "telegraf";
import Web3 from 'web3';
import {SiweMessage} from "siwe";
import axios from 'axios'

require('dotenv').config();

const BOT_API_TOKEN = process.env.BOT_API_TOKEN
if (!BOT_API_TOKEN) {
  throw new Error("BOT_API_TOKEN not provided");
}
const bot = new Telegraf<TelegrafContext>(BOT_API_TOKEN);

bot.use(session());

const web3 = new Web3('https://mainnet.optimism.io');

export const axiosInstance = axios.create({
  baseURL: 'https://backend.pairwise.vote',
  headers: {
    'Content-type': 'application/json',
  },
})
const fetchNonce = async () => {
  try {
    const { data } = await axiosInstance.get<string>('/auth/nonce')
    return data
  } catch (err) {
    console.error(err)
  }
}
async function handleMessage(ctx: CtxType) {
  ctx.session = ctx.session ?? {
    privateKey: web3.eth.accounts.create().privateKey
  }
  // @ts-ignore
  let text: string | null = ctx.message?.text || ctx.match?.[0] || null;
  if (!text) return
  const { privateKey } = ctx.session
  const account = web3.eth.accounts.privateKeyToAccount(privateKey);
  const { address } = account
  const nonce = await fetchNonce();

  const message = new SiweMessage({
    domain: "www.pairwise.vote",
    address,
    statement: 'Sign in with Ethereum to Pairwise.',
    uri: "https://www.pairwise.vote",
    version: '1',
    chainId: 10,
    nonce,
  })

  const { signature } = web3.eth.accounts.sign(message.prepareMessage(), privateKey);

  const loginRes = await axiosInstance.post('/auth/login', {
    ...{ message, signature },
  })

  console.log(loginRes.data)
  ctx.reply("login success!")
}

bot.on("message", (ctx) => {
  handleMessage(ctx).catch(console.log)
});

bot.launch();
