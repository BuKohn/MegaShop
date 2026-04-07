const express = require("express");
const fs = require("fs").promises;
const path = require("path");
const bcrypt = require("bcrypt");

const apiRouter = express.Router();
const DATA_FILE = path.join(__dirname, "../config", "data.json");

// Читает и парсит JSON из файла
async function readData() {
  const raw = await fs.readFile(DATA_FILE, "utf-8");
  return JSON.parse(raw);
}

// Сохраняет объект данных в JSON
async function writeData(data) {
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
}

function normalizeEmail(email) {
  return String(email).trim().toLowerCase();
}

// Возвращает безопасные данные пользователя без пароля
function toSafeUser(user, index) {
  return {
    id: index + 1,
    name: user.name || user.login || "",
    email: normalizeEmail(user.email || "")
  };
}

// Проверяет, что пользователь авторизован в сессии
function ensureAuthenticated(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({ message: "Требуется авторизация" });
  }
  next();
}

// Инициализирует и возвращает корзину API в сессии
function getApiCart(req) {
  if (!Array.isArray(req.session.apiCart)) {
    req.session.apiCart = [];
  }
  return req.session.apiCart;
}

// Формирует ответ корзины с товарами и общей суммой
function buildCartResponse(cart, products) {
  const items = cart
    .map((item) => {
      const product = products.find((p) => p.id === item.productId);
      if (!product) {
        return null;
      }

      return {
        productId: item.productId,
        quantity: item.quantity,
        product,
        lineTotal: product.price * item.quantity
      };
    })
    .filter(Boolean);

  const total = items.reduce((sum, item) => sum + item.lineTotal, 0);

  return { items, total };
}

// GET /api/products — возвращает список всех товаров
apiRouter.get("/products", async (req, res) => {
  const data = await readData();
  res.status(200).json(data.products || []);
});

// GET /api/products/:id — возвращает товар по id
apiRouter.get("/products/:id", async (req, res) => {
  const productId = Number(req.params.id);
  if (!Number.isInteger(productId) || productId <= 0) {
    return res.status(400).json({ message: "Некорректный product id" });
  }

  const data = await readData();
  const product = (data.products || []).find((p) => p.id === productId);

  if (!product) {
    return res.status(404).json({ message: "Товар не найден" });
  }

  res.status(200).json(product);
});

// GET /api/categories — возвращает список категорий
apiRouter.get("/categories", async (req, res) => {
  const data = await readData();
  res.status(200).json(data.categories || []);
});

// GET /api/categories/:id/products — возвращает товары категории
apiRouter.get("/categories/:id/products", async (req, res) => {
  const categoryId = String(req.params.id || "").trim();
  if (!categoryId) {
    return res.status(400).json({ message: "Некорректный category id" });
  }

  const data = await readData();
  const category = (data.categories || []).find((c) => c.id === categoryId);
  if (!category) {
    return res.status(404).json({ message: "Категория не найдена" });
  }

  const products = (data.products || []).filter((p) => p.category === categoryId);
  res.status(200).json(products);
});

// GET /api/cart — возвращает корзину текущего пользователя
apiRouter.get("/cart", ensureAuthenticated, async (req, res) => {
  const data = await readData();
  const cart = getApiCart(req);
  res.status(200).json(buildCartResponse(cart, data.products || []));
});

// POST /api/cart/items — добавляет товар в корзину
apiRouter.post("/cart/items", ensureAuthenticated, async (req, res) => {
  const productId = Number(req.body.productId);
  const quantity = Number(req.body.quantity);

  if (!Number.isInteger(productId) || productId <= 0) {
    return res.status(400).json({ message: "Некорректный productId" });
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return res.status(400).json({ message: "quantity должен быть целым числом > 0" });
  }

  const data = await readData();
  const product = (data.products || []).find((p) => p.id === productId);
  if (!product) {
    return res.status(404).json({ message: "Товар не найден" });
  }

  const cart = getApiCart(req);
  const existing = cart.find((i) => i.productId === productId);
  if (existing) {
    existing.quantity += quantity;
  } else {
    cart.push({ productId, quantity });
  }

  res.status(201).json(buildCartResponse(cart, data.products || []));
});

// PUT /api/cart/items/:productId — обновляет количество товара
apiRouter.put("/cart/items/:productId", ensureAuthenticated, async (req, res) => {
  const productId = Number(req.params.productId);
  const quantity = Number(req.body.quantity);

  if (!Number.isInteger(productId) || productId <= 0) {
    return res.status(400).json({ message: "Некорректный product id" });
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return res.status(400).json({ message: "quantity должен быть целым числом > 0" });
  }

  const data = await readData();
  const cart = getApiCart(req);
  const existing = cart.find((i) => i.productId === productId);

  if (!existing) {
    return res.status(404).json({ message: "Товар не найден в корзине" });
  }

  existing.quantity = quantity;
  res.status(200).json(buildCartResponse(cart, data.products || []));
});

// DELETE /api/cart/items/:productId — удаляет товар из корзины
apiRouter.delete("/cart/items/:productId", ensureAuthenticated, async (req, res) => {
  const productId = Number(req.params.productId);
  if (!Number.isInteger(productId) || productId <= 0) {
    return res.status(400).json({ message: "Некорректный product id" });
  }

  const data = await readData();
  const cart = getApiCart(req);
  const nextCart = cart.filter((item) => item.productId !== productId);

  if (nextCart.length === cart.length) {
    return res.status(404).json({ message: "Товар не найден в корзине" });
  }

  req.session.apiCart = nextCart;
  res.status(200).json(buildCartResponse(nextCart, data.products || []));
});

// DELETE /api/cart/clear — полностью очищает корзину
apiRouter.delete("/cart/clear", ensureAuthenticated, (req, res) => {
  req.session.apiCart = [];
  res.status(200).json({ message: "Корзина очищена", items: [], total: 0 });
});

// POST /api/auth/register — регистрирует нового пользователя
apiRouter.post("/auth/register", async (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = normalizeEmail(req.body.email || "");
  const password = String(req.body.password || "");

  if (!name || !email || !password) {
    return res.status(400).json({ message: "Поля name, email, password обязательны" });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: "Пароль должен содержать минимум 6 символов" });
  }

  const data = await readData();
  const users = data.users || [];
  const existingUser = users.find((u) => normalizeEmail(u.email || "") === email);
  if (existingUser) {
    return res.status(400).json({ message: "Email уже зарегистрирован" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = { login: name, name, email, password: passwordHash, cart: [] };
  users.push(user);
  data.users = users;
  await writeData(data);

  res.status(201).json({ message: "Регистрация успешна", user: toSafeUser(user, users.length - 1) });
});

// POST /api/auth/login — выполняет вход пользователя
apiRouter.post("/auth/login", async (req, res) => {
  const email = normalizeEmail(req.body.email || "");
  const password = String(req.body.password || "");

  if (!email || !password) {
    return res.status(400).json({ message: "Поля email и password обязательны" });
  }

  const data = await readData();
  const users = data.users || [];
  const userIndex = users.findIndex((u) => normalizeEmail(u.email || "") === email);
  if (userIndex === -1) {
    return res.status(401).json({ message: "Неверный email или пароль" });
  }

  const user = users[userIndex];
  const isValidPassword = await bcrypt.compare(password, String(user.password || ""));
  if (!isValidPassword) {
    return res.status(401).json({ message: "Неверный email или пароль" });
  }

  req.session.user = {
    login: user.name || user.login || "",
    email: normalizeEmail(user.email || ""),
    id: userIndex + 1
  };

  if (!Array.isArray(req.session.cart)) {
    req.session.cart = [];
  }
  if (!Array.isArray(req.session.apiCart)) {
    req.session.apiCart = [];
  }

  res.status(200).json({ message: "Вход выполнен", user: toSafeUser(user, userIndex) });
});

// POST /api/auth/logout — завершает сессию пользователя
apiRouter.post("/auth/logout", (req, res) => {
  if (!req.session) {
    return res.status(200).json({ message: "Сессия уже завершена" });
  }

  req.session.destroy((err) => {
    if (err) {
      return res.status(400).json({ message: "Не удалось завершить сессию" });
    }
    res.clearCookie("connect.sid");
    res.status(200).json({ message: "Выход выполнен" });
  });
});

// GET /api/auth/me — возвращает профиль текущего пользователя
apiRouter.get("/auth/me", ensureAuthenticated, async (req, res) => {
  const email = normalizeEmail(req.session.user.email || "");
  const data = await readData();
  const users = data.users || [];
  const userIndex = users.findIndex((u) => normalizeEmail(u.email || "") === email);

  if (userIndex === -1) {
    return res.status(404).json({ message: "Пользователь не найден" });
  }

  res.status(200).json(toSafeUser(users[userIndex], userIndex));
});

// Возвращает 404 для неизвестных endpoints
apiRouter.use((req, res) => {
  res.status(404).json({ message: "API endpoint не найден" });
});

module.exports = apiRouter;
