// Роут логина
const express = require("express");
const loginRouter = express.Router();
const bcrypt = require("bcrypt");
const fs = require("fs").promises;
const path = require("path");
const DATA_FILE = path.join(__dirname, "../config", "data.json");

// GET - отображение страницы входа
loginRouter.get("/", function(req, res){
    res.render("login", {
        login: res.locals.data.login || {}
    });
});

// POST - обработка входа
loginRouter.post("/", async function(req, res){
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: "Заполните все поля" });
        }

        const dataRaw = await fs.readFile(DATA_FILE, "utf-8");
        const data = JSON.parse(dataRaw);

        // Поиск пользователя
        const user = data.users?.find(u =>
            u.email?.trim().toLowerCase() === email.trim().toLowerCase()
        );

        if (!user) {
            return res.json({ success: false, message: "Пользователь не найден" });
        }

        // Сравнение пароля
        const isMatch = await bcrypt.compare(password, user.password);

        if (isMatch) {
            // сохранение сессии
            req.session.user = {
                login: user.login,
                email: user.email
            };

            console.log('Сессия создана:', req.session.user);

            res.json({
                success: true,
                message: "Вход выполнен",
                user: { login: user.login, email: user.email }
            });
        } else {
            res.json({ success: false, message: "Неверный пароль" });
        }

    } catch (err) {
        console.error("Ошибка входа:", err);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
});

module.exports = loginRouter;