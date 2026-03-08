const express = require("express");
const fs = require('fs').promises;

const app = express();
 
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

//Роуты
app.use("/categories", require("./routes/categories"));
app.use("/products", require("./routes/products"));
app.use("/", require("./routes/index"));

app.use((req, res) => {
  res.status(404).render("not_found");
})

app.listen(3000);