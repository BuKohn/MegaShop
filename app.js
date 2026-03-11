const express = require("express");
const fs = require('fs').promises;

const app = express();
const session = require("express-session");
const path = require("path");

app.set("view engine", "ejs");
app.set("views", __dirname + "/templates");

// Загрузка статики
app.use(express.static(__dirname + "/public"));

// Загрузка данных о товарах в res.locals.data
app.use(async (req, res, next) => {
  try{
    const data = await fs.readFile(__dirname + "/config/data.json", "utf-8");
    res.locals.data = JSON.parse(data);
    next();
  } catch (err){
    console.log(err);
  }
});

// парсинг json
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Настройка сессий
app.use(session({
  secret: "omega-secret-key",
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 24 часа
    httpOnly: true,
    secure: false
  }
}));

app.use((req, res, next) => {
  res.locals.session = req.session;
  next();
});

// счётчик товаров в коризне
app.use(async (req, res, next) => {
  try {
    const dataRaw = await fs.readFile(path.join(__dirname, "config", "data.json"), "utf-8");
    const data = JSON.parse(dataRaw);
    res.locals.data = data;

    let cartCount = 0;

    if (req.session?.user?.email) {
      const user = data.users?.find(u =>
          u.email?.trim().toLowerCase() === req.session.user.email.trim().toLowerCase()
      );

      if (user) {
        cartCount = user.cart_length || 0;
      }
    }

    res.locals.cartCount = cartCount;
    res.locals.session = req.session;

    next();
  } catch (err) {
    console.error("Ошибка загрузки данных:", err);
    res.locals.cartCount = 0;
    res.locals.session = req.session;
    next();
  }
});

//Роуты
app.use("/categories", require("./routes/categories"));
app.use("/products", require("./routes/products"));
app.use("/register", require("./routes/register"));
app.use("/login", require("./routes/login"));
app.use("/logout", require("./routes/logout"));
app.use("/cart", require("./routes/cart"));
app.use("/", require("./routes/index"));

app.use((req, res) => {
  res.status(404).render("not_found", {
    message: "Страница не найдена"
  });
})

app.listen(3000);