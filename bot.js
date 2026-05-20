require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");
const ytSearch = require("yt-search");
const ytdl = require("ytdl-core");

process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

const bot = new TelegramBot(process.env.BOT_TOKEN, {
    polling: true
});

let tracksStore = {};
let queue = {};

// 🚀 START
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id,
        "🎧 Music Bot\nНапиши название трека\n\nИли открой плеер 👇",
        {
            reply_markup: {
                keyboard: [
                    [
                        {
                            text: "🎧 Открыть плеер",
                            web_app: { url: process.env.WEBAPP_URL }
                        }
                    ]
                ],
                resize_keyboard: true
            }
        }
    );
});

// 🔍 ПОИСК + WebApp
bot.on("message", async (msg) => {
    const chatId = msg.chat.id;

    // если из Mini App
    if (msg.web_app_data) {
        return searchAndShow(chatId, msg.web_app_data.data);
    }

    if (!msg.text || msg.text.startsWith("/")) return;

    searchAndShow(chatId, msg.text);
});

// 🔍 функция поиска
async function searchAndShow(chatId, query) {
    try {
        const res = await ytSearch(query);
        const tracks = res.videos.slice(0, 5);

        if (!tracks.length) {
            return bot.sendMessage(chatId, "❌ Ничего не найдено");
        }

        tracksStore[chatId] = tracks;

        for (let i = 0; i < tracks.length; i++) {
            const t = tracks[i];

            await bot.sendMessage(chatId,
                `🎧 ${t.title}`,
                {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: "▶️ Play", callback_data: `play:${i}` },
                                { text: "➕ Очередь", callback_data: `queue:${i}` }
                            ]
                        ]
                    }
                }
            );
        }
    } catch (e) {
        console.log("SEARCH ERROR:", e.message);
        bot.sendMessage(chatId, "❌ Ошибка поиска");
    }
}

// ▶️ PLAY / QUEUE
bot.on("callback_query", async (q) => {
    bot.answerCallbackQuery(q.id).catch(() => {});

    const chatId = q.message.chat.id;
    const [action, index] = q.data.split(":");

    const list = tracksStore[chatId];
    if (!list) return;

    const track = list[Number(index)];
    if (!track) {
        return bot.sendMessage(chatId, "❌ Трек устарел, попробуй снова");
    }

    if (!queue[chatId]) queue[chatId] = [];

    if (action === "queue") {
        queue[chatId].push(track);
        return bot.sendMessage(chatId, "➕ Добавлено в очередь");
    }

    if (action === "play") {
        queue[chatId] = [track]; // 🔥 фикс бага
        playNext(chatId);
    }
});

// 🔁 АВТОПЛЕЙ
const { exec } = require("child_process");
const fs = require("fs");

async function playNext(chatId) {
    if (!queue[chatId] || queue[chatId].length === 0) {
        return bot.sendMessage(chatId, "📭 Очередь пуста");
    }

    const track = queue[chatId].shift();

    const file = `track_${Date.now()}.mp3`;

    try {
        await bot.sendMessage(chatId, `🎧 Играет: ${track.title}`);

        const cmd = `yt-dlp -x --audio-format mp3 -o "${file}" "${track.url}"`;

        exec(cmd, async (err) => {
            if (err) {
                console.log("YT-DLP ERROR:", err.message);

                // следующий трек
                return playNext(chatId);
            }

            try {
                await bot.sendAudio(chatId, file, {
                    title: track.title
                });

                fs.unlinkSync(file);

                setTimeout(() => playNext(chatId), 2000);

            } catch (e) {
                console.log("SEND ERROR:", e.message);
                playNext(chatId);
            }
        });

    } catch (e) {
        console.log("PLAY ERROR:", e.message);
        playNext(chatId);
    }
}