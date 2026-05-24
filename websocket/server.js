const { Server } = require("socket.io");
const fs = require("fs").promises;
const path = require("path");

async function readData() {
    const raw = await fs.readFile(DATA_FILE, "utf-8");
    return JSON.parse(raw);
}

async function writeData(data) {
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
}

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
    const notificationSubscriptions = new Map();

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

    // Обновляет настройки уведомлений пользователя в data.json
    async function updateUserNotificationSettings(userId, room, enabled) {
        try {
            const data = await readData();
            const users = data.users || [];
            
            const userIndex = userId - 1;
            
            if (userIndex < 0 || userIndex >= users.length) {
                console.error(`[WS] Пользователь с id=${userId} не найден`);
                return false;
            }
            
            const user = users[userIndex];
            
            if (!user.notificationSettings) {
                user.notificationSettings = { rooms: [] };
            }
            if (!Array.isArray(user.notificationSettings.rooms)) {
                user.notificationSettings.rooms = [];
            }
            
            const rooms = user.notificationSettings.rooms;
            const roomIndex = rooms.indexOf(room);
            
            if (enabled && roomIndex === -1) {
                rooms.push(room);
            } else if (!enabled && roomIndex !== -1) {
                rooms.splice(roomIndex, 1);
            } else {
                return true;
            }
            
            await writeData(data);
            console.log(`[WS] Настройки обновлены: user=${user.login}, room=${room}, enabled=${enabled}`);
            return true;
            
        } catch (err) {
            console.error(`[WS] Ошибка обновления настроек:`, err.message);
            return false;
        }
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
        const userSettings = socket.request.session?.user?.notificationSettings || { rooms: [] };
        notificationSubscriptions.set(socket.id, new Set(userSettings.rooms || []));

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

        socket.on('get_notification_settings', () => {
            const settings = socket.request.session?.user?.notificationSettings || { rooms: [] };
            socket.emit('notification_settings', settings);
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
            io.to(room).emit('message', message);

            const notification = {
                type: 'new_message',
                room,
                roomName: ROOMS[room],
                message: text,
                from: username,
                timestamp: new Date().toISOString()
            }

            for (const [targetSocketId, subscribedRooms] of notificationSubscriptions) {
                if (targetSocketId === socket.id) continue;
                
                const targetSocket = io.sockets.sockets.get(targetSocketId);
                if (!targetSocket) continue;
                
                if (subscribedRooms.has(room) && !targetSocket.rooms.has(room)) {
                    io.to(targetSocketId).emit('notification', notification);
                }
            }

            messageHistory[room].push(message);
            if (messageHistory[room].length > MAX_HISTORY) messageHistory[room].shift();

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

        // 6. get_unread_counts — счётчик непрочитанных без подписки на комнату
        socket.on('get_unread_counts', ({ since }) => {
            if (!since || typeof since !== 'object') {
                socket.emit('error', { message: 'since должен быть объектом' });
                return;
            }
            const counts = {};
            for (const room of Object.keys(ROOMS)) {
                const sinceTs = since[room];
                const history = messageHistory[room] || [];
                if (!sinceTs) {
                    counts[room] = 0;
                } else {
                    const cutoff = new Date(sinceTs).getTime();
                    let n = 0;
                    for (const msg of history) {
                        const t = new Date(msg.timestamp).getTime();
                        if (t > cutoff && msg.username !== username) n++;
                    }
                    counts[room] = n;
                }
            }
            socket.emit('unread_counts', { counts });
        });

        // Подписка на уведомления комнаты
        socket.on('subscribe_notifications', async ({ room }) => {
            if (!ROOMS[room]) return;
        
            const userId = socket.request.session?.user?.id;
            if (!userId) return;
        
            const subs = notificationSubscriptions.get(socket.id) || new Set();
            subs.add(room);
            notificationSubscriptions.set(socket.id, subs);
        
            if (socket.request.session?.user?.notificationSettings) {
                if (!socket.request.session.user.notificationSettings.rooms.includes(room)) {
                    socket.request.session.user.notificationSettings.rooms.push(room);
                    socket.request.session.save();
                }
            }
        
            await updateUserNotificationSettings(userId, room, true);
        
            console.log(`[WS] ${socket.id} включил уведомления для ${room}`);
            socket.emit('notification_settings_updated', { room, enabled: true });
        });

        // Отписка
        socket.on('unsubscribe_notifications', async ({ room }) => {
            const userId = socket.request.session?.user?.id;
            if (!userId) return;
        
            const subs = notificationSubscriptions.get(socket.id) || new Set();
            subs.delete(room);
            notificationSubscriptions.set(socket.id, subs);
        
            if (socket.request.session?.user?.notificationSettings) {
                socket.request.session.user.notificationSettings.rooms = 
                    socket.request.session.user.notificationSettings.rooms.filter(r => r !== room);
                socket.request.session.save();
            }
        
            await updateUserNotificationSettings(userId, room, false);
            
            console.log(`[WS] ${socket.id} отключил уведомления для ${room}`);
            socket.emit('notification_settings_updated', { room, enabled: false });
        });

        socket.on('disconnect', () => {
            if (socket.currentRoom) {
                socket.to(socket.currentRoom).emit('user_left', { username, userId, room: socket.currentRoom, timestamp: new Date().toISOString() });
            }
            notificationSubscriptions.delete(socket.id);
            console.log(`[${new Date().toISOString()}] INFO [socketId:${socket.id}] Отключение: user=${username}`);
        });
    });

    return io;
}

module.exports = initWebSocket;
