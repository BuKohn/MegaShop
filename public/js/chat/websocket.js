class ChatClient {
    constructor(socketUrl) {
        this.socketUrl = socketUrl;
        this.currentRoom = 'general';
        this.rooms = ['general', 'support', 'products-discussion', 'random'];
        this.roomNames = {
            'general': 'Общий чат',
            'support': 'Техподдержка',
            'products-discussion': 'Обсуждение товаров',
            'random': 'Случайная комната'
        };

        this.messages = [];
        this.users = [];
        this.typingUsers = new Set();

        this.unreadCounts = {};
        this.lastSeen = {};
        const now = new Date().toISOString();
        this.rooms.forEach(r => {
            this.lastSeen[r] = now;
            this.unreadCounts[r] = 0;
        });

        this.pendingSystemMessage = null;
        this.isConnected = false;
        this.typingTimeout = null;
        this.unreadPollTimer = null;

        this.initSocket();
        this.bindEvents();
    }

    // Подключение к серверу и регистрация всех обработчиков событий
    initSocket() {
        this.socket = io(this.socketUrl, {
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000
        });

        this.socket.on('connect', () => {
            console.log('[Chat] Подключено');
            this.isConnected = true;
            this.updateConnectionStatus('connected');
            this.socket.emit('join_room', { room: this.currentRoom });
            this.updateActiveRoom(this.currentRoom);
            this.renderMessages();
            this._startUnreadPolling();
        });

        this.socket.on('disconnect', () => {
            this.isConnected = false;
            this.updateConnectionStatus('disconnected');
            this._stopUnreadPolling();
        });

        this.socket.on('connect_error', () => this.updateConnectionStatus('error'));
        this.socket.on('reconnect_attempt', () => this.updateConnectionStatus('reconnecting'));

        this.socket.on('reconnect', () => {
            console.log('[Chat] Переподключено');
            this.updateConnectionStatus('connected');
            this.socket.emit('join_room', { room: this.currentRoom });
            this._startUnreadPolling();
        });

        this.socket.on('message_history', (data) => {
            if (data.room !== this.currentRoom) return;
            this.messages = data.messages || [];
            this.renderMessages();
            if (this.pendingSystemMessage) {
                this.showSystemMessage(this.pendingSystemMessage);
                this.pendingSystemMessage = null;
            }
            this._markRoomSeen(this.currentRoom);
            this._refreshOnlineUsers();
        });

        this.socket.on('message', (message) => this.handleNewMessage(message));

        this.socket.on('user_joined', (data) => {
            if (data.room !== this.currentRoom) return;
            this.showSystemMessage(`${data.username} присоединился к чату`);
            this._refreshOnlineUsers();
        });

        this.socket.on('user_left', (data) => {
            if (data.room !== this.currentRoom) return;
            this.showSystemMessage(`${data.username} покинул чат`);
            this._refreshOnlineUsers();
        });

        this.socket.on('typing_status', (data) => this.updateTypingIndicator(data));

        this.socket.on('online_users', (data) => {
            if (data.room !== this.currentRoom) return;
            this.users = data.users || [];
            this.renderUsersList();
            this.updateHeaderCount();
        });

        this.socket.on('unread_counts', (data) => {
            if (!data?.counts) return;
            for (const [room, count] of Object.entries(data.counts)) {
                if (room === this.currentRoom) continue;
                this.unreadCounts[room] = count;
                this.updateRoomUnread(room);
            }
        });

        this.socket.on('error', (data) => {
            console.error('[Chat] Ошибка сервера:', data.message);
        });
    }

    // Запускает периодический опрос непрочитанных сообщений (раз в 5 сек)
    _startUnreadPolling() {
        this._stopUnreadPolling();
        this._requestUnreadCounts();
        this.unreadPollTimer = setInterval(() => this._requestUnreadCounts(), 5000);
    }

    // Останавливает polling непрочитанных при отключении
    _stopUnreadPolling() {
        if (this.unreadPollTimer) {
            clearInterval(this.unreadPollTimer);
            this.unreadPollTimer = null;
        }
    }

    // Спрашивает у сервера сколько новых сообщений после lastSeen в каждой комнате
    _requestUnreadCounts() {
        if (!this.isConnected) return;
        this.socket.emit('get_unread_counts', { since: this.lastSeen });
    }

    // Запрашивает свежий список участников текущей комнаты
    _refreshOnlineUsers() {
        this.socket.emit('get_online_users', { room: this.currentRoom });
    }

    // Запоминает момент "просмотра" комнаты — нужно для подсчёта непрочитанных
    _markRoomSeen(room) {
        const msgs = room === this.currentRoom ? this.messages : null;
        if (msgs && msgs.length > 0) {
            this.lastSeen[room] = msgs[msgs.length - 1].timestamp;
        } else {
            this.lastSeen[room] = new Date().toISOString();
        }
    }

    // Переключение комнаты: leave старой, join новой, сброс локального состояния
    joinRoom(roomName) {
        if (this.currentRoom === roomName) return;

        const prevRoom = this.currentRoom;
        this._markRoomSeen(prevRoom);

        this.currentRoom = roomName;
        this.messages = [];
        this.users = [];
        this.typingUsers = new Set();
        this.unreadCounts[roomName] = 0;

        this.socket.emit('leave_room', { room: prevRoom });
        this.socket.emit('join_room', { room: roomName });

        this.pendingSystemMessage = `Вы перешли в комнату "${this.roomNames[roomName] || roomName}"`;

        this.updateActiveRoom(roomName);
        this.updateRoomUnread(roomName);
        this.renderMessages();
        this.renderUsersList();
        this.updateHeaderCount();

        const typingEl = document.getElementById('typing-indicator');
        if (typingEl) typingEl.textContent = '';
        this.updateOwnTypingStatus(false);
    }

    // Отправка сообщения в текущую комнату + сброс индикатора печати
    sendMessage(text) {
        if (!text.trim()) return;
        this.socket.emit('send_message', { text, room: this.currentRoom });
        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
            this.typingTimeout = null;
            this.socket.emit('typing', { isTyping: false, room: this.currentRoom });
            this.updateOwnTypingStatus(false);
        }
        this.clearInput();
    }

    // Обработка входящего сообщения: добавляем в локальный массив и в UI
    handleNewMessage(message) {
        this.messages.push(message);
        this.addMessageToUI(message);
        this.lastSeen[this.currentRoom] = message.timestamp;
    }

    // Отправляет серверу событие "печатает", авто-сбрасывает через 2 сек простоя
    startTyping() {
        if (!this.typingTimeout) {
            this.socket.emit('typing', { isTyping: true, room: this.currentRoom });
            this.updateOwnTypingStatus(true);
        }
        clearTimeout(this.typingTimeout);
        this.typingTimeout = setTimeout(() => {
            this.socket.emit('typing', { isTyping: false, room: this.currentRoom });
            this.typingTimeout = null;
            this.updateOwnTypingStatus(false);
        }, 2000);
    }

    // Обновляет индикатор "X печатает..." и помечает участника в списке справа
    updateTypingIndicator(data) {
        if (data.room !== this.currentRoom) return;

        if (data.isTyping) this.typingUsers.add(data.username);
        else this.typingUsers.delete(data.username);

        const currentLogin = window.currentUser?.login || 'Гость';
        const el = document.getElementById('typing-indicator');
        if (el) {
            const others = [...this.typingUsers].filter(u => u !== currentLogin);
            el.textContent = others.length > 0 ? `${others.join(', ')} печатает...` : '';
        }
        this.renderUsersList();
    }

    // Показывает собственный статус "Вы печатаете..." под полем ввода
    updateOwnTypingStatus(isTyping) {
        const el = document.getElementById('own-typing-status');
        if (el) el.textContent = isTyping ? 'Вы печатаете...' : '';
    }

    // Привязывает обработчики кликов на кнопки комнат, отправки и поле ввода
    bindEvents() {
        document.querySelectorAll('.room-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const room = e.currentTarget.dataset.room;
                if (room) this.joinRoom(room);
            });
        });

        const sendBtn = document.getElementById('send-button');
        const input = document.getElementById('message-input');

        if (sendBtn && input) {
            sendBtn.addEventListener('click', () => this.sendMessage(input.value));
        }
        if (input) {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.sendMessage(input.value);
            });
            input.addEventListener('input', () => this.startTyping());
        }
    }

    // Перерисовывает всю область сообщений текущей комнаты
    renderMessages() {
        const container = document.getElementById('chat-messages');
        if (!container) return;
        container.innerHTML = '';
        if (this.messages.length === 0) {
            const div = document.createElement('div');
            div.className = 'system-message';
            div.textContent = 'Сообщений пока нет. Начните общение!';
            container.appendChild(div);
            return;
        }
        this.messages.forEach(msg => this.addMessageToUI(msg));
    }

    // Добавляет одно сообщение в DOM
    addMessageToUI(msg) {
        const container = document.getElementById('chat-messages');
        if (!container) return;

        const currentLogin = window.currentUser?.login || 'Гость';
        const isOwn = msg.username === currentLogin;
        const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 60;

        const time = new Date(msg.timestamp).toLocaleTimeString('ru-RU', {
            hour: '2-digit', minute: '2-digit'
        });

        const div = document.createElement('div');
        div.className = `message${isOwn ? ' own' : ''}`;
        div.innerHTML = `
            <div class="message-header">
                <span class="message-author">${this.escapeHtml(msg.username)}</span>
                <span class="message-time">${time}</span>
            </div>
            <div class="message-content">${this.escapeHtml(msg.text)}</div>
        `;
        container.appendChild(div);
        if (isAtBottom) container.scrollTop = container.scrollHeight;
    }

    // Перерисовывает список участников в правой панели
    renderUsersList() {
        const list = document.getElementById('users-list');
        if (!list) return;
        list.innerHTML = '';

        if (this.users.length === 0) {
            const li = document.createElement('li');
            li.className = 'no-users';
            li.textContent = 'Нет участников';
            list.appendChild(li);
            return;
        }
        this.users.forEach(user => {
            const li = document.createElement('li');
            const isTyping = this.typingUsers.has(user.username);
            li.innerHTML = `
                <span class="user-name">${this.escapeHtml(user.username)}</span>
                ${isTyping ? '<span class="user-typing-badge">печатает...</span>' : ''}
            `;
            list.appendChild(li);
        });
    }

    // Обновляет цифру онлайн-участников в заголовке правой панели
    updateHeaderCount() {
        const el = document.getElementById('users-panel-count');
        if (el) el.textContent = this.users.length;
    }

    // Переключает класс .active у кнопок комнат и заголовок над чатом
    updateActiveRoom(room) {
        document.querySelectorAll('.room-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.room === room);
        });
        const header = document.getElementById('current-room-name');
        if (header) header.textContent = this.roomNames[room] || room;
    }

    // Обновляет красный бейдж непрочитанных у кнопки комнаты
    updateRoomUnread(room) {
        const btn = document.querySelector(`.room-btn[data-room="${room}"]`);
        if (!btn) return;
        const badge = btn.querySelector('.unread-badge');
        if (!badge) return;
        const count = this.unreadCounts[room] || 0;
        badge.textContent = count;
        badge.classList.toggle('unread-badge--active', count > 0);
    }

    // Показывает плашку статуса соединения (подключено / переподключение / ошибка)
    updateConnectionStatus(status) {
        const el = document.getElementById('connection-status');
        if (!el) return;
        const texts = {
            connected: 'Подключено',
            disconnected: 'Соединение потеряно',
            reconnecting: 'Переподключение...',
            error: 'Ошибка соединения'
        };
        el.className = `connection-status ${status}`;
        el.textContent = texts[status] || status;
        if (status === 'connected') setTimeout(() => el.classList.remove('connected'), 2000);
    }

    // Добавляет служебное сообщение (например, "X присоединился") в область чата
    showSystemMessage(text) {
        const container = document.getElementById('chat-messages');
        if (!container) return;
        const div = document.createElement('div');
        div.className = 'system-message';
        div.textContent = text;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    }

    clearInput() {
        const input = document.getElementById('message-input');
        if (input) input.value = '';
    }

    // Экранирует HTML-символы — защита от XSS при вставке текста через innerHTML
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new ChatClient(window.location.origin);
});
