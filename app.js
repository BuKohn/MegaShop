const express = require("express");
const fs = require('fs').promises;
const http = require('http');
const session = require("express-session");
const path = require("path");
const initWebSocket = require('./websocket/server');
const app = express();
const server = http.createServer(app);

// Middleware сессии
const sessionMiddleware = session({
  secret: "omega-secret-key",
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000, httpOnly: true, secure: false }
});

app.use(sessionMiddleware);
app.set("view engine", "ejs");
app.set("views", __dirname + "/templates");
app.use(express.static(__dirname + "/public"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(async (req, res, next) => {
  try {
    const data = await fs.readFile(__dirname + "/config/data.json", "utf-8");
    res.locals.data = JSON.parse(data);
    next();
  } catch (err) { console.error(err); next(); }
});

app.use((req, res, next) => {
  res.locals.session = req.session;
  next();
});

app.use(async (req, res, next) => {
  try {
    const data = await fs.readFile(path.join(__dirname, "config", "data.json"), "utf-8");
    const parsed = JSON.parse(data);
    res.locals.data = parsed;
    let cartCount = 0;
    if (req.session?.apiCart) {
      cartCount = req.session.apiCart.reduce((acc, item) => acc + item.quantity, 0);
    }
    res.locals.cartCount = cartCount;
    res.locals.session = req.session;
    next();
  } catch (err) {
    console.error(err);
    res.locals.cartCount = 0;
    res.locals.session = req.session;
    next();
  }
});

// Роуты
app.use("/categories", require("./routes/views/categories"));
app.use("/products", require("./routes/views/products"));
app.use("/register", require("./routes/views/register"));
app.use("/login", require("./routes/views/login"));
app.use("/cart", require("./routes/views/cart"));
app.use("/api", require("./routes/api/api"));
app.use("/chat", require("./routes/views/chat"));
app.use("/", require("./routes/views/index"));

app.use((req, res) => {
  res.status(404).render("not_found", { message: "Страница не найдена" });
});

// Инициализация WebSocket
const io = initWebSocket(server);
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

process.on('SIGINT', () => {
  console.log('[SERVER] Завершение работы...');
  server.close(() => {
    console.log('[SERVER] Сервер остановлен');
    process.exit(0);
  });
});

server.listen(3000, () => {
  console.log('[SERVER] Запущен: http://localhost:3000');
});