importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

const firebaseConfig = {
    apiKey: "AIzaSyAXPSwGdaVEJHinl4IYWYhtP2V9R8fan9o",
    authDomain: "megashop-97808.firebaseapp.com",
    projectId: "megashop-97808",
    messagingSenderId: "883545548919",
    appId: "1:883545548919:web:07244e6fe7157c251a3e72"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

console.log('[SW] Firebase Messaging initialized');

messaging.onBackgroundMessage(function(payload) {
    console.log('[SW] Получено фоновое сообщение:', payload);

    const notificationTitle = payload.notification?.title || 'Уведомление';
    const notificationOptions = {
        body: payload.notification?.body || '',
        icon: '/images/placeholder.jpg',
        badge: '/images/placeholder.jpg',
        tag: 'price-change',
        requireInteraction: true
    };

    self.registration.showNotification(notificationTitle, notificationOptions)
        .then(() => console.log('[SW] Уведомление показано'))
        .catch(err => console.error('[SW] Ошибка показа:', err));
});

// Обработка клика по уведомлению
self.addEventListener('notificationclick', function(event) {
    console.log('[SW] Клик по уведомлению:', event.notification.title);
    event.notification.close();
    event.waitUntil(clients.openWindow('/products/1'));
});