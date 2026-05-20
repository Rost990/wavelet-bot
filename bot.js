require("dotenv").config();

const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const ytSearch = require("yt-search");
const { exec } = require("child_process");
const fs = require("fs");

const app = express();
app.use(express.json());

const bot = new TelegramBot(process.env.BOT_TOKEN);

const PORT = process.env.PORT || 3000;
const URL = process.env.RENDER_URL;

const WEBHOOK_PATH = `/bot${process.env.BOT_TOKEN}`;

// память
let tracksStore = {};
let queue = {};

// 🚀 webhook
bot.setWebHook(`${URL}${WEBHOOK_PATH}`);

// 📡 endpoint
app.post(WEBHOOK_PATH, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

// 🟢 старт
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id,
        "🎧 Music Bot\nНапиши название трека"
    );
});

// 🔍 поиск
bot.on("message", async (msg) => {
    const chatId = msg.chat.id;

    if (!msg.text || msg.text.startsWith("/")) return;

    try {
        const res = await ytSearch(msg.text);
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
                                { text: "➕ Queue", callback_data: `queue:${i}` }
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
});

// ▶️ кнопки
bot.on("callback_query", async (q) => {
    bot.answerCallbackQuery(q.id).catch(() => {});

    const chatId = q.message.chat.id;
    const [action, index] = q.data.split(":");

    const list = tracksStore[chatId];
    if (!list) return;

    const track = list[Number(index)];
    if (!track) {
        return bot.sendMessage(chatId, "❌ Трек устарел");
    }

    if (!queue[chatId]) queue[chatId] = [];

    if (action === "queue") {
        queue[chatId].push(track);
        return bot.sendMessage(chatId, "➕ Добавлено в очередь");
    }

    if (action === "play") {
        queue[chatId] = [track];
        playNext(chatId);
    }
});

// 🔁 автоплей через yt-dlp
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
                console.log("YT ERROR:", err.message);
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

// 🚀 сервер
app.listen(PORT, () => {
    console.log("🚀 Webhook bot started");
});