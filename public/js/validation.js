document.addEventListener('DOMContentLoaded', () => {
    const loginInput = document.querySelector('input[placeholder="login"]');
    const emailInput = document.querySelector('input[placeholder="email"]');
    const passwordInput = document.querySelector('input[placeholder="password"]');
    const repeatPasswordInput = document.querySelector('input[placeholder="repeat password"]');
    const submitBtn = document.querySelector('.reg-log-btn');

    // Регулярные выражения
    const patterns = {
        login: /^[A-Za-z0-9]{3,20}$/,  // 3-20 символов, латиница или цифры
        email: /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/, // email
        password: /^(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])[A-Za-z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]{10,}$/ // 10+ символов и спецсимволы
    };

    // Ошибки
    const showError = (input, message) => {
        // Сброс стилей
        document.querySelectorAll('.reg-log-textarea').forEach(el => {
            el.classList.remove('error', 'success');
        });

        input.classList.add('error');
        alert(`Ошибка:\n${message}`);
        input.focus();
        return false;
    };

    // хеширование через Crypto-JS
    const hashPassword = (password) => {
        return CryptoJS.SHA256(password).toString();
    };

    // Обработчик клика по кнопке
    submitBtn.addEventListener('click', async (e) => {
        e.preventDefault();

        const login = loginInput.value.trim();
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        const repeatPassword = repeatPasswordInput.value;

        // 🔹 Валидация логина
        if (!patterns.login.test(login)) {
            return showError(loginInput,
                'Логин должен содержать от 3 до 20 символов (только латиница и цифры)');
        }

        // 🔹 Валидация почты
        if (!patterns.email.test(email)) {
            return showError(emailInput,
                'Введите корректный email (пример: user@gmail.com)');
        }

        // 🔹 Валидация пароля
        if (!patterns.password.test(password)) {
            return showError(passwordInput,
                'Пароль должен содержать минимум 10 символов и хотя бы один спецсимвол (!@#$%^&*)');
        }

        // 🔹 Проверка совпадения паролей
        if (password !== repeatPassword) {
            return showError(repeatPasswordInput,
                'Пароли не совпадают');
        }

        const hashedPassword = hashPassword(password);
        alert('✅ Регистрация успешна! (тест)');

        try {
            const response = await fetch('/register/api/register', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    login,
                    email,
                    password: hashedPassword
                })
            });

            const result = await response.json();

            if (result.success) {
                alert('Регистрация успешна!');
                window.location.href = '/login';
            } else {
                alert('Ошибка: ' + result.message);
            }
        } catch (err) {
            console.error('Ошибка отправки:', err);
        }
    });
});
