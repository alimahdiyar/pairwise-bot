import {CtxType, TelegrafContext} from "./types";
import {Markup, session, Telegraf} from "telegraf";
import Web3 from 'web3';
import {SiweMessage} from "siwe";
import axios from 'axios'
import {PairsType} from "./types/pair";

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
    const {data} = await axiosInstance.get<string>('/auth/nonce')
    return data
  } catch (err) {
    console.error(err)
  }
}

export async function fetchPairs(cid: string, token: string) {
  const url = '/flow/pairs'
  return axiosInstance
    .get<PairsType>(url, {
      headers: {
        auth: token
      },
      params: {
        cid,
      },
    })
    .then((res) => res.data)
}

export async function voteProjects({
                                     id1,
                                     id2,
                                     pickedId,
                                   }: {
  id1: number
  id2: number
  pickedId: number | null
}, token: string) {
  return axiosInstance
    .post('/flow/projects/vote', {
      project1Id: id1,
      project2Id: id2,
      pickedId,
    }, {
      headers: {
        auth: token
      },
    })
    .then((res) => res.data)
}

async function handleMessage(ctx: CtxType) {
  ctx.session = ctx.session ?? {
    privateKey: web3.eth.accounts.create().privateKey
  }
  // @ts-ignore
  let text: string | null = ctx.message?.text || ctx.match?.[0] || null;
  if (!text) return

  if (text.startsWith("/start")) {
    const args = text.slice("/start ".length).split("-")
    for (let i = 0; i < args.length; i++) {
      const [name, value] = args[i].split("=");
      if (name === 'cid') {
        ctx.session.cid = value.toLowerCase()
      }
    }
  }
  if (!ctx.session.cid) {
    return ctx.reply("Please start the bot with a link that has cid")
  }
  if (!ctx.session.token) {
    const account = web3.eth.accounts.privateKeyToAccount(ctx.session.privateKey);
    const {address} = account
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

    const {signature} = web3.eth.accounts.sign(message.prepareMessage(), ctx.session.privateKey);

    const loginRes = await axiosInstance.post<string>('/auth/login', {
      ...{message, signature},
    })
    ctx.session.token = loginRes.data
  }
  let pairsResponse = await fetchPairs(ctx.session.cid, ctx.session.token)
  const pickedId = text === "Neither" ? null : pairsResponse.pairs[0].find(p => p.name === text)?.id
  if (pickedId !== undefined) {
    await voteProjects({
      id1: pairsResponse.pairs[0][0].id,
      id2: pairsResponse.pairs[0][1].id,
      pickedId
    }, ctx.session.token)
    pairsResponse = await fetchPairs(ctx.session.cid, ctx.session.token)
  }
  let responseText = (pairsResponse.pairs[0].map(project => `*${project.name}*\n${project.contributionDescription}`)).join("\n\n")
  responseText += "\n\n*Which project should receive more RetroPGF funding?*\nChoose neither if it is too close to call or you don't want to give OP to either project."
  responseText += `\n\nVoted: ${pairsResponse.votedPairs}/${pairsResponse.totalPairs} (You need to make at least ${Math.ceil(pairsResponse.totalPairs * pairsResponse.threshold)} Pairwise votes)`
  return ctx.reply(responseText, {
    parse_mode: "Markdown",
    ...Markup.keyboard([
      Markup.button.text(pairsResponse.pairs[0][0].name),
      Markup.button.text("Neither"),
      Markup.button.text(pairsResponse.pairs[0][1].name)
    ])
  })
}

bot.on("message", (ctx) => {
  handleMessage(ctx).catch(console.log)
});

bot.launch();
