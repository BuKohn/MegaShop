const { Server } = require("socket.io");
const fs = require("fs").promises;
const path = require("path");

function initWebSocket(server) {
    const io = new Server(server, {
        cors: { origin: "http://localhost:3000", methods: ["GET", "POST"] }
    });

    const ROOMS = {
        'general': 'Общий чат',
        'support': 'Техническая поддержка',
        'products-discussion': 'Обсуждение товаров',
        'random': 'Случайная комната'
    };
    const MAX_HISTORY = 50;
    const DATA_FILE = path.join(__dirname, "../config/data.json");

    let messageHistory = {};
    Object.keys(ROOMS).forEach(room => messageHistory[room] = []);

    // Загрузка истории
    async function loadChatHistory() {
        try {
            const data = await fs.readFile(DATA_FILE, "utf-8");
            const parsed = JSON.parse(data);
            if (parsed.chatHistory) {
                Object.keys(ROOMS).forEach(room => {
                    messageHistory[room] = Array.isArray(parsed.chatHistory[room])
                        ? parsed.chatHistory[room].slice(-MAX_HISTORY)
                        : [];
                });
            }
        } catch (err) { console.error("[WS] Ошибка загрузки истории:", err.message); }
    }

    // Сохранение истории
    async function saveChatHistory() {
        try {
            const data = await fs.readFile(DATA_FILE, "utf-8");
            const parsed = JSON.parse(data);
            parsed.chatHistory = messageHistory;
            await fs.writeFile(DATA_FILE, JSON.stringify(parsed, null, 2), "utf-8");
        } catch (err) { console.error("[WS] Ошибка сохранения истории:", err.message); }
    }

    loadChatHistory();
    setInterval(saveChatHistory, 30000);

    function getRoomUsersList(room) {
        const users = [];
        const roomSockets = io.sockets.adapter.rooms.get(room);
        if (roomSockets) {
            roomSockets.forEach(socketId => {
                const sock = io.sockets.sockets.get(socketId);
                if (sock) {
                    const u = sock.request.session?.user || { login: 'Гость', id: null };
                    users.push(`${u.login} (id: ${u.id || 'null'})`);
                }
            });
        }
        return users;
    }

    function logError(socketId, username, message) {
        console.log(`[${new Date().toISOString()}] ERROR [socketId:${socketId}] ${username}: ${message}`);
    }

    // Событие подключения
    io.on('connection', (socket) => {
        const userInfo = socket.request.session?.user || { login: 'Гость', id: null };
        const username = userInfo.login || 'Гость';
        const userId = userInfo.id || null;
        const clientIp = socket.request.headers['x-forwarded-for'] || socket.request.connection.remoteAddress || 'unknown';
        const connectTime = new Date().toISOString();

        console.log(`[${connectTime}] INFO [socketId:${socket.id}] Подключение: IP=${clientIp}, user=${username}, userId=${userId || 'null'}`);

        // 1. join_room
        socket.on('join_room', ({ room }) => {
            if (!ROOMS[room]) {
                socket.emit('error', { message: 'Комната не существует' });
                logError(socket.id, username, `Попытка входа в несуществующую комнату: ${room}`);
                return;
            }

            socket.join(room);
            socket.currentRoom = room;

            const usersInRoom = getRoomUsersList(room);
            console.log(`[${new Date().toISOString()}] INFO [socketId:${socket.id}] ${username} присоединился к комнате "${ROOMS[room]}". Пользователи: [${usersInRoom.join(', ')}]`);

            socket.emit('message_history', { room, messages: messageHistory[room] || [] });
            socket.to(room).emit('user_joined', { username, userId, room, timestamp: new Date().toISOString() });
        });

        // 2. leave_room
        socket.on('leave_room', ({ room }) => {
            if (!ROOMS[room]) {
                logError(socket.id, username, `Попытка покинуть несуществующую комнату: ${room}`);
                return;
            }
            socket.leave(room);
            console.log(`[${new Date().toISOString()}] INFO [socketId:${socket.id}] ${username} покинул комнату "${ROOMS[room]}"`);
            socket.to(room).emit('user_left', { username, userId, room, timestamp: new Date().toISOString() });
        });

        // 3. send_message
        socket.on('send_message', ({ text, room }) => {
            if (username === 'Гость') {
                socket.emit('error', { message: 'Только авторизованные пользователи могут отправлять сообщения' });
                return;
            }

            if (!ROOMS[room]) {
                logError(socket.id, username, `Отправка в несуществующую комнату: ${room}`);
                socket.emit('error', { message: 'Комната не существует' });
                return;
            }
            if (!text?.trim()) {
                logError(socket.id, username, `Пустое сообщение в комнату: ${room}`);
                socket.emit('error', { message: 'Сообщение не может быть пустым' });
                return;
            }
            if (!socket.rooms.has(room)) {
                logError(socket.id, username, `Отправка без подписки на комнату: ${room}`);
                socket.emit('error', { message: 'Вы не подписаны на эту комнату' });
                return;
            }

            const message = {
                id: Date.now(),
                text: text.trim(),
                username,
                userId,
                room,
                timestamp: new Date().toISOString()
            };

            messageHistory[room].push(message);
            if (messageHistory[room].length > MAX_HISTORY) messageHistory[room].shift();

            io.to(room).emit('message', message);
            console.log(`[${new Date().toISOString()}] INFO [socketId:${socket.id}] ${username} -> ${ROOMS[room]}: "${text.trim()}"`);
        });

        // 4. typing
        socket.on('typing', ({ isTyping, room }) => {
            if (ROOMS[room] && socket.rooms.has(room)) {
                socket.to(room).emit('typing_status', { username, userId, isTyping, room });
            }
        });

        // 5. get_online_users
        socket.on('get_online_users', ({ room }) => {
            if (!ROOMS[room]) {
                logError(socket.id, username, `Запрос юзеров для несуществующей комнаты: ${room}`);
                return;
            }
            const users = [];
            const roomSockets = io.sockets.adapter.rooms.get(room);
            if (roomSockets) {
                roomSockets.forEach(id => {
                    const sock = io.sockets.sockets.get(id);
                    if (sock) {
                        const u = sock.request.session?.user || { login: 'Гость', id: null };
                        users.push({ socketId: id, username: u.login, userId: u.id });
                    }
                });
            }
            socket.emit('online_users', { room, users, count: users.length });
            console.log(`[${new Date().toISOString()}] INFO [socketId:${socket.id}] ${username} запросил список пользователей в "${ROOMS[room]}". Найдено: ${users.length}`);
        });

        socket.on('disconnect', () => {
            if (socket.currentRoom) {
                socket.to(socket.currentRoom).emit('user_left', { username, userId, room: socket.currentRoom, timestamp: new Date().toISOString() });
            }
            console.log(`[${new Date().toISOString()}] INFO [socketId:${socket.id}] Отключение: user=${username}`);
        });
    });

    return io;
}

module.exports = initWebSocket;