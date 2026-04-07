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

// счётчик товаров в корзине
app.use(async (req, res, next) => {
  try {
    const data = await fs.readFile(path.join(__dirname, "config", "data.json"), "utf-8");
    const parsed = JSON.parse(data);
    res.locals.data = parsed;

    let cartCount = 0;
    if (req.session?.cart) {
      cartCount = req.session.cart.length;
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

//Роуты
app.use("/api", require("./routes/api"));
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