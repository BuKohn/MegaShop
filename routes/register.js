// Роут регистрации
const express = require("express");
const registerRouter = express.Router();
const bcrypt = require("bcrypt");
const fs = require("fs").promises;
const path = require("path");
const DATA_FILE = path.join(__dirname, "../config", "data.json");

// Обработка страницы регистрации
registerRouter.get("/", function(req, res){
    res.render("register", {
        register: res.locals.data.register || {}
    });
});

registerRouter.post("/api/register", async (req, res) => {
    try {
        const { login, email, password } = req.body; // password уже захеширован на клиенте

        if (!login || !email || !password) {
            return res.status(400).json({ success: false, message: 'Заполните все поля' });
        }

        const rawData = await fs.readFile(DATA_FILE, "utf-8");
        const data = JSON.parse(rawData);

        // проверка совпадения по login & email
        const existingUser = data.users?.find(
            u => u.login === login || u.email === email
        );

        if (existingUser) {
            if (existingUser.login === login) {
                return res.status(409).json({ success: false, message: "Логин уже занят" });
            }
            if (existingUser.email === email) {
                return res.status(409).json({ success: false, message: "Email уже зарегистрирован" });
            }
        }
        const finalHash = await bcrypt.hash(password, 10);

        // создание нового user
        const newUser = {
            login: login.trim(),
            email: email.trim().toLowerCase(),
            password: finalHash,
            cart: []
        };

        if (!data.users) data.users = [];
        data.users.push(newUser);

        await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");

        console.log('Новый пользователь:', { login, email, passwordHash: finalHash });

        res.json({
            success: true,
            message: "Регистрация успешна",
            user: { login: newUser.login, email: newUser.email }
        });

    } catch (err) {
        console.error("❌ Ошибка регистрации:", err);
        res.status(500).json({
            success: false,
            message: "Ошибка сервера: " + err.message
        });
    }
});

module.exports = registerRouter;