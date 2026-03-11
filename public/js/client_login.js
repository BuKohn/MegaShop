document.addEventListener('DOMContentLoaded', function() {
    const emailInput = document.getElementById('login-email');
    const passwordInput = document.getElementById('login-password');
    const loginBtn = document.getElementById('login-btn');
    const messageDiv = document.getElementById('login-message');

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    function showMessage(text, isError = true) {
        messageDiv.textContent = text;
        messageDiv.style.color = isError ? 'red' : 'green';
    }

    function hashPassword(password) {
        return CryptoJS.SHA256(password).toString();
    }

    async function handleLogin() {
        const email = emailInput.value.trim();
        const password = passwordInput.value;

        // Валидация
        if (!emailRegex.test(email)) {
            showMessage('Некорректный формат email');
            return;
        }
        if (password.length < 6) {
            showMessage('Пароль должен содержать минимум 6 символов');
            return;
        }

        showMessage('Вход...');

        try {
            const hashedPassword = hashPassword(password);

            const response = await fetch('/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password: hashedPassword})
            });

            const result = await response.json();

            if (result.success) {
                showMessage('Успешный вход!', false);
                // Перенаправление или сохранение сессии
                setTimeout(() => {
                    window.location.href = '/';
                }, 1000);
            } else {
                showMessage(result.message || 'Ошибка входа');
            }
        } catch (error) {
            console.error('Ошибка:', error);
            showMessage('Ошибка соединения с сервером');
        }
    }

    loginBtn.addEventListener('click', handleLogin);

    // Вход Enter
    passwordInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') handleLogin();
    });
});