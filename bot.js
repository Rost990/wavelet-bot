require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");
const ytSearch = require("yt-search");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

const bot = new TelegramBot(process.env.BOT_TOKEN, {
    polling: true
});

const MUSIC_DIR = "./music";
if (!fs.existsSync(MUSIC_DIR)) fs.mkdirSync(MUSIC_DIR);

// ===== STATE =====
let tracksStore = {};
let queue = {};
let current = {};
let favorites = {};

// ===== АНТИ-КРАШ =====
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

// ==========================
// 🎧 ПОИСК
// ==========================

bot.on("message", async (msg) => {
    const chatId = msg.chat.id;

    if (!msg.text) return;

    if (msg.text === "/start") {
        return bot.sendMessage(chatId,
            "🎧 Вас приветствует wavelet music bot\nНапиши название трека"
        );
    }

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
                                { text: "▶", callback_data: `play:${i}` },
                                { text: "❤️", callback_data: `fav:${i}` }
                            ]
                        ]
                    }
                }
            );
        });

    } catch {
        bot.sendMessage(chatId, "❌ Ошибка поиска");
    }
});

// ==========================
// 🎛 CALLBACK
// ==========================

bot.on("callback_query", (q) => {

    bot.answerCallbackQuery(q.id).catch(() => {});

    const chatId = q.message.chat.id;
    const [action, index] = q.data.split(":");

    const track = tracksStore[chatId]?.[index];

    if (!queue[chatId]) queue[chatId] = [];

    // ▶ PLAY
    if (action === "play") {
        queue[chatId].push(track);
        bot.sendMessage(chatId, "➕ В очередь");

        if (!current[chatId]) playNext(chatId);
    }

    // ❤️ FAVORITE
    if (action === "fav") {
        if (!favorites[chatId]) favorites[chatId] = [];

        favorites[chatId].push(track);
        bot.sendMessage(chatId, "❤️ Добавлено в избранное");
    }

    // ⏭ NEXT
    if (action === "next") {
        playNext(chatId);
    }

    // ⏹ STOP
    if (action === "stop") {
        current[chatId] = null;
        bot.sendMessage(chatId, "⏹ Остановлено");
    }
});

// ==========================
// ▶ PLAY NEXT (АВТОПЛЕЙ)
// ==========================

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
        // 💎 кеш
        if (!fs.existsSync(filePath)) {
            await new Promise((resolve, reject) => {
                const cmd = `yt-dlp -x --audio-format mp3 -o "${filePath}" "${track.url}"`;

                exec(cmd, (err) => {
                    if (err) reject();
                    else resolve();
                });
            });
        }

        await bot.sendAudio(chatId, filePath, {
            title: track.title,
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "⏭", callback_data: "next:0" },
                        { text: "⏹", callback_data: "stop:0" }
                    ]
                ]
            }
        });

        // 🔁 автоплей
        setTimeout(() => {
            playNext(chatId);
        }, 2000);

    } catch (e) {
        console.log("PLAY ERROR");

        current[chatId] = null;
        playNext(chatId);
    }
}