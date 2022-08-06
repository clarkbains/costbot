const config = require("./config.js")
const discord = require("discord.js")
const strftime = require('strftime')
require('discord-reply');
const { Client, Intents } = require('discord.js');
const fs = require("fs")
const path = require("path");
const { send } = require("process");
const dataFile = path.join(config.datafolder, "data.json")
const dataBackupFolder = path.join(config.datafolder, "backup")

let selfId = ""
var historyLookup = {}
var itemLookup = {}
let mrf = getMostRecentFile(dataBackupFolder);
let backupNum = mrf ? (Number(mrf.file.match(/\d+/g).join(""))) : 0
console.log(`Data dir: ${config.datafolder}`)
console.log(`API Token: ${config.token}`)
console.log(`Channels: ${config.channels}`)
console.log(`Most Recent Backup: #${backupNum}`)

function getMostRecentFile(dir) {
    const files = orderRecentFiles(dir);
    return files.length ? files[0] : undefined;
}

function orderRecentFiles(dir) {
    try {
        return fs.readdirSync(dir)
        .filter((file) => fs.lstatSync(path.join(dir, file)).isFile())
        .map((file) => ({ file, ctime: fs.lstatSync(path.join(dir, file)).ctime }))
        .sort((a, b) => b.ctime.getTime() - a.ctime.getTime());
    } catch {
        fs.mkdirSync(dir)
        return []
    }
}


function readHistoryLookup() {
    try {
        let x = fs.readFileSync(dataFile)
        tmp = JSON.parse(String(x))
        historyLookup = tmp.history
        itemLookup = tmp.item
    } catch {
        historyLookup = {}
        itemLookup = {}
    }

}

function writeHistoryLookup() {
    fs.writeFileSync(dataFile, JSON.stringify({ history: historyLookup, item: itemLookup }))
}

setInterval(async () => {
    backupNum++;
    backupNum = backupNum % 60;
    writeHistoryLookup();
    fs.copyFileSync(dataFile, path.join(dataBackupFolder, "data_backup" + backupNum + ".json"))
}, 1000 * 3600 * 24)


console.log("Starting Cost Bot")
var client = new discord.Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_MESSAGE_REACTIONS] })
client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    selfId = client.user.id
    readHistoryLookup()
    setInterval(() => { writeHistoryLookup() }, 10000)
});
client.login(config.token)
client.on('messageCreate', async (m) => {
    if (m.author.id == selfId) {
        return
    }
    console.log("istrigger?")
    if (isTrigger(m)) {
        console.log("Parsing")
        await parseMessage(m)
    }
})

async function getSummary(guildid, id) {
    const Guild = await client.guilds.fetch(guildid)
    let sortedKeys = Object.keys(historyLookup).sort((a, b) => {
        let timea = historyLookup[a].time || 0
        let timeb = historyLookup[b].time || 0
        return timea - timeb
    })
    let owes = {}
    let reasons = {}
    for (let randKey of sortedKeys) {
        if (historyLookup[randKey].to == id) {
            const from = historyLookup[randKey].from
            if (owes[from] === undefined) {
                owes[from] = 0
                reasons[from] = []
            }
            owes[from] += historyLookup[randKey].amount
            reasons[from].push([historyLookup[randKey].amount, historyLookup[randKey]])
        }

        if (historyLookup[randKey].from == id) {
            const to = historyLookup[randKey].to
            if (owes[to] === undefined) {
                owes[to] = 0
                reasons[to] = []
            }
            owes[to] -= historyLookup[randKey].amount
            reasons[to].push([-historyLookup[randKey].amount, historyLookup[randKey]])

        }
    }
    for (let userid of Object.keys(owes)) {
        if (Math.abs(owes[userid]) < 0.01) {
            delete owes[userid]
            delete reasons[userid]
            continue
        }
        let user;
        try {
            user = await Guild.members.fetch(userid, { cache: true })
        } catch (e) {
            user = await client.users.fetch(userid)
        }
        let total = 0;
        let numInclude = 0;
        let r = []
        for (const reason of reasons[userid].reverse()) {
            const amount = reason[0]
            total += amount;
            if (owes[userid] > 0 && amount > 0 || owes[userid] < 0 && amount < 0) {
                r.push(reason[1])
            }
            if (total <= owes[userid] && owes[userid] < 0) {
                break;
            } else if (total >= owes[userid] && owes[userid] > 0) {
                break;
            }
        }
        owes[userid] = { amount: owes[userid], name: user.nickname || user.user ? user.user.username : user.username, detail: r.map(e => { return { reason: e.reason, amount: Math.abs(e.amount), date: new Date(((e.time) || 0) * 1000) } }) }
    }
    return owes
}
async function getSummaryEmbed(summary, addDetail = false) {
    let final = [""]
    let sortedId = Object.keys(summary).sort((a, b) => { return summary[b].amount - summary[a].amount })
    let owed = sortedId.filter(e => summary[e].amount > 0.01)
    let owers = sortedId.filter(e => summary[e].amount < -0.01)
    //console.log(summary, owed, owers)
    if (owed.length > 0) {
        final.push(`**People Who Owe You**`)
        for (let id of owed) {
            final.push(`${summary[id].name} ${summary[id].amount > 0 ? "owes" : "is owed"} \$${Math.abs(summary[id].amount).toFixed(2)}`)
            if (addDetail)
                for (let reason of summary[id].detail) {
                    final.push(`\t*${strftime('%b %d, %Y', reason.date)}: $${reason.amount.toFixed(2)}${reason.reason ? `: ${reason.reason.trim()}` : ""}*`)
                }

        }
        final.push(``)
    }
    if (owers.length > 0) {
        final.push(`**People You Owe**`)
        for (let id of owers) {
            final.push(`${summary[id].name} ${summary[id].amount > 0 ? "owes" : "is owed"} \$${Math.abs(summary[id].amount).toFixed(2)}`)
            if (addDetail)
                for (let reason of summary[id].detail) {
                    final.push(`\t*${strftime('%b %d, %Y', reason.date)}: $${reason.amount.toFixed(2)}${reason.reason ? `: ${reason.reason.trim()}` : ""}*`)
                }
        }
        final.push(``)
    }
    if (sortedId.length > 0) {
        let net = sortedId.reduce((accumulator, id) => {
            return accumulator + summary[id].amount
        }, 0)
        if (net === 0) {
            final.push(`**Overall, your debts cancel out**`)
        } else {
            final.push(`**Overall, you ${net > 0 ? "are owed" : "owe others"} \$ ${Math.abs(net).toFixed(2)} **`)

        }
    } else {
        final.push(` **You have nothing outstanding**`)

    }
    return final.join("\n")
}

async function parseMessage(msg) {
    console.log(`${msg.author.username} has said ${msg.content}`)

    var txt = msg.content
    if (txt.toLowerCase().startsWith("!help")) {
        await msg.channel.send(getHelp())
    }
    else if (txt.toLowerCase().startsWith("!rec")) {
        let target = msg.author.id
        if (match = txt.match(/i:(\d*)\s*$/)) {
            target = match[1]
        }

        await msg.reply(await getSummaryEmbed(await getSummary(msg.guild.id, target), true))
    }
    else if (txt.toLowerCase().startsWith("!bal")) {
        let target = msg.author.id
        if (match = txt.match(/i:(\d*)\s*$/)) {
            target = match[1]
        }

        await msg.reply(await getSummaryEmbed(await getSummary(msg.guild.id, target)))
    }
    else {
        try {
            let paymentRegex = /payed|pays?|gives?|paid|refund|p/i
            let billRegex = /owes?|o/i

            let firstGroup;
            let secondGroup;
            let paying = false;


            //Determine basic info about the command
            if (txt.match(/^[<>@!&\d\s]*(payed|pays?|gives?|paid|refund|p)/i)) {
                paying = true;
                let split = txt.replace(paymentRegex, "&&&").split("&&&")
                // console.log("a->b", split)

                firstGroup = split[0]
                secondGroup = split[1]
            }
            else if (txt.match(/^[<>@!&\d\s]*(owes?|o)/i)) {
                paying = false;
                let split = txt.replace(billRegex, "&&&").split("&&&")
                //console.log("b->a", split)

                firstGroup = split[0]
                secondGroup = split[1]
            } else {
                throw new TypeError()
            }


            firstGroup = (await extractMentions(msg.guild.id, firstGroup)).mentions
            let t = await extractMentions(msg.guild.id, secondGroup)
            secondGroup = t.mentions
            t = await extractValueAndReason(t.remainingText)
            let price = t.price * (paying ? -1 : 1)
            let reason = t.reason

            if (firstGroup.length == 0 && secondGroup.length == 0) {
                console.log("No Targets Specified")
                throw new TypeError()
            } else if (firstGroup.length == 0) {
                firstGroup.push(msg.author)
            } else if (secondGroup.length == 0) {
                secondGroup.push(msg.author)
            }
            //console.log(firstGroup, secondGroup)
            let first = await expandTargetArray(firstGroup)
            let second = await expandTargetArray(secondGroup)
            //console.log(first,second)
            console.log(first.map(e => e.username), "paying", second.map(e => e.username), price, reason)
            let msgs = []
            let keys = []
            let parent = undefined
            let totalSubs = first.length * second.length

            let pricePer = price / totalSubs;

            let transactionTime = Math.floor(new Date().getTime() / 1000)
            for (let f of first) {
                for (let s of second) {
                    let par = await createEmbed(f, s, pricePer, reason, totalSubs == 1)
                    let sent = await msg.channel.send({
                        embeds: [par]
                    })
                    msgs.push(sent)
                    let key = getId()
                    historyLookup[key] =
                    {
                        from: f.id,
                        to: s.id,
                        amount: pricePer,
                        reason: reason,
                        split: totalSubs,
                        time: transactionTime,
                        msg: {
                            channel: sent.channel.id,
                            guild: sent.channel.guild.id
                        }
                    }
                    keys.push(key)
                }
            }

            if (totalSubs == 1) {
                parent = msgs[0]
            } else {
                parent = await msg.channel.send(await createEmbed(firstGroup, secondGroup, price, reason, true))
                msgs.push(parent)
                console.log(parent)
            }
            writeHistoryLookup();
            await parent.react('❌')
            let permittedDeleters = [...first.map(e => e.id), ...second.map(e => e.id), msg.author.id]

            console.log("Permitted Deleters", new Array(...new Set(permittedDeleters)))
            try {
                let reactorFilter = (reaction, user) => {
                    return permittedDeleters.includes(user.id) && reaction.emoji.name == '❌'
                }
                const collector = parent.createReactionCollector({ filter: reactorFilter, time: 30_000 })
                collector.on('collect', async (r, u) => {
                    console.log(`Collected ${r.emoji.name} from ${u.id}`)
                    let deleters = []
                    for (let user of (await r.users.fetch()).keys()){
                        if (user != client.user.id){
                            deleters.push(`<@!${user}>`)
                        }
                    }
                    for (let k of keys) {
                        delete historyLookup[k]
                    }
                    for (let m of msgs) {
                        m.delete()
                    }
                    msg.reply(`This transaction has been deleted by ${deleters.join(", ")}.`)
                });
            } catch (e) {
                console.log("Error handling reactions", e)
            }

        } catch (e) {
            if (!(e instanceof TypeError)) {
                console.log(e)
            }
            console.log(e)
        }

    }
}

async function createEmbed(from, to, amount, reason, summary) {
    let f = await generatePersonSummary(from)
    let t = await generatePersonSummary(to)
    const embed = new discord.MessageEmbed()
        .setTitle(`${amount >= 0 ? "Bill" : "Payment"} ${summary ? "Summary" : "Record"}`)
        .setDescription(
            `**From:** \t${f}
**To:** \t${t}
${f === t ? "~~" : ""}**Amount:** \t$ ${Math.abs(amount).toFixed(2)}${f === t ? "~~" : ""}
${(reason && summary) ? `**Reason:** \t ${reason}` : ""}`).setColor(config.colour)
    return embed
}
async function expandTargetArray(array) {
    let retval = new Set();
    for (let entry of array) {
        if (entry instanceof discord.User) {
            retval.add(entry)
        } else if (entry instanceof discord.GuildMember) {
            retval.add(entry.user)
        }
        else if (entry instanceof discord.Role) {
            entry.members.forEach(e => {
                retval.add(e.user)
            })
        } else {
            console.error("Tried to add object of class " + entry.constructor.name + " to user set", entry)
        }
    }
    // console.log(retval)
    return Array.from(retval)
}
async function extractMentions(guildid, messageText) {
    const Guild = await client.guilds.fetch(guildid)
    let objects = []
    //console.log("parsing", messageText)
    while (m = messageText.match(/\s*<@([!|&]?)(\d*)>\s*/)) {
        if (m[1] == "&") {
            objects.push(await Guild.roles.fetch(m[2], false, true))
        } else if (m[1] == "" || m[1] == "!") {
            try {
                objects.push(await Guild.members.fetch(m[2], { cache: false }))
            } catch {
                objects.push(await client.users.fetch(m[2], { cache: false }))
            }
        } else {
            console.log("Got here, idk how", m)
        }
        messageText = messageText.replace(m[0], "")
    }
    //console.log("# found", objects.length)
    return { mentions: objects, remainingText: messageText }
}

async function extractValueAndReason(messageText) {
    messageText = messageText.replace(/^\s*/, "")
    let priceRegex = /^\$?(\d*).?(\d*)\$?\s*/
    let priceText = messageText.match(priceRegex)
    let price = Number(`${priceText[1] ? priceText[1] : "0"}.${priceText[2] ? priceText[2] : "0"}`)
    messageText = messageText.replace(priceRegex, "")
    return { price: price, reason: messageText }
}



async function generatePersonSummary(list) {
    if (!Array.isArray(list)) {
        list = [list]
    }

    let hasRoles = list.filter(e => e instanceof discord.Role).length > 0
    let primary = list.map(e => { return (e instanceof discord.Role) ? e.name : ((e instanceof discord.GuildMember) ? e.user.username : e.username) }).join(", ")
    if (hasRoles) {
        primary = `${primary} (${(await expandTargetArray(list)).map(e => e.username).join(", ")})`
    }
    return primary
}



function genStr() {
    return '_' + Math.random().toString(36).substr(2, 9) + Math.random().toString(36).substr(2, 9)
}

function getId() {
    let key = genStr()
    while (historyLookup[key]) {
        key = genStr()
    }
    return key
}


function isTrigger(msg) {
    return config.channels.includes(String(msg.channel.id)) || config.channels.includes(`${msg.guild.id}::${msg.channel.id}`)
}



function getHelp() {
    return `
    **Cost Bot**
    \nKeeps track of balances between several people
    \nTo bill someone, simply send the message \`@person/grouptocharge owes @person/grouptorecievebalance $balance\`
    \n for example, \`@clarkbains owes @newbjumper $10\`
    \n you may omit a mention and it will be substituted with your own name
    \n for example, \`owe @newbjumper 10\`
    \n\n\
    \nTo Pay someone, simply send the message\`@persontopay paid @persontorecievebalance $balance\`
    \nagain, you can omit mentions.
    \nfor example, \`paid @person 10\`
    \n\n
    \nTo see your outstanding balances, simply say \`!bal\`
    \nTo see your outstanding balances including a breakdown of what charges everything is for, use \`!rec\`, (receipt)
    \nto see this message, simply say \`!help\`
    \nAt the time, \`@everybody\` and \`@here\` are unsupported. Please use roles.
    \nInstead of "paid" you can use "payed", "pay", "pays", "give", "gives", "refund", or "p". Instead of "owe", you can use "owes", or "o"
           `
}
