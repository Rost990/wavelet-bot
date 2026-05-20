require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");
const ytSearch = require("yt-search");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

if (!process.env.BOT_TOKEN) {
    console.log("❌ BOT_TOKEN missing");
    process.exit(1);
}
const bot = new TelegramBot(process.env.BOT_TOKEN, {
    polling: true
});

const MUSIC_DIR = "/tmp/music";
if (!fs.existsSync(MUSIC_DIR)) fs.mkdirSync(MUSIC_DIR, { recursive: true });

let tracksStore = {};
let queue = {};
let current = {};
let favorites = {};

process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id,
        "🎧 Вас приветствует Wavelet-Bot\nНапиши название трека"
    );
});

// Поиск
bot.on("message", async (msg) => {
    const chatId = msg.chat.id;

    if (!msg.text || msg.text.startsWith("/")) return;

    try {
        const res = await ytSearch(msg.text);
        const tracks = res.videos.slice(0, 5);

        tracksStore[chatId] = tracks;

        tracks.forEach((t, i) => {
            bot.sendMessage(chatId,
                `🎧 ${t.title}`,
                {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: "▶ Play", callback_data: `play:${i}` },
                                { text: "❤️ Fav", callback_data: `fav:${i}` }
                            ]
                        ]
                    }
                }
            );
        });

    } catch (e) {
        console.log(e);
        bot.sendMessage(chatId, "❌ Ошибка поиска");
    }
});

// CALLBACK 
bot.on("callback_query", (q) => {
    bot.answerCallbackQuery(q.id).catch(() => {});

    const chatId = q.message.chat.id;
    const [action, index] = q.data.split(":");

    const track = tracksStore[chatId]?.[index];
    if (!track) return;

    if (!queue[chatId]) queue[chatId] = [];

    if (action === "play") {
        queue[chatId].push(track);
        bot.sendMessage(chatId, "➕ Добавлено в очередь");

        if (!current[chatId]) playNext(chatId);
    }

    if (action === "fav") {
        if (!favorites[chatId]) favorites[chatId] = [];
        favorites[chatId].push(track);

        bot.sendMessage(chatId, "❤️ Добавлено в избранное");
    }

    if (action === "next") {
        playNext(chatId);
    }

    if (action === "stop") {
        current[chatId] = null;
        queue[chatId] = [];
        bot.sendMessage(chatId, "⏹ Остановлено");
    }
});

//  PLAY
async function playNext(chatId) {
    if (!queue[chatId] || queue[chatId].length === 0) {
        current[chatId] = null;
        return bot.sendMessage(chatId, "📭 Очередь пуста");
    }

    const track = queue[chatId].shift();
    current[chatId] = track;

    const fileName = track.title.replace(/[^\w]/g, "_") + ".mp3";
    const filePath = path.join(MUSIC_DIR, fileName);

    try {
        if (!fs.existsSync(filePath)) {
            await new Promise((resolve, reject) => {
                const cmd = `yt-dlp -x --audio-format mp3 -o "${filePath}" "${track.url}"`;

                exec(cmd, (err) => {
                    if (err) {
                        console.log("YT-DLP ERROR:", err.message);
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
        }

        await bot.sendAudio(chatId, filePath, {
            title: track.title,
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "⏭ Next", callback_data: "next:0" },
                        { text: "⏹ Stop", callback_data: "stop:0" }
                    ]
                ]
            }
        });

        setTimeout(() => playNext(chatId), 2000);

    } catch (e) {
        console.log("PLAY ERROR:", e.message);

        current[chatId] = null;
        setTimeout(() => playNext(chatId), 1000);
    }
}