//роут корзины
const express = require("express");
const cartRouter = express.Router();
const fs = require("fs").promises;
const path = require("path");
const DATA_FILE = path.join(__dirname, "../config", "data.json");

cartRouter.get("/", async function(req, res) {
    try {
        // Проверка сессии
        if (!req.session || !req.session.user) {
            return res.redirect('/login');
        }

        const rawData = await fs.readFile(DATA_FILE, "utf-8");
        const data = JSON.parse(rawData);

        // Поиск пользователя
        const user = data.users?.find(u =>
            u.email?.trim().toLowerCase() === req.session.user.email.trim().toLowerCase()
        );

        if (!user) {
            return res.status(404).send("Пользователь не найден");
        }

        // Получаем товары из корзины
        const cartItems = data.products?.filter(p => user.cart?.includes(p.id)) || [];
        const total = cartItems.reduce((sum, p) => sum + p.price, 0);

        res.render("cart", {
            cartItems,
            total,
            session: req.session
        });

    } catch (err) {
        console.error("Ошибка загрузки корзины:", err);
        res.status(500).send("Ошибка сервера");
    }
});

cartRouter.post("/add", async function(req, res) {
    try {
        const { productId } = req.body;

        if (!req.session || !req.session.user) {
            return res.json({ success: false, redirect: true, message: "Требуется авторизация" });
        }

        if (!productId) {
            return res.status(400).json({ success: false, message: "Не указан товар" });
        }

        const rawData = await fs.readFile(DATA_FILE, "utf-8");
        const data = JSON.parse(rawData);

        const userIndex = data.users?.findIndex(u =>
            u.email?.trim().toLowerCase() === req.session.user.email.trim().toLowerCase()
        );

        if (userIndex === -1) {
            return res.status(404).json({ success: false, message: "Пользователь не найден" });
        }

        const product = data.products?.find(p => p.id === productId);
        if (!product) {
            return res.status(404).json({ success: false, message: "Товар не найден" });
        }

        const user = data.users[userIndex];
        if (!user.cart) user.cart = [];

        if (user.cart.includes(productId)) {
            return res.json({ success: false, message: "Товар уже в корзине" });
        }

        // Добавляем товар
        user.cart.push(productId);
        user.cart_length = user.cart.length;

        data.users[userIndex] = user;
        await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");

        console.log(`Товар ${productId} добавлен. cart_length: ${user.cart_length}`);

        res.json({
            success: true,
            message: "Товар добавлен в корзину",
            cartCount: user.cart_length
        });

    } catch (err) {
        console.error("Ошибка добавления:", err);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
});

cartRouter.delete("/remove/:productId", async function(req, res) {
    try {
        const productId = parseInt(req.params.productId);

        if (!req.session || !req.session.user) {
            return res.status(401).json({ success: false, message: "Требуется авторизация" });
        }

        const rawData = await fs.readFile(DATA_FILE, "utf-8");
        const data = JSON.parse(rawData);

        const userIndex = data.users?.findIndex(u =>
            u.email?.trim().toLowerCase() === req.session.user.email.trim().toLowerCase()
        );

        if (userIndex === -1) {
            return res.status(404).json({ success: false, message: "Пользователь не найден" });
        }

        const user = data.users[userIndex];
        if (!user.cart) {
            return res.json({ success: true, message: "Корзина пуста" });
        }

        const initialLength = user.cart.length;
        user.cart = user.cart.filter(id => id !== productId);

        if (user.cart.length === initialLength) {
            return res.status(404).json({ success: false, message: "Товар не найден в корзине" });
        }

        user.cart_length = user.cart.length;

        data.users[userIndex] = user;
        await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");

        console.log(`Товар ${productId} удалён. cart_length: ${user.cart_length}`);

        res.json({
            success: true,
            message: "Товар удалён",
            cartCount: user.cart_length
        });

    } catch (err) {
        console.error("Ошибка удаления:", err);
        res.status(500).json({ success: false, message: "Ошибка сервера" });
    }
});

module.exports = cartRouter;