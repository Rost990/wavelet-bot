require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");
const ytSearch = require("yt-search");
const ytdl = require("ytdl-core");

const bot = new TelegramBot(process.env.BOT_TOKEN, {
    polling: true
});

let tracksStore = {};
let queue = {};

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id,
        "🎧  Вас приветсвует wavelet-bot\nНапиши название трека"
    );
});

// 🔍 Поиск
bot.on("message", async (msg) => {
    const chatId = msg.chat.id;

    if (!msg.text || msg.text.startsWith("/")) return;

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
                            { text: "▶️ Play", callback_data: `play:${i}` },
                            { text: "➕ В очередь", callback_data: `queue:${i}` }
                        ]
                    ]
                }
            }
        );
    });
});

// ▶️ PLAY
bot.on("callback_query", async (q) => {
    bot.answerCallbackQuery(q.id).catch(() => {});

    const chatId = q.message.chat.id;
    const [action, index] = q.data.split(":");

    const track = tracksStore[chatId]?.[index];
    if (!track) return;

    if (!queue[chatId]) queue[chatId] = [];

    if (action === "queue") {
        queue[chatId].push(track);
        return bot.sendMessage(chatId, "➕ Добавлено в очередь");
    }

    if (action === "play") {
        queue[chatId].unshift(track);
        playNext(chatId);
    }
});

// 🔁 Автоплей
async function playNext(chatId) {
    if (!queue[chatId] || queue[chatId].length === 0) {
        return bot.sendMessage(chatId, "📭 Очередь пуста");
    }

    const track = queue[chatId].shift();

    try {
        bot.sendMessage(chatId, `🎧 Играет: ${track.title}`);

        const stream = ytdl(track.url, {
            filter: "audioonly",
            quality: "highestaudio",
            highWaterMark: 1 << 25
        });

        await bot.sendAudio(chatId, stream, {
            title: track.title
        });

        // автоплей вперёд
        setTimeout(() => playNext(chatId), 2000);

    } catch (e) {
        console.log("PLAY ERROR:", e.message);

        // пробуем следующий
        playNext(chatId);
    }
}