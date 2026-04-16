let socket = null;
let currentRoom = 'general';
let isTyping = false;
let typingTimeout = null;

// Названия комнат
const ROOM_NAMES = {
    'general': 'Общий чат',
    'support': 'Техническая поддержка',
    'products-discussion': 'Обсуждение товаров',
    'random': 'Случайная комната'
};

function initChat() {
    if (socket) return;
    socket = io();

    console.log('Подключение к чату...');
    console.log('Текущий пользователь:', window.currentUser || { login: 'Гость', id: null });

    socket.on('connect', () => {
        console.log('Подключено к чату');
        joinRoom('general');
    });

    socket.on('message', (data) => addMessageToChat(data));

    socket.on('user_joined', (data) => {
        addSystemMessage(`${data.username} присоединился к чату`);
    });

    socket.on('user_left', (data) => {
        const currentLogin = window.currentUser?.login || 'Гость';
        if (data.username !== currentLogin) {
            addSystemMessage(`${data.username} покинул чат`);
        }
    });

    socket.on('typing_status', (data) => {
        const indicator = document.getElementById('typingIndicator');
        const currentLogin = window.currentUser?.login || 'Гость';
        if (data.isTyping && data.username !== currentLogin) {
            indicator.textContent = `${data.username} печатает...`;
            indicator.style.display = 'block';
        } else {
            indicator.style.display = 'none';
        }
    });

    socket.on('message_history', (data) => {
        const chatBody = document.getElementById('chatMessages');
        chatBody.innerHTML = '';
        if (data.messages) {
            data.messages.forEach(msg => addMessageToChat(msg));
        }
    });

    socket.on('error', (data) => {
        console.error('Ошибка чата:', data.message);
    });
}

// Переключение / присоединение к комнате
function joinRoom(roomName) {
    if (!socket) return;

    if (currentRoom && currentRoom !== roomName) {
        socket.emit('leave_room', { room: currentRoom });
    }

    currentRoom = roomName;
    socket.emit('join_room', { room: roomName });

    const roomNameEl = document.getElementById('currentRoomName');
    if (roomNameEl) {
        roomNameEl.textContent = ROOM_NAMES[roomName] || roomName;
    }

    document.querySelectorAll('.chat-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.room === roomName);
    });

    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
        chatMessages.innerHTML = '<div style="text-align:center; color:#999; padding:20px;">Загрузка сообщений...</div>';
    }
}

// Отправка сообщения
function sendMessage() {
    if (window.currentUser?.id === null){
        alert('Только авторизованные пользователи могут отправлять сообщения!')
    };
    const input = document.getElementById('chatInput');
    const text = input?.value.trim();
    if (text && socket && currentRoom) {
        socket.emit('send_message', { text: text, room: currentRoom });
        if (input) input.value = '';
        stopTyping();
    }
}

// Добавление сообщения в DOM
function addMessageToChat(data) {
    const chatBody = document.getElementById('chatMessages');
    if (!chatBody) return;
    const currentLogin = window.currentUser?.login || 'Гость';
    const isMine = data.username === currentLogin;

    const div = document.createElement('div');
    div.className = `message ${isMine ? 'own' : ''}`;

    const time = new Date(data.timestamp).toLocaleTimeString('ru-RU', {
        hour: '2-digit', minute: '2-digit'
    });

    div.innerHTML = `
        <div class="message-header">
            <span class="message-author">${escapeHtml(data.username)}</span>
            <span class="message-time">${time}</span>
        </div>
        <div class="message-content">${escapeHtml(data.text)}</div>
    `;

    chatBody.appendChild(div);
    chatBody.scrollTop = chatBody.scrollHeight;
}

function addSystemMessage(text) {
    const chatBody = document.getElementById('chatMessages');
    if (!chatBody) return;
    const div = document.createElement('div');
    div.style.cssText = 'text-align:center; font-size:12px; color:#888; margin:10px 0;';
    div.textContent = text;
    chatBody.appendChild(div);
    chatBody.scrollTop = chatBody.scrollHeight;
}

// Индикатор набора текста
function startTyping() {
    if (!isTyping && socket && currentRoom) {
        isTyping = true;
        socket.emit('typing', { isTyping: true, room: currentRoom });
    }
}

function stopTyping() {
    if (isTyping && socket && currentRoom) {
        isTyping = false;
        socket.emit('typing', { isTyping: false, room: currentRoom });
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Обработчики кнопок
document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById('chatToggle');
    const chatWindow = document.getElementById('chatWindow');
    const closeBtn = document.getElementById('chatClose');

    if (toggleBtn && chatWindow) {
        toggleBtn.addEventListener('click', () => {
            chatWindow.classList.toggle('hidden');
            if (!socket) initChat();
        });
    }

    if (closeBtn && chatWindow) {
        closeBtn.addEventListener('click', () => chatWindow.classList.add('hidden'));
    }

    document.querySelectorAll('.chat-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const room = tab.dataset.room;
            if (room) joinRoom(room);
        });
    });

    const sendBtn = document.getElementById('chatSend');
    const input = document.getElementById('chatInput');

    if (sendBtn) sendBtn.addEventListener('click', sendMessage);

    if (input) {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
            startTyping();
            if (typingTimeout) clearTimeout(typingTimeout);
            typingTimeout = setTimeout(stopTyping, 2000);
        });
    }
});